import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';import {buildSouthbank,southbankProfiles,shellAtlas,remainingEnvelope} from '../src/southbank.mjs';
const scene=new THREE.Scene(),t=new THREE.Texture(),data=JSON.parse(fs.readFileSync('dist/assets/london-map.json'));const result=buildSouthbank(scene,data,{facade:t,shellFacade:t,plaster:{color:t,normal:t}});
assert.equal(result.info.length,14);assert.equal(result.excluded.size,15);assert.deepEqual(result.suppressedEnvelopes,['w1455593628']);assert.equal(result.nightUniforms.length,2);assert.equal(shellAtlas.windows.length,2);
for(const profile of southbankProfiles){if(result.suppressedEnvelopes.includes(profile.id))continue;const group=scene.getObjectByName(profile.name),info=result.info.find(p=>p.id===profile.id),bounds=new THREE.Box3().setFromObject(group);assert.ok(bounds.min.y>=4.7);assert.ok(Math.abs(bounds.max.y-5-profile.height)<.4);assert.ok(group.children.length<=5,'Shared materials batch the building into a few draw calls');if(profile.style==='stone-grid'){assert.ok(info.balconies>80);assert.ok(info.panes>900);}if(profile.style==='curtain-wall')assert.ok(info.panes>1500);if(profile.style==='oriel-grid')assert.ok(info.oriels>50,'Projecting bay windows add real depth');
for(const object of group.children){const p=object.geometry.attributes.position,n=object.geometry.attributes.normal;assert.equal(n.count,p.count);for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1)<1e-5,'Faces have nondegenerate normals');}}
}
assert.equal(result.info.find(p=>p.name==='One Casson Square').height,122.3);assert.equal(result.info.find(p=>p.name==='One Casson Square').mappedHeight,105);console.log(JSON.stringify(result.info));

const rectangle=(x0,z0,x1,z1)=>({p:[[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]]]});
const residual=remainingEnvelope(rectangle(0,0,10,10),[rectangle(0,0,4,10)]);
const polygonArea=r=>Math.abs(r.reduce((sum,a,i)=>{const b=r[(i+1)%r.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2);
assert.ok(Math.abs(residual.reduce((sum,p)=>sum+polygonArea(p[0])-p.slice(1).reduce((s,r)=>s+polygonArea(r),0),0)-60)<1e-8,'Partial parent shells retain exactly the uncovered footprint');
for(const p of residual)for(const r of p)for(const [x]of r)assert.ok(x>=4,'The clipped parent does not overlap a mapped part');
