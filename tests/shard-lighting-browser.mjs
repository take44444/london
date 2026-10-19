import assert from 'node:assert/strict';import {build} from 'esbuild';import {chromium} from 'playwright';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';import {prepareShardMaterials} from './src/shard.mjs';
const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(1024,128);renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,32,2,0,.1,10);camera.position.z=2;
const positions=[],indices=[];for(let col=0;col<32;col++){const i=positions.length/3;positions.push(col,0,0,col+.9,0,0,col,2,0,col+.9,2,0);indices.push(i,i+1,i+2,i+2,i+1,i+3);}
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const material=new THREE.MeshStandardMaterial();material.name='Material #13';scene.add(new THREE.Mesh(geometry,material));const prepared=prepareShardMaterials(scene);prepared.nightUniforms[0].value=2;renderer.render(scene,camera);
const gl=renderer.getContext(),pixels=new Uint8Array(1024*128*4),ranges=[],means=[];gl.readPixels(0,0,1024,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
for(let col=0;col<32;col++){let lo=255,hi=0,sum=0,count=0;for(let y=8;y<120;y++)for(let x=col*32+4;x<col*32+24;x++){const v=pixels[(y*1024+x)*4];lo=Math.min(lo,v);hi=Math.max(hi,v);sum+=v;count++;}ranges.push(hi-lo);means.push(sum/count);}
window.result={ranges,means,panes:prepared.info.panes,error:gl.getError()};renderer.dispose();
`},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setContent('<!doctype html><title>Shard pane lighting</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});const result=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);assert.equal(result.error,0);assert.equal(result.panes,32);assert.ok(result.ranges.every(v=>v<=1),'Every pane remains fully lit or dark across both triangles');assert.ok(result.means.some(v=>v>50)&&result.means.some(v=>v<1),'The fixture contains both occupied and dark rooms');console.log('Shard lighting: 32 panes keep coherent room illumination across their full surface.');}finally{await browser.close();}
