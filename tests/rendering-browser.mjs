/** Render the real dense facade against a native multisampled reference. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import sharp from 'sharp';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {prepareShardMaterials} from './src/shard.mjs';
import {createRendering} from './src/rendering.js';
const variant=new URL(location.href).searchParams.get('variant');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,900);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),hdr=await new RGBELoader().loadAsync('/assets/sky.hdr'),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(hdr).texture;scene.environmentIntensity=.6;scene.background=hdr;scene.backgroundIntensity=1.4;scene.backgroundRotation.y=.45;scene.environmentRotation.y=.45;pmrem.dispose();
const camera=new THREE.PerspectiveCamera(42,800/900,.5,2000);camera.position.set(330,190,370);camera.lookAt(0,145,0);scene.add(new THREE.HemisphereLight('#e0ebee','#776747',.95));const sun=new THREE.DirectionalLight('#fff1d3',2.4);sun.position.set(-180,360,210);scene.add(sun);
const model=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/assets/shard.glb')).scene;prepareShardMaterials(model);scene.add(model);
const gl=renderer.getContext(),query=gl.getInternalformatParameter.bind(gl),has=renderer.extensions.has.bind(renderer.extensions);
if(variant==='byte')renderer.extensions.has=name=>name==='EXT_color_buffer_float'?false:has(name);
if(variant==='single')gl.getInternalformatParameter=(target,format,pname)=>pname===gl.SAMPLES?new Int32Array():query(target,format,pname);
const pipeline=createRendering(renderer,scene,camera,variant==='byte');gl.getInternalformatParameter=query;renderer.extensions.has=has;await pipeline.ready;
window.renderingQA={info:pipeline.info,render(mode){if(mode==='direct')renderer.render(scene,camera);else pipeline.render(0);return gl.getError();},resize(){renderer.setSize(640,720);pipeline.resize(640,720);pipeline.render(0);return {...pipeline.info,error:gl.getError()};}};
`},bundle:true,format:'esm',write:false});
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
 for(const variant of ['quality','byte','single']){
  const page=await browser.newPage({viewport:{width:800,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/rendering-fixture*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style><script type="module" src="/rendering-test.js"></script>'}));
  await page.route('**/rendering-test.js',r=>r.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text}));
  await page.goto('http://localhost:5173/rendering-fixture?variant='+variant);await page.waitForFunction(()=>window.renderingQA,null,{timeout:120000});
  const info=await page.evaluate(()=>window.renderingQA.info);
  assert.equal(info.hdr,variant!=='byte');assert.equal(info.contactShading,variant!=='byte');
  assert.ok(variant==='single'?info.samples===0:info.samples>1,JSON.stringify(info));
  assert.equal(await page.evaluate(()=>window.renderingQA.render('direct')),0);
  const reference=await page.screenshot();
  assert.equal(await page.evaluate(()=>window.renderingQA.render('composed')),0);
  const actual=await page.screenshot({path:'test-results/rendering-'+variant+'.png'});
  if(variant==='quality'){
   const crop={left:390,top:200,width:25,height:300},a=await sharp(reference).extract(crop).removeAlpha().raw().toBuffer(),b=await sharp(actual).extract(crop).removeAlpha().raw().toBuffer();
   const error=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
   // This region contains the subpixel facade grid. The former single-sample
   // pipeline has error ~8.5; native and offscreen MSAA agree within ~2.4.
   assert.ok(error<4,'Fine facade grid differs from native antialias reference: '+error);console.log('Dense facade mean pixel error',error);
  }
  const resized=await page.evaluate(()=>window.renderingQA.resize());assert.equal(resized.width,640);assert.equal(resized.height,720);assert.equal(resized.samples,info.samples);assert.equal(resized.error,0);assert.deepEqual(errors,[]);
  console.log('Rendering path passed',JSON.stringify({variant,info}));await page.close();
 }
}finally{await browser.close();}
