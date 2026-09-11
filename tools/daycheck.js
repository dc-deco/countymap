#!/usr/bin/env node
/* Everyone must get the same five counties at the same moment, or the game has
   no social half. Runs the shipped date logic and the shipped generator under
   a spread of device time zones, at instants either side of the rollover, and
   fails if any single instant produces more than one puzzle.
   Usage: node tools/daycheck.js */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* lifted out of the page itself, so this tests what ships */
const grab = k => eval(html.match(new RegExp('const ' + k + '\\s*=\\s*(\\[.*?\\]);', 's'))[1]);
const src = re => html.match(re)[0];
/* one eval, and const -> var, so the bindings land in this file's scope */
eval([
  src(/const DAY_ZONE = "[^"]+";/).replace(/^const /, 'var '),
  src(/function localIso\(d\)\{[\s\S]*?\n\}/),
  src(/function zoneIso\(d\)\{[\s\S]*?\n\}/),
  src(/^function seedFor\(d\)\{.*$/m),
  src(/^function rng\(s\)\{.*$/m),
].join('\n'));
const EASY = grab('EASY'), MID = grab('MID'), HARD = grab('HARD');
const TIER = [EASY, EASY.concat(MID), MID, MID.concat(HARD), HARD];
function puzzleFor(iso){
  const rand = rng(seedFor(iso)), out = [];
  for (const t of TIER){ let n, g = 0; do { n = t[Math.floor(rand() * t.length)]; g++; }
    while (out.includes(n) && g < 80); out.push(n); }
  return out;
}

const ZONES = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
               'Pacific/Honolulu','Europe/London','Europe/Helsinki','Asia/Kolkata',
               'Australia/Sydney','Pacific/Kiritimati','UTC'];
const INSTANTS = [
  ['11:59pm Eastern',        '2026-09-11T23:59:00-04:00'],
  ['12:01am Eastern',        '2026-09-12T00:01:00-04:00'],
  ['1:30am, DST falling back','2026-11-01T01:30:00-05:00'],
  ['11:59pm New Year Eve',   '2026-12-31T23:59:00-05:00'],
  ['noon Eastern',           '2027-03-14T12:00:00-04:00'],
];

if (process.argv[2] === '--one'){                 // child: one zone, one instant
  const d = new Date(process.argv[3]);
  process.stdout.write(JSON.stringify({ zone: process.env.TZ, iso: zoneIso(d),
    local: localIso(d), puzzle: puzzleFor(zoneIso(d)) }));
  process.exit(0);
}

console.log(`day zone: ${DAY_ZONE}\n`);
let bad = 0;
for (const [label, at] of INSTANTS){
  const rows = ZONES.map(tz => JSON.parse(spawnSync(process.execPath,
    [__filename, '--one', at], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).stdout));
  const days = new Set(rows.map(r => r.iso));
  const sets = new Set(rows.map(r => r.puzzle.join(',')));
  const locals = new Set(rows.map(r => r.local));
  const ok = days.size === 1 && sets.size === 1;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(26)} ${[...days].join(' / ')}  ${rows[0].puzzle.join(', ')}`);
  console.log(`     ${ZONES.length} zones agree on the day: ${days.size === 1}` +
              `  |  on the five: ${sets.size === 1}` +
              `  |  their own local dates differ: ${locals.size > 1}`);
}
console.log(bad ? `\n${bad} instant(s) split the players` : '\nevery zone draws the same five at the same moment');
process.exit(bad ? 1 : 0);
