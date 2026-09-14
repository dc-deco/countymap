#!/usr/bin/env python3
"""The two pictures the game cannot inline.

Everything else here is a single file, but a link preview needs a real URL —
Open Graph will not take a data URI — and iOS will not take an SVG for a home
screen icon. Both are built from the same relief and the same county paths the
game itself draws, so a shared link looks like the thing it opens.

  share.jpg             1200x630, what a pasted link unfurls to
  apple-touch-icon.png  180x180, the home screen icon iOS takes
  icon-512.png          512x512, the same for the manifest, so Android installs

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

# ---- share card: the name first, the state given room, one goldenrod county ----
# A link preview is a poster, not a map. The county grid at this size was
# noise, the hillshade read as an old-map filter, and the state pressed on
# every edge. So: flat warm cream, the state at about three quarters of the
# width with air around it, county lines held back to a third, the border
# strong, and Madison County in the game's goldenrod with a pin on it — which
# says "geography game" without a word of mechanics. The relief survives only
# as a whisper inside the state. Drawn at 2x and downsampled, since PIL's
# lines and polygons are not antialiased on their own.
from PIL import ImageOps
x0, y0, x1, y1 = ky_bbox()
W, H = 1200, 630
SS = 2
w, h = W * SS, H * SS
CREAM  = (245, 240, 229)
FIELD_LO, FIELD_HI = (214, 206, 187), (236, 229, 211)   # the state's own tone, textured between these
INK    = (27, 36, 32)
GOLD   = (228, 169, 60)
MADDER = (155, 59, 38)
card = Image.new('RGBA', (w, h), CREAM + (255,))

kw, kh = x1 - x0, y1 - y0
state_w = 0.78 * w
sc = state_w / kw
ox = w - 56 * SS - state_w
oy = h - 50 * SS - kh * sc
P = lambda p: ((p[0] - x0) * sc + ox, (p[1] - y0) * sc + oy)

# the state: a flat field with a whisper of relief, cut to the outline
rel = relief.resize((round(kw * sc), round(kh * sc)), Image.LANCZOS,
                    box=(x0 * RK, y0 * RK, x1 * RK, y1 * RK)).convert('L')
field = ImageOps.colorize(rel, black=FIELD_LO, white=FIELD_HI).convert('RGBA')
state_mask = Image.new('L', (w, h), 0)
sm = ImageDraw.Draw(state_mask)
for ring in rings(C['outline']): sm.polygon([P(p) for p in ring], fill=255)
layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
layer.paste(field, (round(ox), round(oy)))
card = Image.composite(layer, card, state_mask)

# the one accent: Madison County, then its lines and pin go on top
madison = next(c for c in C['counties'] if c['name'] == 'Madison')
d = ImageDraw.Draw(card)
for ring in rings(madison['d']): d.polygon([P(p) for p in ring], fill=GOLD + (255,))

# county lines at a third, on their own layer so the alpha actually blends
grid = Image.new('RGBA', (w, h), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
for c in C['counties']:
    for ring in rings(c['d']):
        gd.line([P(p) for p in ring] + [P(ring[0])], fill=INK + (88,), width=3)
card = Image.alpha_composite(card, grid)
d = ImageDraw.Draw(card)
for ring in rings(C['outline']):
    d.line([P(p) for p in ring] + [P(ring[0])], fill=INK + (255,), width=9, joint='curve')

# a small pin on Madison: white halo, madder disc, a pinhole of white
px, py = P((madison['x'], madison['y']))
def disc(r, fill): d.ellipse([px - r, py - r, px + r, py + r], fill=fill)
disc(15 * SS / 2 + 4, (255, 255, 255, 255))
disc(15 * SS / 2, MADDER + (255,))
disc(3 * SS, (255, 255, 255, 255))

# the brand, in the empty country north-west of the river
def tracked(xy, text, font, fill, track):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + track
head = ttf(700, 62 * SS)
tracked((56 * SS, 56 * SS), 'COUNTY AS HELL', head, INK, 0.07 * 62 * SS)
d.text((58 * SS, 134 * SS), 'How well do you know Kentucky?', font=ttf(400, 31 * SS), fill=(76, 86, 80))

# JPEG, not PNG: even flat, the relief whisper and the antialiasing compress
# far better as a photograph. Not WebP either — a link preview has to render
# wherever it is pasted, and some of those still will not take one.
card.resize((W, H), Image.LANCZOS).convert('RGB').save(
    os.path.join(OUT, 'share.jpg'), quality=88, optimize=True, progressive=True)

# ---- home screen icon: the state, tight, on paper ----
# Opaque, square, and the state nearly edge to edge: the OS rounds the corners
# itself, would paint any transparency black, and shows the thing at 60 points,
# where a thin outline floating in margin reads as a smudge. The border is
# drawn at 2x and downsampled so it stays a line rather than a stair.
def icon(S, name):
    pad = round(S * 0.045)
    ss = 2
    kw, kh = (x1 - x0) * 1.03, (y1 - y0) * 1.03
    iw = (S - pad * 2) * ss
    ih = max(1, round(iw * kh / kw))
    img, P = crop(kw, kh, iw, ih)
    lines(img, P, False, max(1, round(S * ss / 180)))
    out = Image.new('RGB', (S * ss, S * ss), PAPER)
    out.paste(img.convert('RGB'), (pad * ss, (S * ss - ih) // 2))
    out.resize((S, S), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)

icon(180, 'apple-touch-icon.png')   # what iOS takes
icon(512, 'icon-512.png')           # what the manifest offers Android

for n in ('share.jpg', 'apple-touch-icon.png', 'icon-512.png'):
    p = os.path.join(OUT, n)
    print(f'  {n}  {Image.open(p).size[0]}x{Image.open(p).size[1]}  {os.path.getsize(p)/1024:.0f} KB')
