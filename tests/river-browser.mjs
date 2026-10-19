import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';import {createRiver} from './src/river.js';
const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(256,256);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const tex=new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1);tex.needsUpdate=true;
const river=createRiver(tex,new THREE.Vector3(-180,360,210),renderer,true,false),water=river.mesh;
const original=water.material.fragmentShader;water.onBeforeRender=()=>{};
water.material.fragmentShader=original.replace('vec3 diffuseLight = vec3(0.0);','gl_FragColor=vec4(surfaceNormal.x*4.+.5,surfaceNormal.z*4.+.5,0.,1.);return;vec3 diffuseLight=vec3(0.);');water.material.needsUpdate=true;
const scene=new THREE.Scene();scene.add(water);const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2000);camera.position.set(8,100,0);camera.up.set(0,0,-1);camera.lookAt(8,0,0);
const target=new THREE.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4);
function capture(span,time){camera.left=camera.bottom=-span/2;camera.right=camera.top=span/2;camera.updateProjectionMatrix();water.material.uniforms.time.value=time;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);return Array.from(pixels);}
const near=capture(24,0),later=capture(24,1.25),far=capture(4096,0),noWake=capture(128,0);river.wakes[0].set(8,0,0,20);const wake=capture(128,0);
water.material.fragmentShader=original;water.material.needsUpdate=true;renderer.render(scene,camera);
const optics=original.slice(original.indexOf('float transmittedCos='),original.indexOf('vec3 scatter ='));
water.material=new THREE.ShaderMaterial({vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){float theta=vUv.x;'+optics+'gl_FragColor=vec4(vec3(reflectance),1.);}'});
camera.left=camera.bottom=-3000;camera.right=camera.top=3000;camera.updateProjectionMatrix();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);const fresnel=Array.from({length:256},(_,x)=>pixels[(128*256+x)*4]);
window.result={near,later,far,noWake,wake,fresnel,info:river.info};renderer.dispose();target.dispose();
`},bundle:true,format:'iife',write:false});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.setContent('<!doctype html><title>River optics</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});const r=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);
 const rms=p=>Math.sqrt(p.reduce((s,v,i)=>i%4<2?s+((v/255-.5)/4)**2:s,0)/(p.length/2));
 const change=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>i%4<2?s+((v-b[i])/255/4)**2:s,0)/(a.length/2));
 const near=rms(r.near),far=rms(r.far),motion=change(r.near,r.later),wake=change(r.noWake,r.wake);
 assert.ok(near>.008&&near<.065,'Resolved ripple slopes stay small and visible');assert.ok(far<near*.1,'Subpixel waves fade instead of aliasing into a crumpled surface');assert.ok(motion>.005,'Gravity-wave phases move');assert.ok(wake>.002,'Localized boat disturbances survive filtering');assert.equal(r.info.dielectricIOR,1.333);assert.ok(r.fresnel[255]>=4&&r.fresnel[255]<=6,'Normal incidence reflects approximately two percent');assert.ok(r.fresnel[128]>=14&&r.fresnel[128]<=17,'Oblique incidence follows the dielectric equation');assert.ok(r.fresnel[0]>240,'Grazing incidence approaches full reflection');for(let i=1;i<256;i++)assert.ok(r.fresnel[i]<=r.fresnel[i-1],'Reflectance stays monotonic with viewing angle');assert.ok(r.info.waves.rmsHeight<.05);
 console.log(JSON.stringify({nearRms:near,farRms:far,motion,wake,rmsWaveHeight:r.info.waves.rmsHeight,fresnel:[r.fresnel[255],r.fresnel[128],r.fresnel[0]],errors}));
}finally{await browser.close();}
