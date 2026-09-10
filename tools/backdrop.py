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
im = im.resize((W, round(W*im.size[1]/im.size[0])), Image.LANCZOS)
if BL:  im = im.filter(ImageFilter.GaussianBlur(BL))
if SAT != 1.0: im = ImageEnhance.Color(im).enhance(SAT)
im.save(out, 'WEBP', quality=Q, method=6)
import os
print(f"{out}: {im.size[0]}x{im.size[1]}  {os.path.getsize(out)/1024:.0f} KB "
      f"(base64 {os.path.getsize(out)*4/3/1024:.0f} KB)  blur={BL} sat={SAT} q={Q}")
