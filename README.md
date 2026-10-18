# London, in another light

An interactive Three.js reconstruction of the Westminster riverfront, including a detailed Elizabeth Tower model, a textured Westminster Abbey scan, reflective Thames water, the London Eye, moving riverboats and red double decker buses.

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

This is an architectural recreation of a part of London. The riverfront, surrounding city blocks, bridge and Palace are constructed geometry; the Abbey is a photographic scan. The layout is approximate, and this is not a complete geographical model of London. The current scene does not meet a claim of being indistinguishable from real photography.

## Asset credits

- [Clock Tower (Big Ben)](https://sketchfab.com/3d-models/9a1c691fac774bcca4e2ba565c4c9d9b) by ManySince910, CC BY 4.0. Scaled and material settings adjusted.
- [Westminster Abbey, London, UK](https://sketchfab.com/3d-models/33175190a3ab441e908bd18796c3803d) by Brian Trepanier, CC BY 4.0. Geometry simplified, textures resized and compressed. Both models retrieved from the public Allen Institute Objaverse dataset.
- [Sandstone Blocks 05](https://polyhaven.com/a/sandstone_blocks_05), [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), and [Tree Small 02](https://polyhaven.com/a/tree_small_02), Poly Haven, CC0. The tree uses the asset's transparent preview image as a distant impostor.
- Three.js and its water normal texture: MIT license.

All scene assets are hosted with the app. Google Fonts is the only external runtime request; system fonts provide the fallback.
