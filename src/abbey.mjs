import * as THREE from 'three';
import {pointedArch,palaceRoofGeometry} from './palace.mjs';

const BASE=5,TAU=Math.PI*2;

/** The nave's long straight wall establishes the mapped orientation. */
export function abbeyPose(building){
  const ring=building?.p?.[0]?.[0]||[];
  const west=ring.length?ring.reduce((a,p)=>p[0]<a[0]?p:a,ring[0]):[-394.53,92.56];
  return {position:[west[0]+.53,west[1]-7.56],rotation:-.09,length:161.5,towerHeight:68};
}

export function archPanel(width,height,openingWidth,openingHeight,bottom){
  const wall=new THREE.Shape();wall.moveTo(-width/2,0);wall.lineTo(width/2,0);wall.lineTo(width/2,height);wall.lineTo(-width/2,height);wall.closePath();
  const hole=pointedArch(openingWidth,openingHeight,bottom);wall.holes.push(hole);
  const outer=pointedArch(openingWidth+.34,openingHeight+.26,bottom-.1);outer.holes.push(pointedArch(openingWidth,openingHeight,bottom));
  return {
    wall:new THREE.ExtrudeGeometry(wall,{depth:.24,bevelEnabled:false,curveSegments:14}),
    glass:new THREE.ShapeGeometry(hole,14).translate(0,0,.025),
    frame:new THREE.ExtrudeGeometry(outer,{depth:.10,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:2,curveSegments:14}).translate(0,0,.25),
  };
}

/** A curved stone support with an open underside, extruded across its width. */
export function flyingButtressGeometry(){
  const s=new THREE.Shape();s.moveTo(0,27.8);s.quadraticCurveTo(4.6,24,9,15.5);s.lineTo(9,17.0);s.quadraticCurveTo(4.6,26,0,29.2);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:.65,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:1,curveSegments:16});
}

// Homography through the two tower centres at the clock and parapet levels.
// Coordinates are normalized in the unmodified licensed source photograph.
export function abbeyPhotoMatrix(){
  const source=[[-10.5,42],[10.5,42],[-10.5,68],[10.5,68]],target=[[520/1824,315/1368],[1260/1824,315/1368],[640/1824,90/1368],[1147/1824,90/1368]];
  const rows=[];
  for(let i=0;i<4;i++){const [x,y]=source[i],[u,v]=target[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
  for(let col=0;col<8;col++){
    let pivot=col;for(let r=col+1;r<8;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];const scale=rows[col][col];
    for(let k=col;k<9;k++)rows[col][k]/=scale;
    for(let r=0;r<8;r++)if(r!==col){const f=rows[r][col];for(let k=col;k<9;k++)rows[r][k]-=f*rows[col][k];}
  }
  const h=rows.map(r=>r[8]);return new THREE.Matrix3().set(h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1);
}

/** Architectural interpretation using mapped placement and published principal sizes. */
export function buildAbbey({instance,box,rod,mats,transform},textures){
  const stone=mats.stone.clone();stone.color.set('#d5d0c2');
  stone.map=textures.plaster?.color??stone.map;stone.normalMap=textures.plaster?.normal??stone.normalMap;stone.roughnessMap=textures.plaster?.roughness??stone.roughnessMap;
  stone.normalScale.set(.16,.16);stone.onBeforeCompile=mats.stone.onBeforeCompile;stone.customProgramCacheKey=mats.stone.customProgramCacheKey;
  const trim=stone.clone();trim.color.set('#c4bfae');trim.onBeforeCompile=stone.onBeforeCompile;trim.customProgramCacheKey=stone.customProgramCacheKey;
  const glass=new THREE.MeshStandardMaterial({color:'#293a3a',roughness:.28,metalness:.06,envMapIntensity:.8});
  const lead=new THREE.MeshStandardMaterial({color:'#3e4544',roughness:.8,metalness:.25});
  const photo=new THREE.MeshStandardMaterial({map:textures.abbeyPhoto??null,color:'#f1eee6',roughness:.88});
  const projection=abbeyPhotoMatrix(),inverse=transform.clone().invert();
  photo.onBeforeCompile=shader=>{
    shader.uniforms.uAbbeyInverse={value:inverse};shader.uniforms.uAbbeyPhoto={value:projection};
    shader.vertexShader='uniform mat4 uAbbeyInverse; uniform mat3 uAbbeyPhoto; varying vec3 vAbbeyPhoto; varying float vAbbeyHeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 abbeyLocal=(uAbbeyInverse*modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
      vAbbeyPhoto=uAbbeyPhoto*vec3(abbeyLocal.z,abbeyLocal.y-${BASE.toFixed(1)},1.);vAbbeyHeight=abbeyLocal.y-${BASE.toFixed(1)};`);
    shader.fragmentShader='varying vec3 vAbbeyPhoto; varying float vAbbeyHeight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
        vec2 abbeyUv=vAbbeyPhoto.xy/vAbbeyPhoto.z;abbeyUv.y=1.-abbeyUv.y;
        float photoMask=smoothstep(13.,17.,vAbbeyHeight)*step(0.,abbeyUv.x)*step(abbeyUv.x,1.)*step(0.,abbeyUv.y)*step(abbeyUv.y,1.);
        vec3 actualStone=texture2D(map,clamp(abbeyUv,vec2(.001),vec2(.999))).rgb;
        diffuseColor.rgb*=mix(vec3(.57,.55,.49),actualStone,photoMask);
      #endif`);
  };
  photo.customProgramCacheKey=()=> 'abbey-projective-west-photo-v1';
  const photoGlass=photo.clone();photoGlass.roughness=.34;photoGlass.envMapIntensity=.65;photoGlass.onBeforeCompile=photo.onBeforeCompile;photoGlass.customProgramCacheKey=photo.customProgramCacheKey;
  const octagon=new THREE.CylinderGeometry(1,1,1,8),cone=new THREE.ConeGeometry(1,1,8),ball=new THREE.SphereGeometry(1,8,6),torus=new THREE.TorusGeometry(1,.035,6,48),circle=new THREE.CircleGeometry(1,48);
  const plank=new THREE.BoxGeometry(1,1,1),arch=new THREE.ShapeGeometry(pointedArch(1,1),12);
  const support=flyingButtressGeometry();
  let windows=0,buttresses=0,chapels=0;
  const stoneBox=(x,y,z,w,h,d,mat=stone,angle=0)=>box(x,y,z,w,h,d,mat,angle);
  function finial(x,y,z,height=4){
    instance(octagon,trim,x,y+height*.16,z,.23,height*.32,.23);
    instance(cone,trim,x,y+height*.63,z,.36,height*.62,.36);
    instance(ball,trim,x,y+height*.98,z,.1,.1,.1);
  }
  function cross(x,y,z,height=2){rod([x,y,z],[x,y+height,z],.06,trim);rod([x,y+height*.68,z-.45],[x,y+height*.68,z+.45],.06,trim);}
  const roofs=new Map(),panelCache=new Map();
  function roof(x,y,z,width,rise,length,angle=0){
    const key=[width,rise,length].join(',');if(!roofs.has(key))roofs.set(key,palaceRoofGeometry(width,rise,length));
    instance(roofs.get(key),mats.roof,x,y,z,1,1,1,0,angle);
  }
  function panel(x,y,z,width,height,openingWidth,openingHeight,bottom,angle=0,west=false){
    const key=[width,height,openingWidth,openingHeight,bottom].join(',');if(!panelCache.has(key))panelCache.set(key,archPanel(width,height,openingWidth,openingHeight,bottom));
    const p=panelCache.get(key);
    for(const [g,m] of [[p.wall,west?photo:stone],[p.glass,west?photoGlass:glass],[p.frame,trim]])instance(g,m,x,y,z,1,1,1,0,angle);
    windows++;
  }
  // Nave, choir and aisle volumes. Local X follows the long axis of the church.
  stoneBox(63,BASE+15.5,0,112,31,14);roof(63,BASE+31,0,14,10,112,Math.PI/2);
  for(const side of [-1,1]){
    stoneBox(63,BASE+8,side*10.2,112,16,6.4);
    roof(63,BASE+16,side*10.2,6.4,5,112,Math.PI/2);
    for(let x=18;x<119;x+=6.2){
      panel(x,BASE+19,side*7.02,6.2,12,3.5,8.8,1.7,side>0?0:Math.PI);
      panel(x,BASE,side*13.42,6.2,16,3.8,10.7,3.4,side>0?0:Math.PI);
      stoneBox(x+3.05,BASE+8.5,side*14.7,1,17,2.5,trim);
      stoneBox(x+3.05,BASE+18.5,side*14.7,.65,3,.8,trim);finial(x+3.05,BASE+20,side*14.7,4);
      // The support's 2D X coordinate runs outward from the clerestory wall.
      instance(support,stone,x+2.7,BASE,side*7,1,1,1,0,side>0?-Math.PI/2:Math.PI/2);
      buttresses++;
    }
    for(const y of [16,19,31])stoneBox(63,BASE+y,side*7.15,112,.25,.5,trim);
  }
  instance(octagon,stone,119,BASE+13,0,10,26,10);
  instance(cone,mats.roof,119,BASE+29.5,0,10.3,7,10.3);
  // North and south transepts with real circular tracery and portal openings.
  stoneBox(77,BASE+15.5,0,24,31,62);roof(77,BASE+31,0,24,10,62);
  for(const side of [-1,1]){
    const z=side*31.02,angle=side>0?0:Math.PI;
    panel(77,BASE,z,24,18,7.2,13.6,1.1,angle);
    stoneBox(77,BASE+25,z,24,14,.3,stone);
    const rose=new THREE.MeshStandardMaterial({color:'#304448',roughness:.38,metalness:.05});
    instance(circle,rose,77,BASE+26,z+side*.2,4.6,4.6,1,0,angle);
    for(const r of [1.35,3.15,4.55])instance(torus,trim,77,BASE+26,z+side*.25,r,r,r,0,angle);
    for(let i=0;i<16;i++){
      const a=i*TAU/16,cx=Math.cos(a),cy=Math.sin(a);
      rod([77+cx*1.35,BASE+26+cy*1.35,z+side*.3],[77+cx*4.55,BASE+26+cy*4.55,z+side*.3],.085,trim);
    }
    for(const dx of [-10.7,10.7]){stoneBox(77+dx,BASE+16,z,1.5,32,2,trim);finial(77+dx,BASE+32,z,5.5);}
    cross(77,BASE+41,z,2.3);
  }
  // Eastern chapels and the polygonal termination of the choir.
  for(const side of [-1,1])for(const [x,z] of [[103,15],[116,17],[124,13]]){
    stoneBox(x,BASE+9,side*z,9.5,18,9.5);roof(x,BASE+18,side*z,9.5,6.5,10,Math.PI/2);
    panel(x,BASE+1,side*(z+4.78),9.5,17,4.8,12,2,side>0?0:Math.PI);
    for(const dx of [-4,4])finial(x+dx,BASE+19,side*(z+4),4);chapels++;
  }
  // Henry VII's chapel: lower, long windows, and a dense Tudor pinnacle skyline.
  stoneBox(143.75,BASE+10.5,0,35.5,21,23.6);roof(143.75,BASE+21,0,23.6,7,35.5,Math.PI/2);
  for(const side of [-1,1])for(let x=129;x<161;x+=5.3){
    panel(x,BASE+1,side*11.82,5.3,20,3.5,15.5,2.1,side>0?0:Math.PI);
    stoneBox(x+2.5,BASE+12,side*12.4,.65,24,1.2,trim);finial(x+2.5,BASE+25,side*12.4,5.8);
  }
  panel(161.52,BASE+2,0,23.6,23,8,16,2,Math.PI/2);
  // The west front retains separate towers, projecting cornices and deep reveals.
  for(const side of [-1,1]){
    const z=side*10.5;
    stoneBox(6,BASE+31,z,12,62,11,stone);
    panel(-.02,BASE,z,11,38,5.5,14,21,-Math.PI/2,true);
    panel(-.02,BASE+47,z,11,15,5.8,11.7,1,-Math.PI/2,true);
    // A photographed intermediate stage carries the clock and its opposite rose.
    instance(plank,photo,-.13,BASE+42.5,z,.24,9,11);
    for(let face=0;face<4;face++){
      const angle=face*Math.PI/2,nx=Math.sin(angle),nz=Math.cos(angle);
      if(face!==3){
        panel(6+nx*6.02,BASE+47,z+nz*5.52,11,15,5.2,11.7,1,angle);
        panel(6+nx*6.02,BASE+18,z+nz*5.52,11,20,4.6,14.6,2.4,angle);
      }
    }
    for(const y of [15,38,47,61.5,63])stoneBox(6,BASE+y,z,12.6,.35,11.6,trim);
    for(const dx of [-5.4,5.4])for(const dz of [-4.9,4.9]){
      stoneBox(6+dx,BASE+31,z+dz,.75,62,.75,trim);
      stoneBox(6+dx,BASE+63,z+dz,1.15,2.1,1.15,trim);finial(6+dx,BASE+64,z+dz,4);
    }
    stoneBox(6,BASE+62.3,z,10,.25,9,lead);
    for(let face=0;face<4;face++)for(let u=-4.2;u<=4.3;u+=1.4){
      const a=face*Math.PI/2;
      stoneBox(6+Math.sin(a)*6+Math.cos(a)*u,BASE+63.4,z+Math.cos(a)*5.5-Math.sin(a)*u,.55,1.5,.55,trim);
    }
    instance(torus,side<0?mats.gold:trim,-.42,BASE+42,z,1.9,1.9,1.9,0,-Math.PI/2);
  }
  stoneBox(6,BASE+18.5,0,12,37,10,stone);
  panel(-.04,BASE,0,10,18,6.5,10.2,.6,-Math.PI/2);
  panel(-.04,BASE+18,0,10,20,8.2,17.2,1.2,-Math.PI/2,true);
  for(let i=0;i<10;i++){
    const z=-4.2+i*.93;instance(octagon,trim,-.42,BASE+13.2,z,.16,1.6,.16);instance(ball,trim,-.42,BASE+14.15,z,.16,.2,.16);
    finial(-.42,BASE+15,z,1.3);
  }
  for(const z of [-4.8,4.8])stoneBox(-.3,BASE+20,z,.8,40,.65,trim);
  const gable=new THREE.Shape();gable.moveTo(-5,37);gable.lineTo(5,37);gable.lineTo(0,41);gable.closePath();
  instance(new THREE.ExtrudeGeometry(gable,{depth:.3,bevelEnabled:false}),photo,-.03,BASE,0,1,1,1,0,-Math.PI/2);
  cross(-.2,BASE+41,0,2);
  const bounds=new THREE.Box3(new THREE.Vector3(-2,BASE,-36),new THREE.Vector3(163,BASE+68,37)).applyMatrix4(transform);
  return {bounds,info:{architectural:true,length:161.5,towerHeight:68,windows,buttresses,chapels:chapels+1,photoFacade:!!textures.abbeyPhoto}};
}
