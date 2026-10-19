import * as THREE from 'three';
import {CSM} from 'three/addons/csm/CSM.js';

/** Camera-following sunlight. Existing material hooks retain their own shading. */
export function createSunShadows(scene,camera,sun,mobile=false){
  const cascades=mobile?2:3,mapSize=mobile?1024:2048,range=1600;
  const csm=new CSM({camera,parent:scene,cascades,maxFar:range,mode:'custom',shadowMapSize:mapSize,shadowBias:-.000012,lightNear:1,lightFar:4000,lightMargin:450,
    lightDirection:new THREE.Vector3().subVectors(sun.target.position,sun.position).normalize(),
    customSplitsCallback(count,near,far,out){for(const distance of count===2?[360,range]:[170,540,range])out.push(Math.min(distance,far)/far);},
  });
  csm.fade=true;csm.updateFrustums();
  const configured=new Set();
  function prepareObject(root){root.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material?.isMeshStandardMaterial||configured.has(material))continue;
      const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey.bind(material)();
      csm.setupMaterial(material);const setup=material.onBeforeCompile;
      material.onBeforeCompile=function(shader,renderer){setup.call(this,shader,renderer);previous.call(this,shader,renderer);};
      material.customProgramCacheKey=()=>`${cacheKey}:sun-cascades-${cascades}`;
      material.needsUpdate=true;configured.add(material);
    }
  });}
  prepareObject(scene);
  function configureBias(){
    for(const light of csm.lights){const width=light.shadow.camera.right-light.shadow.camera.left;light.shadow.normalBias=Math.max(.025,width/mapSize*.35);light.shadow.radius=1;}
  }
  configureBias();
  const lastPositions=csm.lights.map(()=>new THREE.Vector3(Infinity,Infinity,Infinity)),lastDirection=new THREE.Vector3();
  let updates=0;
  const towardSun=new THREE.Vector3();
  function update(){
    camera.updateMatrixWorld();
    csm.lightDirection.subVectors(sun.target.position,sun.position).normalize();
    csm.update();let changed=lastDirection.distanceToSquared(csm.lightDirection)>1e-12;
    for(let i=0;i<cascades;i++){
      const light=csm.lights[i];light.color.copy(sun.color);light.intensity=sun.intensity;
      if(lastPositions[i].distanceToSquared(light.position)>1e-10)changed=true;
      lastPositions[i].copy(light.position);
    }
    lastDirection.copy(csm.lightDirection);towardSun.copy(csm.lightDirection).negate();
    if(changed)updates++;return changed;
  }
  return {
    update,
    prepareObject,
    get direction(){return towardSun;},
    resize(){csm.updateFrustums();configureBias();lastDirection.set(Infinity,Infinity,Infinity);},
    get info(){return {cascades,mapSize,range,materials:configured.size,updates,direction:towardSun.toArray(),positions:csm.lights.map(l=>l.position.toArray()),texelSizes:csm.lights.map(l=>(l.shadow.camera.right-l.shadow.camera.left)/mapSize)};},
  };
}
