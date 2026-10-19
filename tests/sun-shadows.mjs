import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSunShadows} from '../src/sun-shadows.mjs';
for(const mobile of [false,true]){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1.6,.3,4200),sun=new THREE.DirectionalLight('#ffcf9a',2.7);
 sun.position.set(-260,155,235);sun.target.position.set(-60,0,20);
 camera.position.set(360,150,410);camera.lookAt(-80,35,100);
 const material=new THREE.MeshStandardMaterial();material.customProgramCacheKey=()=> 'existing-facade';material.onBeforeCompile=shader=>{shader.uniforms.kept={value:42};};
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(10,20,10),material));
 const rig=createSunShadows(scene,camera,sun,mobile);
 assert.equal(rig.update(),true);assert.equal(rig.update(),false,'A still camera does not redraw static shadow maps');
 const before=rig.info;
 assert.equal(before.cascades,mobile?2:3);assert.ok(before.texelSizes[0]<before.texelSizes.at(-1),'Nearby surfaces receive finer shadow resolution');
 const shader={uniforms:{}};material.onBeforeCompile(shader);assert.equal(shader.uniforms.kept.value,42,'Existing material extensions survive CSM setup');assert.equal(shader.uniforms.CSM_cascades.value.length,before.cascades);
 assert.ok(material.customProgramCacheKey().startsWith('existing-facade:'));
 camera.position.x+=1000;camera.position.z-=800;camera.lookAt(920,35,-700);assert.equal(rig.update(),true);
 assert.ok(Math.hypot(...rig.info.positions[0].map((v,i)=>v-before.positions[0][i]))>1000,'Shadow coverage follows exploration beyond Westminster');
 assert.ok(new THREE.Vector3(...rig.info.direction).distanceTo(new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize())<1e-10,'Shadow and water directions can use the same sunlight vector');
 assert.equal(rig.update(),false);
 camera.aspect=.46;camera.updateProjectionMatrix();rig.resize();assert.equal(rig.update(),true,'Viewport changes refresh the cascade bounds');
 assert.ok(rig.info.texelSizes.every(Number.isFinite));
}
console.log('Sun shadows: camera-following coverage, near detail, stable reuse, resize, shared direction and material hooks passed.');
