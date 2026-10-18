import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import * as THREE from 'three';
import {prepareTree,createVegetation} from '../src/vegetation.mjs';
import {leafCards} from '../scripts/tree-leaf-cards.mjs';

// The shipping asset must preserve a real opacity channel, not just alphaMode metadata.
const glb=await readFile(new URL('../dist/assets/tree-canopy.glb',import.meta.url));
const jsonSize=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+jsonSize)),binStart=28+jsonSize;
const image=json.images.find(i=>/leaves_diff/.test(i.name)),view=json.bufferViews[image.bufferView];
const data=glb.subarray(binStart+(view.byteOffset||0),binStart+(view.byteOffset||0)+view.byteLength);
const meta=await sharp(data).metadata(),stats=await sharp(data).stats();
assert.equal(meta.hasAlpha,true,'Leaf image contains alpha pixels');
assert.equal(meta.channels,4);assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);
assert.ok(stats.channels[3].mean>10&&stats.channels[3].mean<245,'Opacity contains cutouts and opaque leaves');
assert.equal(json.materials.find(m=>/leaves/.test(m.name)).alphaMode,'MASK');
const leafMaterial=json.materials.findIndex(m=>/leaves/.test(m.name));
const leafIndices=json.meshes.flatMap(m=>m.primitives).filter(p=>p.material===leafMaterial).reduce((sum,p)=>sum+json.accessors[p.indices].count,0);
assert.equal(leafIndices,30250*6,'Every source leaf island remains represented by a card');
const pp=[],nn=[],uu=[],ii=[];
for(let leaf=0;leaf<2;leaf++){
  const start=pp.length/3;
  for(let y=0;y<3;y++)for(let x=0;x<3;x++){pp.push(leaf*2+x/2,y/2,.02*(x*x+y*y));nn.push(0,0,1);uu.push(x/2,y/2);}
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){const i=start+y*3+x;ii.push(i,i+1,i+4,i,i+4,i+3);}
}
const cards=leafCards(new Float32Array(pp),new Float32Array(nn),new Float32Array(uu),new Uint32Array(ii));
assert.equal(cards.cards,2);assert.equal(cards.indices.length,12);
assert.ok(Math.min(...cards.positions.filter((_,i)=>i%3===0))<.001&&Math.max(...cards.positions.filter((_,i)=>i%3===0))>2.999,'Separate leaves retain their full extent');

// A quantized source at a translated/scaled node must retain its full shape.
const source=new THREE.Group(),geometry=new THREE.BoxGeometry(2,2,2),positions=geometry.attributes.position;
const quantized=new Int16Array(positions.count*3);
for(let i=0;i<positions.count;i++)for(let j=0;j<3;j++)quantized[i*3+j]=positions.getComponent(i,j)*32767;
geometry.setAttribute('position',new THREE.Int16BufferAttribute(quantized,3,true));
const material=new THREE.MeshStandardMaterial({name:'test_leaves'}),mesh=new THREE.Mesh(geometry,material);
mesh.position.set(3,2,-5);mesh.scale.set(4,8,4);mesh.rotation.y=.4;source.add(mesh);
const prepared=prepareTree(source),bounds=prepared.parts[0].geometry.boundingBox;
assert.ok(Math.abs(bounds.min.y)<1e-6&&Math.abs(bounds.max.y-1)<1e-6,'Normalized tree retains its full height');
assert.ok(bounds.max.x-bounds.min.x>.5,'Quantized coordinates do not collapse during transformation');
assert.equal(prepared.parts[0].material.alphaTest,.45);
assert.equal(prepared.parts[0].material.transparent,false);
const scene=new THREE.Scene(),impostor={material:new THREE.MeshBasicMaterial(),aspect:.7};
const forest=createVegetation(scene,source,impostor,false);
for(let i=0;i<100;i++)forest.add((i%10-5)*3,Math.floor(i/10)*3,13);
forest.build();const camera=new THREE.PerspectiveCamera();camera.position.set(0,11,0);
assert.equal(forest.update(camera,0),true);
assert.ok(forest.info.detailInstances>0&&forest.info.detailInstances<=16,'Near geometry respects its budget');
assert.equal(forest.update(camera,1),false);assert.equal(forest.info.windTime,1,'Wind advances with a stationary camera');
camera.position.set(5000,11,5000);assert.equal(forest.update(camera,2),true);
assert.equal(forest.info.detailInstances,0,'Distant trees return to impostors');
console.log('Vegetation: shipping leaf alpha, quantized model transforms, detail budget, wind clock and distance switching passed.');
