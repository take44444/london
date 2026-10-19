import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {planRoof,emitRoof,roofAttachment,roofBuildingHeight,roofSurfaceRange} from '../src/city-roofs.mjs';
const rectangle=[[-10,-5],[10,-5],[10,5],[-10,5]],building=(shape,p=[rectangle],extra={})=>({roofRect:rectangle,p:[p],area:200,t:{'roof:shape':shape,'roof:height':'4',...extra}});
const projectArea=p=>Math.abs((p[1][0]-p[0][0])*(p[2][2]-p[0][2])-(p[1][2]-p[0][2])*(p[2][0]-p[0][0]))/2;
const geometry=(b,height=20)=>{const plan=planRoof(b,height),roof=[],walls=[];const counts=emitRoof(plan,b.p[0],{roof:(points,uv)=>{roof.push(points);assert.ok(points.flat().every(Number.isFinite));assert.ok(uv.flat().every(Number.isFinite));const a=new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])),b=new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0])),surface=a.cross(b).length()/2,texture=Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))/2;assert.ok(Math.abs(surface-texture*9)<1e-5,'Roof texture coordinates retain metre scale on each slope');},wall:(p)=>walls.push(p)});return {plan,roof,walls,counts};};
for(const shape of ['gabled','hipped','pyramidal','mansard','flat_mansard','skillion','gambrel','saltbox','round','butterfly']){
 const g=geometry(building(shape));assert.ok(Math.abs(g.roof.reduce((a,p)=>a+projectArea(p),0)-200)<1e-5,`${shape} covers its footprint exactly once`);
 for(const p of g.roof)for(const v of p)assert.ok(v[1]>=g.plan.eaves-1e-6&&v[1]<=25+1e-6,'Roof geometry stays within the mapped total height');
}
const gabled=geometry(building('gabled')),hipped=geometry(building('hipped')),pyramid=geometry(building('pyramidal'));
assert.ok(gabled.walls.length>0,'Gable ends close the space above the walls');assert.equal(hipped.walls.length,0,'A rectangular hip roof meets the eaves on all sides');
assert.equal(gabled.plan.heightAt([9,0]),25);assert.ok(pyramid.plan.heightAt([9,0])<22,'Pyramids converge to a point rather than a ridge');
assert.equal(geometry(building('skillion',[rectangle],{'roof:direction':'90'})).plan.heightAt([-10,0]),25);
assert.ok(geometry(building('gabled',[rectangle],{'roof:orientation':'across'})).plan.heightAt([9,0])<22,'Across orientation rotates the ridge');
const concave=[[-10,-5],[10,-5],[10,0],[5,0],[5,5],[-10,5]],hole=[[-2,-2],[-2,2],[2,2],[2,-2]];
for(const [polygon,area]of [[[concave],175],[[rectangle,hole],184]]){
 const g=geometry(building('gabled',polygon));assert.ok(Math.abs(g.roof.reduce((a,p)=>a+projectArea(p),0)-area)<1e-5,'Clipped roofs preserve notches and courtyard holes');
 const mesh=new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(g.roof.flat(2),3)),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 const [x,z]=polygon.length>1?[0,0]:[8,3];assert.equal(new THREE.Raycaster(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,0,'Rays pass through space outside the real footprint');
 const support=roofAttachment(polygon,[x,z],1);assert.ok(support&&Math.hypot(support[0]-x,support[1]-z)>1,'Rooftop attachments relocate away from holes and notches');
}
const map=JSON.parse(await readFile(new URL('../dist/assets/london-map.json',import.meta.url)));let count=0,mapped=0,triangles=0;
const ringArea=r=>Math.abs(r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2);
for(const b of map.buildings){const fallback=['garage','garages','shed','greenhouse'].includes(b.t.building)?1:b.area<85?3:b.area>1500?6:4,h=THREE.MathUtils.clamp(roofBuildingHeight(b.t,fallback),2.5,190),min=parseFloat(b.t.min_height)||parseFloat(b.t['building:min_level'])*3.55||0;if(h<=min+.5)continue;const plan=planRoof(b,h,min,.5);if(!plan)continue;count++;if(!plan.inferred)mapped++;let projected=0;const n=emitRoof(plan,b.p[0],{roof:p=>{assert.ok(p.flat().every(Number.isFinite));assert.ok(p.every(v=>v[1]<=h+5+1e-5&&v[1]>=plan.eaves-1e-5));projected+=projectArea(p);},wall:p=>{assert.ok(p.flat().every(Number.isFinite));}});triangles+=n.triangles;const footprint=ringArea(b.p[0][0])-b.p[0].slice(1).reduce((s,r)=>s+ringArea(r),0);assert.ok(Math.abs(projected-footprint)<.001,'Every shipping roof preserves its footprint area');}
assert.ok(count>1000&&mapped>300&&triangles<150000);
console.log(`City roofs: distinct profiles, closed gables, clipped courtyards, supported attachments and ${count} shipping roof plans (${mapped} mapped) passed.`);

assert.equal(roofBuildingHeight({height:'20','building:levels':'4','roof:levels':'1'},4),20,'An explicit total height already includes its roof');
assert.equal(roofBuildingHeight({'building:levels':'4','roof:height':'3'},4),17.2,'Inferred height adds an explicit roof to facade storeys');
assert.ok(planRoof(building('gabled',[rectangle],{'roof:height':undefined,'roof:levels':'0'}),20),'An unoccupied roof can still have a nonzero pitch');

const supportRange=roofSurfaceRange(gabled.plan,[[-1,-1],[1,-1],[1,1],[-1,1]]);
assert.equal(supportRange[1],25,'Fixtures crossing a ridge account for the peak between their corners');
assert.ok(supportRange[0]<supportRange[1]);

const narrow=[[-10,-1],[10,-1],[10,1],[-10,1]],narrowRoof=geometry({...building('mansard',[narrow],{'roof:orientation':'across','roof:height':'12'}),roofRect:narrow});
assert.ok(Math.abs(narrowRoof.roof.reduce((sum,p)=>sum+projectArea(p),0)-40)<1e-5,'Tall mansards across narrow footprints retain a positive inner roof ring');
