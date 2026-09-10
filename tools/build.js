#!/usr/bin/env node
/* Assembles index.html from the template plus the generated map data.
   Usage: node tools/build.js [dataDir] [outFile]
   dataDir must contain frame.json, counties.json, water.json and relief.webp
   (see tools/README.md for how those are produced). */
const fs = require('fs'), path = require('path');
const DATA = process.argv[2] || path.join(__dirname, 'data');
const OUT  = process.argv[3] || path.join(__dirname, '..', 'index.html');
const rd = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const frame = rd('frame.json');
const C = rd('counties.json');
const W = rd('water.json');
const FACTS = rd('facts.json');
const webp = fs.readFileSync(path.join(DATA, 'relief.webp'));

/* Optional page backdrop: drop a backdrop.* into tools/data and it gets
   inlined. Absent, the rule is omitted entirely and the page is unchanged. */
const BACKDROP_OPACITY = 0.07;
const backdropFile = ['backdrop.webp','backdrop.jpg','backdrop.jpeg','backdrop.png']
  .map(f => path.join(DATA, f)).find(fs.existsSync);
let backdropCss = '';
if (backdropFile) {
  const ext = path.extname(backdropFile).slice(1).replace('jpg','jpeg');
  const uri = 'data:image/' + ext + ';base64,' + fs.readFileSync(backdropFile).toString('base64');
  backdropCss =
`/* faint page backdrop; the map and panels paint over it opaquely */
body::before{
  content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:url(${uri}) center center / cover no-repeat;
  opacity:${BACKDROP_OPACITY};
}`;
}

const SVG_W = C.svg_w, SVG_H = C.svg_h;
const K = SVG_W / frame.px_w;
const FRAME = { k:+K.toFixed(10), ox:frame.org_x, oy:frame.org_y, world:Math.pow(2,frame.z)*256 };

const counties = C.counties.map(c => `<path d="${c.d}" data-n="${c.name}"/>`).join('\n');
const CO = {};
for (const c of C.counties) CO[c.name] = { x:c.x, y:c.y, lon:c.lon, lat:c.lat };
const NAMES = C.counties.map(c => c.name);

/* rivers grouped by stroke width so the DOM stays small */
const byW = new Map();
for (const r of W.rivers) {
  if (!byW.has(r.w)) byW.set(r.w, []);
  byW.get(r.w).push(r.d);
}
const rivers = [...byW.entries()].sort((a,b)=>b[0]-a[0])
  .map(([w, ds]) => `<g stroke-width="${w}">` + ds.map(d=>`<path d="${d}"/>`).join('') + `</g>`)
  .join('\n');
const lakes = W.lakes.map(l => `<path d="${l.d}"/>`).join('');
const urban = W.urban.map(u => `<path d="${u.d}"/>`).join('');

let html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const subs = {
  __SVG_W__: String(SVG_W),
  __SVG_H__: String(SVG_H),
  __TERRAIN__: 'data:image/webp;base64,' + webp.toString('base64'),
  __COUNTY_PATHS__: counties,
  __OUTLINE__: C.outline,
  __RIVERS__: rivers,
  __LAKES__: lakes,
  __URBAN__: urban,
  __NAMES__: JSON.stringify(NAMES),
  __CENT__: JSON.stringify(CO),
  __FRAME__: JSON.stringify(FRAME),
  __FACTS__: JSON.stringify(FACTS),
  __BACKDROP_CSS__: backdropCss,
};

/* every county must carry a fact, or the reveal falls flat for that round */
const noFact = NAMES.filter(n => !FACTS[n] || !String(FACTS[n]).trim());
if (noFact.length) { console.error('counties missing a fact:', noFact); process.exit(1); }
const orphan = Object.keys(FACTS).filter(n => !CO[n]);
if (orphan.length) { console.error('facts with no matching county:', orphan); process.exit(1); }
for (const [k, v] of Object.entries(subs)) html = html.split(k).join(v);

const left = html.match(/__[A-Z_]+__/g);
if (left) { console.error('unsubstituted placeholders:', [...new Set(left)]); process.exit(1); }
fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT}  ${(fs.statSync(OUT).size/1024).toFixed(0)} KB`);
console.log(`  ${NAMES.length} counties, ${W.rivers.length} river segs, ${W.lakes.length} lakes, ${W.urban.length} urban`);
console.log(`  relief ${(webp.length/1024).toFixed(0)} KB webp -> ${(webp.length*4/3/1024).toFixed(0)} KB base64`);
console.log(backdropFile
  ? `  backdrop ${path.basename(backdropFile)} ${(fs.statSync(backdropFile).size/1024).toFixed(0)} KB at ${BACKDROP_OPACITY} opacity`
  : '  backdrop none (add tools/data/backdrop.jpg to enable)');
