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
| 2 | `curl -K dem/urls.txt --parallel` | 390 Terrarium elevation tiles (z10, ~19 MB) |
| 3 | `mosaic.py` | `elev.npy` — stitched, despeckled elevation grid |
| 4 | `relief.py` | `relief_*.webp` + `frame.json` — hillshade & tint |

The crop in `relief.py` (`CW,CE,CS,CN`) sets the frame's aspect ratio, and
that ratio is what fixes the map's height on the page: the element is as wide
as its column, and `aspect-ratio` does the rest. It is currently
`-89.72, -81.82, 35.33, 40.32` — 7.90° of longitude by 4.99° of latitude,
which projects to about 1.25:1. Kentucky is a 2.27:1 state, so a frame cropped
close to it makes for a short, wide map; the extra latitude buys vertical
space on the page. Tighten the longitude margin and the state grows within
the frame. Changing the crop means re-running steps 5-6 as well.
| 5 | `geom.js` | `counties.json` — projected county paths, interior points, lon/lat |
| 6 | `water.js` | `water.json` — rivers, lakes, urban areas |

`facts.json` is hand-maintained, not generated — it is not part of this
pipeline and survives a full map rebuild.

Copy `frame.json`, `counties.json`, `water.json` and the chosen
`relief_*.webp` (as `relief.webp`) into `tools/data/`, then run `build.js`.

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
