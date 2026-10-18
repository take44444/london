import assert from 'node:assert/strict';
import * as THREE from 'three';
import {palaceWindowGeometry,palaceRoofGeometry,buildPalace} from '../src/palace.mjs';

const surface=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
for(let floor=0;floor<2;floor++)for(let column=0;column<4;column++){
  const {masonry,glass,moulding}=palaceWindowGeometry(column,floor);
  const group=new THREE.Group();group.add(new THREE.Mesh(masonry,surface),new THREE.Mesh(glass,surface));
  group.updateMatrixWorld();
  const hit=(x,y)=>{
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1));
    const hits=ray.intersectObject(group,true);assert.ok(hits.length);return hits[0];
  };
  assert.ok(Math.abs(hit(0,6).point.z-.025)<1e-5,'Glass is recessed behind the masonry');
  assert.ok(Math.abs(hit(1.8,6).point.z-.22)<1e-5,'Masonry surrounds the opening');
  assert.ok(Math.abs(hit(1,10.4).point.z-.22)<1e-5,'Pointed arch retains stone at the crown corners');
  assert.ok(Math.abs(hit(0,10.4).point.z-.025)<1e-5,'Pointed crown remains open');
  for(const g of [masonry,glass,moulding])assert.ok(g.attributes.position.array.every(Number.isFinite),'Geometry has finite positions');
  for(const g of [masonry,glass]){
    const uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++){
      assert.ok(uv.getX(i)>=column/4-1e-6&&uv.getX(i)<=(column+1)/4+1e-6,'Atlas stays inside its window bay');
      assert.ok(uv.getY(i)>=floor/2-1e-6&&uv.getY(i)<=(floor+1)/2+1e-6,'Atlas stays inside its storey');
    }
  }
  masonry.dispose();glass.dispose();moulding.dispose();
}
const roof=palaceRoofGeometry(14,10.5,264,1.6),mesh=new THREE.Mesh(roof,surface);mesh.scale.x=1.6;mesh.updateMatrixWorld();
for(const x of [-5,5]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,25,0),new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObject(mesh);assert.ok(hits.length,'Both roof pitches face outward');
  assert.ok(hits[0].face.normal.y>0,'Roof pitches face the sky');
  assert.ok(Math.abs(hits[0].point.y-10.5*(1-Math.abs(x)/11.2))<1e-5,'The pitched roof has the intended physical slope');
}
const uv=roof.attributes.uv;
assert.ok(Math.abs(uv.getX(1)-uv.getX(0)-264)<1e-5,'Roof plates use metre-scale UVs along the ridge');
assert.ok(Math.abs(uv.getY(2)-Math.hypot(11.2,10.5))<1e-5,'Roof plates use metre-scale UVs along the slope');
roof.dispose();surface.dispose();
const geometries=new Set(),materials=new Set(),finials=[];
const transform=new THREE.Matrix4().makeScale(1.6,1,1).setPosition(99.2,0,0);
const record=(geometry,material,x,y,z)=>{geometries.add(geometry);materials.add(material);if(y>90)finials.push(new THREE.Vector3(x,y,z).applyMatrix4(transform));};
const mats={stone:new THREE.MeshStandardMaterial(),glass:new THREE.MeshStandardMaterial(),weathered:new THREE.MeshStandardMaterial()};
const palace=buildPalace({instance:record,box:()=>{},rod:()=>{},mats,transform,centralTowerPosition:[-129.66,95.24]},{});
assert.ok(palace.dormers>100&&palace.archedOpenings>800,'End and courtyard walls share the detailed architecture');
assert.ok(geometries.size<40,'Repeated dormers and mouldings share geometry rather than adding separate draw calls');
assert.ok(finials.length>0&&finials.every(p=>Math.abs(p.x+129.66)<1e-6&&Math.abs(p.z-95.24)<1e-6),'Central Tower follows its mapped location through the Palace transform');
for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const m of Object.values(mats))m.dispose();
console.log('Palace: recessed pointed openings, solid arch crowns, atlas alignment and both roof pitches passed.');
