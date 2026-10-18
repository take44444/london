import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';
import {curtainMaterial} from './src/building-surfaces.mjs';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(64,64);renderer.toneMapping=THREE.NoToneMapping;
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
const geometry=new THREE.PlaneGeometry(2,2),material=curtainMaterial();material.userData.night.value=1;
geometry.setAttribute('color',new THREE.Float32BufferAttribute([.87381,.91276,.84239,.87381,.91276,.84239,.87381,.91276,.84239,.87381,.91276,.84239],3));scene.add(new THREE.Mesh(geometry,material));
const gl=renderer.getContext(),pixels=new Uint8Array(64*64*4),ranges=[],means=[];
for(let cell=0;cell<32;cell++){
 const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,cell+.2+geometry.attributes.position.getX(i)*.2,.6+geometry.attributes.position.getY(i)*.2);uv.needsUpdate=true;
 renderer.render(scene,camera);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 let lo=255,hi=0,sum=0,count=0;for(let y=16;y<48;y++)for(let x=16;x<48;x++){const v=pixels[(y*64+x)*4];lo=Math.min(lo,v);hi=Math.max(hi,v);sum+=v;count++;}ranges.push(hi-lo);means.push(sum/count);
}
window.result={ranges,means};renderer.dispose();geometry.dispose();material.dispose();
`},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setContent('<!doctype html><title>Curtain lighting check</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);assert.ok(result.ranges.every(v=>v<=1),'Each pane has a coherent lighting value instead of per-pixel hash noise');assert.ok(result.means.some(v=>v>30)&&result.means.some(v=>v<1),'The fixture includes both occupied and dark panes');
 console.log('Curtain shader: 32 panes retain coherent occupied or dark lighting without pixel noise.');
}finally{await browser.close();}
