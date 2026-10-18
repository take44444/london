import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {mappedSurface,emitCurtainWall,curtainMaterial,replacedEnvelopes} from '../src/building-surfaces.mjs';
assert.equal(mappedSurface({'building:material':'glass'}),'glass');
assert.equal(mappedSurface({'building:material':'brick'},0),'brick');
assert.equal(mappedSurface({'building:material':'sandstone'},1),'stone');
assert.equal(mappedSurface({building:'church'},0),'stone','An untagged historic building does not become glass');
for(const direction of [1,-1]){
 const coarse=[],fine=[];
 const quad=(out,p,uv)=>{assert.ok(uv.flat().every(Number.isFinite));out.push(...[0,2,1,0,3,2].flatMap(i=>p[i]));};
 const panes=emitCurtainWall({a:[0,0],c:[direction*9,0],bottom:5,top:19,storeyHeight:3.5,color:[1,1,1],coarse,fine,quad});
 assert.equal(panes,24);
 const mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({side:THREE.FrontSide}));mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(fine,3));
 const hit=(x,y)=>new THREE.Raycaster(new THREE.Vector3(direction*x,y,-direction*2),new THREE.Vector3(0,0,direction)).intersectObject(mesh)[0];
 assert.ok(Math.abs(hit(.75,6.7).distance-2.1)<1e-5,'Glass is recessed behind the metal frame');
 assert.ok(Math.abs(hit(.02,6.7).distance-2)<1e-5,'Mullions remain at the mapped wall outline');
 assert.ok(Math.abs(hit(.75,8.49).distance-2)<1e-5,'The transom connects adjacent storeys');
 const partUV=[];emitCurtainWall({a:[0,0],c:[9,0],bottom:145,top:152,storeyHeight:3.5,color:[1,1,1],coarse:[],quad:(out,p,uv)=>partUV.push(...uv.map(v=>v[1]))});
 assert.equal(Math.max(...partUV)-Math.min(...partUV),2,'High building parts keep metre-scale floor spacing');
 mesh.geometry.dispose();mesh.material.dispose();
}
const material=curtainMaterial();assert.equal(material.ior,1.5);assert.equal(material.metalness,0);assert.equal(material.transmission,0,'Opaque room backing avoids unmodelled transparent interiors');material.dispose();
console.log('Building surfaces: mapped materials, recessed glass, connected frames and consistent upper-storey spacing passed.');

const map=JSON.parse(await readFile(new URL('../dist/assets/london-map.json',import.meta.url)));
const replaced=replacedEnvelopes(map.buildings);
assert.ok(replaced.has('w389881291'),'One Blackfriars renders its shaped height bands instead of a filled envelope');
assert.ok(replaced.has('w511760789'),'Two Fifty One uses its mapped volumes');
const parent={id:'test',area:100,c:[5,5],p:[[[[0,0],[10,0],[10,10],[0,10]]]],t:{'building:part':'no',height:'20'}};
const part=(lo,hi)=>({id:'part',area:50,c:[5,5],t:{'building:part':'yes',min_height:String(lo),height:String(hi)}});
assert.equal(replacedEnvelopes([parent,part(10,20)]).has('test'),false,'A roof-only part cannot remove the ground-level building');
assert.equal(replacedEnvelopes([parent,part(0,10),part(10,20)]).has('test'),true);
console.log('Building parts: complete height coverage replaces envelopes; partial mapping preserves the building.');
