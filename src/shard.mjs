import * as THREE from 'three';

/** The source has separate pane islands. Keep illumination constant per island. */
function preparePaneLights(geometry,matrix){
 const position=geometry.attributes.position,index=geometry.index,count=position.count;
 const parent=Int32Array.from({length:count},(_,i)=>i);
 function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 const at=i=>index?index.getX(i):i,total=index?.count||count;
 for(let i=0;i<total;i+=3){const a=root(at(i));parent[root(at(i+1))]=a;parent[root(at(i+2))]=a;}
 const centers=new Map(),point=new THREE.Vector3();
 for(let i=0;i<count;i++){
  const id=root(i);if(!centers.has(id))centers.set(id,{sum:new THREE.Vector3(),count:0});
  const pane=centers.get(id);point.fromBufferAttribute(position,i).applyMatrix4(matrix);pane.sum.add(point);pane.count++;
 }
 for(const pane of centers.values()){
  const center=pane.sum.divideScalar(pane.count);
  // Several neighboring panes can belong to a single room. Hash once on the
  // CPU, rather than cutting a window with a world-space fragment grid.
  const seed=Math.sin(Math.floor(center.x/3)*127.1+Math.floor(center.y/3.2)*311.7+Math.floor(center.z/3)*74.7)*43758.5453;
  pane.light=seed-Math.floor(seed)>.82?1:0;
 }
 const light=new Float32Array(count);for(let i=0;i<count;i++)light[i]=centers.get(root(i)).light;
 geometry.setAttribute('shardRoom',new THREE.BufferAttribute(light,1));
 return centers.size;
}

/** Physical materials for the untextured AccuCities Shard geometry. */
export function prepareShardMaterials(model){
 const materials=new Map(),night={value:0};let triangles=0,meshes=0,panes=0;
 model.updateWorldMatrix(true,true);
 model.traverse(object=>{if(!object.isMesh)return;meshes++;triangles+=(object.geometry.index?.count||object.geometry.attributes.position.count)/3;
  if((Array.isArray(object.material)?object.material:[object.material]).some(m=>/Blue_|Material #13/.test(m.name)))panes+=preparePaneLights(object.geometry,object.matrixWorld);
  object.material=(Array.isArray(object.material)?object.material:[object.material]).map(source=>{
   if(materials.has(source.name))return materials.get(source.name);
   const name=source.name,isGlass=/Blue_|Material #13/.test(name);let material;
   if(isGlass){
    material=new THREE.MeshPhysicalMaterial({color:name==='Blue_01'?'#68838a':'#455e66',roughness:.14,metalness:.08,ior:1.5,envMapIntensity:1.6,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{shader.uniforms.uShardNight=night;shader.vertexShader='attribute float shardRoom;varying float vShardRoom;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvShardRoom=shardRoom;');shader.fragmentShader='varying float vShardRoom;uniform float uShardNight;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance+=vec3(1.,.64,.32)*uShardNight*vShardRoom*.15;`);
    };material.customProgramCacheKey=()=> 'shard-pane-lighting-v2';
   }else{
    const dark=/Material #72|Material #85/.test(name),sign=name==='Material #73',warm=name==='Orange';material=new THREE.MeshStandardMaterial({color:sign?'#b75343':warm?'#7c705e':dark?'#343d40':'#b7bbba',roughness:dark||warm?.45:.78,metalness:dark||warm?.55:.12,side:THREE.DoubleSide});
   }
   material.name=name;materials.set(name,material);return material;
  });if(object.material.length===1)object.material=object.material[0];object.castShadow=object.receiveShadow=true;
 });return {nightUniforms:[night],info:{meshes,triangles,panes,materials:materials.size,photographicMaps:false}};
}

/** Keep the small mapped skyline representation outside the detailed viewing range. */
export function attachShard(scene,model,proxies,position){
 const prepared=prepareShardMaterials(model),lod=new THREE.LOD();lod.name='The Shard';lod.position.fromArray(position);scene.add(lod);lod.addLevel(model,0);
 if(proxies.length){const distant=new THREE.Group();distant.name='Mapped Shard skyline';scene.add(distant);scene.updateMatrixWorld(true);for(const proxy of proxies)distant.attach(proxy);lod.attach(distant);lod.addLevel(distant,900,.12);}
 return {lod,nightUniforms:prepared.nightUniforms,info:{...prepared.info,source:'AccuCities',proxyMeshes:proxies.length,detailRange:900,position:[...position]},get detailed(){return model.visible;}};
}
