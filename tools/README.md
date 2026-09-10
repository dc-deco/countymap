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

## Regenerating the map data

Needs network plus `npm install` in `tools/` and `pip install numpy Pillow`.
Run from a scratch directory; each step writes into it.

| step | script | output |
| --- | --- | --- |
| 1 | `tiles.py` | tile list + `dem/meta.json` for the Kentucky bbox |
| 2 | `curl -K dem/urls.txt --parallel` | 390 Terrarium elevation tiles (z10, ~19 MB) |
| 3 | `mosaic.py` | `elev.npy` — stitched, despeckled elevation grid |
| 4 | `relief.py` | `relief_*.webp` + `frame.json` — hillshade & tint |
| 5 | `geom.js` | `counties.json` — projected county paths, interior points, lon/lat |
| 6 | `water.js` | `water.json` — rivers, lakes, urban areas |

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
