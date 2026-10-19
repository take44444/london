# Detailed Shard model

The Shard view uses a local, compressed subset of the free AccuCities London sample. The source supplies detailed geometry and named materials, with no photographic texture maps. The current physical materials and room lighting are an interpretation, not a scan texture.

Source: [AccuCities sample downloads](https://accucities.com/samples-links/). The FBX used is `AccuCities-FBX-sample-3D Model-of-London-Level-3-Shard-Level-4-TQ3280.fbx` from the publisher's [Level 3 archive](https://www.accucities.com/wp-content/uploads/samples/AccuCities-FBX-sample-3D%20Model-of-London-TQ3280.zip). The sample and adapted geometry use [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the publisher's [sample license statement](https://accucities.com/new-creative-commons-licences-for-accucities-samples/) applies. Attribution and a download of the adapted GLB are in the controls dialog.

The preparation script selects seven detailed components, converts source centimetres to metres, preserves their relative transforms, joins compatible primitives, applies conservative simplification and compresses with meshopt. It preserves 981,008 triangles in 16 draw primitives in an approximately 8.4 MB file. Aggressive simplification removed glass panels and was rejected after visual inspection.

The source body's bounding box is registered against the OSM tower-part union (excluding the adjoining station's lower roof), with no axis rotation or height scaling. Bounds agree within approximately 0.7 m. This is a registration check, not independent proof of survey accuracy. Source model height is approximately 308.94 m.

The detailed model loads only when its view is selected. The original mapped skyline meshes are separately batched in the regional asset and remain in use beyond 900 m, with hysteresis. Lazy materials register with the existing cascaded shadows and inherit current night lighting. Initial Westminster loading does not fetch the model.

```sh
node --max-old-space-size=6144 scripts/prepare-shard.mjs source.fbx dist/assets/shard.glb
node --max-old-space-size=6144 scripts/prepare-region.mjs region-source.json dist/assets/london-context.gltf
npm run build
node tests/shard.mjs
node tests/sun-shadows.mjs
node tests/region.mjs
```

Browser checks require the local server. Run the modes separately:

```sh
node tests/shard-browser.mjs
node tests/shard-browser.mjs mobile
```
