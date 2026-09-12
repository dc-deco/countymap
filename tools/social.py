#!/usr/bin/env python3
"""The two pictures the game cannot inline.

Everything else here is a single file, but a link preview needs a real URL —
Open Graph will not take a data URI — and iOS will not take an SVG for a home
screen icon. Both are built from the same relief and the same county paths the
game itself draws, so a shared link looks like the thing it opens.

  share.jpg             1200x630, what a pasted link unfurls to
  apple-touch-icon.png  180x180, the home screen icon

Usage: python3 tools/social.py
"""
import json, os, re
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
OUT = os.path.dirname(HERE)
PAPER = (231, 235, 232)

C = json.load(open(os.path.join(DATA, 'counties.json')))
relief = Image.open(os.path.join(DATA, 'relief.webp')).convert('RGB')
SW, SH = C['svg_w'], C['svg_h']
RK = relief.width / SW                      # relief pixels per map unit

def ttf(weight, size):
    """Lato ships as woff2 for the page; PIL needs it unpacked."""
    dst = f'/tmp/lato-{weight}.ttf'
    if not os.path.exists(dst):
        f = TTFont(os.path.join(DATA, 'fonts', f'lato-{weight}.woff2'))
        f.flavor = None; f.save(dst)
    return ImageFont.truetype(dst, size)

def rings(d):
    out = []
    for sub in d.split('Z'):
        pts = [(float(a), float(b)) for a, b in re.findall(r'[ML](-?[\d.]+) (-?[\d.]+)', sub)]
        if len(pts) > 2: out.append(pts)
    return out

def ky_bbox():
    x0 = y0 = 1e9; x1 = y1 = -1e9
    for ring in rings(C['outline']):
        for x, y in ring:
            x0, x1 = min(x0, x), max(x1, x); y0, y1 = min(y0, y), max(y1, y)
    return x0, y0, x1, y1

def crop(vw, vh, out_w, out_h):
    """A view vw x vh map units centred on Kentucky, clamped inside the frame.
       Kentucky fills 96% of the frame's width, so a generous margin is simply
       not available and the clamp is the normal case, not the edge case."""
    x0, y0, x1, y1 = ky_bbox()
    vw, vh = min(vw, SW), min(vh, SH)
    vx = min(max((x0 + x1) / 2 - vw / 2, 0), SW - vw)
    vy = min(max((y0 + y1) / 2 - vh / 2, 0), SH - vh)
    img = relief.resize((out_w, out_h), Image.LANCZOS,
                        box=(vx * RK, vy * RK, (vx + vw) * RK, (vy + vh) * RK)).convert('RGBA')
    s = out_w / vw
    P = lambda p: ((p[0] - vx) * s, (p[1] - vy) * s)

    # wash everything outside the state, as the page does
    mask = Image.new('L', (out_w, out_h), 255)
    md = ImageDraw.Draw(mask)
    for ring in rings(C['outline']): md.polygon([P(p) for p in ring], fill=0)
    img = Image.composite(Image.alpha_composite(img, Image.new('RGBA', img.size, PAPER + (150,))),
                          img, mask)
    return img, P

def lines(img, P, counties, w):
    d = ImageDraw.Draw(img)
    if counties:
        for c in C['counties']:
            for ring in rings(c['d']):
                d.line([P(p) for p in ring] + [P(ring[0])], fill=(38, 48, 43, 160), width=w)
    for ring in rings(C['outline']):
        d.line([P(p) for p in ring] + [P(ring[0])], fill=(24, 32, 27, 255), width=w * 3)

# ---- share card: the whole state, the name in the empty north-west ----
x0, y0, x1, y1 = ky_bbox()
W, H = 1200, 630
img, P = crop(SW, SW * H / W, W, H)      # as wide as the frame goes
lines(img, P, True, 2)
# A bar across the bottom would have cut the southern counties off: at this
# width the state is 509px tall in a 630px card, so the type goes where the
# map has nothing — over the pale country north-west of the line.
scrim = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(scrim).rectangle([0, 0, 640, 210], fill=PAPER + (150,))
img = Image.alpha_composite(img, scrim.filter(__import__('PIL.ImageFilter', fromlist=['x']).GaussianBlur(38)))
d = ImageDraw.Draw(img)
d.text((56, 44), 'County As Hell', font=ttf(700, 72), fill=(24, 32, 27))
d.text((59, 128), 'A Kentucky map game', font=ttf(400, 32), fill=(66, 78, 72))
# JPEG, not PNG: a hillshade is a photograph as far as a compressor is
# concerned, and PNG made 992 KB of it. Not WebP either — a link preview has
# to render wherever it is pasted, and some of those still will not take one.
img.convert('RGB').save(os.path.join(OUT, 'share.jpg'), quality=86,
                        optimize=True, progressive=True)

# ---- home screen icon: the state, tight, on paper ----
S = 180
pad = 14
kw, kh = (x1 - x0) * 1.06, (y1 - y0) * 1.06
iw = S - pad * 2
ih = max(1, round(iw * kh / kw))
img, P = crop(kw, kh, iw, ih)
lines(img, P, False, 1)
icon = Image.new('RGB', (S, S), PAPER)
icon.paste(img.convert('RGB'), (pad, (S - ih) // 2))
icon.save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)

for n in ('share.jpg', 'apple-touch-icon.png'):
    p = os.path.join(OUT, n)
    print(f'  {n}  {Image.open(p).size[0]}x{Image.open(p).size[1]}  {os.path.getsize(p)/1024:.0f} KB')
