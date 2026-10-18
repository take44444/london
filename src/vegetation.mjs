import * as THREE from 'three';

const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};

/** Decode normalized glTF attributes before baking node transforms into metre geometry. */
export function prepareTree(source){
  source.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(source),height=bounds.max.y-bounds.min.y;
  if(!(height>0))throw Error('The tree model has no height');
  const base=new THREE.Box3(),p=new THREE.Vector3();
  source.traverse(mesh=>{if(mesh.isMesh){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){
    p.fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld);if(p.y<bounds.min.y+height*.02)base.expandByPoint(p);
  }}});
  const root=base.getCenter(new THREE.Vector3());root.y=bounds.min.y;
  const normalize=new THREE.Matrix4().makeScale(1/height,1/height,1/height).multiply(new THREE.Matrix4().makeTranslation(-root.x,-root.y,-root.z));
  const parts=[];
  source.traverse(mesh=>{if(mesh.isMesh){
    const geometry=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(mesh.geometry.attributes)){
      const array=new Float32Array(attribute.count*attribute.itemSize);
      for(let i=0;i<attribute.count;i++)for(let j=0;j<attribute.itemSize;j++)array[i*attribute.itemSize+j]=attribute.getComponent(i,j);
      geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,attribute.itemSize));
    }
    if(mesh.geometry.index)geometry.setIndex(mesh.geometry.index.clone());
    geometry.applyMatrix4(normalize.clone().multiply(mesh.matrixWorld));geometry.computeBoundingSphere();
    const material=mesh.material.clone(),leaves=/leav/i.test(material.name);
    material.transparent=false;material.alphaTest=leaves?.45:0;material.depthWrite=true;material.side=THREE.DoubleSide;
    material.roughness=1;material.metalness=0;material.envMapIntensity=.8;material.normalScale?.set(.35,.35);
    parts.push({geometry,material,leaves});
  }});
  const normalizedBounds=new THREE.Box3();for(const part of parts){part.geometry.computeBoundingBox();normalizedBounds.union(part.geometry.boundingBox);}
  const extent=Math.max(1.3,2*Math.max(Math.abs(normalizedBounds.min.x),Math.abs(normalizedBounds.max.x),Math.abs(normalizedBounds.min.z),Math.abs(normalizedBounds.max.z)))*1.08;
  return {parts,extent,triangles:parts.reduce((sum,p)=>sum+(p.geometry.index?.count||p.geometry.attributes.position.count)/3,0)};
}

const fadeFragment=`
  float treeDither=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
  if(treeDither>vTreeVisibility)discard;`;
const farFadeFragment=`
  float treeDither=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
  if(treeDither<1.-vTreeVisibility)discard;`;

function treeShader(shader,time){
  shader.uniforms.uTreeTime=time;
  shader.vertexShader='uniform float uTreeTime; attribute float treeVisibility; varying float vTreeVisibility;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vTreeVisibility=treeVisibility;
    vec3 treeRoot=instanceMatrix[3].xyz;
    float treePhase=treeRoot.x*.07+treeRoot.z*.11;
    float crown=pow(clamp(position.y,0.,1.),3.);
    transformed.x+=sin(uTreeTime*.7+treePhase)*.012*crown;
    transformed.z+=sin(uTreeTime*.53+treePhase+1.7)*.009*crown;`);
  shader.fragmentShader='varying float vTreeVisibility;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n'+fadeFragment);
}

export function createVegetation(scene,source,impostor,mobile){
  const prepared=prepareTree(source),budget=mobile?8:16,radius=mobile?100:145;
  const records=[],time={value:0},atlasReady={value:0};
  const nearFade=new THREE.InstancedBufferAttribute(new Float32Array(budget),1).setUsage(THREE.DynamicDrawUsage);
  const near=prepared.parts.map(part=>{
    const geometry=part.geometry.clone();geometry.setAttribute('treeVisibility',nearFade);
    const material=part.material.clone();material.onBeforeCompile=shader=>treeShader(shader,time);material.customProgramCacheKey=()=> 'london-tree-wind-fade-v1';
    const mesh=new THREE.InstancedMesh(geometry,material,budget);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.setColorAt(0,new THREE.Color());mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:material.map,alphaTest:material.alphaTest,side:THREE.DoubleSide});
    depth.onBeforeCompile=shader=>treeShader(shader,time);depth.customProgramCacheKey=()=> 'london-tree-shadow-wind-v1';mesh.customDepthMaterial=depth;scene.add(mesh);return mesh;
  });
  const farMaterial=new THREE.MeshBasicMaterial({map:impostor.material.map,color:'#ffffff',alphaTest:.4,side:THREE.DoubleSide,fog:true});
  impostor.material=farMaterial;
  farMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uAtlasReady=atlasReady;
    shader.vertexShader=`uniform float uAtlasReady; attribute float treeVisibility; varying float vTreeVisibility; varying vec2 vTreeAtlas;\n`+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      vec3 treeCenter=instanceMatrix[3].xyz;
      float treeHeight=length(instanceMatrix[1].xyz);
      vec3 towardCamera=normalize(cameraPosition-treeCenter);
      vec3 treeRight=normalize(vec3(towardCamera.z,0.,-towardCamera.x)+vec3(.000001,0.,0.));
      vec3 treeUp=normalize(cross(towardCamera,treeRight));
      vec2 size=mix(vec2(${impostor.aspect.toFixed(7)},1.),vec2(${prepared.extent.toFixed(7)}),uAtlasReady)*treeHeight;
      vec3 treeWorld=treeCenter+treeRight*position.x*size.x+treeUp*position.y*size.y;
      vec4 mvPosition=viewMatrix*vec4(treeWorld,1.);
      gl_Position=projectionMatrix*mvPosition;
      float yaw=atan(instanceMatrix[2].x,instanceMatrix[0].x);
      float angle=atan(towardCamera.x,towardCamera.z)-yaw;
      float viewIndex=mod(floor(angle/6.28318530718*8.+.5)+8.,8.);
      float elevation=clamp(floor(asin(clamp(towardCamera.y,-1.,1.))/.6108652382+.5),0.,2.);
      vec2 tileUv=mix(vec2(.015625),vec2(.984375),uv);
      vTreeAtlas=mix(uv,(tileUv+vec2(viewIndex,elevation))/vec2(8.,3.),uAtlasReady);
      vTreeVisibility=treeVisibility;`);
    shader.fragmentShader='varying float vTreeVisibility; varying vec2 vTreeAtlas;\n'+shader.fragmentShader;
    // Complement the geometry fade so a transition does not thin both representations.
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\n'+farFadeFragment);
    // map_fragment is a shader include; expand just its UV expression here.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','vTreeAtlas'));
  };
  farMaterial.customProgramCacheKey=()=> 'london-tree-multiview-v1';
  let far=null,farFade=null,atlas=null,selectedCount=0;
  const lastCamera=new THREE.Vector3(Infinity,Infinity,Infinity),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3(),color=new THREE.Color();
  return {
    add(x,z,height=13){const seed=records.length;records.push({x,z,height,yaw:hash(seed+2)*Math.PI*2,tint:.87+hash(seed+7)*.16});},
    build(){
      const geometry=new THREE.PlaneGeometry(1,1);farFade=new THREE.InstancedBufferAttribute(new Float32Array(records.length).fill(1),1).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('treeVisibility',farFade);
      far=new THREE.InstancedMesh(geometry,farMaterial,records.length);
      for(let i=0;i<records.length;i++){
        const r=records[i];matrix.compose(position.set(r.x,5+r.height/2,r.z),q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,r.yaw),scale.setScalar(r.height));far.setMatrixAt(i,matrix);far.setColorAt(i,color.setScalar(r.tint));
      }
      far.computeBoundingSphere();far.frustumCulled=false;scene.add(far);
    },
    prepare(renderer,environment){
      const tile=mobile?128:256,padding=tile/64;
      const target=new THREE.WebGLRenderTarget(tile*8,tile*3,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
      target.texture.colorSpace=THREE.LinearSRGBColorSpace;
      const bake=new THREE.Scene();bake.environment=environment;bake.environmentIntensity=.45;
      for(const part of prepared.parts){const mesh=new THREE.Mesh(part.geometry,part.material);mesh.castShadow=true;mesh.receiveShadow=true;bake.add(mesh);}
      bake.add(new THREE.HemisphereLight('#e0ebee','#776747',.95));
      const sun=new THREE.DirectionalLight('#fff1d3',2.4);sun.position.set(-2,4,3);sun.target.position.set(0,.5,0);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-1.3,right:1.3,top:1.3,bottom:-1.3,near:.1,far:10});sun.shadow.normalBias=.002;sun.shadow.bias=-.0001;bake.add(sun,sun.target);
      const camera=new THREE.OrthographicCamera(-prepared.extent/2,prepared.extent/2,prepared.extent/2,-prepared.extent/2,.1,8);
      const old={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha(),autoClear:renderer.autoClear,shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate};
      try{
        renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear();renderer.autoClear=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
        for(let elevation=0;elevation<3;elevation++)for(let view=0;view<8;view++){
          const angle=view*Math.PI/4,pitch=elevation*35*Math.PI/180;
          camera.position.set(Math.sin(angle)*3*Math.cos(pitch),.5+3*Math.sin(pitch),Math.cos(angle)*3*Math.cos(pitch));camera.lookAt(0,.5,0);
          renderer.setViewport(view*tile+padding,elevation*tile+padding,tile-2*padding,tile-2*padding);renderer.setScissor(view*tile,elevation*tile,tile,tile);renderer.setScissorTest(true);
          if(elevation===2&&view===7)target.texture.generateMipmaps=true;
          renderer.render(bake,camera);
        }
        atlas=target;farMaterial.map=target.texture;atlasReady.value=1;farMaterial.needsUpdate=true;
      }catch(error){target.dispose();console.warn('Using the photographic tree fallback:',error.message);}
      finally{
        sun.shadow.map?.dispose();renderer.setRenderTarget(old.target);renderer.setViewport(old.viewport);renderer.setScissor(old.scissor);renderer.setScissorTest(old.scissorTest);renderer.setClearColor(old.clear,old.alpha);renderer.autoClear=old.autoClear;renderer.shadowMap.autoUpdate=old.shadowAuto;renderer.shadowMap.needsUpdate=old.shadowNeeds;
      }
    },
    update(camera,elapsed){
      time.value=elapsed;
      if(!far||camera.position.distanceToSquared(lastCamera)<.04)return false;
      lastCamera.copy(camera.position);
      const candidates=[];
      for(let i=0;i<records.length;i++){const r=records[i],distance=Math.hypot(camera.position.x-r.x,camera.position.y-5-r.height/2,camera.position.z-r.z);if(distance<radius)candidates.push({i,distance});}
      candidates.sort((a,b)=>a.distance-b.distance);
      const cutoff=Math.min(radius,candidates[budget]?.distance??radius);
      farFade.array.fill(1);nearFade.array.fill(0);selectedCount=0;
      for(let slot=0;slot<Math.min(budget,candidates.length);slot++){
        const c=candidates[slot],r=records[c.i],fade=1-THREE.MathUtils.smoothstep(c.distance,Math.max(0,cutoff-25),cutoff);
        if(fade<.001)continue;
        nearFade.setX(selectedCount,fade);farFade.setX(c.i,1-fade);
        matrix.compose(position.set(r.x,5,r.z),q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,r.yaw),scale.setScalar(r.height));
        for(const mesh of near){mesh.setMatrixAt(selectedCount,matrix);mesh.setColorAt(selectedCount,color.setScalar(r.tint));}
        selectedCount++;
      }
      nearFade.needsUpdate=true;farFade.needsUpdate=true;
      for(const mesh of near){mesh.count=selectedCount;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
      return true;
    },
    get info(){return {placements:records.length,detailInstances:selectedCount,detailBudget:budget,trianglesPerTree:prepared.triangles,atlasViews:atlas?24:1,atlasSize:atlas?[atlas.width,atlas.height]:null,leafCutoff:.45,windTime:time.value};},
  };
}
