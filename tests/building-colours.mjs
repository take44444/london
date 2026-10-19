import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseMappedColour,buildingColours} from '../src/building-colours.mjs';
assert.deepEqual(parseMappedColour('#ABC').toArray(),parseMappedColour('#aabbcc').toArray());
assert.deepEqual(parseMappedColour(' Light_Grey ').toArray(),parseMappedColour('lightgrey').toArray());
assert.ok(parseMappedColour('light_brown'));assert.equal(parseMappedColour('white;red'),null);assert.equal(parseMappedColour('transparent'),null);assert.equal(parseMappedColour('unknown'),null);
const light=buildingColours({'building:colour':'white','roof:colour':'#333333'},'stone'),dark=buildingColours({'building:colour':'black','roof:colour':'#dddddd'},'stone');
assert.ok(light.wall.every((v,i)=>v>dark.wall[i]*20),'White and black walls remain distinct in linear reflectance');
assert.ok(light.roof.every((v,i)=>v<dark.roof[i]),'Roof colours are independent of the wall colour');
assert.deepEqual(buildingColours({},'brick',42),buildingColours({},'brick',42),'Fallback materials remain deterministic');
const map=JSON.parse(await readFile(new URL('../dist/assets/london-map.json',import.meta.url)));let walls=0,roofs=0;
for(const b of map.buildings){const p=buildingColours(b.t,'stone');if(p.wallMapped)walls++;if(p.roofMapped)roofs++;for(const v of [...p.wall,...p.roof])assert.ok(Number.isFinite(v)&&v>=.016&&v<=.82);}
assert.ok(walls>2000&&roofs>3000);console.log(`Building colours: sRGB parsing, bounded reflectance, independent roofs and ${walls} wall / ${roofs} roof tags passed.`);
