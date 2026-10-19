import * as THREE from 'three';
import {createFacadeMaterial} from './facade-material.mjs';
import {facadeAtlases} from './facades.mjs';
import {colourRoofSurface} from './building-colours.mjs';
import {curtainMaterial} from './building-surfaces.mjs';
import {weatherGround} from './streets.mjs';

/** Replace offline material symbols with shared local PBR maps before shadow setup. */
export function attachRegion(scene,model,textures,treeMaterial,nightUniforms){
  if(!model)return null;
  const surface=(key,color)=>new THREE.MeshStandardMaterial({color,map:textures[key]?.color,normalMap:textures[key]?.normal,normalScale:new THREE.Vector2(.2,.2),roughnessMap:textures[key]?.roughness,roughness:.92,side:THREE.DoubleSide,vertexColors:true});
  const materials={
    stone:createFacadeMaterial(textures.facade,facadeAtlases.stone,{continuous:true}),
    brick:createFacadeMaterial(textures.brickFacade,facadeAtlases.brick,{continuous:true}),
    glass:curtainMaterial(),
    roof:colourRoofSurface(surface('roof','#ffffff'),.25646),
    'gable-stone':colourRoofSurface(surface('plaster','#ffffff'),.2585658),
    'gable-brick':colourRoofSurface(surface('brick','#ffffff'),.1117787),
    land:weatherGround(surface('paving','#cccac1')),
    pavement:weatherGround(surface('paving','#deddd5')),
    road:weatherGround(surface('asphalt','#a1a3a2'),true),
    grass:new THREE.MeshStandardMaterial({color:'#89967a',map:textures.grass,normalMap:textures.grassNormal,normalScale:new THREE.Vector2(.3,.3),roughnessMap:textures.grassRoughness,roughness:1,side:THREE.DoubleSide}),
    tree:treeMaterial.clone(),
  };
  for(const key of ['stone','brick','glass'])nightUniforms.push(materials[key].userData.night);
  const treeNight={value:0};nightUniforms.push(treeNight);
  materials.tree.onBeforeCompile=shader=>{shader.uniforms.uRegionTreeNight=treeNight;shader.fragmentShader='uniform float uRegionTreeNight;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(1.,.12,clamp(uRegionTreeNight/1.5,0.,1.));');};
  materials.tree.customProgramCacheKey=()=> 'regional-tree-day-night-v1';
  const disposed=new Set(),shardProxies=[];let meshes=0;
  model.traverse(object=>{if(!object.isMesh)return;if(object.userData.feature==='shard')shardProxies.push(object);const old=object.material,key=old.name;if(!materials[key])throw Error(`Unknown regional material ${key}`);object.material=materials[key];object.castShadow=!['land','grass','road','pavement','tree'].includes(key);object.receiveShadow=key!=='tree';disposed.add(old);meshes++;});
  for(const old of disposed)old.dispose();
  model.name='Greater London context';scene.add(model);
  return {...model.userData,meshes,materials,shardProxies};
}
