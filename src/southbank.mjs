import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import {createFacadeMaterial} from './facade-material.mjs';
import {curtainMaterial} from './building-surfaces.mjs';
export const southbankProfiles=[
 {id:'w46250966',name:'Shell Centre',height:107,floors:27,style:'punched-stone'},
 {id:'w535308530',name:'Thirty Casson Square',height:105,floors:30,style:'stone-grid'},
 {id:'w535308531',name:'One Casson Square',height:122.3,floors:37,style:'stone-grid'},
 {id:'w535308533',name:'Two Southbank Place',height:80.7,floors:16,style:'curtain-wall'},
 {id:'w535308535',name:'Four Casson Square',height:100,floors:29,style:'oriel-grid'},
 {id:'w535308528',name:'SEVEN',height:50,floors:15,style:'bronze-grid'},
 {id:'w535308526',name:'Belvedere Gardens upper tower',height:73,floors:21,style:'bronze-grid'},
 {id:'w716813206',name:'Belvedere Gardens lower tower',height:45,floors:11,style:'bronze-grid'},
 {id:'w1455597382',name:'Belvedere Gardens podium',height:21.3,floors:6,style:'bronze-grid',partIds:['w535308526','w716813206']},
 {id:'w1455593628',name:'One Southbank Place envelope',height:21.3,floors:6,style:'precast-office',partIds:['w535308537','w717129420','w717129421','w717129422','w717129423']},
 ...[['w535308537',35],['w717129420',45],['w717129421',47],['w717129422',51],['w717129423',54]].map(([id,height],i)=>({id,name:'One Southbank Place terrace '+(i+1),height,floors:Math.round(height/4.5),style:'precast-office'})),
];
export const shellAtlas={width:320,height:180,rows:[0,90,180],columns:[[21,59],[98,138],[180,217],[259,294]],windows:[[15,70],[105,160]]};
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const clean=(p,hole=false)=>{p=p.slice();if(Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.01)p.pop();if((area(p)<0)!==hole)p.reverse();return p;};

/** Remove footprint area already represented by mapped parts. */
export function remainingEnvelope(building,parts){
 const paths=b=>b.p.flatMap(poly=>poly.map((r,i)=>clean(r,i>0).map(([x,z])=>({X:Math.round(x*100),Y:Math.round(z*100)}))));
 const clipper=new ClipperLib.Clipper(),tree=new ClipperLib.PolyTree();clipper.AddPaths(paths(building),ClipperLib.PolyType.ptSubject,true);clipper.AddPaths(parts.flatMap(paths),ClipperLib.PolyType.ptClip,true);clipper.Execute(ClipperLib.ClipType.ctDifference,tree,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
 const out=[],ring=n=>n.Contour().map(p=>[p.X/100,p.Y/100]);function visit(node){for(const child of node.Childs()){if(!child.IsHole()&&child.Contour().length>=3){const p=[ring(child),...child.Childs().filter(n=>n.IsHole()).map(ring)];if(Math.abs(area(p[0]))-p.slice(1).reduce((s,r)=>s+Math.abs(area(r)),0)>2)out.push(p);}visit(child);}}visit(tree);return out;
}
/** Source-identified buildings replace generic masonry in the Southbank cluster. */
export function buildSouthbank(scene,data,textures){
 if(!data)return null;
 const stone=new THREE.MeshStandardMaterial({color:'#c9c7be',roughness:.86,map:textures.plaster?.color,normalMap:textures.plaster?.normal,normalScale:new THREE.Vector2(.08,.08),side:THREE.DoubleSide});
 const bronze=new THREE.MeshStandardMaterial({color:'#5c5043',metalness:.52,roughness:.43});
 const roof=new THREE.MeshStandardMaterial({color:'#686d6c',roughness:.92});
 const glass=curtainMaterial(),photo=createFacadeMaterial(textures.shellFacade||textures.facade,shellAtlas,{continuous:true});
 const railing=new THREE.MeshPhysicalMaterial({color:'#809693',transparent:true,opacity:.48,roughness:.18,metalness:0,ior:1.5,side:THREE.DoubleSide,depthWrite:false});
 const excluded=new Set(),info=[],suppressedEnvelopes=[],nightUniforms=[glass.userData.night,photo.userData.night];
 for(const profile of southbankProfiles){const building=data.buildings.find(b=>b.id===profile.id);if(!building)continue;
  const polygons=profile.partIds?remainingEnvelope(building,profile.partIds.map(id=>data.buildings.find(b=>b.id===id)).filter(Boolean)):building.p;
  if(!polygons.length){excluded.add(profile.id);suppressedEnvelopes.push(profile.id);continue;}
  const group=new THREE.Group();group.name=profile.name;scene.add(group);excluded.add(profile.id);
  const batches=new Map(),stats={...profile,mappedHeight:parseFloat(building.t.height)||null,panes:0,balconies:0,frameMembers:0};
  function tri(mat,p,uv=p.map(v=>[v[0]/3,v[1]/3]),color=[.84,.87,.86]){if(!batches.has(mat))batches.set(mat,{p:[],uv:[],color:[]});const b=batches.get(mat);for(let i=0;i<3;i++){b.p.push(...p[i]);b.uv.push(...uv[i]);b.color.push(...color);}}
  function quad(mat,p,uv,color){for(const ids of [[0,2,1],[0,3,2]])tri(mat,ids.map(i=>p[i]),uv&&ids.map(i=>uv[i]),color);}
  function box(center,size,mat,angle=0){const g=new THREE.BoxGeometry(...size).rotateY(angle).translate(...center),p=g.attributes.position,uv=g.attributes.uv,index=g.index;for(let i=0;i<index.count;i+=3){const ids=[0,1,2].map(j=>index.getX(i+j));tri(mat,ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]),ids.map(j=>[uv.getX(j),uv.getY(j)]));}g.dispose();stats.frameMembers++;}
  function horizontal(poly,y,mat){const rings=poly.map((r,i)=>clean(r,i>0)),flat=rings.flat();for(const ids of THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p))))){const p=[ids[0],ids[2],ids[1]].map(i=>flat[i]);tri(mat,p.map(v=>[v[0],y,v[1]]),p.map(v=>v.map(x=>x/4)));}}
  const base=5,top=base+profile.height,bodyTop=profile.style==='punched-stone'?top-4:profile.style==='curtain-wall'?top-10:profile.style==='stone-grid'?top-profile.height/profile.floors*4:top;
  function elevation(ring,bottom,upper,{penthouse=false}={}){for(let i=0;i<ring.length;i++){
   const a=ring[i],c=ring[(i+1)%ring.length],dx=c[0]-a[0],dz=c[1]-a[1],span=Math.hypot(dx,dz);if(span<.1)continue;
   const tx=dx/span,tz=dz/span,nx=tz,nz=-tx,angle=-Math.atan2(dz,dx),point=(s,y,d=0)=>[a[0]+tx*s+nx*d,y,a[1]+tz*s+nz*d];
   const width=profile.style==='punched-stone'?2.7:profile.style==='curtain-wall'?1.5:3.4,bays=Math.max(1,Math.round(span/width)),bayWidth=span/bays,storey=profile.height/profile.floors;
   if(profile.style==='punched-stone'&&!penthouse){
    quad(photo,[point(0,bottom),point(span,bottom),point(span,upper),point(0,upper)],[[0,0],[bays/4,0],[bays/4,(profile.floors-1)/2],[0,(profile.floors-1)/2]],[.58,.55,.49]);
    for(let bay=0;bay<=bays;bay+=2)box(point(bay*bayWidth,(bottom+upper)/2,.12),[.22,upper-bottom,.32],stone,angle);
    continue;
   }
   quad(glass,[point(0,bottom,-.16),point(span,bottom,-.16),point(span,upper,-.16),point(0,upper,-.16)],[[0,(bottom-base)/storey],[span/1.5,(bottom-base)/storey],[span/1.5,(upper-base)/storey],[0,(upper-base)/storey]]);
   stats.panes+=bays*Math.max(1,Math.round((upper-bottom)/storey));
   for(let bay=0;bay<=bays;bay++)box(point(bay*bayWidth,(bottom+upper)/2,.06),[profile.style==='curtain-wall'?.07:.25,upper-bottom,.36],profile.style==='curtain-wall'?bronze:stone,angle);
   const first=Math.ceil((bottom-base)/storey),last=Math.floor((upper-base)/storey);
   for(let floor=first;floor<=last;floor++){
    const y=base+floor*storey,thick=profile.style==='stone-grid'?(floor%3===0?.36:.14):.12;
    if(profile.style==='stone-grid'&&floor>0&&floor<3)continue;
    box(point(span/2,y,.06),[span+.1,thick,.4],profile.style==='curtain-wall'?bronze:stone,angle);
    if(!penthouse&&profile.style==='stone-grid'&&floor>2&&floor<profile.floors-4&&span>9){
     const bay=(floor+i*2)%bays,s=(bay+.5)*bayWidth,w=bayWidth*.9,depth=1.05;
     box(point(s,y,.65),[w,.16,1.3],stone,angle);
     quad(railing,[point(s-w/2,y+.1,depth),point(s+w/2,y+.1,depth),point(s+w/2,y+1.12,depth),point(s-w/2,y+1.12,depth)]);
     box(point(s,y+1.12,depth),[w,.045,.045],bronze,angle);stats.balconies++;
    }
   }
   if(profile.style==='oriel-grid'&&!penthouse&&span>9)for(let floor=2;floor<profile.floors-2;floor++)for(let bay=(floor+i)%3;bay<bays;bay+=3){const y=base+floor*storey+.2,s=(bay+.5)*bayWidth,w=bayWidth*.78,depth=.75,h=storey-.5;
    box(point(s,y,.4),[w,.16,1.0],stone,angle);box(point(s,y+h,.4),[w,.16,1.0],stone,angle);
    quad(glass,[point(s-w/2,y,depth),point(s+w/2,y,depth),point(s+w/2,y+h,depth),point(s-w/2,y+h,depth)],[[0,0],[1,0],[1,1],[0,1]]);
    for(const side of [-1,1])quad(glass,[point(s+side*w/2,y,0),point(s+side*w/2,y,depth),point(s+side*w/2,y+h,depth),point(s+side*w/2,y+h,0)],[[0,0],[.5,0],[.5,1],[0,1]]);stats.oriels=(stats.oriels||0)+1;
   }
   if(profile.style==='bronze-grid'&&span>5)for(let bay=0;bay<bays;bay+=2)box(point((bay+.23)*bayWidth,(bottom+upper)/2,.1),[bayWidth*.32,upper-bottom,.18],bronze,angle);
  }}
  for(const polygon of polygons){const rings=polygon.map((r,i)=>clean(r,i>0));for(const ring of rings)elevation(ring,base,bodyTop);horizontal(polygon,bodyTop,roof);
   if(profile.style==='punched-stone'){
    for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],span=Math.hypot(dx,dz),n=Math.max(1,Math.round(span/6));if(span<1)continue;const angle=-Math.atan2(dz,dx);for(let j=0;j<=n;j++)box([a[0]+dx*j/n,top-2.3,a[1]+dz*j/n],[.5,3.4,.55],stone,angle);box([(a[0]+b[0])/2,top-.3,(a[1]+b[1])/2],[span+.4,.6,.8],stone,angle);}
   }else if(bodyTop<top-.01){
    const inset=profile.style==='curtain-wall'?4.5:1.1,inner=rings.map(r=>r.map(p=>{const dx=p[0]-building.c[0],dz=p[1]-building.c[1],d=Math.hypot(dx,dz);return [p[0]-dx/d*inset,p[1]-dz/d*inset];}));
    for(const ring of inner)elevation(ring,bodyTop,top,{penthouse:true});horizontal(inner,top,roof);
   }
  }
  for(const [mat,b]of batches){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));g.computeVertexNormals();g.computeBoundingBox();const m=new THREE.Mesh(g,mat);m.castShadow=mat!==railing;m.receiveShadow=true;group.add(m);}
  stats.meshes=group.children.length;info.push(stats);
 }
 return {excluded,info,nightUniforms,suppressedEnvelopes};
}
