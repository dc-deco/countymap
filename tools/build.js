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
const BACKDROP_OPACITY = 0.15;
const uriFor = f => {
  const ext = path.extname(f).slice(1).replace('jpg','jpeg');
  return `data:image/${ext};base64,` + fs.readFileSync(f).toString('base64');
};
const pick = names => names.map(f => path.join(DATA, f)).find(fs.existsSync);
/* Two crops. A landscape photo cannot both fill a portrait screen and show
   the whole scene: `cover` on a ~0.5-aspect phone magnifies a 1.5-aspect
   image about 3x and throws away the sides. backdrop-tall is a portrait
   composite (whole vista over a blurred blow-up of itself) used whenever the
   viewport is taller than it is wide. */
const wideFile = pick(['backdrop.webp','backdrop.jpg','backdrop.jpeg','backdrop.png']);
const tallFile = pick(['backdrop-tall.webp','backdrop-tall.jpg','backdrop-tall.png']);
const backdropSrc = pick(['backdrop.jpg','backdrop.jpeg','backdrop.png']);
if (backdropSrc && wideFile && wideFile !== backdropSrc &&
    fs.statSync(backdropSrc).mtimeMs > fs.statSync(wideFile).mtimeMs) {
  console.error(`  ! ${path.basename(backdropSrc)} is newer than ${path.basename(wideFile)} — ` +
    `run tools/backdrop.py to regenerate, or the old backdrop stays inlined`);
}
/* Welcome sheet header. Optional: with no file the sheet simply has no image. */
const welcomeFile = pick(['welcome.webp','welcome.jpg','welcome.jpeg','welcome.png']);
const welcomeImg = welcomeFile
  ? `<img class="welcomeimg" src="${uriFor(welcomeFile)}" alt="The Welcome to Kentucky state line sign, reading Unbridled Spirit">`
  : '';

let backdropCss = '';
if (wideFile) {
  backdropCss =
`/* faint page backdrop; the map and panels paint over it opaquely */
body::before{
  content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:url(${uriFor(wideFile)}) center center / cover no-repeat;
  opacity:${BACKDROP_OPACITY};
}`;
  if (tallFile) backdropCss +=
`
/* portrait viewports get the tall crop, so a phone shows the whole scene
   rather than a magnified sliver of its middle */
@media (max-aspect-ratio: 1/1){
  body::before{background-image:url(${uriFor(tallFile)})}
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
  __WELCOME_IMG__: welcomeImg,
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
console.log(welcomeFile
  ? `  welcome ${path.basename(welcomeFile)} ${(fs.statSync(welcomeFile).size/1024).toFixed(0)} KB`
  : '  welcome image none');
console.log(wideFile
  ? `  backdrop ${path.basename(wideFile)} ${(fs.statSync(wideFile).size/1024).toFixed(0)} KB` +
    (tallFile ? ` + ${path.basename(tallFile)} ${(fs.statSync(tallFile).size/1024).toFixed(0)} KB` : ' (no portrait crop)') +
    ` at ${BACKDROP_OPACITY} opacity`
  : '  backdrop none (add tools/data/backdrop.jpg to enable)');
