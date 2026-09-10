#!/usr/bin/env python3
"""Prepare the page backdrop: shrink, optionally soften, and write WebP.
The result is inlined by build.js, and sits at ~7% opacity behind the page,
so detail is invisible - compress hard.
Usage: python3 tools/backdrop.py [source] [out] [--blur R] [--sat S] [--width W] [--q Q]
"""
import sys
from PIL import Image, ImageFilter, ImageEnhance
a = sys.argv[1:]
src = a[0] if a and not a[0].startswith('--') else 'tools/data/backdrop.jpeg'
out = a[1] if len(a) > 1 and not a[1].startswith('--') else 'tools/data/backdrop.webp'
def opt(name, default, cast=float):
    return cast(a[a.index(name)+1]) if name in a else default
W   = opt('--width', 1200, int)
Q   = opt('--q', 50, int)
BL  = opt('--blur', 0.0)
SAT = opt('--sat', 1.0)
im = Image.open(src).convert('RGB')

# --portrait WxH: fit the whole scene across the width of a tall canvas and
# fill the rest with a heavily blurred blow-up of itself, feathered at the
# seam. Lets `background-size:cover` on a phone show the entire vista instead
# of a magnified centre slice.
if '--portrait' in a:
    PW, PH = (int(v) for v in a[a.index('--portrait')+1].lower().split('x'))
    sc = max(PW/im.size[0], PH/im.size[1])
    fill = im.resize((round(im.size[0]*sc), round(im.size[1]*sc)), Image.LANCZOS)
    fill = fill.crop((round((fill.size[0]-PW)/2), round((fill.size[1]-PH)/2),
                      round((fill.size[0]-PW)/2)+PW, round((fill.size[1]-PH)/2)+PH))
    fill = fill.filter(ImageFilter.GaussianBlur(PW*0.05))
    front = im.resize((PW, round(PW*im.size[1]/im.size[0])), Image.LANCZOS)
    top = round((PH - front.size[1]) / 2)
    feather = max(8, round(front.size[1]*0.12))
    mask = Image.new('L', front.size, 255)
    px = mask.load()
    for y in range(feather):
        v = round(255*y/feather)
        for x in range(front.size[0]):
            px[x, y] = v
            px[x, front.size[1]-1-y] = v
    fill.paste(front, (0, top), mask)
    im = fill
else:
    im = im.resize((W, round(W*im.size[1]/im.size[0])), Image.LANCZOS)
if BL:  im = im.filter(ImageFilter.GaussianBlur(BL))
if SAT != 1.0: im = ImageEnhance.Color(im).enhance(SAT)
im.save(out, 'WEBP', quality=Q, method=6)
import os
print(f"{out}: {im.size[0]}x{im.size[1]}  {os.path.getsize(out)/1024:.0f} KB "
      f"(base64 {os.path.getsize(out)*4/3/1024:.0f} KB)  blur={BL} sat={SAT} q={Q}")
