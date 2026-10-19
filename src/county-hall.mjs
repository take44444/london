import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createFacadeMaterial} from './facade-material.mjs';
import {facadeAtlases} from './facades.mjs';
const BASE=5;
export const countyHallIds=new Set(['r1789966','w716826100']);
const A=[244.56,-312.85],B=[216.22,-88.47],length=Math.hypot(B[0]-A[0],B[1]-A[1]),along=[(B[0]-A[0])/length,(B[1]-A[1])/length];

/** Four controls on the two end piers, at pavement and main cornice level. */
export function countyPhotoMatrix(){
 const source=[[0,0],[length,0],[0,31],[length,31]],target=[[138/1852,887/1344],[1509/1852,897/1344],[138/1852,771/1344],[1509/1852,656/1344]],rows=[];
 for(let i=0;i<4;i++){const [x,y]=source[i],[u,v]=target[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let c=0;c<8;c++){let pivot=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;[rows[c],rows[pivot]]=[rows[pivot],rows[c]];const scale=rows[c][c];for(let k=c;k<9;k++)rows[c][k]/=scale;for(let r=0;r<8;r++)if(r!==c){const f=rows[r][c];for(let k=c;k<9;k++)rows[r][k]-=f*rows[c][k];}}
 const h=rows.map(r=>r[8]);return new THREE.Matrix3().set(h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1);
}
const signedArea=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const clean=(ring,hole)=>{let r=ring.slice();if(Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<.01)r.pop();if((signedArea(r)<0)!==hole)r.reverse();return r;};
export function countyRoofHeight(point,rings){
 let distance=Infinity;for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(dx*dx+dz*dz||1),0,1);distance=Math.min(distance,Math.hypot(point[0]-a[0]-dx*t,point[1]-a[1]-dz*t));}
 return BASE+31+Math.min(distance/14,1)*14;
}
/** Mapped shell with an interpreted roof, colonnade, dormers and lantern. */
export function buildCountyHall(scene,data,textures){
 const building=data?.buildings.find(b=>b.id==='r1789966');if(!building)return null;
 const group=new THREE.Group();group.name='County Hall';scene.add(group);
 const stone=new THREE.MeshStandardMaterial({color:'#c9c4b6',map:textures.plaster?.color,roughness:.9,normalMap:textures.plaster?.normal,normalScale:new THREE.Vector2(.12,.12)});
 const copper=new THREE.MeshStandardMaterial({color:'#6f9f8f',roughness:.72,metalness:.18});
 const glass=new THREE.MeshStandardMaterial({color:'#243334',roughness:.23,metalness:.03,envMapIntensity:1.1});
 const roof=new THREE.MeshStandardMaterial({color:'#6c4d38',map:textures.roof?.color,roughness:.9,normalMap:textures.roof?.normal,normalScale:new THREE.Vector2(.2,.2)});
 const rear=createFacadeMaterial(textures.facade,facadeAtlases.stone,{continuous:true});
 const photo=new THREE.MeshStandardMaterial({map:textures.countyPhoto??textures.facade,color:'#e0dace',roughness:.91,side:THREE.DoubleSide});
 const projection=countyPhotoMatrix();
 photo.onBeforeCompile=shader=>{
  shader.uniforms.uCountyPhoto={value:projection};shader.vertexShader='uniform mat3 uCountyPhoto;varying vec3 vCountyPhoto;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvec3 countyWorld=(modelMatrix*vec4(position,1.)).xyz;float countyAlong=dot(countyWorld.xz-vec2(${A}),vec2(${along}));vCountyPhoto=uCountyPhoto*vec3(countyAlong,countyWorld.y-${BASE.toFixed(1)},1.);`);
  shader.fragmentShader='varying vec3 vCountyPhoto;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec2 countyUv=vCountyPhoto.xy/vCountyPhoto.z;countyUv.y=1.-countyUv.y;diffuseColor*=texture2D(map,clamp(countyUv,vec2(0.),vec2(1.)));');
 };
 photo.customProgramCacheKey=()=> 'county-hall-photo-v1';
 const batches=new Map();const batch=mat=>{if(!batches.has(mat))batches.set(mat,{p:[],uv:[]});return batches.get(mat);};
 function tri(mat,p,uv=p.map(v=>[v[0]/3,v[2]/3])){const b=batch(mat);for(let i=0;i<3;i++){b.p.push(...p[i]);b.uv.push(...uv[i]);}}
 function quad(mat,p,uv){for(const ids of [[0,2,1],[0,3,2]])tri(mat,ids.map(i=>p[i]),uv&&ids.map(i=>uv[i]));}
 const rings=building.p[0].map((r,i)=>clean(r,i>0));let roofTriangles=0,frontSegments=0;
 for(let r=0;r<rings.length;r++)for(let i=0;i<rings[r].length;i++){
  const a=rings[r][i],b=rings[r][(i+1)%rings[r].length],dx=b[0]-a[0],dz=b[1]-a[1],span=Math.hypot(dx,dz),west=r===0&&-dz/span>.55&&Math.max(a[0],b[0])<260;
  if(west)frontSegments++;
  quad(west&&textures.countyPhoto?photo:rear,[[a[0],BASE,a[1]],[b[0],BASE,b[1]],[b[0],BASE+31,b[1]],[a[0],BASE+31,a[1]]],[[0,0],[span/12,0],[span/12,31/10.65],[0,31/10.65]]);
 }
 const flat=rings.flat(),initial=THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p))));
 let faces=initial;const edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
 // Split shared edges together so curved roof-height interpolation cannot leave cracks.
 for(let pass=0;pass<14;pass++){
  const mids=new Map();for(const face of faces)for(let i=0;i<3;i++){const a=face[i],b=face[(i+1)%3],key=edgeKey(a,b);if(!mids.has(key)&&Math.hypot(flat[a][0]-flat[b][0],flat[a][1]-flat[b][1])>3.5){mids.set(key,flat.length);flat.push([(flat[a][0]+flat[b][0])/2,(flat[a][1]+flat[b][1])/2]);}}
  if(!mids.size)break;const next=[];
  for(const face of faces){let [a,b,c]=face,m=[mids.get(edgeKey(a,b)),mids.get(edgeKey(b,c)),mids.get(edgeKey(c,a))],count=m.filter(v=>v!==undefined).length;
   if(!count){next.push(face);continue;}
   if(count===3){const [ab,bc,ca]=m;next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);continue;}
   while(count===1?m[0]===undefined:!(m[0]!==undefined&&m[1]!==undefined)){[a,b,c]=[b,c,a];m=[m[1],m[2],m[0]];}
   const [ab,bc]=m;if(count===1)next.push([a,ab,c],[ab,b,c]);else next.push([a,ab,c],[ab,bc,c],[ab,b,bc]);
  }faces=next;
 }
 for(const face of faces){let p=face.map(i=>[flat[i][0],countyRoofHeight(flat[i],rings),flat[i][1]]);if(new THREE.Vector3().subVectors(new THREE.Vector3(...p[1]),new THREE.Vector3(...p[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...p[2]),new THREE.Vector3(...p[0]))).y<0)p.reverse();tri(roof,p);roofTriangles++;}
 const details=new Map();function add(geometry,mat,position,rotation=0){geometry.rotateY(rotation);geometry.translate(...position);if(!details.has(mat))details.set(mat,[]);details.get(mat).push(geometry);}
 function box(pos,size,mat,rotation=0){add(new THREE.BoxGeometry(...size),mat,pos,rotation);}
 function cylinder(pos,r0,r1,h,mat,sides=12){add(new THREE.CylinderGeometry(r1,r0,h,sides),mat,pos);}
 // Two rows of copper dormers sit on the pitched river-facing roofs.
 let dormers=0;for(const side of [[0,74],[143,length]])for(let t=side[0]+5;t<side[1]-3;t+=5.5){for(const row of [0,1]){
  const x=A[0]+along[0]*t+3.1+row*3.0,z=A[1]+along[1]*t+.4;const y=countyRoofHeight([x,z],rings)+.6,angle=Math.atan2(along[0],along[1]);
  box([x,y,z],[.35,2.3,1.4],copper,angle);box([x-.2,y,z],[.38,1.65,1.05],glass,angle);box([x,y+1.25,z],[.8,.25,1.8],copper,angle);dormers++;
 }}
 for(const t of [9,31,55,150,172,195,218]){const x=A[0]+along[0]*t+8,z=A[1]+along[1]*t+1;box([x,49,z],[1.5,8,2.2],stone);box([x,53.2,z],[2.1,.45,2.8],stone);}
 // Curved columns stand in front of the mapped recessed central frontage.
 let columns=0;for(let i=0;i<10;i++){const angle=(-61+i*122/9)*Math.PI/180,x=218+28*Math.cos(angle),z=-200+28*Math.sin(angle);cylinder([x,22,z],.8,.7,17.5,stone);cylinder([x,13.1,z],1,1,.5,stone);cylinder([x,30.8,z],1,1,.8,stone);columns++;}
 // Copper roof lantern, interpreted from the photograph rather than surveyed.
 cylinder([276,50.5,-195],3.7,3.2,4,copper,8);cylinder([276,54,-195],2.8,2.8,4.5,glass,8);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;box([276+2.8*Math.cos(a),54,-195+2.8*Math.sin(a)],[.4,5,.4],copper,a);}
 cylinder([276,57,-195],3.6,2.4,1.3,copper,8);cylinder([276,59.2,-195],2.4,.6,3.2,copper,8);cylinder([276,61.7,-195],.3,0,2.5,copper,8);
 for(const [mat,b]of batches){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));if(mat===rear)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(b.p.length).fill(.55),3));if(mat===roof){const merged=mergeVertices(g);g.dispose();g=merged;}g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat);mesh.name=mat===roof?'County Hall pitched roof':mat===photo?'County Hall photographic frontage':'County Hall masonry';mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 for(const [mat,geometries]of details){const g=mergeGeometries(geometries);for(const geometry of geometries)geometry.dispose();const mesh=new THREE.Mesh(g,mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 return {group,nightUniforms:[rear.userData.night],info:{mappedId:building.id,photo:!!textures.countyPhoto,courtyards:rings.length-1,frontSegments,roofTriangles,dormers,columns,roofPeak:50,cupolaPeak:63,interpretation:true}};
}
