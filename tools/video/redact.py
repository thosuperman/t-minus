#!/usr/bin/env python3
"""Blur email addresses in the recorded frames before the video is built.

Jira shows the signed-in user's email on the profile card that appears when the pointer rests on a
name. This finds every email address in ../capture/out/scenes with on-device text recognition
(macOS Vision, see ocr.swift) and blurs it in place. The untouched frames are kept in
../capture/out/scenes_orig the first time a frame is changed.

Frames next to a detection that have no detection of their own (the card fading in or out) get the
neighbouring boxes blurred too.

Usage: python3 redact.py [scene ...]   (all scenes when none is named; then python3 build.py)
"""
import shutil, subprocess, sys
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
SCENES = HERE.parent / 'capture' / 'out' / 'scenes'
ORIG = HERE.parent / 'capture' / 'out' / 'scenes_orig'
B = HERE / 'build'
PAD = 12        # pixels added left, right and below the recognised text
PAD_TOP = 2     # less above, so the line over the address stays readable
NEIGHBOURS = 6  # frames either side of a detection that are also blurred


def detect(files):
    B.mkdir(exist_ok=True)
    exe = B / 'ocr'
    if not exe.exists():
        subprocess.run(['swiftc', '-O', str(HERE / 'ocr.swift'), '-o', str(exe)], check=True)
    hits = defaultdict(list)
    procs = []
    n = 8
    for i in range(n):
        part = files[i::n]
        if part:
            procs.append(subprocess.Popen([str(exe)] + [str(f) for f in part], stdout=subprocess.PIPE, text=True))
    for p in procs:
        for line in p.communicate()[0].splitlines():
            path, _text, box = line.split('\t')
            hits[Path(path)].append(tuple(int(v) for v in box.split(',')))
    return hits


def blur(path, boxes):
    backup = ORIG / path.relative_to(SCENES)
    if not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup)
    im = Image.open(path).convert('RGB')
    for x, y, w, h in boxes:
        box = (max(0, x - PAD), max(0, y - PAD_TOP), min(im.width, x + w + PAD), min(im.height, y + h + PAD))
        region = im.crop(box)
        small = region.resize((max(1, region.width // 10), max(1, region.height // 10)), Image.BILINEAR)
        region = small.resize(region.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
        im.paste(region, box)
    im.save(path, quality=95)


def main():
    total = 0
    changed = []
    for scene in sorted(p for p in SCENES.iterdir() if p.is_dir() and (not sys.argv[1:] or p.name in sys.argv[1:])):
        files = sorted(scene.glob('f*.jpg'))
        hits = detect(files)
        if not hits:
            continue
        todo = defaultdict(set)
        for i, f in enumerate(files):
            if f not in hits:
                continue
            for j in range(max(0, i - NEIGHBOURS), min(len(files), i + NEIGHBOURS + 1)):
                if j == i or files[j] not in hits:
                    todo[files[j]].update(hits[f])
        for f, boxes in todo.items():
            blur(f, sorted(boxes))
        total += len(todo)
        changed += list(todo)
        print(f'{scene.name}: email found in {len(hits)} frames, blurred {len(todo)} frames')
    left = detect(sorted(changed))
    print(f'blurred {total} frames; frames where an email is still readable: {len(left)}')
    sys.exit(1 if left else 0)


if __name__ == '__main__':
    main()
