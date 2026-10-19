# Local Greater London context

`london-context.gltf` extends the detailed Westminster scene with simplified OSM volumes within a 6 km radius. It uses the core map's metre projection, source footprints, courtyard holes, mapped heights, colours, wall materials and available roof forms. Missing heights remain estimates. This is architectural context, not a photogrammetric scan.

The generated asset contains 116,823 additional volumes, 46,488 with recorded height/level information, 3,680 pitched roofs, 22 domes and 63,806 mapped tree locations. Geometry is batched by 800 m tiles and material. Whole-wall quads use metric façade UVs; only complete atlas rows repeat. Glass roof sections use the curtain-wall material. Building parts replace parent envelopes only when their height intervals and projected footprints cover the parent.

Runtime materials share the existing local PBR maps and lighting uniforms. Attach the region before cascaded shadow setup so its material hooks receive the same sunlight. The river extends beneath the regional land polygons, which preserve mapped water openings. The original ground ring remains the fallback if the context cannot load.

The compressed spatial buffers are each below 8 MB. Total geometry transfer is approximately 60 MB; no paid service, key or runtime map request is used. Regional geometry has fewer details than the core and adds loading and rendering cost, especially on mobile.

## Rebuild from the bundled source

```sh
gzip -dc dist/assets/london-context-source.json.gz > /tmp/london-region.json
node --max-old-space-size=6144 scripts/prepare-region.mjs /tmp/london-region.json dist/assets/london-context.gltf
npm run build
node tests/region.mjs
node tests/colours-browser.mjs
```

To refresh the source, install Python `osmium` and `shapely` in a suitable environment, obtain the Greater London PBF from Geofabrik, then run:

```sh
python3 scripts/extract-region.py greater-london.osm.pbf dist/assets/london-map.json /tmp/london-region.json 6000
```

The derived source includes ODbL attribution and is downloadable in the controls dialog. Browser checks require the local server; run each full-scene mode separately:

```sh
npm run dev
node tests/region-browser.mjs
node tests/browser.mjs desktop
node tests/browser.mjs mobile
```
