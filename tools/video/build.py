#!/usr/bin/env python3
"""Assemble the demo video from real screencast frames, synthetic narration and captions.

Inputs
  ../capture/out/scenes/<scene>/frames.json + f*.jpg   (recorded from the real Forge app by capture.mjs)
  narration.json                                        (text per scene)
Outputs (in ./build)
  Final_Demo_1080p.mp4, Subtitles.srt, timeline.json

Editing rules, kept deliberately small so the video stays an honest record:
  - frames are shown in the order they were recorded; nothing is composited into the picture except captions;
  - named waiting periods (a server-side script, the agent thinking) are shortened;
  - a scene may be played between 0.8x and 1.4x to fit its narration, and its last frame may be held.
"""
import json, os, subprocess, sys, wave, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SCENES = HERE.parent / 'capture' / 'out' / 'scenes'
B = HERE / 'build'
FPS = 30
W, H = 1920, 1080
LEAD, TAIL = 0.35, 0.6
FONT = '/System/Library/Fonts/Helvetica.ttc'

# Waiting periods to shorten: scene -> (mark where the wait starts, seconds kept after it, mark where it ends, seconds the wait is cut to)
WAITS = {
    's3b_fastforward': ('script', 1.2, 'script-done', 3.5),
    's6_rovo': ('asked', 1.0, 'answered', 3.0),
}

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f"FAILED: {' '.join(map(str, cmd))[:300]}\n{r.stderr[-1500:]}")
    return r.stdout

def dur(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)]).strip())

def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)

# ---------- narration ----------
def synth(narr):
    out = {}
    adir = B / 'audio'; adir.mkdir(parents=True, exist_ok=True)
    words = 0; speech = 0.0
    for sc in narr['scenes']:
        cues = []; t = LEAD; pcm = bytearray(b'\x00\x00' * int(48000 * LEAD))
        for i, line in enumerate(sc['lines']):
            aiff = adir / f"{sc['id']}_{i}.aiff"; wav = adir / f"{sc['id']}_{i}.wav"
            run(['say', '-v', narr['voice'], '-r', str(narr['rate']), '-o', str(aiff), line.get('tts', line['text'])])
            # The system voice cannot speak slower than about 155 words a minute, so it is time-stretched (pitch kept).
            run(['ffmpeg', '-y', '-v', 'error', '-i', str(aiff), '-af', f"atempo={narr.get('tempo', 1.0)}", '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', str(wav)])
            with wave.open(str(wav)) as w:
                frames = w.readframes(w.getnframes()); d = w.getnframes() / 48000
            cues.append({'start': t, 'end': t + d, 'text': line['text']})
            pcm += frames; t += d
            words += len(line['text'].split()); speech += d
            if i < len(sc['lines']) - 1:
                gap = narr['gapSeconds']; pcm += b'\x00\x00' * int(48000 * gap); t += gap
        out[sc['id']] = {'cues': cues, 'pcm': pcm, 'audio': t}
    return out, words, speech

# ---------- video timing ----------
def remap(scene_id, target):
    meta = json.loads((SCENES / scene_id / 'frames.json').read_text())
    t0, end = meta['t0'], meta['end']
    fr = [((f['t'] - t0) / 1000, f['file']) for f in meta['frames']]
    total = (end - t0) / 1000
    marks = {m['label']: m['t'] / 1000 for m in meta.get('marks', [])}
    segs = [(0.0, total, 1.0)]  # (from, to, speed)
    note = None
    if scene_id in WAITS:
        a_mark, keep, b_mark, cut_to = WAITS[scene_id]
        if a_mark in marks and b_mark in marks:
            a, b = marks[a_mark] + keep, marks[b_mark]
            if b - a > cut_to + 0.5:
                segs = [(0.0, a, 1.0), (a, b, (b - a) / cut_to), (b, total, 1.0)]
                note = f"wait shortened from {b - a:.1f}s to {cut_to:.1f}s"
    def m(t):
        out = 0.0
        for a, b, sp in segs:
            if t <= a: break
            out += (min(t, b) - a) / sp
        return out
    d1 = m(total)
    k = max(0.8, min(1.4, d1 / target))  # >1 = play faster
    times = [m(t) / k for t, _ in fr]
    length = max(d1 / k, target)
    return fr, times, length, {'recorded': round(total, 2), 'speed': round(k, 3), 'note': note, 'marks': {a: round(m(b) / k, 2) for a, b in marks.items()}}

def encode_scene(scene_id, fr, times, length, out):
    lst = B / f'{scene_id}.ffconcat'
    lines = ['ffconcat version 1.0']
    for i, (_, f) in enumerate(fr):
        nxt = times[i + 1] if i + 1 < len(fr) else length
        d = max(nxt - times[i], 1 / 240)
        lines += [f"file '{SCENES / scene_id / f}'", f'duration {d:.5f}']
    lines.append(f"file '{SCENES / scene_id / fr[-1][1]}'")
    lst.write_text('\n'.join(lines))
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst),
         '-vf', f'fps={FPS},scale={W}:{H}:flags=lanczos:out_range=tv,format=yuv420p', '-color_range', 'tv', '-t', f'{length:.3f}',
         '-c:v', 'libx264', '-crf', '15', '-preset', 'medium', '-an', str(out)])

# ---------- captions ----------
def wrap(draw, text, fnt, maxw):
    words = text.split(); lines = []; cur = ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=fnt) <= maxw: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def split_cue(c):
    """Captions stay at two lines; a long sentence becomes two consecutive captions."""
    t = c['text']
    if len(t) <= 96: return [c]
    mid = len(t) // 2
    cands = [i for i, ch in enumerate(t) if ch in ',;:.' and 20 < i < len(t) - 20] or [i for i, ch in enumerate(t) if ch == ' ']
    cut = min(cands, key=lambda i: abs(i - mid)) + 1
    a, b = t[:cut].strip(), t[cut:].strip()
    span = c['end'] - c['start']; ta = c['start'] + span * len(a) / (len(a) + len(b))
    return [{'start': c['start'], 'end': ta, 'text': a}, {'start': ta, 'end': c['end'], 'text': b}]

def caption_png(text, path):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    fnt = font(40); lines = wrap(d, text, fnt, 1480)
    lh = 52; bw = int(max(d.textlength(l, font=fnt) for l in lines)) + 56; bh = lh * len(lines) + 30
    x0 = (W - bw) // 2; y0 = H - 54 - bh
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=14, fill=(11, 21, 48, 225))
    for i, l in enumerate(lines):
        d.text(((W - d.textlength(l, font=fnt)) / 2, y0 + 14 + i * lh), l, font=fnt, fill=(255, 255, 255, 255))
    img.save(path)

def end_card(path, notes):
    img = Image.new('RGB', (W, H), (11, 21, 48)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([W // 2 - 62, 250, W // 2 + 62, 374], radius=26, fill=(47, 107, 255))
    f = font(60, True); d.text((W // 2 - d.textlength('T−', font=f) / 2, 278), 'T−', font=f, fill='white')
    f = font(96, True); t = 'T-Minus'; d.text(((W - d.textlength(t, font=f)) / 2, 420), t, font=f, fill='white')
    f = font(44); t = 'Go-live mission control for Jira'; d.text(((W - d.textlength(t, font=f)) / 2, 548), t, font=f, fill=(201, 211, 234))
    f = font(40, True); t = 'tminus.hayaix.tech'; d.text(((W - d.textlength(t, font=f)) / 2, 640), t, font=f, fill=(242, 163, 58))
    f = font(27); y = 800
    for n in notes:
        d.text(((W - d.textlength(n, font=f)) / 2, y), n, font=f, fill=(147, 161, 196)); y += 42
    img.save(path)

def srt_time(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

# ---------- main ----------
def main():
    shutil.rmtree(B, ignore_errors=True); B.mkdir(parents=True)
    narr = json.loads((HERE / 'narration.json').read_text())
    audio, words, speech = synth(narr)
    parts = []; srt = []; timeline = []; clock = 0.0; n = 0
    for sc in narr['scenes']:
        sid = sc['id']; a = audio[sid]
        target = a['audio'] + TAIL
        fr, times, length, info = remap(sid, target)
        raw = B / f'{sid}_raw.mp4'; encode_scene(sid, fr, times, length, raw)
        length = dur(raw)
        # audio padded to the scene length
        pcm = a['pcm'] + b'\x00\x00' * max(0, int(48000 * length) - len(a['pcm']) // 2)
        wavp = B / f'{sid}.wav'
        with wave.open(str(wavp), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(bytes(pcm[: int(48000 * length) * 2]))
        cues = [x for c in a['cues'] for x in split_cue(c)]
        inputs = ['-i', str(raw)]; filt = []; last = '[0:v]'
        for i, c in enumerate(cues):
            # Hold each caption 0.25 s after the words end, but never into the next caption.
            end = min(c['end'] + 0.25, cues[i + 1]['start'] - 0.04) if i + 1 < len(cues) else c['end'] + 0.25
            p = B / f'{sid}_cap{i}.png'; caption_png(c['text'], p)
            inputs += ['-loop', '1', '-t', f'{length:.3f}', '-i', str(p)]
            out = f'[v{i}]'
            filt.append(f"{last}[{i + 1}:v]overlay=0:0:enable='between(t,{c['start']:.3f},{end:.3f})'{out}")
            last = out
            n += 1; srt.append(f"{n}\n{srt_time(clock + c['start'])} --> {srt_time(clock + end)}\n{c['text']}\n")
        final = B / f'{sid}.mp4'
        run(['ffmpeg', '-y', '-v', 'error', *inputs, '-i', str(wavp), '-filter_complex', ';'.join(filt), '-map', last, '-map', f'{len(cues) + 1}:a',
             '-t', f'{length:.3f}', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', str(FPS),
             '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', str(final)])
        d = dur(final)
        timeline.append({'scene': sid, 'start': round(clock, 2), 'length': round(d, 2), 'narration': round(a['audio'], 2), **info})
        parts.append(final); clock += d
    # end card
    notes = ['All data shown is synthetic. The plan clock is simulated and labelled in the app.',
             'Recorded from the app installed in Jira. Two waiting periods are shortened. Narration is a synthetic voice.',
             'T-Minus is an independent app built on Atlassian Forge.']
    card = B / 'end.png'; end_card(card, notes)
    endv = B / 'zz_end.mp4'
    run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-t', '5', '-i', str(card), '-f', 'lavfi', '-t', '5', '-i', 'anullsrc=r=48000:cl=stereo',
         '-vf', 'fade=t=in:st=0:d=0.5,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-shortest', str(endv)])
    timeline.append({'scene': 'end_card', 'start': round(clock, 2), 'length': 5.0}); parts.append(endv); clock += 5
    lst = B / 'all.ffconcat'; lst.write_text('ffconcat version 1.0\n' + '\n'.join(f"file '{p}'" for p in parts))
    joined = B / 'joined.mp4'
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(joined)])
    final = B / 'Final_Demo_1080p.mp4'
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(joined), '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
         '-movflags', '+faststart', str(final)])
    (B / 'Subtitles.srt').write_text('\n'.join(srt))
    total = dur(final)
    summary = {'duration': round(total, 2), 'words': words, 'speech_seconds': round(speech, 1),
               'wpm_while_speaking': round(words / (speech / 60)), 'wpm_overall': round(words / (total / 60)), 'scenes': timeline}
    (B / 'timeline.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
