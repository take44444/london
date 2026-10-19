import * as THREE from 'three';
/** Physical materials for the untextured AccuCities Shard geometry. */
export function prepareShardMaterials(model){
 const materials=new Map(),night={value:0};let triangles=0,meshes=0;
 model.traverse(object=>{if(!object.isMesh)return;meshes++;triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;
  object.material=(Array.isArray(object.material)?object.material:[object.material]).map(source=>{
   if(materials.has(source.name))return materials.get(source.name);
   const name=source.name,isGlass=/Blue_|Material #13/.test(name);let material;
   if(isGlass){
    material=new THREE.MeshPhysicalMaterial({color:name==='Blue_01'?'#68838a':'#455e66',roughness:.14,metalness:.08,ior:1.5,envMapIntensity:1.6,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{shader.uniforms.uShardNight=night;shader.vertexShader='varying vec3 vShardWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvShardWorld=(modelMatrix*vec4(position,1.)).xyz;');shader.fragmentShader='varying vec3 vShardWorld;uniform float uShardNight;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 shardCell=floor(vec2((vShardWorld.x+vShardWorld.z)*.7,vShardWorld.y/3.5));
      float occupied=step(.82,fract(sin(dot(shardCell,vec2(127.1,311.7)))*43758.5453));
      float room=step(.22,fract(vShardWorld.y/3.5));
      totalEmissiveRadiance+=vec3(1.,.64,.32)*uShardNight*occupied*room*.15;`);
    };material.customProgramCacheKey=()=> 'shard-room-lighting-v1';
   }else{
    const dark=/Material #72|Material #85/.test(name),sign=name==='Material #73',warm=name==='Orange';material=new THREE.MeshStandardMaterial({color:sign?'#b75343':warm?'#7c705e':dark?'#343d40':'#b7bbba',roughness:dark||warm?.45:.78,metalness:dark||warm?.55:.12,side:THREE.DoubleSide});
   }
   material.name=name;materials.set(name,material);return material;
  });if(object.material.length===1)object.material=object.material[0];object.castShadow=object.receiveShadow=true;
 });return {nightUniforms:[night],info:{meshes,triangles,materials:materials.size,photographicMaps:false}};
}

/** Keep the small mapped skyline representation outside the detailed viewing range. */
export function attachShard(scene,model,proxies,position){
 const prepared=prepareShardMaterials(model),lod=new THREE.LOD();lod.name='The Shard';lod.position.fromArray(position);scene.add(lod);lod.addLevel(model,0);
 if(proxies.length){const distant=new THREE.Group();distant.name='Mapped Shard skyline';scene.add(distant);scene.updateMatrixWorld(true);for(const proxy of proxies)distant.attach(proxy);lod.attach(distant);lod.addLevel(distant,900,.12);}
 return {lod,nightUniforms:prepared.nightUniforms,info:{...prepared.info,source:'AccuCities',proxyMeshes:proxies.length,detailRange:900,position:[...position]},get detailed(){return model.visible;}};
}
