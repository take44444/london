import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';import {createSkyDome} from './src/sky.mjs';
const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(256,256);renderer.toneMapping=THREE.NoToneMapping;
const target=new THREE.WebGLRenderTarget(256,256),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(46,1,.8,6400);
scene.fog=new THREE.FogExp2('#a9adb1',.0012);
const texture=new THREE.DataTexture(new Uint8Array([60,120,180,255]),1,1);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
const sky=createSkyDome(texture,scene.fog),haze=sky.material,plain=new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false});scene.add(sky);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000),new THREE.MeshBasicMaterial({color:'#665544',fog:true}));ground.rotation.x=-Math.PI/2;scene.add(ground);
const pixels=new Uint8Array(256*256*4),sample=(x,y)=>Array.from(pixels.slice((y*256+x)*4,(y*256+x)*4+3)),cases=[];
function capture(material,height){sky.material=material;camera.position.set(0,height,0);camera.lookAt(0,height,-1);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);const edge=128-height/6400/Math.tan(23*Math.PI/180)*128;return {ground:sample(128,Math.floor(edge)-1),sky:sample(128,Math.ceil(edge)+1),upper:sample(128,230)};}
for(const [colour,intensity]of [['#aebdbd',2],['#a9adb1',1.6],['#1c2c46',.16]])for(const height of [100,300]){scene.fog.color.set(colour);plain.color.setScalar(intensity);haze.color.setScalar(intensity);cases.push({colour,height,before:capture(plain,height),after:capture(haze,height)});}
const rig=new THREE.Group();rig.position.set(2520,230,-459);rig.add(camera);scene.add(rig);camera.position.set(0,0,0);camera.lookAt(2520,230,-460);renderer.render(scene,camera);window.skyParentedError=sky.position.distanceTo(camera.getWorldPosition(new THREE.Vector3()));window.result=cases;renderer.dispose();target.dispose();
`},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setContent('<!doctype html><title>Sky horizon check</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});const cases=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>window.skyParentedError)<1e-6,'Sky follows the world position of a parented probe camera');
 let baselineJump=0,maxJump=0;
 for(const c of cases)for(let i=0;i<3;i++){baselineJump=Math.max(baselineJump,Math.abs(c.before.ground[i]-c.before.sky[i]));maxJump=Math.max(maxJump,Math.abs(c.after.ground[i]-c.after.sky[i]));assert.ok(Math.abs(c.before.upper[i]-c.after.upper[i])<=1,'The upper photographic sky is preserved');}
 assert.ok(baselineJump>30,'The fixture reproduces the original terrain-to-sky discontinuity');assert.ok(maxJump<=2,'The sky matches fogged terrain across the far clipping edge for all lighting modes and camera heights');
 console.log('Sky horizon pixels: original discontinuity reproduced; corrected boundary matches within two byte values, with upper sky preserved.',JSON.stringify({baselineJump,maxJump}));
}finally{await browser.close();}
