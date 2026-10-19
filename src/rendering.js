import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/** Match color and depth storage; some mobile formats offer fewer sample counts. */
function renderSamples(renderer,floatColor,mobile){
  const gl=renderer.getContext(),limit=Math.min(4,renderer.capabilities.maxSamples);
  const color=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,floatColor?gl.RGBA16F:gl.RGBA8,gl.SAMPLES));
  const depth=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES));
  const supported=color.filter(n=>n>1&&n<=limit&&depth.includes(n)).sort((a,b)=>a-b);
  return supported.length?(mobile?supported[0]:supported.at(-1)):0;
}

/** Reuse the color pass depth so alpha-tested leaves keep their real silhouettes. */
class SceneDepthAO extends GTAOPass {
  constructor(scene,camera,width,height,resolutionScale){
    super(scene,camera,width,height);
    this.resolutionScale=resolutionScale;
    this.setSize(width,height);
    this.blendIntensity=.48;
    this.updateGtaoMaterial({radius:3.2,thickness:4,distanceExponent:1.5,distanceFallOff:1,scale:1,samples:12,screenSpaceRadius:false});
    this.updatePdMaterial({radius:4,samples:8,rings:2,depthPhi:2,normalPhi:3});
    this.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-6500,4.5,-6500),new THREE.Vector3(6500,400,6500)));
  }
  setSize(width,height){
    const scale=this.resolutionScale??1;
    super.setSize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));
  }
  render(renderer,writeBuffer,readBuffer,deltaTime,maskActive){
    this.setGBuffer(readBuffer.depthTexture);
    super.render(renderer,writeBuffer,readBuffer,deltaTime,maskActive);
  }
}

export function createRendering(renderer,scene,camera,mobile){
  const floatColor=renderer.extensions.has('EXT_color_buffer_float');
  const samples=renderSamples(renderer,floatColor,mobile);
  const size=renderer.getSize(new THREE.Vector2());
  const target=new THREE.WebGLRenderTarget(size.x,size.y,{
    type:floatColor?THREE.HalfFloatType:THREE.UnsignedByteType,
    depthBuffer:true,
    depthTexture:new THREE.DepthTexture(size.x,size.y,THREE.UnsignedIntType),
    // The canvas's antialias flag does not cover offscreen scene rendering.
    // SMAA alone cannot integrate subpixel mullions and Gothic stonework.
    samples,
  });
  const composer=new EffectComposer(renderer,target);
  const scenePass=new RenderPass(scene,camera);
  const ao=new SceneDepthAO(scene,camera,size.x,size.y,mobile?.6:.75);
  ao.enabled=floatColor;
  const output=new OutputPass();
  const antialias=new SMAAPass();
  if(!floatColor){antialias._edgesRT.texture.type=THREE.UnsignedByteType;antialias._weightsRT.texture.type=THREE.UnsignedByteType;}
  composer.addPass(scenePass);
  composer.addPass(ao);
  composer.addPass(output);
  composer.addPass(antialias);
  composer.setSize(size.x,size.y);
  // These built-in lookup images are embedded in SMAAPass, not fetched remotely.
  const ready=Promise.all([antialias._areaTexture.image.decode(),antialias._searchTexture.image.decode()]).then(()=>{antialias._areaTexture.needsUpdate=true;antialias._searchTexture.needsUpdate=true;});
  renderer.info.autoReset=false;
  return {
    ready,
    render(dt){renderer.info.reset();composer.render(dt);},
    resize(width,height){composer.setSize(width,height);},
    get info(){return {contactShading:ao.enabled,antialias:samples?'MSAA + SMAA':'SMAA',samples,hdr:floatColor,width:composer.readBuffer.width,height:composer.readBuffer.height,aoWidth:ao.width,aoHeight:ao.height};},
  };
}
