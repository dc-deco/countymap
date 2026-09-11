#!/usr/bin/env node
/* How the daily counties rotate. Replays the page's own generator over
   consecutive dates, so it answers for the shipped build rather than for an
   idealised model — the difficulty tiers make the two very different.
   Usage: node tools/rotation.js [days] */
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const DAYS = +process.argv[2] || 400000;

const grab = k => eval(html.match(new RegExp('const ' + k + '\\s*=\\s*(\\[.*?\\]);', 's'))[1]);
const CO = JSON.parse(html.match(/const CO = (\{.*?\});/s)[1]);
const EASY = grab('EASY'), MID = grab('MID'), HARD = grab('HARD');
const TIER = [EASY, EASY.concat(MID), MID, MID.concat(HARD), HARD];

/* the page's own seed and PRNG, copied so this measures what ships */
const seedFor = d => { let h = 2166136261; for (const c of d) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function drawFrom(rand){
  const out = [];
  for (const t of TIER){ let n, g = 0; do { n = t[Math.floor(rand() * t.length)]; g++; }
    while (out.includes(n) && g < 80); out.push(n); }
  return out;
}
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
const yrs = d => (d / 365.2425).toFixed(1);

const all = Object.keys(CO);
const tiers = [...EASY, ...MID, ...HARD];
console.log(`tiers: EASY ${EASY.length}  MID ${MID.length}  HARD ${HARD.length}  = ${tiers.length} of ${all.length} counties`);
const missing = all.filter(n => !tiers.includes(n));
if (missing.length) console.log(`  NEVER ASKED (${missing.length}): ${missing.join(', ')}`);

/* the real calendar: when does a day actually repeat an earlier one */
const seenSet = new Map(), seenSeq = new Map(), freq = new Map();
let firstSet = null, firstSeq = null;
const start = Date.UTC(2026, 8, 11);
for (let i = 0; i < DAYS; i++){
  const iso = isoOf(new Date(start + i * 86400000));
  const p = drawFrom(rng(seedFor(iso)));
  for (const n of p) freq.set(n, (freq.get(n) || 0) + 1);
  const seq = p.join('|'), set = [...p].sort().join('|');
  if (!firstSeq && seenSeq.has(seq)) firstSeq = { i, iso, prev: seenSeq.get(seq) };
  if (!firstSet && seenSet.has(set)) firstSet = { i, iso, prev: seenSet.get(set), p };
  if (!seenSeq.has(seq)) seenSeq.set(seq, iso);
  if (!seenSet.has(set)) seenSet.set(set, iso);
}
console.log(`\nfrom ${isoOf(new Date(start))}, over ${DAYS.toLocaleString()} days:`);
console.log('  first repeated five  :', firstSet
  ? `${firstSet.iso} replays ${firstSet.prev} — day ${firstSet.i.toLocaleString()}, ${yrs(firstSet.i)} years (${firstSet.p.join(', ')})`
  : 'none');
console.log('  first repeated order :', firstSeq
  ? `${firstSeq.iso} replays ${firstSeq.prev} — day ${firstSeq.i.toLocaleString()}, ${yrs(firstSeq.i)} years` : 'none');

/* how big the space really is, from the rate collisions actually happen */
const D = 2000000, seen = new Set();
let coll = 0;
for (let i = 0; i < D; i++){
  const k = drawFrom(rng((i * 2654435761) >>> 0)).sort().join('|');
  if (seen.has(k)) coll++; else seen.add(k);
}
const N = D * D / (2 * coll);
console.log(`\neffective space: ${Math.round(N).toLocaleString()} equally-likely sets`);
console.log(`  (a flat draw from all ${all.length} would be ${(function(n,k){let r=1;for(let i=0;i<k;i++)r=r*(n-i)/(i+1);return Math.round(r);})(all.length,5).toLocaleString()})`);
for (const p of [0.01, 0.10, 0.50, 0.90]){
  const n = Math.sqrt(2 * N * Math.log(1 / (1 - p)));
  console.log(`  ${String(p * 100).padStart(3)}% chance of a repeat by day ${Math.round(n).toLocaleString().padStart(7)}  (${yrs(n)} years)`);
}
const f = [...freq.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nhow often a county comes round: ${(DAYS / f[0][1]).toFixed(1)} days (${f[0][0]}) to ${(DAYS / f[f.length - 1][1]).toFixed(1)} days (${f[f.length - 1][0]})`);
