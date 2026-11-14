#!/usr/bin/env python3
"""Build the Devpost thumbnail (3:2) from the real Mission Control screenshot.

Usage: python3 tools/thumbnail/make.py
Output: CODEGEIST-2026-SUBMISSION/SCREENSHOTS/00_Thumbnail.png (1500 x 1000)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'CODEGEIST-2026-SUBMISSION' / 'SCREENSHOTS'
FONT = '/System/Library/Fonts/Helvetica.ttc'
W, H = 1500, 1000
NAVY, ACCENT, AMBER = (11, 21, 48), (47, 107, 255), (242, 163, 58)

def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=1 if bold else 0)

im = Image.new('RGB', (W, H), NAVY)
d = ImageDraw.Draw(im)

# Title block
d.rounded_rectangle((80, 78, 80 + 210, 78 + 44), 22, fill=AMBER)
d.text((80 + 105, 78 + 22), 'FOR JIRA + ROVO', font=font(17, True), fill=NAVY, anchor='mm')
d.text((76, 140), 'T-Minus', font=font(124, True), fill='white')
d.text((80, 286), 'Go-live mission control', font=font(50), fill=(214, 224, 245))
d.text((80, 362), 'What is late, which deadlines are at risk, and how long you still have to decide on a rollback.',
       font=font(25), fill=(150, 166, 200))

# Real screenshot of the board, cropped to the app area, in a framed card
shot = Image.open(SHOTS / '01_Mission_Control.png').convert('RGB')
sw, sh = shot.size
crop = shot.crop((0, int(sh * 0.158), sw, int(sh * 0.158) + int(sw * 560 / 1340)))
cw = W - 160
card = crop.resize((cw, int(cw * crop.height / crop.width)), Image.LANCZOS)
x, y = 80, 440
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((x - 4, y + 10, x + cw + 4, H + 60), 22, fill=(0, 0, 0, 150))
im.paste(Image.alpha_composite(im.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(22))).convert('RGB'))
mask = Image.new('L', card.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width, card.height + 40), 16, fill=255)
im.paste(card, (x, y), mask)
ImageDraw.Draw(im).rounded_rectangle((x, y, x + cw, H + 40), 16, outline=ACCENT, width=3)

out = SHOTS / '00_Thumbnail.png'
im.save(out, optimize=True)
print(out, im.size, out.stat().st_size)
