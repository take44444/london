/** Compile distant OSM geometry offline; the browser loads spatially culled meshes. */
import fs from 'node:fs/promises';
import {shardMappedParts} from '../src/shard-pose.mjs';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {Document,NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression,KHRMeshQuantization} from '@gltf-transform/extensions';
import {quantize,reorder,weld} from '@gltf-transform/functions';
import {MeshoptEncoder} from 'meshoptimizer';
import {roofBuildingHeight,planRoof,emitRoof} from '../src/city-roofs.mjs';
import {buildingColours} from '../src/building-colours.mjs';
import {mappedSurface} from '../src/building-surfaces.mjs';
import {offsetStreet,roadWidth} from '../src/streets.mjs';
const raw=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const core=JSON.parse(await fs.readFile('dist/assets/london-map.json','utf8'));
const existing=new Set(core.buildings.filter(b=>Math.hypot(...b.c)<=1950).map(b=>b.id));
const abbey=core.buildings.find(b=>b.t.name==='Westminster Abbey')?.p||[];
const inRing=(p,r)=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
const landmark=(x,z)=>(x>-210&&x< -30&&z>-100&&z<280)||(x>195&&x<250&&z>-430&&z< -260)||abbey.some(p=>inRing([x,z],p[0])&&!p.slice(1).some(h=>inRing([x,z],h)));
const area=r=>r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const clean=(r,hole=false)=>{let p=r.filter((p,i)=>!i||Math.hypot(p[0]-r[i-1][0],p[1]-r[i-1][1])>.01);if(Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.01)p=p.slice(0,-1);if((area(p)<0)!==hole)p.reverse();return p;};
const doc=new Document(),scene=doc.createScene('Greater London'),buffer=doc.createBuffer(),materials=new Map(),tiles=new Map();
const stats={buildings:0,mappedHeights:0,domes:0,pitchedRoofs:0,trees:0,triangles:0,tiles:0,landmarks:[],source:raw.source};
let feature='';
function batch(kind,x,z){const tx=Math.floor(x/800),tz=Math.floor(z/800),key=`${feature}:${tx}:${tz}`;if(!tiles.has(key))tiles.set(key,{feature,x:(tx+.5)*800,z:(tz+.5)*800,batches:new Map()});const tile=tiles.get(key);if(!tile.batches.has(kind))tile.batches.set(kind,{p:[],n:[],uv:[],c:[]});return tile.batches.get(kind);}
function triangle(b,p,uv,color=[1,1,1]){const a=new THREE.Vector3(...p[0]),n=new THREE.Vector3(...p[1]).sub(a).cross(new THREE.Vector3(...p[2]).sub(a));if(n.lengthSq()<1e-12)return;n.normalize();for(let i=0;i<3;i++){b.p.push(...p[i]);b.n.push(n.x,n.y,n.z);b.uv.push(...uv[i]);b.c.push(...color.map(v=>Math.round(THREE.MathUtils.clamp(v,0,1)*255)));}stats.triangles++;}
function quad(b,p,uv,c){for(const order of [[0,2,1],[0,3,2]])triangle(b,order.map(i=>p[i]),order.map(i=>uv[i]),c);}
function horizontal(polys,y,kind,size,color=[1,1,1]){for(const poly of polys){const rings=poly.map((r,i)=>clean(r,i>0)).filter(r=>r.length>=3);if(!rings.length)continue;const flat=rings.flat(),center=rings[0].reduce((s,p)=>[s[0]+p[0]/rings[0].length,s[1]+p[1]/rings[0].length],[0,0]);const b=batch(kind,...center),tris=THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p))));for(const ids of tris){const p=[ids[0],ids[2],ids[1]].map(i=>flat[i]);triangle(b,p.map(v=>[v[0],y,v[1]]),p.map(v=>v.map(c=>c/size)),color);}}}
for(const b of raw.buildings){feature=shardMappedParts.has(b.id)?'shard':'';const [x,z]=b.c,t=b.t,d=Math.hypot(x,z),id=Number(b.id.slice(1));if(existing.has(b.id)||landmark(x,z)||['roof','construction'].includes(t.building)||/Elizabeth Tower|Palace of Westminster|London Eye|Westminster Abbey/.test(t.name||''))continue;
 // Tiny distant outbuildings are subpixel at the supported camera range.
 if(d>4500&&b.area<60&&!t.height)continue;
 const fallback=['garage','garages','shed','greenhouse'].includes(t.building)?1:b.area<85?3:b.area>1500?6:4;
 const height=Math.min(400,roofBuildingHeight(t,fallback)),min=parseFloat(t.min_height)||parseFloat(t['building:min_level'])*3.55||0;if(height<=min+.3)continue;
 const seed=(Math.sin(id*127.1+311.7)*43758.5453)%1,type=mappedSurface(t,id%3===1?1:0),col=buildingColours(t,type,id),plan=planRoof(b,height,min,Math.abs(seed));
 const dome=t['roof:shape']==='dome'&&parseFloat(t['roof:height'])>0&&b.p.length===1&&b.p[0].length===1;
 const rise=dome?Math.min(height-min,parseFloat(t['roof:height'])):plan?.rise||0,y0=5+min,y1=5+height-rise;
 const floors=Math.max(1,Math.round((height-rise-min)/3.55)),rows=type==='brick'?4:3,wall=batch(type,x,z),roof=batch('roof',x,z);
 for(const poly of b.p){const rings=poly.map((r,i)=>clean(r,i>0));for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.08||y1<=y0+.01)continue;const u=id%97,v=type==='glass'?floors:floors/rows,w=type==='glass'?Math.max(1,Math.round(len/1.5)):Math.max(1,Math.round(len/3))/4;quad(wall,[[a[0],y0,a[1]],[c[0],y0,c[1]],[c[0],y1,c[1]],[a[0],y1,a[1]]],[[u,0],[u+w,0],[u+w,v],[u,v]],col.wall);}
 if(dome){const ring=rings[0],cx=ring.reduce((s,p)=>s+p[0]/ring.length,0),cz=ring.reduce((s,p)=>s+p[1]/ring.length,0),target=t['roof:material']==='glass'?wall:roof,color=t['roof:material']==='glass'?col.wall:col.roof;let along=0;for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);for(let j=0;j<8;j++){const point=(p,k)=>{const phi=k/8*Math.PI/2;return [cx+(p[0]-cx)*Math.cos(phi),y1+rise*Math.sin(phi),cz+(p[1]-cz)*Math.cos(phi)];};quad(target,[point(a,j),point(c,j),point(c,j+1),point(a,j+1)],[[along/1.5,j*rise/8/3.55],[(along+len)/1.5,j*rise/8/3.55],[(along+len)/1.5,(j+1)*rise/8/3.55],[along/1.5,(j+1)*rise/8/3.55]],color);}along+=len;}}
 else if(plan)emitRoof(plan,poly,{roof:(p,uv)=>triangle(t['roof:material']==='glass'?wall:roof,p,t['roof:material']==='glass'?p.map(v=>[(v[0]*.7+v[2]*.7)/1.5,v[1]/3.55]):uv,t['roof:material']==='glass'?col.wall:col.roof),wall:(p,uv)=>triangle(type==='glass'?wall:batch(type==='brick'?'gable-brick':'gable-stone',x,z),p,type==='glass'?p.map(v=>[(v[0]*.7+v[2]*.7)/1.5,v[1]/3.55]):uv,col.wall)});
 else horizontal([poly],5+height,'roof',3,col.roof);
 }
 stats.buildings++;if(t.height||t['building:levels'])stats.mappedHeights++;if(dome)stats.domes++;if(plan)stats.pitchedRoofs++;if(['The Shard','30 St Mary Axe',"St Paul's Cathedral"].includes(t.name))stats.landmarks.push({id:b.id,name:t.name,height,center:b.c});
}
feature='';
horizontal(raw.land,4.97,'land',2.2);horizontal(raw.greens,5.02,'grass',5);
for(const r of raw.roads){const {width,pedestrian}=roadWidth(r.t),bridge=r.t.bridge&&r.t.bridge!=='no',y=bridge?11:5.13,kind=pedestrian?'pavement':'road';const left=offsetStreet(r.p,width/2),right=offsetStreet(r.p,-width/2),b=batch(kind,...r.p[0]);let s=0;for(let i=1;i<r.p.length;i++){const next=s+Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1]);quad(b,[[...left[i-1]],[...left[i]],[...right[i]],[...right[i-1]]].map(p=>[p[0],y,p[1]]),[[0,s/5],[0,next/5],[width/5,next/5],[width/5,s/5]]);s=next;}}
for(const [x,z] of raw.trees||[]){const h=9+Math.abs(Math.sin(x*7+z*13))*5,w=h*326/480,b=batch('tree',x,z);for(const [dx,dz] of [[w/2,0],[0,w/2]])quad(b,[[x-dx,5,z-dz],[x+dx,5,z+dz],[x+dx,5+h,z+dz],[x-dx,5+h,z-dz]],[[0,0],[1,0],[1,1],[0,1]]);stats.trees++;}
console.log('Geometry',stats.buildings,stats.triangles,tiles.size);
for(const tile of tiles.values())for(const [kind,b] of tile.batches){if(!b.p.length)continue;for(let i=0;i<b.p.length;i+=3){b.p[i]-=tile.x;b.p[i+2]-=tile.z;}if(!materials.has(kind))materials.set(kind,doc.createMaterial(kind).setDoubleSided(true));const accessor=(array,type,normalized=false)=>doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);const p=doc.createPrimitive().setMaterial(materials.get(kind)).setAttribute('POSITION',accessor(new Float32Array(b.p),'VEC3')).setAttribute('NORMAL',accessor(new Float32Array(b.n),'VEC3')).setAttribute('TEXCOORD_0',accessor(new Float32Array(b.uv),'VEC2')).setAttribute('COLOR_0',accessor(new Uint8Array(b.c),'VEC3',true));const mesh=doc.createMesh().addPrimitive(p);scene.addChild(doc.createNode(`context-${tile.feature?tile.feature+'-':''}${kind}`).setExtras(tile.feature?{feature:tile.feature}:{}).setMesh(mesh).setTranslation([tile.x,0,tile.z]));tile.batches.delete(kind);}
stats.tiles=tiles.size;scene.setExtras(stats);await MeshoptEncoder.ready;
await doc.transform(weld(),reorder({encoder:MeshoptEncoder}),quantize({pattern:/^(POSITION|NORMAL)$/,quantizePosition:16,quantizeNormal:8}));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
// External spatial buffers keep each hosted asset below the static-file limit.
const sectors=new Map();for(const node of scene.listChildren()){const [x,,z]=node.getTranslation(),key=`${Math.floor(x/4000)}-${Math.floor(z/4000)}`;if(!sectors.has(key))sectors.set(key,doc.createBuffer(`region-${key}`).setURI(`london-context-${key}.bin`));const target=sectors.get(key);for(const primitive of node.getMesh().listPrimitives()){for(const accessor of primitive.listAttributes())accessor.setBuffer(target);primitive.getIndices()?.setBuffer(target);}}
for(const b of doc.getRoot().listBuffers())if(![...sectors.values()].includes(b))b.dispose();
const io=new NodeIO().registerExtensions([EXTMeshoptCompression,KHRMeshQuantization]).registerDependencies({'meshopt.encoder':MeshoptEncoder});await io.write(process.argv[3],doc);await fs.writeFile(process.argv[3].replace(/\.(gltf|glb)$/,'.json'),JSON.stringify(stats,null,2));console.log(stats);
await fs.writeFile(process.argv[3].replace(/\.(gltf|glb)$/,'-source.json.gz'),gzipSync(JSON.stringify(raw),{level:9}));
