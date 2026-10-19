# Local reflection radiance

The Shard's glazing now samples HDR panoramas rendered from the local London scene, rather than the generic sky environment used elsewhere. Captures sit at world positions `[2520.93, 45, -459.745]` and `[2520.93, 230, -459.745]`. The shader blends their roughness-filtered radiance by fragment height. Day, golden-hour and night each have a pair of maps; their weights follow the existing lighting transition, including interrupted transitions and lighting chosen before model loading.

The tower and its mapped skyline proxy are hidden during capture. Buildings, street positions, roofs, vegetation and sky come from the app's existing assets. The capture uses a static rough river surface and omits shadows. It is an approximation of local image-based lighting, without exact reflection parallax, moving-object updates, or photographed facade scans. The physical material models a dark opaque room backing under a clear dielectric surface; the source has no furnished interiors for full transmission.

Capture and filtering are offline. The app loads and prefilters the six maps only after the detailed Shard is requested. It uses shared maps for the glazing, preserves the existing pane-lighting and shadow hooks, and retains the original environment if local maps cannot load. Devices without floating-point color targets skip this feature. Reflection directions still change with the view and surface normal.

Desktop panoramas are 1024 × 512, about 8.6 MB combined, producing six 256-face CubeUV maps (about 38 MB of RGBA16F texture storage). Mobile panoramas are 512 × 256, about 2.3 MB combined, producing 128-face maps (about 9.4 MB). Mobile images are downsampled in linear radiance before RGBE encoding, preserving average light levels. All source files are below the static hosting file limit. The public download page lists attribution, license, panoramas and per-mode hashes.

The sky dome now follows a camera's world position. CubeCamera views are parented cameras, so reading their local position would misplace the sky during capture. The existing horizon test also checks this case.

To regenerate, run the local server and bake modes separately. Keep the scene source unchanged between captures:

```sh
node scripts/bake-shard-reflections.mjs day
node scripts/bake-shard-reflections.mjs golden
node scripts/bake-shard-reflections.mjs night
node scripts/prepare-mobile-reflections.mjs
npm run build
```

Each bake records its rendered source-bundle hash, capture settings and image hashes. The capture uses a reduced-motion 640 × 480 app view; this selects the smaller sky and vegetation assets, adequate for the 256-face probe resolution.

Validation:

```sh
node tests/reflection-hdr.mjs
node tests/reflection-assets.mjs
node tests/shard-reflections-browser.mjs
node tests/sky-browser.mjs
node tests/shard-browser.mjs
node tests/shard-browser.mjs mobile
```

Run full-city browser modes sequentially. The focused reflection fixture verifies upper/lower probes, lighting mixtures and directional reflected surroundings. The asset checks verify hashes, HDR decode, dimensions, day/night contrast, and mobile radiance preservation. Full-city checks verify lazy requests, device resolution, material integration, current lighting after load, mouse controls and reuse after returning to Westminster. These checks do not establish photographic realism.
