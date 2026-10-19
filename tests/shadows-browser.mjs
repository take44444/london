import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';import {createSunShadows} from './src/sun-shadows.mjs';
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.3,4200),sun=new THREE.DirectionalLight('#ffffff',2.7);
sun.position.set(-260,155,235);sun.target.position.set(-60,0,20);scene.add(new THREE.HemisphereLight('#ffffff','#ffffff',.08));
const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),material);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;group.add(ground);
const cube=new THREE.Mesh(new THREE.BoxGeometry(12,20,12),material);cube.position.y=10;cube.castShadow=true;cube.receiveShadow=true;group.add(cube);scene.add(group);
camera.position.set(70,90,100);camera.lookAt(0,0,0);const rig=createSunShadows(scene,camera,sun,false),gl=renderer.getContext(),pixel=new Uint8Array(4),results=[];
function sample(position){const point=position.clone().project(camera);const x=Math.round((point.x*.5+.5)*256),y=Math.round((point.y*.5+.5)*256);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return pixel[0];}
for(const [x,z]of [[0,0],[1200,-900]]){group.position.set(x,0,z);camera.position.set(x+70,90,z+100);camera.lookAt(x,0,z);rig.update();renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);results.push({shadow:sample(new THREE.Vector3(x+10,.01,z-10)),lit:sample(new THREE.Vector3(x-30,.01,z+30))});}
window.result={results,info:rig.info};renderer.dispose();
`},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setContent('<!doctype html><title>Shadow coverage check</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);
 for(const r of result.results){assert.ok(r.lit>100,'A ground sample receives sunlight');assert.ok(r.shadow<r.lit*.7,'The projected building shadow darkens the ground');}
 console.log('Sun shadow pixels: shaded ground is darker at the origin and 1.5 kilometres away.',JSON.stringify(result.results));
}finally{await browser.close();}
