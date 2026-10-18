# London, in another light

An interactive Three.js reconstruction of central London, with bundled OpenStreetMap building footprints, roads, riverbanks, green areas and tree positions. It includes a detailed Elizabeth Tower model, a textured Westminster Abbey scan, reflective Thames water, the London Eye, moving riverboats and red double decker buses.

## Run

From the workspace root:

```sh
npm run dev
```

Open http://localhost:5173. To rebuild after editing `london/src/`, run `npm run build`. Dependencies are installed in `london/`; on a new checkout, first run `npm --prefix london install`.

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
- [Sandstone Blocks 05](https://polyhaven.com/a/sandstone_blocks_05), [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), and [Tree Small 02](https://polyhaven.com/a/tree_small_02), Poly Haven, CC0. The tree uses the asset's transparent preview image as a distant impostor.
- [Brick Wall 11](https://polyhaven.com/a/brick_wall_11), [Grey Plaster 03](https://polyhaven.com/a/grey_plaster_03), [Asphalt 02](https://polyhaven.com/a/asphalt_02), [Roof Slates 02](https://polyhaven.com/a/roof_slates_02), and [Grass Ground](https://polyhaven.com/a/grass_ground), Poly Haven, CC0.
- Three architectural façade textures generated with the built-in imagegen tool. Originals, browser filenames and complete prompts are documented in [art-assets/GENERATION.md](art-assets/GENERATION.md).
- Three.js and its water normal texture: MIT license.

All scene assets are hosted with the app. Google Fonts is the only external runtime request; system fonts provide the fallback.
