"""Independent reference for the border-distance scoring, in Python.

Rebuilt for the taller frame. Mirrors nothing from the page's JavaScript: the
point-to-segment projection, the inverse Mercator and the haversine are
written out here so that agreement between the two is evidence, not a shared
bug. 60 pairs, picked by a fixed stride so the set is stable run to run.
"""
import json, math, os, re, sys

DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), 'data')
OUT = sys.argv[2] if len(sys.argv) > 2 else 'cases.json'
F = json.load(open(os.path.join(DIR, 'frame.json')))
C = json.load(open(os.path.join(DIR, 'counties.json')))
Z = F['z']; WORLD = 2 ** Z * 256
K = C['svg_w'] / F['px_w']

def svg_to_lonlat(x, y):
    gx = x / K + F['org_x']; gy = y / K + F['org_y']
    lon = gx / WORLD * 360.0 - 180.0
    n = math.pi * (1 - 2 * gy / WORLD)
    return lon, math.degrees(math.atan(math.sinh(n)))

def haversine_mi(a, b):
    lo1, la1 = a; lo2, la2 = b
    R = 3958.7613
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = p2 - p1; dl = math.radians(lo2 - lo1)
    s = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(s))

def rings(d):
    out = []
    for sub in d.split('Z'):
        pts = [(float(a), float(b)) for a, b in re.findall(r'[ML](-?[\d.]+) (-?[\d.]+)', sub)]
        if len(pts) > 1: out.append(pts)
    return out

def nearest_on_border(px, py, d):
    best = None; bd = float('inf')
    for ring in rings(d):
        for i in range(len(ring)):
            ax, ay = ring[i - 1]; bx, by = ring[i]
            dx, dy = bx - ax, by - ay
            L = dx * dx + dy * dy
            t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
            qx, qy = ax + t * dx, ay + t * dy
            dist = math.hypot(px - qx, py - qy)
            if dist < bd: bd = dist; best = (qx, qy)
    return best

def score(mi):
    return max(0, round(100 * math.exp(-((mi / 85.0) ** 1.4))))

cs = sorted(C['counties'], key=lambda c: c['name'])
n = len(cs)
cases = []
for i in range(60):
    a = cs[(i * 7) % n]; b = cs[(i * 23 + 11) % n]
    if a['name'] == b['name']: b = cs[(i * 23 + 12) % n]
    q = nearest_on_border(a['x'], a['y'], b['d'])
    mi = haversine_mi(svg_to_lonlat(a['x'], a['y']), svg_to_lonlat(*q))
    cases.append(dict(**{'from': a['name']}, to=b['name'],
                      px=round(a['x'], 1), py=round(a['y'], 1),
                      mi=round(mi, 4), score=score(mi)))
json.dump(cases, open(OUT, 'w'))
d = [c['mi'] for c in cases]
print(f"{len(cases)} reference cases, {min(d):.1f}-{max(d):.1f} mi")
