# Offscreen scene antialiasing

The color pass renders into an EffectComposer render target. The canvas's `antialias: true` setting applies to the default framebuffer and does not multisample that offscreen target. SMAA after the color pass can smooth silhouettes, but cannot recover an averaged sample of very fine mesh detail. The Shard's dense mullion geometry consequently produced broad moiré patterns that looked like broken glass panels.

The scene buffers now use a sample count supported by both the selected color format (RGBA16F with the float-color extension, RGBA8 otherwise) and DEPTH_COMPONENT24, capped at four samples. Desktop selects the highest supported count; mobile selects the lowest count above one within that cap. Devices without a common count retain single-sample rendering and SMAA. The renderer's diagnostic snapshot reports the chosen count. Resizing preserves it. This adds multisampled color and depth storage; the existing pixel ratio limits remain important on mobile.

Isolation checks on the detailed Shard found that disabling shadows, changing depth precision, moving the near plane, or removing the depth texture did not fix the pattern. Multisampling did. No source geometry or materials were changed to hide it.

`tests/rendering-browser.mjs` renders the actual asset against a native multisampled reference, checks the facade region's mean absolute pixel error, and exercises HDR, standard-color and single-sample fallback paths plus resize and WebGL errors. The original single-sample pipeline's facade error was approximately 8.5 intensity levels; the multisampled pipeline is approximately 2.5, including contact shading and SMAA. This is a regression check for the sampling defect, not evidence of photographic realism.

Run with the local server available:

```sh
node tests/rendering-browser.mjs
node tests/shard-browser.mjs
node tests/shard-browser.mjs mobile
```

Run full-city modes separately and sequentially. The focused rendering fixture uses a smaller scene.
