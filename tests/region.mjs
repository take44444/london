import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression,KHRMeshQuantization} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const files=(await fs.readdir('dist/assets')).filter(f=>/^london-context.*\.(gltf|bin)$/.test(f));
const sizes=await Promise.all(files.map(async f=>(await fs.stat('dist/assets/'+f)).size));
const byteLength=sizes.reduce((s,n)=>s+n,0);assert.ok(sizes.every(n=>n<24*1024*1024),'Every hosted asset stays below the static-file limit');
const doc=await new NodeIO().registerExtensions([EXTMeshoptCompression,KHRMeshQuantization]).registerDependencies({'meshopt.decoder':MeshoptDecoder}).read('dist/assets/london-context.gltf');
const scene=doc.getRoot().listScenes()[0],stats=scene.getExtras(),nodes=scene.listChildren();
assert.ok(stats.buildings>50000,'The wider city contains mapped buildings beyond the core');
assert.ok(stats.mappedHeights>5000);assert.ok(stats.domes>2);assert.ok(stats.pitchedRoofs>1000);assert.ok(stats.trees>1000);
assert.equal(stats.source.radius,6000);assert.equal(stats.source.license,'ODbL-1.0');
assert.ok(byteLength<65000000,'Regional asset remains within the transfer budget');
assert.ok(nodes.length<2200,'Spatial batching avoids one draw call per building');
let maxHeight=0,minX=Infinity,maxX=-Infinity,triangles=0;const names=new Set();
for(const node of nodes){names.add(node.getMesh().listPrimitives()[0].getMaterial().getName());for(const primitive of node.getMesh().listPrimitives()){
 const p=primitive.getAttribute('POSITION'),uv=primitive.getAttribute('TEXCOORD_0'),c=primitive.getAttribute('COLOR_0');assert.equal(uv.getComponentType(),5126,'Repeating UVs retain float precision');assert.equal(c.getCount(),p.getCount());
 const matrix=node.getWorldMatrix(),v=[];for(let i=0;i<p.getCount();i++){p.getElement(i,v);const x=matrix[0]*v[0]+matrix[4]*v[1]+matrix[8]*v[2]+matrix[12],y=matrix[1]*v[0]+matrix[5]*v[1]+matrix[9]*v[2]+matrix[13];assert.ok(Number.isFinite(x)&&Number.isFinite(y));maxHeight=Math.max(maxHeight,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
 triangles+=(primitive.getIndices()?.getCount()||p.getCount())/3;
}}
assert.ok(maxHeight>300&&maxHeight<410,'Mapped skyline preserves the Shard height');assert.ok(minX< -5900&&maxX>5900);
for(const name of ['stone','brick','glass','roof','land','grass','road','tree'])assert.ok(names.has(name));
assert.equal(triangles,stats.triangles);
console.log(JSON.stringify({buildings:stats.buildings,mappedHeights:stats.mappedHeights,domes:stats.domes,pitchedRoofs:stats.pitchedRoofs,trees:stats.trees,triangles,meshes:nodes.length,maxHeight,megabytes:byteLength/1e6}));
