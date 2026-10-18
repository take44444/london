import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildLondon } from './world.js';
import { createRendering } from './rendering.js';
import { createRiver } from './river.js';
import {createVictoriaOcclusion} from './victoria.mjs';

const canvas=document.querySelector('#world');
const scene=new THREE.Scene();
scene.background=new THREE.Color('#d4d4b9');
scene.fog=new THREE.FogExp2('#c6c7ac',.0008);
const camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.8,6400);
const views={
  westminster:{position:[142,64,235],target:[-100,31,-32],title:'Westminster',description:'Where the city’s story meets the river. A little history, a little golden light.',subtitle:'PALACE OF WESTMINSTER'},
  bigben:{position:[37,84,80],target:[-121,49,-51],title:'Time, standing tall.',description:'Look a little closer. Four clock faces, Gothic spires, and a silhouette known around the world.',subtitle:'ELIZABETH TOWER · BIG BEN'},
  eye:{position:[-110,95,-220],target:[220.19,65,-345.06],title:'A turn above the city.',description:'Follow the quiet rhythm of the London Eye. The river keeps moving. So does the view.',subtitle:'THE LONDON EYE · SOUTH BANK'},
  river:{position:[90,29,380],target:[80,26,-180],title:'Life along the Thames.',description:'Drift down to the water. Watch the boats pass and the city find its own reflection.',subtitle:'RIVER THAMES · WESTMINSTER BRIDGE'},
  abbey:{position:[-500,75,-35],target:[-340,29,95],title:'Written in stone.',description:'Discover the Abbey’s twin towers, Gothic windows and flying buttresses, recreated in stone.',subtitle:'WESTMINSTER ABBEY · WEST FRONT'},
  victoria:{position:[-270,50,350],target:[-173.75,54,213.23],title:'Stone, rising skyward.',description:'Look up through tiers of Gothic windows, carved stone and the lanterns of Victoria Tower.',subtitle:'VICTORIA TOWER · SOVEREIGN’S ENTRANCE'},
};
let renderer;
try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
}catch(error){document.querySelector('#error').hidden=false;document.querySelector('#loading').classList.add('done');throw error;}
const mobile=innerWidth<700;
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
camera.position.fromArray(views.westminster.position);
const controls=new OrbitControls(camera,canvas);
controls.target.fromArray(views.westminster.target);
controls.enableDamping=true;controls.dampingFactor=.065;
controls.maxPolarAngle=Math.PI*.49;
controls.minDistance=24;controls.maxDistance=1050;
controls.minTargetRadius=0;controls.maxTargetRadius=1750;
controls.zoomSpeed=.7;controls.rotateSpeed=.42;controls.panSpeed=.6;
controls.autoRotateSpeed=.24;
controls.keyPanSpeed=22;
controls.listenToKeyEvents(window);
controls.update();

const hemi=new THREE.HemisphereLight('#e0ebee','#776747',2.05);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe2a3',3.8);
sun.position.set(-240,220,240);sun.target.position.set(-60,0,20);
sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
Object.assign(sun.shadow.camera,{left:-370,right:370,top:410,bottom:-410,near:10,far:1000});
sun.shadow.bias=-.0003;sun.shadow.normalBias=.4;sun.shadow.blurSamples=8;
scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight('#b8d3e5',.4);fill.position.set(300,180,-160);scene.add(fill);

let loaded=0;
const manager=new THREE.LoadingManager();
manager.onProgress=(url,done,total)=>{loaded=done/total;document.querySelector('#loading-progress').textContent=` · ${Math.round(loaded*100)}%`;};
const loader=new THREE.TextureLoader(manager);
const loadTexture=(name,color=false)=>new Promise(resolve=>{
  loader.load(`./assets/${name}`,t=>{if(color)t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=renderer.capabilities.getMaxAnisotropy();resolve(t);},undefined,()=>{console.warn('Texture unavailable:',name);resolve(null);});
});
const [stone,normal,roughness,waterNormals]=await Promise.all([
  loadTexture('stone-color.jpg',true),loadTexture('stone-normal.jpg'),loadTexture('stone-roughness.jpg'),loadTexture('waternormals.jpg'),
]);
const surfaceEntries=await Promise.all(['brick','plaster','asphalt','roof','paving'].map(async name=>{
  const [color,normal,roughness]=await Promise.all([loadTexture(`${name}-color.jpg`,true),loadTexture(`${name}-normal.jpg`),loadTexture(`${name}-roughness.jpg`)]);
  return [name,{color,normal,roughness}];
}));
const [facade,brickFacade,palaceFacade,grass,grassNormal,grassRoughness,mapData,unionFlag,abbeyPhoto,streetData]=await Promise.all([
  loadTexture('portland-facade-v1.jpg',true),loadTexture('stock-brick-facade-v1.jpg',true),loadTexture('westminster-facade-v1.jpg',true),loadTexture('grass-color.jpg',true),loadTexture('grass-normal.jpg'),loadTexture('grass-roughness.jpg'),
  fetch('./assets/london-map.json').then(r=>{if(!r.ok)throw Error('Map unavailable');return r.json();}).catch(error=>{console.warn(error.message);return null;}),
  loadTexture('union-flag.svg',true),loadTexture('abbey-west-photo.webp',true),
  fetch('./assets/london-streets.json').then(r=>{if(!r.ok)throw Error('Street details unavailable');return r.json();}).catch(error=>{console.warn(error.message);return null;}),
]);
const dracoLoader=new DRACOLoader(manager).setDecoderPath('./assets/draco/');
const modelLoader=new GLTFLoader(manager);modelLoader.setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(dracoLoader);
const modelNames={bigben:'big-ben.glb',tree:'tree-canopy.glb'};
const models=Object.fromEntries(await Promise.all(Object.entries(modelNames).map(async([name,file])=>{
  try{return [name,(await modelLoader.loadAsync(`./assets/${file}`)).scene];}
  catch(error){console.warn(`Model unavailable: ${file}`,error.message);return [name,null];}
})));
dracoLoader.dispose();
const treePicture=await loadTexture('tree-billboard.png',true);
models.treeImpostor={material:new THREE.MeshBasicMaterial({map:treePicture,alphaTest:.4,side:THREE.DoubleSide,color:'#ffffff'}),aspect:326/480};
const london=buildLondon(scene,{stone,normal,roughness,facade,brickFacade,palaceFacade,grass,grassNormal,grassRoughness,unionFlag,abbeyPhoto,...Object.fromEntries(surfaceEntries)},models,mapData,{mobile,streetData});
const river=createRiver(waterNormals,sun.position,renderer,!!mapData,mobile);
const water=river.mesh;scene.add(water);
const pmrem=new THREE.PMREMGenerator(renderer);
let environment;
let skyResolution=0;
let skyDome=null;
try {
  const hdr=await new RGBELoader().loadAsync('./assets/sky.hdr');
  hdr.mapping=THREE.EquirectangularReflectionMapping;
  environment=pmrem.fromEquirectangular(hdr).texture;
  scene.environment=environment;scene.background=hdr;
  scene.backgroundRotation.y=.45;scene.environmentRotation.y=.45;
  scene.backgroundIntensity=.9;scene.environmentIntensity=.55;
}catch{console.warn('Using procedural sky lighting.');}
pmrem.dispose();
try{
  const skySize=mobile||renderer.capabilities.maxTextureSize<8192?4096:8192;
  const sky=await loadTexture(`sky-${skySize===8192?'8k':'4k'}.webp`,true);
  if(sky){
    const oldBackground=scene.background;
    const geometry=new THREE.SphereGeometry(6000,64,32),uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
    sky.wrapS=THREE.RepeatWrapping;sky.wrapT=THREE.ClampToEdgeWrapping;
    skyDome=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:sky,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false}));
    skyDome.rotation.y=.45;skyDome.renderOrder=-10000;skyDome.frustumCulled=false;
    skyDome.onBeforeRender=(renderer,scene,camera)=>{skyDome.position.copy(camera.position);skyDome.updateMatrixWorld();};
    scene.add(skyDome);scene.background=null;skyResolution=sky.image.width;
    if(oldBackground?.isTexture&&oldBackground!==environment)oldBackground.dispose();
  }
}catch{console.warn('Using the HDR sky background.');}
london.prepareVegetation(renderer,environment);
const rendering=createRendering(renderer,scene,camera,mobile);
await rendering.ready;

// Broad, soft cloud layers add depth without hiding the photographic sky.
const labels=[
  {id:'bigben',name:'BIG BEN',position:new THREE.Vector3(-121,110,-51)},
  {id:'eye',name:'LONDON EYE',position:new THREE.Vector3(220.19,148,-345.06)},
  {id:'westminster',name:'PALACE OF WESTMINSTER',position:new THREE.Vector3(-137,47,100)},
  {id:'abbey',name:'WESTMINSTER ABBEY',position:new THREE.Vector3(-385,79,85)},
  {id:'victoria',name:'VICTORIA TOWER',position:new THREE.Vector3(-173.75,109,213.23)},
];
for(const label of labels) {
  const button=document.createElement('button');button.className='landmark';button.textContent=label.name;button.tabIndex=-1;
  button.addEventListener('click',()=>setView(label.id));document.querySelector('#landmark-labels').append(button);label.element=button;
}

let activeView='westminster',flight=null,lightMode='golden',lightFlight=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.enableDamping=!reducedMotion;
let renderNeeded=true;
controls.addEventListener('change',()=>{renderNeeded=true;});
function setView(id,instant=false) {
  const view=views[id];if(!view)return;
  activeView=id;
  renderNeeded=true;
  document.querySelector('#experience').classList.toggle('focused-view',id!=='westminster');
  controls.autoRotate=false;document.querySelector('#auto-orbit').setAttribute('aria-pressed','false');
  document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===id;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  document.querySelector('#location-title').textContent=view.title;
  document.querySelector('#location-description').textContent=view.description;
  document.querySelector('#location-subtitle').textContent=view.subtitle;
  const ids=Object.keys(views);
  document.querySelector('#location-index').textContent=`${String(ids.indexOf(id)+1).padStart(2,'0')} / ${String(ids.length).padStart(2,'0')}`;
  document.querySelector(`.view-nav [data-view="${id}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:reducedMotion?'instant':'smooth'});
  const endPos=new THREE.Vector3(...view.position);
  if(innerWidth<700&&id==='westminster'){endPos.set(260,180,560);}
  if(innerWidth<700&&id==='abbey'){endPos.set(-680,150,-160);}
  if(innerWidth<700&&id==='victoria'){endPos.set(-305,85,405);}
  if(instant||reducedMotion){camera.position.copy(endPos);controls.target.fromArray(view.target);controls.update();flight=null;}
  else flight={start:performance.now(),from:camera.position.clone(),to:endPos,fromTarget:controls.target.clone(),toTarget:new THREE.Vector3(...view.target)};
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelector('#next-location').addEventListener('click',()=>{const ids=Object.keys(views);setView(ids[(ids.indexOf(activeView)+1)%ids.length]);});
document.querySelector('#reset').addEventListener('click',()=>{setView('westminster');toast('Back to a familiar view.');});
controls.addEventListener('start',()=>{flight=null;if(controls.autoRotate){controls.autoRotate=false;document.querySelector('#auto-orbit').setAttribute('aria-pressed','false');}});
function zoom(factor){flight=null;const offset=camera.position.clone().sub(controls.target);const d=THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(d));controls.update();}
document.querySelector('#zoom-in').addEventListener('click',()=>zoom(.8));
document.querySelector('#zoom-out').addEventListener('click',()=>zoom(1.25));
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='+'||e.key==='=')zoom(.9);if(e.key==='-')zoom(1.1);if(e.key==='Escape'){flight=null;controls.autoRotate=false;document.querySelector('#auto-orbit').setAttribute('aria-pressed','false');}});
document.querySelector('#auto-orbit').addEventListener('click',()=>{flight=null;controls.autoRotate=!controls.autoRotate;document.querySelector('#auto-orbit').setAttribute('aria-pressed',String(controls.autoRotate));toast(controls.autoRotate?'A gentle orbit. Drag whenever you like.':'Orbit paused.');});
document.querySelector('#compass').addEventListener('click',()=>{
  const distance=camera.position.distanceTo(controls.target),p=controls.target.clone().add(new THREE.Vector3(0,distance*.38,distance*.925));
  flight={start:performance.now(),from:camera.position.clone(),to:p,fromTarget:controls.target.clone(),toTarget:controls.target.clone()};
});
document.querySelector('#help-button').addEventListener('click',()=>document.querySelector('#help').showModal());
document.querySelector('#close-help').addEventListener('click',()=>document.querySelector('#help').close());
document.querySelector('#help').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
document.querySelector('#fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable in this preview.');}
});
document.addEventListener('fullscreenchange',()=>{document.querySelector('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});

const lighting={
  day:{sun:'#fff1d3',sunPower:2.4,hemiPower:.95,fillPower:.2,sky:skyResolution?2:.8,env:.45,exposure:1,fog:'#aebdbd',density:.0012,water:'#636553',warm:.015,glow:.15,sunPos:[-180,360,210]},
  golden:{sun:'#ffcf9a',sunPower:2.7,hemiPower:.75,fillPower:.22,sky:skyResolution?1.6:.65,env:.4,exposure:1.05,fog:'#a9adb1',density:.00085,water:'#68604b',warm:.08,glow:.5,sunPos:[-260,155,235]},
  night:{sun:'#a0b4e8',sunPower:.15,hemiPower:.36,fillPower:.32,sky:skyResolution?.16:.07,env:.18,exposure:1.3,fog:'#1c2c46',density:.0009,water:'#243237',warm:1.5,glow:3,sunPos:[-250,250,180]},
};
function setLight(mode,instant=false){
  const l=lighting[mode];if(!l)return;lightMode=mode;renderNeeded=true;
  document.body.classList.toggle('night',mode==='night');
  document.querySelectorAll('[data-light]').forEach(b=>{const active=b.dataset.light===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  lightFlight={sunColor:sun.color.clone(),sunPower:sun.intensity,hemiPower:hemi.intensity,fillPower:fill.intensity,sky:scene.backgroundIntensity??1,env:scene.environmentIntensity??1,exposure:renderer.toneMappingExposure,fog:scene.fog.color.clone(),density:scene.fog.density,water:water.material.uniforms.waterColor.value.clone(),warm:london.mats.warmglass.emissiveIntensity,glow:london.glowMat.emissiveIntensity,sunPos:sun.position.clone(),start:performance.now(),target:l};
  if(instant||reducedMotion)lightFlight.start-=1800;
}
document.querySelectorAll('[data-light]').forEach(b=>b.addEventListener('click',()=>setLight(b.dataset.light)));
setLight('golden',true);

// User-initiated ambient audio is synthesized locally; no permission or download.
let audioContext,ambientGain,audioEnabled=false;
async function toggleAudio(){
  try{
    if(!audioContext){
      audioContext=new (window.AudioContext||window.webkitAudioContext)();
      ambientGain=audioContext.createGain();ambientGain.gain.value=0;ambientGain.connect(audioContext.destination);
      const seconds=8,buffer=audioContext.createBuffer(2,audioContext.sampleRate*seconds,audioContext.sampleRate);
      for(let channel=0;channel<2;channel++){const data=buffer.getChannelData(channel);let last=0;for(let i=0;i<data.length;i++){const white=Math.random()*2-1;last=(last+.02*white)/1.02;data[i]=last*3.5;}}
      const source=audioContext.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=800;
      source.connect(filter);filter.connect(ambientGain);source.start();
      const tide=audioContext.createOscillator();tide.frequency.value=.13;const tideGain=audioContext.createGain();tideGain.gain.value=95;tide.connect(tideGain);tideGain.connect(filter.frequency);tide.start();
      const traffic=audioContext.createOscillator();traffic.type='sine';traffic.frequency.value=64;const trafficGain=audioContext.createGain();trafficGain.gain.value=.025;traffic.connect(trafficGain);trafficGain.connect(ambientGain);traffic.start();
    }
    await audioContext.resume();audioEnabled=!audioEnabled;
    ambientGain.gain.setTargetAtTime(audioEnabled?.38:0,audioContext.currentTime,.8);
    const button=document.querySelector('#sound');button.setAttribute('aria-pressed',String(audioEnabled));button.querySelector('span').textContent=audioEnabled?'Sound on':'Sound off';
    button.querySelector('svg').innerHTML=audioEnabled?'<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m11 4-6 5H2v6h3l6 5ZM16 8l6 8m0-8-6 8"/>';
    toast(audioEnabled?'A little river ambience.':'A quieter moment.');
  }catch{toast('Audio is unavailable in this browser.');}
}
document.querySelector('#sound').addEventListener('click',toggleAudio);
document.addEventListener('visibilitychange',()=>{if(audioContext){if(document.hidden)audioContext.suspend();else if(audioEnabled)audioContext.resume();}});
let toastTimer;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000);}

const temp=new THREE.Vector3(),clock=new THREE.Clock();
const victoriaOccludes=createVictoriaOcclusion(london.victoriaInfo);
let elapsed=0,frame=0,lastShadowUpdate=0;
function animate(){
  requestAnimationFrame(animate);
  if(document.hidden){clock.getDelta();return;}
  const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
  const now=performance.now();
  if(flight){
    const t=Math.min((now-flight.start)/2400,1),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    camera.position.lerpVectors(flight.from,flight.to,e);controls.target.lerpVectors(flight.fromTarget,flight.toTarget,e);if(t===1)flight=null;
  }
  if(lightFlight){
    renderer.shadowMap.needsUpdate=true;
    const f=lightFlight,l=f.target,t=Math.min((now-f.start)/1800,1),e=t*t*(3-2*t),lerp=(a,b)=>THREE.MathUtils.lerp(a,b,e);
    sun.color.copy(f.sunColor).lerp(new THREE.Color(l.sun),e);sun.intensity=lerp(f.sunPower,l.sunPower);
    sun.position.lerpVectors(f.sunPos,new THREE.Vector3(...l.sunPos),e);
    hemi.intensity=lerp(f.hemiPower,l.hemiPower);fill.intensity=lerp(f.fillPower,l.fillPower);
    scene.backgroundIntensity=lerp(f.sky,l.sky);scene.environmentIntensity=lerp(f.env,l.env);renderer.toneMappingExposure=lerp(f.exposure,l.exposure);
    if(skyDome)skyDome.material.color.setScalar(scene.backgroundIntensity);
    scene.fog.color.copy(f.fog).lerp(new THREE.Color(l.fog),e);scene.fog.density=lerp(f.density,l.density);
    water.material.uniforms.waterColor.value.copy(f.water).lerp(new THREE.Color(l.water),e);
    river.setIllumination(THREE.MathUtils.lerp(.1,.9,Math.min(hemi.intensity/.95,1)));
    water.material.uniforms.sunColor.value.copy(sun.color).multiplyScalar(Math.min(sun.intensity/2.7,1));water.material.uniforms.sunDirection.value.copy(sun.position).normalize();
    london.mats.warmglass.emissiveIntensity=lerp(f.warm,l.warm);london.glowMat.emissiveIntensity=lerp(f.glow,l.glow);
    if(models.treeImpostor)models.treeImpostor.material.color.setScalar(THREE.MathUtils.lerp(1,.22,Math.min(l.warm/1.5,1)));
    for(const m of london.bakedMaterials)m.color.setScalar(THREE.MathUtils.lerp(1,.2,Math.min(l.warm/1.5,1)));
    for(const uniform of london.mapContext?.nightUniforms||[])uniform.value=london.mats.warmglass.emissiveIntensity;
    if(t===1)lightFlight=null;
  }
  controls.update(dt);
  // Keep exploration above the river surface when panning down.
  if(controls.target.y<3){const correction=3-controls.target.y;controls.target.y+=correction;camera.position.y+=correction;}
  if(camera.position.y<4)camera.position.y=4;
  if(reducedMotion&&!renderNeeded&&!flight&&!lightFlight&&!controls.autoRotate)return;
  if(london.updateVegetation(camera,reducedMotion?0:elapsed))renderer.shadowMap.needsUpdate=true;
  london.update(reducedMotion?0:elapsed,reducedMotion?0:dt);
  london.updateWakes(river.wakes);
  if(!reducedMotion)water.material.uniforms.time.value+=dt;
  if(!reducedMotion&&elapsed-lastShadowUpdate>.12){renderer.shadowMap.needsUpdate=true;lastShadowUpdate=elapsed;}
  rendering.render(dt);
  renderNeeded=false;
  {
    frame++;
    for(const label of labels){
      temp.copy(label.position).project(camera);
      const x=(temp.x*.5+.5)*innerWidth,y=(-temp.y*.5+.5)*innerHeight;
      const nearIntro=x<340&&y<345;
      const nearCard=x<395&&y>innerHeight-380;
      const visible=temp.z<1&&temp.z>-1&&x>20&&x<innerWidth-75&&y>160&&y<innerHeight-100&&!nearIntro&&!nearCard&&!(label.id!=='victoria'&&victoriaOccludes(camera.position,label.position));
      label.element.style.opacity=visible?'1':'0';label.element.style.pointerEvents=visible?'auto':'none';
      label.element.style.left=`${x}px`;label.element.style.top=`${y}px`;
    }
    document.querySelector('#compass svg').style.transform=`rotate(${-THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())}deg)`;
  }
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);rendering.resize(innerWidth,innerHeight);renderNeeded=true;});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('Graphics paused. Restoring the world…');});
canvas.addEventListener('webglcontextrestored',()=>location.reload());
setView('westminster',true);
renderer.compile(scene,camera);
animate();
requestAnimationFrame(()=>{document.querySelector('#loading').classList.add('done');});

// Exposed read-only snapshot for browser QA and performance diagnostics.
window.londonWorld={
  get state(){const m=london.mapContext;return {ready:true,view:activeView,lighting:lightMode,autoOrbit:controls.autoRotate,sound:audioEnabled,camera:camera.position.toArray(),target:controls.target.toArray(),rendering:{...rendering.info,skyResolution,water:{...river.info,time:water.material.uniforms.time.value,wakes:river.wakes.map(v=>v.toArray())}},models:Object.fromEntries(Object.entries(models).map(([key,value])=>[key,!!value])),map:m?{buildings:m.buildings,recordedHeights:m.recordedHeights,roads:m.roads,trees:m.trees,kerbs:m.kerbs,materials:{glassBuildings:m.glassBuildings,recessedGlassPanes:m.recessedGlassPanes,mappedMaterials:m.mappedMaterials,partEnvelopes:m.partEnvelopes},walls:m.walls,facades:{recessedWindows:m.recessedWindows,detailedFrontages:m.detailedFrontages,lodGroups:m.facadeLODs.length,nearGroups:m.facadeLODs.filter(l=>l.getCurrentLevel()===0).length},source:m.source.name}:null,abbeyBounds:london.abbeyBounds,abbey:london.abbeyInfo,palace:london.palaceInfo,victoria:london.victoriaInfo,vegetation:london.vegetationInfo,instances:london.instanceCount,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
};
