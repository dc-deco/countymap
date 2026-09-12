# Map pipeline

`index.html` is a single self-contained file: the shaded-relief basemap is an
inlined WebP data URI and every vector layer is inlined SVG. Nothing is fetched
at play time. These scripts are what generated that data, kept so the map can be
rebuilt or re-tuned rather than being a black box.

## Rebuilding just the page

If `tools/data/` is present (it is committed), no network is needed:

```sh
node tools/build.js          # tools/data/* + tools/template.html -> index.html
```

Edit `tools/template.html` for any markup, CSS or game-logic change, then
rebuild. Do not hand-edit `index.html` — it is generated and will be overwritten.

The faint page backdrop is inlined behind the whole page at the opacity set
by `BACKDROP_OPACITY` in `build.js` (currently 0.15). It ships as **two**
crops, because `background-size: cover` cannot both fill a portrait screen
and show a landscape photo: on a ~0.5-aspect phone a 1.5-aspect image is
magnified about 3x and the sides are thrown away.

- `backdrop.webp` — landscape, used by default.
- `backdrop-tall.webp` — portrait composite for `max-aspect-ratio: 1/1`. The
  whole scene sits across the width over a blurred blow-up of itself, seam
  feathered, so a phone shows the vista rather than a magnified sliver.

`backdrop.jpeg` is the full-resolution source. Regenerate both with:

```sh
python3 tools/backdrop.py tools/data/backdrop.jpeg tools/data/backdrop.webp \
  --width 1400 --blur 1.4 --sat 0.65 --q 46
python3 tools/backdrop.py tools/data/backdrop.jpeg tools/data/backdrop-tall.webp \
  --portrait 1400x2100 --blur 1.2 --sat 0.65 --q 46
```

The blur is baked in rather than applied with a CSS filter: a filter on a
full-viewport fixed layer costs GPU on phones, and a pre-blurred image also
compresses about 3x smaller. Delete `backdrop.webp` (and the `.jpeg`) and the
build simply omits the rule.

The welcome sheet's header is `tools/data/welcome.webp`, inlined the same
way. Regenerate it from the source with:

```sh
python3 tools/backdrop.py tools/data/welcome.jpeg tools/data/welcome.webp \
  --width 1040 --blur 0 --sat 1.0 --q 82
```

Remove the file and the sheet simply renders without an image. The copy
itself lives in `tools/template.html`.

`tools/data/states.json` holds the neighbouring states, so a tap that misses
Kentucky can be told which state it landed in. These are never drawn — they
exist only for a ray cast — so `tools/states.js` cuts them down hard: clipped
to the map frame, simplified to 0.2 map units (about 90 m), and stored as flat
coordinate arrays rather than SVG paths. Nine states fall inside the frame,
653 points, 8 KB. Regenerate after any change to `frame.json` or the SVG size:

```sh
node tools/states.js
```

Thirteen states fall inside the current frame. Each one the reveal can name
needs a line in `STATE_HEADS` in the template, or it falls back to naming
itself.

Tolerance is safe because one CSS pixel is about 140 m even at full zoom, so
no seam it leaves along a state line is reachable with a finger. Where a
neighbour's outline does not quite meet Kentucky's — the Ohio and Mississippi
channels — a tap names no state and the reveal falls back to its generic
line; every such point measured sits within a tenth of a mile of the border.

The progress strip draws a blank Kentucky route marker per round. Unlike the
images above these are required, and they are masks rather than pictures: the
strip has to colour a marker four ways (still to come, current, played, dead
on), which one flat image cannot do. `tools/shield.py` cuts two alpha masks
out of the sign art — `shield-fill.webp` for the shape and `shield-ink.webp`
for the outlines and the word KENTUCKY — cropped to the sign's own bounding
box, so the CSS box needs no padding fudge:

```sh
python3 tools/shield.py tools/data/Highway.jpeg tools/data
```

It prints the aspect ratio it cropped to; that number is the `aspect-ratio`
on `.shield` in the template and has to move with the art. Size and colour of
the markers are CSS only — `--sw` on `.tape` is the single size knob.

Type is Lato, self-hosted from `tools/data/fonts/` and inlined as data URIs,
so the page makes no request to Google Fonts. Refresh the files with:

```sh
npm pack @fontsource/lato && tar xzf fontsource-lato-*.tgz
cp package/files/lato-latin-400-normal.woff2 tools/data/fonts/lato-400.woff2
cp package/files/lato-latin-700-normal.woff2 tools/data/fonts/lato-700.woff2
```

Lato has no 600 weight, so bold text is 700. Remove the files and the build
emits no @font-face, falling back to the system stack.

To fix or reword a county fun fact, edit `tools/data/facts.json` (a plain
name -> sentence map) and rebuild. The build fails if any of the 120 counties
is missing a fact, or if a fact names a county that does not exist. Facts are
rendered as text, never markup, so quotes and punctuation are safe.

## Regenerating the map data

Needs network plus `npm install` in `tools/` and `pip install numpy Pillow`.
Run from a scratch directory; each step writes into it.

| step | script | output |
| --- | --- | --- |
| 1 | `tiles.py` | tile list + `dem/meta.json` for the Kentucky bbox |
| 2 | `curl -K dem/urls.txt --parallel` | 650 Terrarium elevation tiles (z10, ~30 MB) |
| 3 | `mosaic.py` | `elev.npy` — stitched, despeckled elevation grid |
| 4 | `relief.py` | `relief_*.webp` + `frame.json` — hillshade & tint |

The crop in `relief.py` (`CW,CE,CS,CN`) sets the frame's aspect ratio, and
that ratio is what fixes the map's height on the page: the element is as wide
as its column, and `aspect-ratio` does the rest. It is currently
`-89.72, -81.82, 34.5125, 41.0759` — 7.90° of longitude by 6.56° of latitude,
which projects to about 0.95:1.

The longitude is not a free parameter. Kentucky fills 96.3% of the frame's
width and only 40% of its height, so the state is width-limited: at phone
width it is already drawn as large as the screen allows, and no crop makes it
bigger without cutting it off. Latitude is the only lever, and all it buys is
page height — more terrain above and below the same Kentucky. That is still
worth having, because the alternative is empty page.

The DEM bbox in `tiles.py` has to cover the crop with room to spare; it
currently runs 34.45-41.10N, two tile rows past each edge. Changing the crop
means re-running steps 5-6 and `states.js` as well, and regenerating the
border-distance reference with `refcases.py`, which stores map coordinates.
| 5 | `geom.js` | `counties.json` — projected county paths, interior points, lon/lat |
| 6 | `water.js` | `water.json` — rivers, lakes, urban areas |

## Link previews

`index.html` is the whole game, but two pictures cannot live inside it: Open
Graph will not take a data URI for `og:image`, and iOS will not take an SVG for
a home screen icon. `tools/social.py` builds both from the same relief and
county paths the game draws, so a pasted link looks like the thing it opens:

```sh
python3 tools/social.py     # -> share.jpg, apple-touch-icon.png in the repo root
```

`share.jpg` is 1200x630 with the wordmark set over the empty country north-west
of the state — a bar across the bottom cut the southern counties off, because
at that width Kentucky is 509px tall in a 630px card. JPEG rather than PNG (a
hillshade is a photograph to a compressor: 992 KB became 168 KB) and rather
than WebP (a preview has to render wherever it is pasted). Re-run it after any
change to the relief or the crop. The favicon needs no file — `build.js` draws
it from the state outline and inlines it as an SVG data URI.

## The daily five

`EASY`, `MID` and `HARD` in the template are the draw. A day takes one county
from EASY, one from EASY+MID, one from MID, one from MID+HARD and one from
HARD, rejecting any it has already taken, seeded off the date — so everyone
gets the same five and the same order.

Between them the three tiers must name all 120 counties, exactly once each;
`build.js` fails if any county is in none of them or in two. That check exists
because 33 counties sat in no tier for a while, which nothing could catch from
the outside: the game ran perfectly and simply never mentioned them.

The day itself is Eastern, not the player's own clock — the zone Louisville,
Lexington and Frankfort keep. It used to be local, which meant that between
midnight in the east and midnight in the west, half the country was on
tomorrow's counties: Kentucky straddles two zones, so the state split for an
hour every night, and a shared score could name a puzzle a friend had not been
given yet. `node tools/daycheck.js` sets seven devices in seven zones to one
instant and asserts they all draw the same five.

`node tools/rotation.js [days]` replays the shipped generator over consecutive
dates and reports how often each county comes round and when the five first
repeat. It measures the build rather than an idealised model, which matters:
the tiers cut the space from the 190,578,024 sets a flat draw would give to
about 55 million, and make an EASY county three times likelier on a given day
than a HARD one.

## Playing a day twice

Finishing locks the day, so the ordinary way to test the game — play it, play
it again — stops working after one run. Three query parameters reopen it:

| | |
|---|---|
| `?fresh` | forget today's board, keep the streak and the day count |
| `?wipe` | forget everything, arrive as a first-time visitor |
| `?day=2026-09-15` | play that day's five counties instead of today's |

`?fresh` and `?wipe` remove themselves from the address bar once they have
run, so the next reload behaves like an ordinary return visit — otherwise
there would be no way to test that returning works. `?day` stays, so a reload
lands back on the day under test; it also drives the date in the header and
the key the day is stored under, so persistence can be tested on any date. A
`?day` that is not `YYYY-MM-DD` is ignored.

Replaying with `?fresh` cannot inflate the tally: `finish()` only counts a run
when the record's last day is not the day just played.

These are typed, not hidden. Anyone who learns the words can replay a day —
the lock exists to make a shared score mean something, not to stop someone
determined, and a hatch you cannot type on a phone is no use on a phone.

`facts.json` is hand-maintained, not generated — it is not part of this
pipeline and survives a full map rebuild.

Copy `frame.json`, `counties.json`, `water.json` and the chosen
`relief_*.webp` (as `relief.webp`) into `tools/data/`, then run `build.js`.

`relief.py` renders at 1680px wide, which is about 3 megapixels — the budget
that keeps the inlined WebP near 300 KB. A taller crop means a narrower render
for the same bytes; 1680 is still 27% oversampled against a 440pt map on a 3x
phone.

`frame.json` is the contract between the raster and the vectors: it pins the
Web Mercator origin and zoom, so `geom.js`, `water.js` and the in-page
`svgToLonLat()` all land on the same pixels. Change the crop in `relief.py` and
steps 5-6 must be re-run.

## Data sources

- Elevation — Mapzen / AWS Terrain Tiles (`terrarium`), derived from USGS NED
  and SRTM. Public domain / open data.
- County and state boundaries — US Census Bureau cartographic boundaries, via
  the `us-atlas` package (public domain).
- Rivers, lakes, urban areas — Natural Earth 10m (public domain).
