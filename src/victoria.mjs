import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pointedArch} from './palace.mjs';

const BASE=5,WIDTH=22.4,HALF=WIDTH/2,TAU=Math.PI*2;
const tallWindows=[23.5,54].flatMap((bottom,row)=>[-5.1,0,5.1].map(x=>({x,bottom,width:3.8,height:row?23.5:21.5})));
const smallWindows=[20.3,47.4,80.2].flatMap(bottom=>Array.from({length:9},(_,i)=>({x:(i-4)*1.75,bottom,width:.95,height:2.7})));

/** Keep the square tower aligned with the longest straight edge of its OSM outline. */
export function victoriaPose(building){
  let longest=0,rotation=0;
  for(const polygon of building?.p||[])for(const ring of polygon)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length>longest){longest=length;rotation=-Math.atan2(dz,dx);}
  }
  while(rotation>Math.PI/4)rotation-=Math.PI/2;
  while(rotation< -Math.PI/4)rotation+=Math.PI/2;
  return {position:building?.c||[-173.75,213.23],rotation};
}

/** Test the actual solid core in tower coordinates, preserving the open gateway. */
export function createVictoriaOcclusion(pose){
  const inverse=new THREE.Matrix4().makeRotationY(pose.rotation).setPosition(pose.position[0],0,pose.position[1]).invert();
  const core=new THREE.Box3(new THREE.Vector3(-10.5,BASE+22,-10.5),new THREE.Vector3(10.5,BASE+84.8,10.5));
  const start=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3(),hit=new THREE.Vector3(),ray=new THREE.Ray();
  return (camera,target)=>{
    start.copy(camera).applyMatrix4(inverse);end.copy(target).applyMatrix4(inverse);
    const distance=start.distanceToSquared(end);
    if(distance<.01)return false;
    ray.set(start,direction.copy(end).sub(start).normalize());
    return !!ray.intersectBox(core,hit)&&start.distanceToSquared(hit)<distance-.01;
  };
}

function frameGeometry(width,height){
  const shape=pointedArch(width+.38,height+.25,-.1);shape.holes.push(pointedArch(width,height));
  return new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:16});
}

/** A hollow wall: the gate and all glazing openings are cut through the stone. */
export function victoriaWallGeometry(){
  const wall=new THREE.Shape();wall.moveTo(-HALF,0);wall.lineTo(HALF,0);wall.lineTo(HALF,86.2);wall.lineTo(-HALF,86.2);wall.closePath();
  wall.holes.push(pointedArch(7.8,19.2,.3));
  const panes=[];
  for(const window of [...tallWindows,...smallWindows]){
    const opening=pointedArch(window.width,window.height,window.bottom);
    opening.curves.forEach(curve=>{for(const key of ['v0','v1','v2','v3'])if(curve[key])curve[key].x+=window.x;});
    wall.holes.push(opening);
    const pane=new THREE.ShapeGeometry(opening,16);pane.translate(0,0,-.28);panes.push(pane);
  }
  const masonry=new THREE.ExtrudeGeometry(wall,{depth:.45,bevelEnabled:false,curveSegments:16});
  const glass=mergeGeometries(panes);panes.forEach(p=>p.dispose());
  return {masonry,glass};
}

function parapetGeometry(){
  const wall=new THREE.Shape();wall.moveTo(-HALF,0);wall.lineTo(HALF,0);wall.lineTo(HALF,2.8);wall.lineTo(-HALF,2.8);wall.closePath();
  for(let i=-4;i<=4;i++){
    const arch=pointedArch(1.05,1.9,.35);
    arch.curves.forEach(curve=>{for(const key of ['v0','v1','v2','v3'])if(curve[key])curve[key].x+=i*1.9;});
    wall.holes.push(arch);
  }
  return new THREE.ExtrudeGeometry(wall,{depth:.32,bevelEnabled:false,curveSegments:12});
}

/** Reference-based interpretation, rather than a measured conservation model. */
export function buildVictoriaTower({instance,box,rod,mats},textures={}){
  const stone=mats.stone.clone();stone.color.set('#d7ceb8');
  stone.map=textures.plaster?.color??stone.map;stone.normalMap=textures.plaster?.normal??stone.normalMap;
  stone.roughnessMap=textures.plaster?.roughness??stone.roughnessMap;stone.normalScale.set(.12,.12);
  const scaleMasonry=mats.stone.onBeforeCompile;
  stone.onBeforeCompile=shader=>{
    scaleMasonry(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      #ifdef USE_MAP
        vec2 ashlar=vMapUv*vec2(3.4/.8,3.4/.32);
        ashlar.x+=mod(floor(ashlar.y),2.)*.5;
        vec2 edge=abs(fract(ashlar-.5)-.5);
        vec2 aa=max(fwidth(ashlar),vec2(.0001));
        vec2 seam=1.-smoothstep(vec2(.003),vec2(.003)+aa,edge);
        float stoneVariation=fract(sin(dot(floor(ashlar),vec2(19.31,87.73)))*43758.5453);
        diffuseColor.rgb*=mix(.97,1.03,stoneVariation)*mix(1.,.87,max(seam.x,seam.y));
      #endif`);
  };
  stone.customProgramCacheKey=()=> 'victoria-fine-ashlar-v1';
  const trim=stone.clone();trim.color.set('#cfc5ad');trim.onBeforeCompile=stone.onBeforeCompile;trim.customProgramCacheKey=stone.customProgramCacheKey;
  const dark=new THREE.MeshStandardMaterial({color:'#283b36',roughness:.24,metalness:.06,envMapIntensity:.95});
  const lead=new THREE.MeshStandardMaterial({color:'#3d4541',roughness:.66,metalness:.38});
  const gold=new THREE.MeshStandardMaterial({color:'#a78b4d',roughness:.5,metalness:.6});
  const octagon=new THREE.CylinderGeometry(1,1,1,8),cone=new THREE.ConeGeometry(1,1,8),sphere=new THREE.SphereGeometry(1,10,7);
  const rosette=new THREE.TorusGeometry(.16,.045,4,8);
  const wall=victoriaWallGeometry(),parapet=parapetGeometry();
  const gateFrame=frameGeometry(7.8,19.2);
  const lowerFrame=frameGeometry(3.8,21.5),upperFrame=frameGeometry(3.8,23.5),smallFrame=frameGeometry(.95,2.7);
  const lanternPane=new THREE.ShapeGeometry(pointedArch(.68,5.7),12);
  const stoneBox=(x,y,z,w,h,d,mat=stone,angle=0)=>box(x,y,z,w,h,d,mat,angle);
  // The recessed core starts above the entrance, preserving the carriage passage.
  stoneBox(0,BASE+(22+84.8)/2,0,21,84.8-22,21,stone);
  stoneBox(0,BASE+.12,0,23,.24,23,trim);
  stoneBox(0,BASE+85.7,0,20.8,.28,20.8,lead);
  for(let side=0;side<4;side++){
    const angle=side*Math.PI/2,tx=Math.cos(angle),tz=-Math.sin(angle),nx=Math.sin(angle),nz=Math.cos(angle);
    const point=(u,y,d=0)=>[tx*u+nx*(HALF+d),y,tz*u+nz*(HALF+d)];
    const faceBox=(u,y,w,h,d,depth=.45,mat=trim)=>{const p=point(u,y,depth);stoneBox(p[0],p[1],p[2],w,h,d,mat,angle);};
    instance(wall.masonry,stone,...point(0,BASE),1,1,1,0,angle);
    instance(wall.glass,dark,...point(0,BASE),1,1,1,0,angle);
    instance(gateFrame,trim,...point(0,BASE+.3,.48),1,1,1,0,angle);
    for(const window of tallWindows){
      instance(window.bottom<40?lowerFrame:upperFrame,trim,...point(window.x,BASE+window.bottom,.48),1,1,1,0,angle);
      for(const offset of [-.63,.63])faceBox(window.x+offset,BASE+window.bottom+window.height*.43,.10,window.height*.84,.16,-.12,trim);
      for(let y=window.bottom+1.6;y<window.bottom+window.height*.83;y+=1.8)faceBox(window.x,BASE+y,3.7,.045,.065,-.19,lead);
      // Fine metal bars retain deep dark panes between the stone mullions.
      for(const offset of [-1.25,0,1.25])faceBox(window.x+offset,BASE+window.bottom+window.height*.4,.035,window.height*.78,.06,-.19,lead);
    }
    for(const window of smallWindows)instance(smallFrame,trim,...point(window.x,BASE+window.bottom,.47),1,1,1,0,angle);
    for(const y of [19.7,22.9,46.2,51.2,53.3,78.5,84.1,85.9]){
      faceBox(0,BASE+y,WIDTH+.35,.26,.65,.43);
      faceBox(0,BASE+y+.29,WIDTH+.55,.12,.85,.44);
      for(let u=-8.4;u<=8.5;u+=1.4)instance(rosette,trim,...point(u,BASE+y-.28,.64),1,1,1,0,angle);
    }
    for(const u of [-8.4,-2.55,2.55,8.4]){
      faceBox(u,BASE+53.2,.16,62,.28,.5);
      faceBox(u+.23,BASE+53.2,.085,62,.18,.51);
    }
    instance(parapet,trim,...point(0,BASE+86.1,.04),1,1,1,0,angle);
    faceBox(0,BASE+89,WIDTH,.22,.6,.17);
    for(let u=-8.55;u<=8.6;u+=1.9){
      instance(cone,trim,...point(u,BASE+89.5,.20),.15,.85,.15);
      instance(sphere,trim,...point(u,BASE+90.05,.20),.1,.1,.1);
    }
    // Layered arch mouldings and fan ribs give the entrance a shadowed vault.
    for(let layer=1;layer<=3;layer++)instance(gateFrame,trim,...point(0,BASE+.3,.48+layer*.12),1+layer*.035,1+layer*.012,1,0,angle);
    for(let i=0;i<5;i++){
      const x=(i-2)*1.35,start=point(x,BASE+18.6,-.5);
      rod(start,[0,BASE+21.4,0],.09,trim);
    }
  }
  // The four corner shafts end in open octagonal lanterns, rather than solid cones.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*10.55,z=sz*10.55;
    instance(octagon,stone,x,BASE+41.5,z,1.35,83,1.35);
    for(let y=2;y<84;y+=3.4)instance(octagon,trim,x,BASE+y,z,1.47,.20,1.47);
    for(let k=0;k<8;k++){
      const a=k*TAU/8,dx=Math.sin(a),dz=Math.cos(a);
      rod([x+dx*1.29,BASE+2,z+dz*1.29],[x+dx*1.29,BASE+83,z+dz*1.29],.055,trim);
      const px=x+dx*1.13,pz=z+dz*1.13;
      stoneBox(px,BASE+87.5,pz,.14,7,.14,trim);
      const face=a+TAU/16,r=1.13*Math.cos(TAU/16);
      instance(lanternPane,dark,x+Math.sin(face)*r,BASE+84.6,z+Math.cos(face)*r,1,1,1,0,face);
    }
    for(const [y,r,h] of [[83.5,1.65,.5],[84.1,1.35,.3],[91.3,1.4,.5],[92,1.6,.4]])instance(octagon,trim,x,BASE+y,z,r,h,r);
    instance(cone,stone,x,BASE+94.4,z,1.55,4.8,1.55);
    for(let k=0;k<8;k++){
      const a=k*TAU/8,dx=Math.sin(a),dz=Math.cos(a);
      rod([x+dx*1.55,BASE+92,z+dz*1.55],[x,BASE+96.8,z],.045,trim);
    }
    instance(sphere,gold,x,BASE+97.2,z,.24,.24,.24);
    rod([x,BASE+96.8,z],[x,BASE+98.5,z],.045,gold);
  }
  // A locally bundled vector flag is deformed in the vertex shader at its free edge.
  rod([0,BASE+85.8,0],[0,BASE+112,0],.075,lead);
  const flagTime={value:0};
  const flagMaterial=new THREE.MeshStandardMaterial({map:textures.unionFlag??null,color:textures.unionFlag?'#ffffff':'#214169',side:THREE.DoubleSide,roughness:.95});
  flagMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uFlagTime=flagTime;
    shader.vertexShader='uniform float uFlagTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.z+=(sin(uv.x*9.-uFlagTime*2.)*.3+sin(uv.x*19.+uv.y*3.+uFlagTime*.9)*.08)*uv.x;
      transformed.y+=sin(uv.x*7.-uFlagTime)*.08*uv.x;`);
  };
  flagMaterial.customProgramCacheKey=()=> 'victoria-flag-wind-v1';
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(5,2.5,24,8),flagMaterial);flag.position.set(2.5,BASE+110,0);flag.frustumCulled=false;flag.receiveShadow=true;
  return {flag,update(time){flagTime.value=time;},get info(){return {height:98.5,windows:(tallWindows.length+smallWindows.length)*4,entryOpenings:4,cornerLanterns:4,flagTime:flagTime.value};}};
}
