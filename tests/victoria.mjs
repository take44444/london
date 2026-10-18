import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {victoriaWallGeometry,buildVictoriaTower,victoriaPose,createVictoriaOcclusion} from '../src/victoria.mjs';

const mat=new THREE.MeshStandardMaterial(),walls=victoriaWallGeometry();
const facade=new THREE.Group();facade.add(new THREE.Mesh(walls.masonry,mat),new THREE.Mesh(walls.glass,mat));facade.updateMatrixWorld();
const ray=(group,x,y,z)=>new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,-1)).intersectObject(group,true);
assert.equal(ray(facade,0,8,3).length,0,'The entrance is a real opening');
assert.ok(Math.abs(ray(facade,.29,31.1,3)[0].point.z+.28)<1e-5,'Window glazing sits behind the wall');
assert.ok(Math.abs(ray(facade,9,31.1,3)[0].point.z-.45)<1e-5,'Stone surrounds the glazing');
assert.ok(Math.abs(ray(facade,3.6,18,3)[0].point.z-.45)<1e-5,'The entrance retains its arched crown');

// Verify the assembled tower as well: a filled core must not close the gateway.
const group=new THREE.Group(),geometries=new Set(),materials=new Set();
const cube=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,10);
const instance=(geometry,material,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{
  geometries.add(geometry);materials.add(material);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.rotation.set(rx,ry,rz);group.add(mesh);
};
const box=(x,y,z,w,h,d,material,angle=0)=>instance(cube,material,x,y,z,w,h,d,0,angle);
const rod=(a,b,r,material)=>{
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),mid=start.add(end).multiplyScalar(.5);
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  const e=new THREE.Euler().setFromQuaternion(q);instance(cylinder,material,mid.x,mid.y,mid.z,r,delta.length(),r,e.x,e.y,e.z);
};
const tower=buildVictoriaTower({instance,box,rod,mats:{stone:mat}},{});group.add(tower.flag);group.updateMatrixWorld();
assert.equal(ray(group,0,13,40).length,0,'The complete entrance passage stays open through the tower');
assert.ok(Math.abs(ray(group,.29,36.1,15)[0].point.z-10.92)<1e-4,'The core does not fill the recessed windows');
assert.ok(geometries.size<20,'Repeated architectural details share geometry');
for(const geometry of geometries)assert.ok(geometry.attributes.position.array.every(Number.isFinite));
const map=JSON.parse(await readFile(new URL('../dist/assets/london-map.json',import.meta.url),'utf8'));
const pose=victoriaPose(map.buildings.find(b=>b.t.name==='Victoria Tower'));
assert.deepEqual(pose.position,[-173.75,213.23]);
assert.ok(pose.rotation<-.1&&pose.rotation>-.15,'The tower follows the mapped wall alignment');
const occludes=createVictoriaOcclusion({position:[0,0],rotation:0}),v=(x,y,z)=>new THREE.Vector3(x,y,z);
assert.equal(occludes(v(0,60,40),v(0,60,-40)),true,'The solid tower hides labels behind it');
assert.equal(occludes(v(0,13,40),v(0,13,-40)),false,'The entrance passage does not hide labels');
assert.equal(occludes(v(0,60,40),v(0,60,25)),false,'Labels in front of the tower stay visible');
assert.equal(occludes(v(30,60,40),v(30,60,-40)),false,'Labels beside the tower stay visible');
assert.equal(tower.info.height,98.5);assert.equal(tower.info.cornerLanterns,4);
for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
tower.flag.geometry.dispose();tower.flag.material.dispose();walls.masonry.dispose();walls.glass.dispose();mat.dispose();
console.log('Victoria Tower: hollow entrance, recessed glazing, arch crown, mapped orientation and shared geometry passed.');
