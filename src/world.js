import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildMapCity } from './map-city.js';
import { buildPalace } from './palace.mjs';
import {buildVictoriaTower,victoriaPose} from './victoria.mjs';
import {buildAbbey,abbeyPose} from './abbey.mjs';
import {createVegetation} from './vegetation.mjs';
import {buildCountyHall,countyHallIds} from './county-hall.mjs';

// All repeated architecture is instanced. Dimensions are in metres.
export function buildLondon(scene, textures, models={}, mapData=null, options={}) {
  const buckets = new Map();
  const bakedMaterials=[];
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  let localTransform=null,mapContext=null;
  const bridgeTransform=mapData?new THREE.Matrix4().set(1.24,0,0,62,0,1,0,0,.063,0,1,5.9,0,0,0,1):new THREE.Matrix4();
  const boxGeo = new THREE.BoxGeometry(1,1,1);
  const cylinderGeo = new THREE.CylinderGeometry(1,1,1,10);
  const coneGeo = new THREE.ConeGeometry(1,1,8);
  const sphereGeo = new THREE.SphereGeometry(1,10,7);
  const planeGeo = new THREE.PlaneGeometry(1,1);
  const roofShape=new THREE.Shape();roofShape.moveTo(-.5,0);roofShape.lineTo(.5,0);roofShape.lineTo(0,1);roofShape.closePath();
  const roofGeo=new THREE.ExtrudeGeometry(roofShape,{depth:1,bevelEnabled:false});roofGeo.translate(0,0,-.5);
  let seed = 24131;
  const rand = () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const material = (color, props={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...props});
  const mats = {
    stone:material('#d1b88a',{map:textures.stone,normalMap:textures.normal,normalScale:new THREE.Vector2(.2,.2),roughnessMap:textures.roughness}),
    trim:material('#ad9b77',{roughness:.87}),
    weathered:material('#95866d',{map:textures.stone,normalMap:textures.normal,normalScale:new THREE.Vector2(.16,.16)}),
    dark:material('#423f37'),
    roof:material('#8a8c84',{map:textures.roof?.color,normalMap:textures.roof?.normal,normalScale:new THREE.Vector2(.24,.24),roughnessMap:textures.roof?.roughness,roughness:.78,metalness:.15}),
    gold:material('#bb9154',{metalness:.7,roughness:.38}),
    glass:material('#344b4b',{roughness:.22,metalness:.45,envMapIntensity:1.1}),
    warmglass:material('#6b6652',{roughness:.24,metalness:.35,emissive:'#ffc477',emissiveIntensity:.05}),
    white:material('#e3e4dc',{metalness:.35,roughness:.45}),
    iron:material('#3e5c50',{metalness:.45,roughness:.6}),
    red:material('#a8241f',{metalness:.24,roughness:.4}),
    black:material('#242a2a',{roughness:.8}),
    tarmac:material('#696963'),
    pavement:material('#b3b1a0',{map:textures.stone,roughness:1}),
    ground:material('#979982'),
    grass:material('#646f42'),
    bark:material('#5c5141'),
    foliage:[material('#525f38'),material('#667343'),material('#70794b'),material('#465b3c')],
    buildings:[material('#b0a58d'),material('#c2baa6'),material('#8e8b80'),material('#bbad96'),material('#b3b1a8'),material('#847c6f')],
  };
  // Keep photographed masonry at metre scale on differently sized instances.
  for(const mat of [mats.stone,mats.weathered,mats.pavement,mats.roof]) {
    mat.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 sc = vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        vec3 an = abs(normal);
        vec2 faceScale = an.x > .5 ? sc.zy : (an.y > .5 ? sc.xz : sc.xy);
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(uv * faceScale / 3.4, 1.)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = (normalMapTransform * vec3(uv * faceScale / 3.4, 1.)).xy;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = (roughnessMapTransform * vec3(uv * faceScale / 3.4, 1.)).xy;
        #endif
      #endif`);
    };
    mat.customProgramCacheKey=()=> 'world-scaled-masonry';
  }
  function instance(geo,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0) {
    const key=geo.uuid+mat.uuid;
    if(!buckets.has(key))buckets.set(key,{geo,mat,matrices:[]});
    quaternion.setFromEuler(new THREE.Euler(rx,ry,rz));
    matrix.compose(new THREE.Vector3(x,y,z),quaternion,new THREE.Vector3(sx,sy,sz));
    if(localTransform)matrix.premultiply(localTransform);
    buckets.get(key).matrices.push(matrix.clone());
  }
  const box=(x,y,z,w,h,d,mat=mats.stone,ry=0)=>instance(boxGeo,mat,x,y,z,w,h,d,0,ry);
  const cyl=(x,y,z,r,h,mat=mats.trim)=>instance(cylinderGeo,mat,x,y,z,r,h,r);
  const cone=(x,y,z,r,h,mat=mats.roof)=>instance(coneGeo,mat,x,y,z,r,h,r);
  function rod(a,b,r,mat=mats.white) {
    const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),length=av.distanceTo(bv);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),bv.clone().sub(av).normalize());
    const e=new THREE.Euler().setFromQuaternion(q),mid=av.add(bv).multiplyScalar(.5);
    instance(cylinderGeo,mat,mid.x,mid.y,mid.z,r,length,r,e.x,e.y,e.z);
  }
  function archShape(w,h) {
    const s=new THREE.Shape();
    s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h*.7);
    s.quadraticCurveTo(w*.45,h*.9,0,h);s.quadraticCurveTo(-w*.45,h*.9,-w/2,h*.7);s.closePath();
    return s;
  }
  const lancet = new THREE.ShapeGeometry(archShape(1,1),6);
  function windowEast(x,y,z,w,h,lit=false) {
    instance(lancet,lit?mats.warmglass:mats.glass,x,y,z,w,h,1,0,Math.PI/2);
    box(x+.06,y+h*.45,z,.09,h*.9,.065,mats.trim);
    box(x+.08,y+h*.32,z,.1,.07,w,mats.trim);
    box(x-.05,y-.15,z,.38,.28,w+.4,mats.weathered);
  }
  function roof(x,y,z,w,h,d,mat=mats.roof) {
    instance(roofGeo,mat,x,y,z,w,h,d);
  }
  function addModel(model,x,y,z,height,baked=false) {
    const group=new THREE.Group();group.add(model);
    const bbox=new THREE.Box3().setFromObject(model),size=bbox.getSize(new THREE.Vector3()),center=bbox.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(center.x,bbox.min.y,center.z));
    group.scale.setScalar(height/size.y);group.position.set(x,y,z);
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material){
      if(baked){o.material=new THREE.MeshBasicMaterial({map:o.material.map,side:THREE.DoubleSide});bakedMaterials.push(o.material);}
      else {o.material.roughness=.9;o.material.metalness=0;o.material.emissiveIntensity=.03;}
    }}});
    scene.add(group);return group;
  }
  function pinnacle(x,y,z,height=5) {
    cyl(x,y+height*.12,z,.38,height*.24);cone(x,y+height*.57,z,.62,height*.66);cyl(x,y+height*.97,z,.09,height*.18,mats.gold);
  }
  function gothicTower(x,z,width,height,clock=false) {
    const bottom=5;
    box(x,bottom+height*.33,z,width,height*.66,width,mats.stone);
    for(let k=0;k<4;k++) {
      const a=k*Math.PI/2;
      const xx=x+Math.cos(a)*(width/2+.08),zz=z+Math.sin(a)*(width/2+.08);
      for(let l=0;l<5;l++) {
        const y=12+l*8.8;
        if(y>height*.65)continue;
        for(const offset of [-width*.2,width*.2]) {
          if(k===0)windowEast(xx,y,zz+offset,width*.16,6.6,l%3===0);
          else instance(lancet,mats.glass,xx+(k%2?offset:0),y,zz+(k%2?0:offset),width*.16,6.6,1,0,Math.PI/2-a);
        }
      }
      for(let l=0;l<7;l++)box(x,9+l*7.4,z,width+.5,.3,width+.5,mats.trim);
    }
    for(const dx of [-1,1])for(const dz of [-1,1]) {
      box(x+dx*(width/2-.4),height*.34+3,z+dz*(width/2-.4),1.1,height*.68,1.1,mats.trim);
      box(x+dx*(width/2-.45),height*.78,z+dz*(width/2-.45),1.25,height*.18,1.25,mats.trim);
      pinnacle(x+dx*(width/2-.45),height*.86,z+dz*(width/2-.45),7);
    }
    box(x,height*.69,z,width+1.4,1.2,width+1.4,mats.trim);
    box(x,height*.78,z,width+.1,height*.16,width+.1,mats.stone);
    box(x,height*.86,z,width+2,1,width+2,mats.trim);
    box(x,height*.88,z,width+1,2,width+1,mats.weathered);
    if(clock) {
      const clockY=height*.775;
      const texture=clockTexture();
      const faceMat=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:'#f4d5a1',emissiveIntensity:.18,roughness:.62});
      const geo=new THREE.CircleGeometry(width*.345,64);
      for(let k=0;k<4;k++) {
        const a=k*Math.PI/2;
        const face=new THREE.Mesh(geo,faceMat);
        face.position.set(x+Math.sin(a)*(width/2+.12),clockY,z+Math.cos(a)*(width/2+.12));
        face.rotation.y=a;scene.add(face);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(width*.351,.13,8,64),mats.gold);ring.position.copy(face.position);ring.rotation.copy(face.rotation);scene.add(ring);
      }
      roof(x,height*.9,z,width*.88,12,width*.88);
      box(x,height*.9+11,z,3,3,3,mats.dark);
      cone(x,height*.9+17,z,3.5,10,mats.roof);cyl(x,height*.9+23,z,.13,3,mats.gold);
      for(const side of [-1,1])for(let n=0;n<5;n++) {
        box(x+side*(width/2+.05),height*.9+2.2,z+(n-2)*1.6,.16,3.5,.42,mats.gold);
        box(x+(n-2)*1.6,height*.9+2.2,z+side*(width/2+.05),.42,3.5,.16,mats.gold);
      }
    } else {
      box(x,height*.91,z,width*.76,5,width*.76,mats.dark);
      for(let side=0;side<4;side++)for(let j=-2;j<=2;j++) {
        const a=side*Math.PI/2,dx=Math.cos(a)*(width/2+.05),dz=Math.sin(a)*(width/2+.05);
        instance(lancet,mats.glass,x+dx+(side%2?j*2:0),height*.72,z+dz+(side%2?0:j*2),1.1,8,1,0,Math.PI/2-a);
      }
      for(const dx of [-1,1])for(const dz of [-1,1])pinnacle(x+dx*width*.4,height*.94,z+dz*width*.4,10);
      cyl(x,height+5,z,.1,15,mats.gold);
      box(x+2.7,height+10,z,5,2.6,.05,mats.red);
    }
  }
  // Embankments, pavements and the Thames corridor.
  if(!mapData){
  box(-720,-5,0,1260,14,2600,mats.ground);
  box(740,-5,0,1270,14,2600,mats.ground);
  box(-91,1.2,0,8,10,2600,mats.weathered);box(108,1.2,0,8,10,2600,mats.weathered);
  box(-99,6.25,0,8,.5,2200,mats.pavement);box(118,6.25,0,12,.5,2200,mats.pavement);
  box(-205,5.1,0,19,.3,1400,mats.tarmac);box(145,5.1,400,17,.3,850,mats.tarmac);
  for(let z=-850;z<850;z+=9) {
    box(-205,5.29,z,.18,.04,4,mats.trim);box(145,5.29,z+340,.18,.04,4,mats.trim);
    for(const x of [-88,105]) {box(x,6.9,z, .3,1.2,.14,mats.iron);box(x,7.35,z,.15,.14,9,mats.iron);}
  }
  }
  // The Palace retains its mapped footprint, with physical Gothic openings and roofs.
  const palaceTransform=mapData?new THREE.Matrix4().set(1.6,0,0,99.2,0,1,0,0,0,0,1,0,0,0,0,1):null;
  localTransform=palaceTransform;
  const centralTowerPosition=mapData?.buildings.find(b=>b.t.name==='Central Tower')?.c;
  const palaceInfo=buildPalace({instance,box,rod,mats,transform:palaceTransform,centralTowerPosition},textures);
  localTransform=null;
  if(models.bigben)addModel(models.bigben,-121,5,-51,96);
  else gothicTower(-121,-51,14,85,true);
  const victoriaLocation=victoriaPose(mapData?.buildings.find(b=>b.t.name==='Victoria Tower'));
  const victoriaTransform=new THREE.Matrix4().makeRotationY(victoriaLocation.rotation).setPosition(victoriaLocation.position[0],0,victoriaLocation.position[1]);
  localTransform=victoriaTransform;
  const victoria=buildVictoriaTower({instance,box,rod,mats},textures);
  localTransform=null;
  victoria.flag.applyMatrix4(victoriaTransform);scene.add(victoria.flag);
  // Parliament Square and Westminster Abbey beyond the Palace.
  if(!mapData)box(-246,5,-57,58,.2,67,mats.grass);
  const abbeyLocation=abbeyPose(mapData?.buildings.find(b=>b.t.name==='Westminster Abbey'));
  const abbeyTransform=new THREE.Matrix4().makeRotationY(abbeyLocation.rotation).setPosition(abbeyLocation.position[0],0,abbeyLocation.position[1]);
  localTransform=abbeyTransform;
  const abbey=buildAbbey({instance,box,rod,mats,transform:abbeyTransform},textures);
  localTransform=null;
  // Westminster Bridge: seven shallow arches, green iron and stone piers.
  function bridge() {
    localTransform=bridgeTransform;
    const bridgeZ=-75, length=204, start=-94, span=length/7;
    const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(length,0);s.lineTo(length,10);s.lineTo(0,10);s.closePath();
    for(let i=0;i<7;i++) {
      const x=i*span+2.2,w=span-4.4;
      const hole=new THREE.Path();hole.moveTo(x,0);hole.lineTo(x,1);hole.quadraticCurveTo(x+w*.5,12.6,x+w,1);hole.lineTo(x+w,0);hole.closePath();s.holes.push(hole);
    }
    const geometry=new THREE.ExtrudeGeometry(s,{depth:23,bevelEnabled:false,curveSegments:18});
    const mesh=new THREE.Mesh(geometry,mats.iron);mesh.position.set(start,0,bridgeZ-11.5);mesh.applyMatrix4(bridgeTransform);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    box(8,10.3,bridgeZ,212,.8,24,mats.tarmac);
    for(const side of [-1,1]) {
      box(8,10.85,bridgeZ+side*10,212,.5,3,mats.pavement);
      box(8,12.2,bridgeZ+side*11.6,212,.15,.16,mats.iron);
      box(8,11.5,bridgeZ+side*11.6,212,.13,.12,mats.iron);
      for(let x=-97;x<114;x+=1.1)box(x,11.7,bridgeZ+side*11.6,.085,1.3,.09,mats.iron);
    }
    for(let i=0;i<=7;i++) {
      const x=start+i*span;
      box(x,1.1,bridgeZ,4.5,7,28,mats.weathered);
      for(const side of [-1,1]){cone(x,2,bridgeZ+side*15,3.4,5,mats.weathered);lamp(x,11.1,bridgeZ+side*10.3,5.8,true);}
    }
    for(let x=-90;x<110;x+=11)box(x,10.77,bridgeZ,.11,.03,5,mats.trim,Math.PI/2);
    localTransform=null;
  }
  const glowMat = material('#fff5c7',{emissive:'#ffbe60',emissiveIntensity:.4});
  function lamp(x,y,z,height=6,ornate=false) {
    cyl(x,y+height*.5,z,.085,height,mats.iron);cyl(x,y+.4,z,.25,.8,mats.iron);
    if(ornate) {
      for(const side of [-1,0,1]) {
        rod([x,y+height-.6,z],[x+side*.8,y+height+.2,z],.07,mats.iron);
        box(x+side*.8,y+height+.45,z,.43,.65,.43,glowMat);cone(x+side*.8,y+height+.9,z,.37,.35,mats.iron);
      }
    }else {box(x,y+height,z,.38,.65,.38,glowMat);cone(x,y+height+.5,z,.3,.3,mats.iron);}
  }
  bridge();
  if(!mapData)for(let z=-500;z<550;z+=24){lamp(-95,6.4,z,6,true);lamp(114,6.4,z,6,true);}
  // County Hall: curved frontage suggested by short articulated bays.
  if(!mapData){
  box(161,22,-144,63,34,106,mats.buildings[1]);roof(161,40,-144,64,14,110,mats.roof);
  for(let z=-195;z<-91;z+=6) {
    box(127,24,z,2,36,1.2,mats.trim);
    for(let y=12;y<37;y+=7)windowEast(128,y,z,2.4,4.2);
  }
  box(161,29,-144,68,2,25,mats.trim);box(126,35,-144,10,16,26,mats.stone);
  for(let i=-3;i<=3;i++)cyl(120,22,-144+i*3,.7,22,mats.trim);
  }
  localTransform=null;
  // London Eye. The cabins are counter-rotated to remain level.
  const eye = new THREE.Group();eye.position.set(mapData?220.19:138,mapData?69:72,mapData?-345.06:-243);eye.rotation.y=mapData?Math.PI/2-.13:-.12;if(mapData)eye.scale.setScalar(1.055);scene.add(eye);
  const rotating = new THREE.Group();eye.add(rotating);
  const wheelMaterial=material('#f4f0df',{metalness:.4,roughness:.36});
  const capsuleMat=new THREE.MeshPhysicalMaterial({color:'#afc9c6',metalness:.22,roughness:.12,transparent:true,opacity:.68,depthWrite:false,clearcoat:1});
  const rim=new THREE.Mesh(new THREE.TorusGeometry(60, .58,8,160),wheelMaterial);rotating.add(rim);
  for(const dz of [-.8,.8]) {
    const innerRim=new THREE.Mesh(new THREE.TorusGeometry(58.5,.19,6,128),wheelMaterial);innerRim.position.z=dz;rotating.add(innerRim);
  }
  function localRod(parent,a,b,r,mat=wheelMaterial) {
    const aa=new THREE.Vector3(...a),bb=new THREE.Vector3(...b);
    const m=new THREE.Mesh(cylinderGeo,mat);m.position.copy(aa).add(bb).multiplyScalar(.5);m.scale.set(r,aa.distanceTo(bb),r);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bb.sub(aa).normalize());parent.add(m);return m;
  }
  const capsules=[];
  for(let i=0;i<32;i++) {
    const a=i*Math.PI*2/32;
    localRod(rotating,[0,0,2],[Math.cos(a)*60,Math.sin(a)*60,0],.065);
    localRod(rotating,[0,0,-2],[Math.cos(a)*60,Math.sin(a)*60,0],.065);
    const pod=new THREE.Group();
    const shell=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),capsuleMat);shell.scale.set(3.4,1.9,2);pod.add(shell);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(4.9,.2,2.8),wheelMaterial);floor.position.y=-.85;pod.add(floor);
    for(const rz of [-.6,0,.6]) {
      const band=new THREE.Mesh(new THREE.TorusGeometry(1.83,.055,4,20),wheelMaterial);band.rotation.y=Math.PI/2;band.position.x=rz*3.2;band.scale.y=.92;pod.add(band);
    }
    capsules.push({pod,angle:a});eye.add(pod);
  }
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(2,2,6,24),wheelMaterial);hub.rotation.x=Math.PI/2;eye.add(hub);
  if(mapData)localTransform=new THREE.Matrix4().makeTranslation(220.19,69,-345.06).multiply(new THREE.Matrix4().makeRotationY(Math.PI/2-.13)).multiply(new THREE.Matrix4().makeTranslation(-138,-72,243));
  rod([111,mapData?8:6,-219],[138,72,-240],2.1,mats.white);rod([168,mapData?8:6,-220],[138,72,-240],2.1,mats.white);
  rod([138,72,-247],[141,mapData?8:6,mapData?-205:-280],.6,mats.white);
  box(140,7,-221,65,3,23,mats.pavement);
  localTransform=null;
  const vegetation=models.tree?createVegetation(scene,models.tree,models.treeImpostor,options.mobile):null;
  // Nearby trees use geometry; distant trees use views baked from the same model.
  function tree(x,z,height=13) {
    if(vegetation){vegetation.add(x,z,height);return;}
    if(models.treeImpostor){
      for(const ry of [0,Math.PI/2])instance(planeGeo,models.treeImpostor.material,x,5+height/2,z,height*models.treeImpostor.aspect,height,1,0,ry+.4);
      return;
    }
    const y=5;
    cyl(x,y+height*.25,z,.3,height*.5,mats.bark);
    const color=mats.foliage[Math.floor(rand()*4)];
    for(let i=0;i<9;i++) {
      const a=rand()*Math.PI*2,r=rand()*height*.25,yy=y+height*(.55+rand()*.35);
      const dx=x+Math.sin(a)*r,dz=z+Math.cos(a)*r;
      if(i<4)rod([x,y+height*.3,z],[dx,yy-1,dz],.12,mats.bark);
      instance(sphereGeo,color,dx,yy,dz,height*(.15+rand()*.1),height*(.18+rand()*.08),height*(.15+rand()*.09),rand(),rand(),rand());
    }
  }
  if(!mapData){
  for(let z=-590;z<570;z+=18) {
    if(z>-97&&z<-54)continue;
    tree(124+rand()*8,z,10+rand()*5);
    if(z>235||z<-110)tree(-107-rand()*4,z,11+rand()*5);
  }
  for(let i=0;i<42;i++) {
    const x=-230-rand()*55,z=-90+rand()*65;tree(x,z,10+rand()*8);
  }
  }
  // City blocks. Every frontage has windows, cornices, roofs and chimneys.
  function cityBuilding(x,z,w,d,h,mat) {
    box(x,5+h/2,z,w,h,d,mat);box(x,5+h,z,w+1,.7,d+1,mats.trim);
    if(h<38&&rand()>.25)roof(x,5+h,z,w,3.5,d,mats.roof);
    else box(x,5+h+.9,z,w*.88,1.4,d*.88,mats.roof);
    const levels=Math.floor(h/4.4), columns=Math.max(2,Math.floor(d/4));
    for(let j=0;j<columns;j++)for(let k=0;k<levels;k++) {
      const zz=z-d/2+(j+.5)*d/columns,yy=8+k*4.4;
      const glass=rand()>.75?mats.warmglass:mats.glass;
      box(x+w/2+.03,yy,zz,.08,2.2,1.25,glass);
      box(x-w/2-.03,yy,zz,.08,2.2,1.25,glass);
      if(k===levels-1)box(x+w/2+.12,yy-1.2,zz,.22,.18,1.65,mats.trim);
    }
    for(let j=0;j<Math.floor(w/4);j++)for(let k=0;k<levels;k++) {
      const xx=x-w/2+(j+.5)*4,yy=8+k*4.4;
      box(xx,yy,z+d/2+.04,1.2,2.2,.08,rand()>.7?mats.warmglass:mats.glass);
      box(xx,yy,z-d/2-.04,1.2,2.2,.08,mats.glass);
    }
    for(let c=0;c<Math.floor(w/10);c++)box(x-w*.3+c*8,8+h,z+d*.22,1,5,2.5,mats.weathered);
    for(let k=1;k<levels;k+=2)box(x,6.5+k*4.4,z,w+.35,.2,d+.35,mats.trim);
  }
  const countyHall=buildCountyHall(scene,mapData,textures);
  if(mapData)mapContext=buildMapCity(scene,mapData,textures,{box,cyl,tree,lamp,mats,streetData:options.streetData,hasRegion:!!models.region,excludedBuildings:countyHall?countyHallIds:null});
  if(countyHall&&mapContext)mapContext.nightUniforms.push(...countyHall.nightUniforms);
  else {
  for(let row=0;row<14;row++)for(let col=0;col<18;col++) {
    const x=-330-row*48+(rand()-.5)*6,z=-650+col*76+(rand()-.5)*12;
    if(x>-415&&x<-220&&z>45&&z<150)continue;
    cityBuilding(x,z,25+rand()*14,43+rand()*19,17+rand()*32,mats.buildings[Math.floor(rand()*6)]);
  }
  for(let row=0;row<8;row++)for(let col=0;col<14;col++) {
    const x=212+row*56,z=-700+col*98;
    if(row===0&&z>-330&&z<0)continue;
    cityBuilding(x,z,30+rand()*13,46+rand()*24,16+rand()*37,mats.buildings[Math.floor(rand()*6)]);
  }
  for(let col=0;col<9;col++) {
    const z=-170-col*64;
    cityBuilding(-142,z,66,47,27+rand()*15,mats.buildings[col%6]);
  }
  // Whitehall clock tower and a distant city skyline.
  box(-176,36,-324,18,61,18,mats.buildings[1]);cone(-176,75,-324,14,19,mats.roof);
  for(let i=0;i<30;i++) {
    const x=-100+rand()*700,z=-1000-rand()*500,h=35+rand()*100;
    box(x,5+h/2,z,16+rand()*30,h,20+rand()*30,mats.buildings[i%6]);
    if(i%4===0)cone(x,h+22,z,13,34,mats.glass);
  }
  // A second bridge in the distance anchors the river corridor.
  box(8,12,-625,209,2,17,mats.weathered);
  for(let x=-65;x<100;x+=42)box(x,5,-625,7,17,22,mats.weathered);
  for(let x=-85;x<105;x+=3){box(x,14,-633,.15,2,.15,mats.iron);box(x,14,-617,.15,2,.15,mats.iron);}
  }
  // Street furniture: benches, bins, bollards and tiny riverside pedestrians.
  if(!mapData){
  for(let z=-420;z<520;z+=26) {
    for(const x of [-98,119]) {
      box(x,7,z,1.1,.15,3,mats.weathered);box(x-.45,7.6,z,.12,1.1,3,mats.iron);
      box(x,6.6,z-1,.8,.9,.12,mats.iron);box(x,6.6,z+1,.8,.9,.12,mats.iron);
    }
  }
  const peopleMaterials=['#c3b798','#24363b','#795549','#a67043','#515d55'].map(c=>material(c));
  for(let i=0;i<180;i++) {
    const side=rand()>.5,x=side?111+rand()*9:-98+rand()*5,z=-450+rand()*950;
    if(z>-90&&z<-60)continue;
    const m=peopleMaterials[i%5],h=1.5+rand()*.3;
    cyl(x,6.3+h*.48,z,.2,h*.56,m);instance(sphereGeo,mats.trim,x,6.3+h*.92,z,.17,.2,.17);
    for(const dx of [-.12,.12])box(x+dx,6.65,z,.12,.68,.15,mats.dark);
  }
  }
  // Moving traffic, including red double deckers.
  const vehicles=[];
  function vehicle(isBus,color) {
    const group=new THREE.Group();
    const paint=isBus?mats.red:material(color,{roughness:.32,metalness:.35});
    const length=isBus?9.7:4.2,height=isBus?3.9:1.5,width=isBus?2.55:1.8;
    function part(geo,mat,pos,scale) {const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;group.add(m);return m;}
    part(boxGeo,paint,[0,height/2+.35,0],[length,height,width]);
    part(boxGeo,mats.dark,[0,.55,0],[length+.05,.38,width+.05]);
    for(const side of [-1,1]) {
      for(let i=0;i<(isBus?7:3);i++) {
        const xx=-length*.39+i*(length*.78/(isBus?6:2));
        part(boxGeo,mats.glass,[xx,isBus?3.35:1.55,side*(width/2+.02)],[isBus?1.05:.75,isBus?.9:.55,.035]);
        if(isBus)part(boxGeo,mats.glass,[xx,1.75,side*(width/2+.02)],[1.05,.88,.035]);
      }
      for(const xx of [-length*.3,length*.3]){
        const wheel=part(cylinderGeo,mats.black,[xx,.53,side*width/2],[.47,.18,.47]);wheel.rotation.x=Math.PI/2;
        const hub=part(cylinderGeo,mats.weathered,[xx,.53,side*(width/2+.12)],[.23,.03,.23]);hub.rotation.x=Math.PI/2;
      }
    }
    part(boxGeo,mats.glass,[length/2+.02,isBus?3.2:1.55,0],[.04,isBus?1.05:.55,width*.86]);
    for(const side of [-1,1])part(boxGeo,glowMat,[length/2+.04,.9,side*width*.35],[.06,.2,.24]);
    if(isBus)part(boxGeo,mats.trim,[0,2.38,width/2+.03],[5,.35,.02]);
    mergeGroup(group);scene.add(group);return group;
  }
  for(let i=0;i<11;i++) {
    const bus=i===0||i===4||i===8,car=vehicle(bus,['#dbd5c4','#28383b','#585d57','#9f9e92'][i%4]);
    const dir=i%2?1:-1;
    const bridgeX=-100+i*20;
    car.position.set(bridgeX,10.8,-75+dir*3.1).applyMatrix4(bridgeTransform);car.rotation.y=(dir<0?Math.PI:0)-(mapData?Math.atan2(.063,1.24):0);
    vehicles.push({group:car,dir,speed:bus?5.5:7.2,route:'bridge',bridgeX});
  }
  const trafficCurves=mapContext?mapContext.majorRoads.filter(r=>['Whitehall','Millbank','Victoria Street','Westminster Bridge Road'].includes(r.t.name)&&r.p.length>3).sort((a,b)=>b.p.length-a.p.length).slice(0,6).map(r=>new THREE.CatmullRomCurve3(r.p.map(p=>new THREE.Vector3(p[0],5.35,p[1])))):[];
  for(let i=0;i<9;i++) {
    const car=vehicle(i===2,'#3c4643'),dir=i%2?1:-1;
    car.rotation.y=dir>0?-Math.PI/2:Math.PI/2;car.position.set(-205+dir*4,5.3,-450+i*100);
    if(trafficCurves.length){const curve=trafficCurves[i%trafficCurves.length];vehicles.push({group:car,dir,speed:6,route:'curve',curve,u:i/9,length:curve.getLength()});}
    else vehicles.push({group:car,dir,speed:6,route:'road'});
  }
  // Riverboats and their subtle wakes.
  const boats=[];
  const riverCurve=mapData?.riverPath?new THREE.CatmullRomCurve3(mapData.riverPath.map(p=>new THREE.Vector3(p[0],0,p[1]))):null;
  for(let i=0;i<5;i++) {
    const group=new THREE.Group(),w=5+rand()*2,len=17+rand()*8;
    const hull=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,5),mats.white);hull.rotation.z=Math.PI/2;hull.rotation.y=Math.PI/2;hull.scale.set(2.8,len/2,w/2);hull.position.y=1;group.add(hull);
    const base=new THREE.Mesh(new THREE.BoxGeometry(w,1.7,len),mats.white);base.position.y=1.6;group.add(base);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(w*.83,2,len*.66),mats.glass);cabin.position.set(0,3,0);group.add(cabin);
    const top=new THREE.Mesh(new THREE.BoxGeometry(w*.95,.3,len*.73),mats.white);top.position.set(0,4.1,0);group.add(top);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(w+.04,.32,len),i%2?mats.red:mats.iron);stripe.position.y=1.7;group.add(stripe);
    for(let n=0;n<6;n++) {
      const divider=new THREE.Mesh(new THREE.BoxGeometry(w*.86,1.8,.13),mats.white);divider.position.set(0,3,-len*.3+n*len*.12);group.add(divider);
    }
    group.position.set(-42+i*26,0,-510+i*206);if(i%2)group.rotation.y=Math.PI;
    mergeGroup(group);scene.add(group);
    boats.push({group,dir:i%2?-1:1,speed:2.1+i*.23,phase:i,u:.3+i*.1,length:len});
  }
  // Small flock circling the river.
  const birds=new THREE.Group();scene.add(birds);
  for(let i=0;i<18;i++) {
    const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.2,.1,0),new THREE.Vector3(0,0,0),new THREE.Vector3(1.2,.1,0)]);
    const bird=new THREE.Line(geom,new THREE.LineBasicMaterial({color:'#454a40'}));bird.position.set(rand()*300-150,42+rand()*45,rand()*280-160);birds.add(bird);
  }
  mergeGroup(rotating);
  for(const {pod} of capsules)mergeGroup(pod);
  vegetation?.build();
  // Finalize the static city in a small number of draw calls.
  let instanceCount=0;
  for(const {geo,mat,matrices} of buckets.values()) {
    const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);
    for(let i=0;i<matrices.length;i++)mesh.setMatrixAt(i,matrices[i]);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);instanceCount+=matrices.length;
  }
  return {
    mats,glowMat,instanceCount,bakedMaterials,mapContext,palaceInfo,countyHallInfo:countyHall?.info??null,abbeyBounds:abbey.bounds,abbeyInfo:{...abbey.info,...abbeyLocation},
    get victoriaInfo(){return {...victoria.info,...victoriaLocation};},
    get vegetationInfo(){return vegetation?.info??null;},
    prepareVegetation(renderer,environment){vegetation?.prepare(renderer,environment);},
    updateVegetation(camera,time){return vegetation?.update(camera,time)??false;},
    updateWakes(target){for(let i=0;i<Math.min(target.length,boats.length);i++){const b=boats[i];target[i].set(b.group.position.x,b.group.position.z,b.group.rotation.y,b.length);}},
    update(time,dt) {
      victoria.update(time);
      const angle=time*.005;
      rotating.rotation.z=angle;
      for(const {pod,angle:a} of capsules)pod.position.set(Math.cos(a+angle)*62.3,Math.sin(a+angle)*62.3,0);
      for(const v of vehicles) {
        if(v.route==='bridge'){v.bridgeX+=v.speed*dt*v.dir;if(v.bridgeX>119)v.bridgeX=-104;if(v.bridgeX< -104)v.bridgeX=119;v.group.position.set(v.bridgeX,10.8,-75+v.dir*3.1).applyMatrix4(bridgeTransform);}
        else if(v.route==='curve'){v.u=(v.u+dt*v.speed*v.dir/v.length+1)%1;v.group.position.copy(v.curve.getPointAt(v.u));const t=v.curve.getTangentAt(v.u).multiplyScalar(v.dir);v.group.rotation.y=-Math.atan2(t.z,t.x);}
        else {v.group.position.z+=v.speed*dt*v.dir;if(Math.abs(v.group.position.z)>650)v.group.position.z=-v.dir*650;}
      }
      for(const b of boats) {
        if(riverCurve){b.u=(b.u+dt*b.speed*b.dir/riverCurve.getLength()+1)%1;b.group.position.copy(riverCurve.getPointAt(b.u));const t=riverCurve.getTangentAt(b.u).multiplyScalar(b.dir);b.group.position.x+=(b.phase-2)*12;b.group.rotation.y=Math.atan2(t.x,t.z);}
        else {b.group.position.z+=dt*b.speed*b.dir;if(Math.abs(b.group.position.z)>850)b.group.position.z=-850*b.dir;}
        b.group.position.y=Math.sin(time*.7+b.phase)*.09;b.group.rotation.z=Math.sin(time*.43+b.phase)*.012;
      }
      birds.rotation.y=time*.017;
      birds.children.forEach((b,i)=>{b.position.y+=Math.sin(time*2+i)*.003;});
    },
  };
}

function mergeGroup(group) {
  const buckets=new Map();
  group.updateMatrixWorld(true);
  for(const mesh of [...group.children]){
    if(!mesh.isMesh)continue;
    if(!buckets.has(mesh.material))buckets.set(mesh.material,[]);
    mesh.updateMatrix();buckets.get(mesh.material).push(mesh.geometry.clone().applyMatrix4(mesh.matrix));group.remove(mesh);
  }
  for(const [material,geometries] of buckets){
    // Cylinder, box and torus geometries all carry position, normal and UVs.
    const geometry=mergeGeometries(geometries,false);if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    for(const g of geometries)g.dispose();
  }
}

function clockTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d'),cx=256,cy=256;
  c.fillStyle='#ded5b6';c.fillRect(0,0,512,512);
  const grad=c.createRadialGradient(cx,cy,30,cx,cy,256);grad.addColorStop(0,'#f7efda');grad.addColorStop(.8,'#e8e0c4');grad.addColorStop(1,'#a88946');c.fillStyle=grad;c.beginPath();c.arc(cx,cy,250,0,Math.PI*2);c.fill();
  for(const [r,width,color] of [[247,12,'#ab8439'],[230,5,'#353b35'],[211,3,'#454d42'],[157,2,'#776e4f']]){c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  const numerals=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#27382f';c.font='bold 42px Georgia';
  for(let i=0;i<12;i++){const a=i*Math.PI/6;c.save();c.translate(cx+Math.sin(a)*187,cy-Math.cos(a)*187);c.rotate(a);c.fillText(numerals[i],0,0);c.restore();}
  for(let i=0;i<60;i++){const a=i*Math.PI/30;c.strokeStyle='#444c3b';c.lineWidth=i%5===0?3:1.4;c.beginPath();c.moveTo(cx+Math.sin(a)*218,cy-Math.cos(a)*218);c.lineTo(cx+Math.sin(a)*(i%5===0?205:211),cy-Math.cos(a)*(i%5===0?205:211));c.stroke();}
  for(let i=0;i<16;i++){const a=i*Math.PI/8;c.strokeStyle='#8d8c6f';c.lineWidth=1;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.sin(a)*152,cy+Math.cos(a)*152);c.stroke();}
  function hand(a,l,w){c.save();c.translate(cx,cy);c.rotate(a);c.fillStyle='#24382f';c.beginPath();c.moveTo(-w/2,15);c.lineTo(-w/2,-l*.65);c.lineTo(0,-l);c.lineTo(w/2,-l*.65);c.lineTo(w/2,15);c.closePath();c.fill();c.restore();}
  hand(5.7*Math.PI/6,125,13);hand(42*Math.PI/30,178,8);c.fillStyle='#9d7839';c.beginPath();c.arc(cx,cy,12,0,Math.PI*2);c.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}
