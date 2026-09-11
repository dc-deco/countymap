#!/usr/bin/env node
/* Neighbour-state shapes, for naming the state when a tap misses Kentucky.
   Usage: node tools/states.js [outDir]

   These are never drawn — they exist only so the reveal can say "that's Ohio".
   So they are cut down hard: clipped to the map frame, simplified, and stored
   as flat coordinate arrays for a ray-cast test instead of SVG paths.

   Tolerance is 0.2 map units, about 90 m. Fully zoomed in one CSS pixel is
   still ~140 m, so no gap this leaves along a state line is reachable with a
   finger. */
const fs = require('fs'), path = require('path');
const topo = require('topojson-client');

const DIR = process.argv[2] || path.join(__dirname, 'data');
const F = JSON.parse(fs.readFileSync(path.join(DIR, 'frame.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(DIR, 'counties.json'), 'utf8'));
const us = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'node_modules', 'us-atlas', 'states-10m.json'), 'utf8'));

const Z = F.z, WORLD = Math.pow(2, Z) * 256, SVG_W = C.svg_w, K = SVG_W / F.px_w;
const SVG_H = C.svg_h;
const lon2gx = l => (l + 180) / 360 * WORLD;
const lat2gy = l => { const r = l * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * WORLD; };
const px = ([lon, lat]) => [(lon2gx(lon) - F.org_x) * K, (lat2gy(lat) - F.org_y) * K];

const TOL = 0.2;
const PAD = 4;                      // clip a little outside the frame, so the
const BOX = { x0: -PAD, y0: -PAD, x1: SVG_W + PAD, y1: SVG_H + PAD };  // edges
                                    // of the map are still inside a state

/* Sutherland-Hodgman against the frame rectangle. Coincident edges it leaves
   behind along the cut do not affect a ray cast for a point inside the box. */
function clip(ring) {
  const edges = [
    [p => p[0] >= BOX.x0, (a, b) => [BOX.x0, a[1] + (b[1]-a[1]) * (BOX.x0-a[0]) / (b[0]-a[0])]],
    [p => p[0] <= BOX.x1, (a, b) => [BOX.x1, a[1] + (b[1]-a[1]) * (BOX.x1-a[0]) / (b[0]-a[0])]],
    [p => p[1] >= BOX.y0, (a, b) => [a[0] + (b[0]-a[0]) * (BOX.y0-a[1]) / (b[1]-a[1]), BOX.y0]],
    [p => p[1] <= BOX.y1, (a, b) => [a[0] + (b[0]-a[0]) * (BOX.y1-a[1]) / (b[1]-a[1]), BOX.y1]],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      const ai = inside(a), bi = inside(b);
      if (bi) { if (!ai) out.push(cut(a, b)); out.push(b); }
      else if (ai) out.push(cut(a, b));
    }
    if (!out.length) return [];
  }
  return out;
}

/* Douglas-Peucker */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    let far = -1, fd = tol;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = pts[i];
      const d = len === 0 ? Math.hypot(x - x1, y - y1)
                          : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([s, far], [far, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const R = n => Math.round(n * 10) / 10;
const feats = topo.feature(us, us.objects.states).features;
const out = [];
for (const f of feats) {
  if (f.properties.name === 'Kentucky') continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const projected = ring.map(px);
    /* cheap reject before clipping: a ring nowhere near the frame */
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of projected) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    if (maxx < BOX.x0 || minx > BOX.x1 || maxy < BOX.y0 || miny > BOX.y1) continue;
    const cut = simplify(clip(projected), TOL);
    if (cut.length >= 3) rings.push(cut.flatMap(p => [R(p[0]), R(p[1])]));
  }
  if (rings.length) out.push({ n: f.properties.name, r: rings });
}
/* biggest share of the frame first, so the common misses test first */
const span = s => s.r.reduce((a, r) => a + r.length, 0);
out.sort((a, b) => span(b) - span(a));

const file = path.join(DIR, 'states.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`${out.length} states in frame, ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
for (const s of out) console.log(`  ${s.n.padEnd(16)} ${s.r.length} ring(s), ${span(s) / 2} pts`);
