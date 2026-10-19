import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
export const reflectionModes=['day','golden','night'];
export const reflectionHeights=[45,230];

const reflectionShader=`
#ifdef ENVMAP_TYPE_CUBE_UV
 uniform sampler2D uShardDayLow,uShardDayHigh,uShardGoldenLow,uShardGoldenHigh,uShardNightLow,uShardNightHigh;
 uniform vec3 uShardReflectionWeights;
 varying float vShardReflectionHeight;
 vec4 shardLocalEnvironment(vec3 direction,float roughness){
  float altitude=clamp((vShardReflectionHeight-45.)/185.,0.,1.);
  vec3 radiance=vec3(0.);
  if(uShardReflectionWeights.x>.0001)radiance+=uShardReflectionWeights.x*mix(textureCubeUV(uShardDayLow,direction,roughness).rgb,textureCubeUV(uShardDayHigh,direction,roughness).rgb,altitude);
  if(uShardReflectionWeights.y>.0001)radiance+=uShardReflectionWeights.y*mix(textureCubeUV(uShardGoldenLow,direction,roughness).rgb,textureCubeUV(uShardGoldenHigh,direction,roughness).rgb,altitude);
  if(uShardReflectionWeights.z>.0001)radiance+=uShardReflectionWeights.z*mix(textureCubeUV(uShardNightLow,direction,roughness).rgb,textureCubeUV(uShardNightHigh,direction,roughness).rgb,altitude);
  return vec4(radiance,1.);
 }
#endif
`;

/** Install local, height-blended radiance while preserving existing material hooks. */
export function applyShardReflections(model,textures,weights){
 if(textures.length!==6)throw Error('Six local reflection maps are required');
 const names=['DayLow','DayHigh','GoldenLow','GoldenHigh','NightLow','NightHigh'],uniforms={uShardReflectionWeights:{value:weights}},materials=new Set();
 names.forEach((name,i)=>uniforms['uShard'+name]={value:textures[i]});
 const chunk=THREE.ShaderChunk.envmap_physical_pars_fragment;
 const diffuse='textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 )',specular='textureCubeUV( envMap, envMapRotation * reflectVec, roughness )';
 if(!chunk.includes(diffuse)||!chunk.includes(specular))throw Error('Three.js environment shader changed');
 const localChunk=chunk.replace(diffuse,'shardLocalEnvironment( worldNormal, 1.0 )').replace(specular,'shardLocalEnvironment( reflectVec, roughness )');
 model.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){
  if(!material.isMeshPhysicalMaterial||!/Blue_|Material #13/.test(material.name)||materials.has(material))continue;
  materials.add(material);const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material)();
  material.envMap=textures[2];material.envMapRotation.set(0,0,0);material.envMapIntensity=1.4;
  // Opaque room backing under a clear dielectric outer surface. The source
  // has no furnished interiors for a full transmission pass.
  material.color.set('#202b2e');material.metalness=.04;material.roughness=.12;material.clearcoat=1;material.clearcoatRoughness=.055;
  material.onBeforeCompile=function(shader,renderer){previous.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying float vShardReflectionHeight;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvShardReflectionHeight=(modelMatrix*vec4(position,1.)).y;');shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',reflectionShader+localChunk);};
  material.customProgramCacheKey=()=>cache+':shard-local-radiance-v1';material.needsUpdate=true;
 }});
 return {materials:materials.size,uniforms};
}

/** Load only for the detailed view. Six HDR images become roughness-filtered maps. */
export async function loadShardReflections(renderer,model,weights,mobile=false,base='./assets/reflections/'){
 if(!renderer.extensions.has('EXT_color_buffer_float'))return null;
 const loader=new HDRLoader(),generator=new THREE.PMREMGenerator(renderer),targets=[];let images=[];
 try{
  const results=await Promise.allSettled(reflectionModes.flatMap(mode=>reflectionHeights.map(height=>loader.loadAsync(base+'shard-'+mode+'-'+height+(mobile?'-mobile':'')+'.hdr'))));
  images=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  for(const image of images){targets.push(generator.fromEquirectangular(image));image.dispose();}
  const applied=applyShardReflections(model,targets.map(t=>t.texture),weights);
  return {get info(){return {panoramas:6,heights:[...reflectionHeights],materials:applied.materials,weights:weights.toArray(),local:true};},dispose(){targets.forEach(t=>t.dispose());}};
 }catch(error){targets.forEach(t=>t.dispose());images.forEach(t=>t.dispose());throw error;}
 finally{generator.dispose();}
}
