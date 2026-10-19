import * as THREE from 'three';

/** Match the fogged ground at the horizon without dimming the upper sky photo. */
export function createSkyDome(texture,fog){
  const geometry=new THREE.SphereGeometry(6000,64,32),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
  texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false});
  const horizon={startElevation:.006,endElevation:.11};
  material.onBeforeCompile=shader=>{
    shader.uniforms.uSkyHazeColour={value:fog.color};
    shader.vertexShader='varying vec3 vSkyDirection;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSkyDirection=position;');
    shader.fragmentShader='uniform vec3 uSkyHazeColour;varying vec3 vSkyDirection;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float skyElevation=normalize(vSkyDirection).y;
      float skyPhotoVisibility=smoothstep(${horizon.startElevation.toFixed(4)},${horizon.endElevation.toFixed(4)},skyElevation);
      diffuseColor.rgb=mix(uSkyHazeColour,diffuseColor.rgb,skyPhotoVisibility);`);
  };
  material.customProgramCacheKey=()=> 'photographic-sky-horizon-v1';
  const dome=new THREE.Mesh(geometry,material);dome.userData.horizon=horizon;
  dome.rotation.y=.45;dome.renderOrder=-10000;dome.frustumCulled=false;
  dome.onBeforeRender=(renderer,scene,camera)=>{camera.getWorldPosition(dome.position);dome.updateMatrixWorld();};
  return dome;
}
