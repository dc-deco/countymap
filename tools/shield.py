#!/usr/bin/env python3
"""Turns the blank Kentucky route marker into the two alpha masks the progress
strip paints with.

The source is a black-on-white JPEG of the sign. A single flat image could not
be recoloured, and the strip needs four states (pending, current, played,
exact hit), so the sign is split into the parts that take different colours:

  shield-fill.webp  alpha = everything inside the outer outline
  shield-ink.webp   alpha = the outlines, the rule and the word KENTUCKY

The page paints the fill mask in the state's colour and lays the ink mask over
it in the contrasting one. Both are cropped to the sign's own bounding box, so
the CSS box and the artwork line up with no padding to guess at.

Usage: python3 tools/shield.py [source] [outdir]
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'data', 'Highway.jpeg')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'data')
# 4x the largest size the strip draws at, which covers a 3x phone with room
# to spare. Lossless, because a lossy alpha channel frays a hard edge.
TARGET_W = 208

g = np.array(Image.open(SRC).convert('L'))
ink = g < 128

# Outside is whatever white the image border connects to; everything else is
# the sign. Flood filling beats a bounding box here because the shield's
# shoulders curve in and the corners are not part of it.
lab, _ = ndimage.label(~ink)
sil = lab != lab[0, 0]

ys, xs = np.where(sil)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
sil = sil[y0:y1+1, x0:x1+1]
ink = ink[y0:y1+1, x0:x1+1] & sil
h, w = sil.shape
tw = TARGET_W
th = round(tw * h / w)

def save(mask, name):
    """Alpha-only RGBA: the colour comes from CSS, the image only says where."""
    a = Image.fromarray((mask * 255).astype(np.uint8), 'L') \
             .resize((tw, th), Image.Resampling.LANCZOS)
    img = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    img.putalpha(a)
    p = os.path.join(OUT, name)
    img.save(p, 'WEBP', lossless=True, quality=100, method=6)
    print(f'  {name}  {tw}x{th}  {os.path.getsize(p)/1024:.1f} KB')

print(f'{os.path.basename(SRC)}: sign {w}x{h} at ({x0},{y0}), aspect {w/h:.4f}')
save(sil, 'shield-fill.webp')
save(ink, 'shield-ink.webp')
print(f'  css aspect-ratio: {w}/{h}')
