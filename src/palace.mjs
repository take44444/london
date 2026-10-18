import * as THREE from 'three';

const TAU=Math.PI*2;
const bayWidth=264/62,storey=12;

export function pointedArch(width,height,bottom=0){
  const s=new THREE.Shape(),w=width/2,spring=bottom+height*.76;
  s.moveTo(-w,bottom);s.lineTo(w,bottom);s.lineTo(w,spring);
  s.quadraticCurveTo(w*.85,bottom+height*.91,0,bottom+height);
  s.quadraticCurveTo(-w*.85,bottom+height*.91,-w,spring);s.closePath();
  return s;
}

/** One real opening, with the matching atlas crop on the wall and recessed glass. */
export function palaceWindowGeometry(column,floor){
  const wall=new THREE.Shape();wall.moveTo(-bayWidth/2,0);wall.lineTo(bayWidth/2,0);wall.lineTo(bayWidth/2,storey);wall.lineTo(-bayWidth/2,storey);wall.closePath();
  const opening=pointedArch(2.35,8.05,2.5);wall.holes.push(opening);
  const masonry=new THREE.ExtrudeGeometry(wall,{depth:.22,bevelEnabled:false,curveSegments:12});
  const glass=new THREE.ShapeGeometry(opening,12);glass.translate(0,0,.025);
  const ring=pointedArch(2.65,8.34,2.37);ring.holes.push(pointedArch(2.35,8.05,2.5));
  const moulding=new THREE.ExtrudeGeometry(ring,{depth:.065,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:2,curveSegments:12});moulding.translate(0,0,.225);
  for(const g of [masonry,glass]){
    const p=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,(column+(p.getX(i)/bayWidth+.5))/4,(floor+p.getY(i)/storey)/2);
  }
  return {masonry,glass,moulding};
}

/** Roof UVs are metres along the ridge and along the slope, including X scaling. */
export function palaceRoofGeometry(width,rise,length,xScale=1,lengthScale=1){
  const p=[],uv=[];
  const slope=Math.hypot(width*xScale/2,rise);
  const tri=(points,coords)=>{points.forEach((v,i)=>{p.push(...v);uv.push(...coords[i]);});};
  const quad=(a,b,c,d,coords)=>{tri([a,b,c],[coords[0],coords[1],coords[2]]);tri([a,c,d],[coords[0],coords[2],coords[3]]);};
  const a=[-width/2,0,-length/2],b=[-width/2,0,length/2],c=[0,rise,length/2],d=[0,rise,-length/2],e=[width/2,0,length/2],f=[width/2,0,-length/2];
  quad(a,b,c,d,[[0,0],[length*lengthScale,0],[length*lengthScale,slope],[0,slope]]);
  quad(d,c,e,f,[[0,slope],[length*lengthScale,slope],[length*lengthScale,0],[0,0]]);
  tri([a,d,f],[[0,0],[width*xScale/2,rise],[width*xScale,0]]);
  tri([b,e,c],[[0,0],[width*xScale,0],[width*xScale/2,rise]]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

/** Architectural interpretation; dimensions and secondary details are estimates. */
export function buildPalace({instance,box,rod,mats,transform,centralTowerPosition},textures){
  const xScale=transform?1.6:1;
  const stone=mats.stone.clone();stone.color.set('#ded7c6');stone.onBeforeCompile=mats.stone.onBeforeCompile;stone.customProgramCacheKey=mats.stone.customProgramCacheKey;
  const trim=stone.clone();trim.color.set('#ccc4b1');trim.onBeforeCompile=stone.onBeforeCompile;trim.customProgramCacheKey=stone.customProgramCacheKey;
  const metal=new THREE.MeshStandardMaterial({color:'#626967',roughness:.79,metalness:.42,normalMap:textures.asphalt?.normal??null,normalScale:new THREE.Vector2(.055,.055)});
  metal.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vPalaceRoof;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPalaceRoof=uv;');
    shader.fragmentShader='varying vec2 vPalaceRoof;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 plate=vPalaceRoof/vec2(.72,1.35);
      vec2 edge=abs(fract(plate-.5)-.5);
      vec2 aa=max(fwidth(plate),vec2(.0001));
      vec2 joint=1.-smoothstep(vec2(.009),vec2(.009)+aa,edge);
      float ironPlate=fract(sin(dot(floor(plate),vec2(73.16,119.41)))*43758.5453);
      diffuseColor.rgb*=mix(.91,1.08,ironPlate)*mix(1.,.64,max(joint.x,joint.y));`);
  };
  metal.customProgramCacheKey=()=> 'palace-cast-iron-plates-v1';
  const gutter=metal.clone();gutter.color.set('#535a57');
  const facing=new THREE.MeshStandardMaterial({map:textures.palaceFacade??null,color:'#efebdf',roughness:.91});
  const glass=new THREE.MeshStandardMaterial({map:textures.palaceFacade??null,color:'#d7e0dd',roughness:.25,metalness:.05,envMapIntensity:1.1});
  const stoneBox=(x,y,z,w,h,d,mat=stone,ry=0)=>box(x,y,z,w,h,d,mat,ry);
  const octagon=new THREE.CylinderGeometry(1,1,1,8),point=new THREE.ConeGeometry(1,1,8),sphere=new THREE.SphereGeometry(1,8,6);
  const arch=new THREE.ShapeGeometry(pointedArch(1,1),12);
  const windowGeometries=Array.from({length:8},(_,i)=>palaceWindowGeometry(i%4,Math.floor(i/4)));
  for(let i=1;i<windowGeometries.length;i++){
    windowGeometries[i].moulding.dispose();windowGeometries[i].moulding=windowGeometries[0].moulding;
  }
  const roofGeometries=new Map();
  const roofGeometry=(...dimensions)=>{
    const key=dimensions.join(',');
    if(!roofGeometries.has(key))roofGeometries.set(key,palaceRoofGeometry(...dimensions));
    return roofGeometries.get(key);
  };
  let roofs=0,dormers=0,turrets=0,archedOpenings=0;
  const radial=(x,y,z,r,h,mat=stone)=>instance(octagon,mat,x,y,z,r/xScale,h,r);
  function spire(x,y,z,r,h){
    instance(point,stone,x,y+h/2,z,r/xScale,h,r);
    for(let k=0;k<8;k++){
      const a=k*TAU/8,sx=Math.sin(a)/xScale,sz=Math.cos(a);
      rod([x+sx*r,y,z+sz*r],[x+sx*.08,y+h,z+sz*.08],.045,trim);
      if(k%2===0)for(let step=1;step<4;step++){
        const f=step/4,rr=r*(1-f);
        stoneBox(x+sx*(rr+.08),y+h*f,z+sz*(rr+.08),.14/xScale,.23,.2,trim);
      }
    }
    instance(sphere,trim,x,y+h+.09,z,.14/xScale,.14,.14);
    rod([x,y+h,z],[x,y+h+.7,z],.035,trim);
  }
  function dormer(x,y,z,side){
    const face=x+side*.52;
    stoneBox(x,y+1.05,z,1.15,2.1,1.65,metal);
    instance(arch,mats.glass,face+side*.08,y+.35,z,1.1,1.5,1,0,side*Math.PI/2);
    stoneBox(face,y+1.1,z- .65,.12,1.85,.12,trim);stoneBox(face,y+1.1,z+.65,.12,1.85,.12,trim);
    stoneBox(face,y+.3,z,.16,.16,1.5,trim);
    stoneBox(face+side*.03,y+1.05,z,.08,1.5,.055,trim);
    instance(roofGeometry(1.8,1.35,1.55),metal,x,y+2.05,z,1,1,1,0,Math.PI/2);
    dormers++;
  }
  function roof(x,y,z,width,height,length,orientation=0,hasDormers=true){
    instance(roofGeometry(width,height,length,orientation?1:xScale,orientation?xScale:1),metal,x,y,z,1,1,1,0,orientation);
    const toPoint=(dx,dy,dz)=>[x+dx*Math.cos(orientation)+dz*Math.sin(orientation),y+dy,z-dx*Math.sin(orientation)+dz*Math.cos(orientation)];
    for(const side of [-1,1])rod(toPoint(side*width/2,0,-length/2),toPoint(side*width/2,0,length/2),.09,gutter);
    rod(toPoint(0,height,-length/2),toPoint(0,height,length/2),.065,gutter);
    if(!orientation&&hasDormers)for(let dz=-length/2+7;dz<length/2-4;dz+=8.5){
      // Cross wings conceal the intersecting roof area; keep dormers clear of it.
      if([-33,42,124,209].some(cross=>Math.abs(z+dz-cross)<13))continue;
      for(const side of [-1,1])dormer(x+side*width*.29,y+height*.42,z+dz,side);
    }
    roofs++;
  }

  // Narrow wings and cross halls preserve the existing open courtyard footprint.
  for(const [x,width] of [[-112.5,14],[-162,13],[-137,12]]){
    stoneBox(x,17,88,width,24,264);roof(x,29,88,width,10.5,264);
  }
  for(const z of [-33,42,124,209]){
    stoneBox(-137,17,z,63,24,22);roof(-137,29,z,22,11,63,Math.PI/2,false);
  }
  stoneBox(-137,7,88,66,4,266,mats.weathered);
  function frontage(cx,cz,length,angle,decorate=false){
    const tx=Math.cos(angle),tz=-Math.sin(angle),nx=Math.sin(angle),nz=Math.cos(angle);
    const metricScale=Math.abs(tx)>.5?xScale:1;
    const bays=Math.max(1,Math.round(length*metricScale/bayWidth));
    const width=length/bays,scale=width/bayWidth;
    const offset=(u,d=0)=>[cx+tx*u+nx*d,cz+tz*u+nz*d];
    for(const [y,h,projection] of [[5.3,.35,.75],[17,.34,.42],[17.4,.15,.57],[28.8,.45,.65],[29.2,.18,.82]])stoneBox(cx,y,cz,length,h,projection,trim,angle);
    for(let bay=0;bay<bays;bay++){
      const u=-length/2+(bay+.5)*width,[x,z]=offset(u,.01);
      for(let floor=0;floor<2;floor++){
        const g=windowGeometries[(bay%4)+floor*4];
        for(const [geometry,mat] of [[g.masonry,facing],[g.glass,glass],[g.moulding,trim]])instance(geometry,mat,x,5+floor*12,z,scale,1,1,0,angle);
        for(const shift of [-.39,.39]){
          const [mx,mz]=offset(u+shift*scale,.07);
          stoneBox(mx,11.4+floor*12,mz,.065*scale,6.7,.065,trim,angle);
        }
        const [mx,mz]=offset(u,.09);stoneBox(mx,11.5+floor*12,mz,2.3*scale,.09,.08,trim,angle);
        archedOpenings++;
      }
      const [ex,ez]=offset(u+width/2,.30);
      if(decorate){
        stoneBox(ex,17,ez,.32*scale,24,.35,trim,angle);
        const [px,pz]=offset(u+width/2,.34);
        stoneBox(px,26.7,pz,.45*scale,5.5,.47,trim,angle);
        spire(px,29.6,pz,.26,3.2);
      }
      if(bay%4===0){const [px,pz]=offset(u+width/2,.48);rod([px,6,pz],[px,28.5,pz],.045,gutter);}
    }
  }
  frontage(-105.5,88,264,Math.PI/2,true);
  frontage(-168.5,88,264,-Math.PI/2,true);
  frontage(-137,-44,63,Math.PI,true);frontage(-137,220,63,0,true);
  for(const [z0,z1] of [[-22,31],[53,113],[135,198]]){
    for(const [x,angle] of [[-119.5,-Math.PI/2],[-155.5,Math.PI/2],[-143,-Math.PI/2],[-131,Math.PI/2]])frontage(x,(z0+z1)/2,z1-z0,angle);
    frontage(-137,z0,63,0);frontage(-137,z1,63,Math.PI);
  }
  // Upper ventilation turrets: articulated masonry, dark lancets, and crocketed caps.
  for(const z of [-37,0,37,74,112,149,187,218])for(const x of [-164,-107]){
    const width=3.5,height=15;
    stoneBox(x,34.5,z,width/xScale,height,width);
    for(const y of [28,31,35,39,42])stoneBox(x,y,z,(width+.35)/xScale,.22,width+.35,trim);
    for(const dx of [-1,1])for(const dz of [-1,1]){
      stoneBox(x+dx*width/(2*xScale),36,z+dz*width/2,.22/xScale,18,.22,trim);
      spire(x+dx*width/(2*xScale),44.8,z+dz*width/2,.28,4.3);
    }
    for(let side=0;side<4;side++){
      const a=side*Math.PI/2,nx=Math.sin(a),nz=Math.cos(a);
      for(const offset of [-.65,.65])instance(arch,mats.glass,x+nx*(width/2+.025)/xScale+nz*offset/xScale,30,z+nz*(width/2+.025)-nx*offset,.65,8.5,1,0,a);
    }
    radial(x,44.2,z,1.6,3.5,trim);spire(x,46,z,1.65,8);
    turrets++;
  }
  // Slender octagonal Central Tower; the previous low cone missed this silhouette.
  const center=new THREE.Vector3(-137,0,90);
  if(centralTowerPosition){
    center.set(centralTowerPosition[0],0,centralTowerPosition[1]);
    if(transform)center.applyMatrix4(transform.clone().invert());
  }
  radial(center.x,36,center.z,5.9,18);radial(center.x,55,center.z,4.9,20);
  for(const [y,r] of [[44.8,6.2],[47,5.4],[64.8,5.4],[69.5,4.1]])radial(center.x,y,center.z,r,.45,trim);
  radial(center.x,67.1,center.z,3.8,4.4);
  for(let i=0;i<8;i++){
    const a=i*TAU/8,dx=Math.sin(a),dz=Math.cos(a);
    stoneBox(center.x+dx*4.7/xScale,56,center.z+dz*4.7,.28/xScale,21,.28,trim);
    spire(center.x+dx*5.1/xScale,65,center.z+dz*5.1,.45,10);
    const faceAngle=a+TAU/16,faceRadius=4.9*Math.cos(TAU/16)+.025;
    const opening=arch.clone().scale(2.5,12.3,1).rotateY(faceAngle).scale(1/xScale,1,1);
    instance(opening,mats.glass,center.x+Math.sin(faceAngle)*faceRadius/xScale,49,center.z+Math.cos(faceAngle)*faceRadius);
  }
  spire(center.x,70,center.z,3.8,25.3);
  return {roofs,dormers,turrets,archedOpenings,centralTowerTip:96};

}
