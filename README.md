# London, in another light

An interactive Three.js reconstruction of central London, with bundled OpenStreetMap building footprints, roads, riverbanks, green areas and tree positions. It includes a detailed Elizabeth Tower model, a textured Westminster Abbey scan, reflective Thames water, the London Eye, moving riverboats and red double decker buses.

## Run

From the workspace root:

```sh
npm run dev
```

Open http://localhost:5173. To rebuild after editing `london/src/`, run `npm run build`. Dependencies are installed in `london/`; on a new checkout, first run `npm --prefix london install`.

Browser checks can also run separately from `london/` with `node tests/browser.mjs desktop`, `node tests/browser.mjs mobile`, and `node tests/browser.mjs motion`. This keeps each browser check independently resumable in environments with command time limits.

## Controls

- Left drag: orbit. Right drag: pan. Scroll: zoom.
- Touch: one finger to orbit; pinch and two fingers to zoom and pan.
- Keyboard: arrow keys pan; plus and minus zoom.
- Choose a landmark for a camera transition, or select a time of day.
- The circular arrow restores the opening view; the orbit button starts an automatic rotation.
- Audio starts only after clicking Sound. It is synthesized river and traffic ambience, not a live recording.
- Reduced-motion browser preferences pause environmental movement and use immediate view changes.

## Scope and fidelity

The surrounding city now uses real OpenStreetMap outlines, courtyard holes, curved roads and riverbanks over a region about four kilometres across. Recorded building heights and levels are used where available; other heights and some roof forms are estimates. The Palace, bridge and London Eye remain architectural recreations; the Abbey is a photographic scan. The façade textures are generated architectural interpretations, not photographs of the corresponding buildings. This is not a complete geographical model of London, and the current scene does not meet a claim of being indistinguishable from real photography.

## Rendering

The color scene renders into a linear HDR buffer. Contact shading uses the same depth texture, preserving cutout leaves and avoiding an additional full-city normal pass. A single ACES display transform and SMAA edge smoothing finish the image. Render targets resize with the viewport.

The visible sky uses a locally hosted 8K photograph on desktop and 4K on smaller displays. It is drawn directly on a sky dome so the browser does not allocate six additional high-resolution cube faces. The separate HDR environment still supplies lighting and material reflections.

The river uses a water-air Fresnel reflectance of approximately 0.02, filtered linear reflections, several scales of wind ripples and five boat-following wake sources. Reduced-motion preferences freeze the environmental motion.

Nearby riverfront buildings have actual recessed window openings and projecting sills. Window bays fit each wall segment, and complete atlas rows fit each storey, avoiding sliced windows at corners and rooflines. The same openings control glass roughness and night illumination. Spatial groups switch to matching flat frontages at distance, with hysteresis to reduce switching while orbiting. Courtyard openings follow the inward-facing walls. These details remain interpretations of the mapped buildings, rather than surveyed architectural geometry.

The Palace has separate pointed window openings, recessed glazing, stone mouldings and mullions on its river, west, end and courtyard walls. Steeper intersecting roofs carry metre-scale iron plate shading, gutters and dormers. The roof turrets and octagonal Central Tower have articulated lanterns, ribs and crocketed spires. This reconstruction uses Parliament's descriptions of the [Gothic design](https://www.parliament.uk/about/living-heritage/building/palace/architecture/palacestructure/new-gothic-vision/), [cast iron roof restoration](https://www.parliament.uk/mps-lords-and-offices/offices/commons/media-relations-group/press-releases/18-january-commons-and-lords-speakers-celebrate-conclusion-of-major-parliament-restoration-project/), and [Central Tower restoration](https://www.parliament.uk/globalassets/documents/commons-information-office/g12.pdf) as architectural references. Individual dimensions, roof arrangements and decorative details remain estimates; it is not a measured conservation model. Reference photographs are not redistributed with the app.

Victoria Tower is a separate hollow architectural model aligned with its mapped footprint. Two tiers of tall arched windows, smaller window bands, recessed glazing, layered mouldings, an open entrance passage, pierced parapets and four corner lanterns replace the generic tower. Its overall stone height follows Parliament's published [98.5 metre height](https://www.parliament.uk/about/living-heritage/building/palace/architecture/palacestructure/victoria-tower/); secondary dimensions and carvings are interpretations. A sixth landmark view provides a closer look. The locally hosted Union Flag bends in the wind, and reduced-motion preferences freeze it alongside the other environmental animation.

Vegetation uses the bundled Poly Haven tree model, with real branch and leaf geometry nearby. Leaves retain their opacity mask, and each connected leaf surface is retained as an individually oriented textured card. At load time, the renderer bakes 24 transparent views of the same model into a local GPU atlas: eight directions at three elevations. Distant trees select a view and face the camera. A distance fade and fixed detail budget limit the nearby geometry to 16 trees on desktop and eight on mobile. The canopy and its shadows share a gentle wind deformation; reduced-motion preferences freeze it. Tree shapes are generic broadleaf trees rather than surveyed London species.

To rebuild the tree asset, download the 1K glTF package and separate leaf opacity map for [Tree Small 02](https://polyhaven.com/a/tree_small_02), then run `node scripts/prepare-tree.mjs /path/to/tree.gltf /path/to/leaves-alpha.jpg dist/assets/tree-canopy.glb`. The script packs leaf alpha, converts leaf surfaces to cards, simplifies the wood, and uses WebP textures and meshopt geometry compression. Browser QA checks the runtime atlas and detail budgets; the asset test inspects actual decoded alpha pixels and verifies that all 30,250 leaf islands survive.

## Bundled map data

`dist/assets/london-map.json` is an adapted extract of [OpenStreetMap](https://www.openstreetmap.org/copyright) data, supplied by [Geofabrik](https://download.geofabrik.de/europe/united-kingdom/england/greater-london.html), under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Copyright OpenStreetMap contributors. Coordinates are projected into local metres around Elizabeth Tower, with source attribution and projection parameters retained in the JSON. The app makes no live map requests.

To regenerate the extract, install the Python packages in `scripts/requirements.txt`, download the Greater London `.osm.pbf` outside the project, then run:

```sh
python3 scripts/extract-london.py /path/to/greater-london.osm.pbf dist/assets/london-map.json
python3 scripts/prepare-map.py dist/assets/london-map.json
```

## Asset credits

- [Clock Tower (Big Ben)](https://sketchfab.com/3d-models/9a1c691fac774bcca4e2ba565c4c9d9b) by ManySince910, CC BY 4.0. Scaled and material settings adjusted.
- [Westminster Abbey, London, UK](https://sketchfab.com/3d-models/33175190a3ab441e908bd18796c3803d) by Brian Trepanier, CC BY 4.0. Geometry simplified, textures resized and compressed. Both models retrieved from the public Allen Institute Objaverse dataset.
- [Sandstone Blocks 05](https://polyhaven.com/a/sandstone_blocks_05), [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), and [Tree Small 02](https://polyhaven.com/a/tree_small_02), Poly Haven, CC0. Tree Small 02 by Rico Cilliers is simplified and its separate leaf opacity map packed into the color texture; its transparent preview remains a loading fallback. The visible sky uses the Kloofendal asset’s 8K tonemapped photograph, converted to WebP at 8K and 4K; the original 2K HDR remains the lighting source.
- [Brick Wall 11](https://polyhaven.com/a/brick_wall_11), [Grey Plaster 03](https://polyhaven.com/a/grey_plaster_03), [Asphalt 02](https://polyhaven.com/a/asphalt_02), [Roof Slates 02](https://polyhaven.com/a/roof_slates_02), and [Grass Ground](https://polyhaven.com/a/grass_ground), Poly Haven, CC0.
- Three architectural façade textures generated with the built-in imagegen tool. Originals, browser filenames and complete prompts are documented in [art-assets/GENERATION.md](art-assets/GENERATION.md).
- Three.js and its water normal texture: MIT license.
- [Union Flag SVG (1:2)](https://commons.wikimedia.org/wiki/File:Flag_of_the_United_Kingdom_(1-2).svg), Wikimedia Commons, public domain. Reused locally as the Victoria Tower flag texture; line endings normalized.

All scene assets are hosted with the app. Google Fonts is the only external runtime request; system fonts provide the fallback.
