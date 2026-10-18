import * as THREE from 'three';

const TAU=Math.PI*2;
const signedArea=ring=>ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
const numeric=(value,fallback)=>{const n=parseFloat(value);return Number.isFinite(n)?n:fallback;};
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

/** Render the bundled OSM extract in metres, preserving courtyard holes and street curves. */
export function buildMapCity(scene,data,textures,helpers){
  const {box,cyl,tree,lamp,mats}=helpers;
  const batches=new Map(),facadeUniforms=[];
  let buildingCount=0,wallCount=0,roadCount=0,treeCount=0,recordedHeights=0;
  const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.92,side:THREE.DoubleSide,...options});
  const surface=(name,color,size)=>{
    const tex=textures[name];
    const m=material(color,{map:tex?.color,normalMap:tex?.normal,normalScale:new THREE.Vector2(.25,.25),roughnessMap:tex?.roughness});
    m.userData.tileSize=size;return m;
  };
  const pavement=surface('plaster','#aaa99d',3);
  const asphalt=surface('asphalt','#848780',5);
  const land=surface('plaster','#b8b5a7',8);
  const grass=material('#89967a',{map:textures.grass,normalMap:textures.grassNormal,normalScale:new THREE.Vector2(.4,.4),roughnessMap:textures.grassRoughness});grass.userData.tileSize=5;
  const masonry=surface('brick','#c9b79c',4),terracotta=material('#99634b');
  const roof=surface('asphalt','#777b75',7);
  const slates=surface('roof','#9a9c93',3);
  const facades=[makeFacade(textures.facade,'#d7d1c3'),makeFacade(textures.brickFacade||textures.facade,'#d1c6b0'),makeFacade(textures.facade,'#bdc2bd'),makeFacade(textures.brickFacade||textures.facade,'#afa091')];
  function makeFacade(map,color){
    const m=material(color,{map,vertexColors:true,metalness:.02,envMapIntensity:.75});
    const night={value:0};facadeUniforms.push(night);
    m.onBeforeCompile=shader=>{
      shader.uniforms.uCityNight=night;
      shader.fragmentShader='uniform float uCityNight;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        float facadeLuma = dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722));
        float windowMask = 1. - smoothstep(.075,.21,facadeLuma);
        roughnessFactor = mix(.32,.96,1.-windowMask);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        vec2 windowCell = floor(vMapUv * vec2(4.,4.));
        float windowLight = step(.69,fract(sin(dot(windowCell,vec2(12.9898,78.233)))*43758.5453));
        totalEmissiveRadiance += vec3(1.,.58,.24)*uCityNight*windowMask*windowLight;`);
    };
    m.customProgramCacheKey=()=> 'london-window-light-v1';return m;
  }
  function batch(mat,cx=0,cz=0){
    const key=mat.uuid+':'+Math.floor(cx/280)+':'+Math.floor(cz/280);
    if(!batches.has(key))batches.set(key,{mat,p:[],n:[],uv:[],color:[],indices:[]});
    return batches.get(key);
  }
  function triangle(b,points,uvs,color=[1,1,1]){
    const offset=b.p.length/3;
    for(let i=0;i<3;i++){b.p.push(...points[i]);b.uv.push(...uvs[i]);b.color.push(...color);}
    b.indices.push(offset,offset+1,offset+2);
  }
  function quad(b,points,uvs,color){
    triangle(b,[points[0],points[2],points[1]],[uvs[0],uvs[2],uvs[1]],color);
    triangle(b,[points[0],points[3],points[2]],[uvs[0],uvs[3],uvs[2]],color);
  }
  function cleaned(ring,clockwise=false){
    let p=ring.filter((point,i)=>!i||Math.hypot(point[0]-ring[i-1][0],point[1]-ring[i-1][1])>.03);
    if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.1)p=p.slice(0,-1);
    if((signedArea(p)<0)!==clockwise)p.reverse();
    return p;
  }
  function horizontal(polygons,y,mat){
    for(const rings of polygons){
      const outer=cleaned(rings[0]);if(outer.length<3)continue;
      const holes=rings.slice(1).map(r=>cleaned(r,true)).filter(r=>r.length>2);
      const flat=[outer,...holes].flat(),cx=outer.reduce((s,p)=>s+p[0],0)/outer.length,cz=outer.reduce((s,p)=>s+p[1],0)/outer.length;
      const b=batch(mat,cx,cz),tile=mat.userData.tileSize||4;
      const tris=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(...p)),holes.map(r=>r.map(p=>new THREE.Vector2(...p))));
      for(const tri of tris){const p=tri.map(i=>flat[i]);triangle(b,[p[0],p[2],p[1]].map(a=>[a[0],y,a[1]]),[p[0],p[2],p[1]].map(a=>[a[0]/tile,a[1]/tile]));}
    }
  }
  horizontal(data.ground,5,land);
  horizontal([[[[-6500,-6500],[6500,-6500],[6500,6500],[-6500,6500]],[[-2300,-2300],[-2300,2300],[2300,2300],[2300,-2300]]]],4.97,land);
  horizontal(data.riverside,5.07,pavement);
  for(const area of data.areas){
    if(area.t.leisure==='pitch')horizontal(area.p,5.025,grass);
    else if(area.t.natural!=='water')horizontal(area.p,5.02,grass);
  }
  // Stone walls follow both sides of the actual Thames outline.
  const bankSegments=[];
  for(const polygon of data.water)for(const ring of polygon){
    const p=cleaned(ring),b=batch(mats.weathered);
    for(let i=0;i<p.length;i++){
      const a=p[i],c=p[(i+1)%p.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);
      if(len>180||Math.abs(a[0])>2250||Math.abs(a[1])>2250)continue;
      const u=len/3;
      quad(b,[[a[0],-.5,a[1]],[c[0],-.5,c[1]],[c[0],5.35,c[1]],[a[0],5.35,a[1]]],[[0,0],[u,0],[u,2],[0,2]]);
      if(len>4&&Math.hypot(...a)<1400)bankSegments.push([a,c]);
    }
  }
  function ribbon(points,width,mat,y=5.14){
    if(points.length<2)return;
    let length=0;
    const cx=points[0][0],cz=points[0][1],b=batch(mat,cx,cz),tile=mat.userData.tileSize||4;
    const edges=points.map((p,i)=>{
      const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const dx=next[0]-prev[0],dz=next[1]-prev[1],l=Math.hypot(dx,dz)||1;
      const pointY=typeof y==='function'?y(p):y;
      return [[p[0]-dz/l*width/2,pointY,p[1]+dx/l*width/2],[p[0]+dz/l*width/2,pointY,p[1]-dx/l*width/2]];
    });
    for(let i=1;i<points.length;i++){
      const next=length+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
      quad(b,[edges[i-1][0],edges[i][0],edges[i][1],edges[i-1][1]],[[0,length/tile],[0,next/tile],[width/tile,next/tile],[width/tile,length/tile]]);
      length=next;
    }
  }
  const majorRoads=[];
  for(const road of data.roads){
    const t=road.t,kind=t.highway;
    if(road.p.length<2||Math.hypot(...road.p[Math.floor(road.p.length/2)])>2050)continue;
    const pedestrian=['footway','path','pedestrian','cycleway'].includes(kind);
    const width=numeric(t.width,pedestrian?(kind==='pedestrian'?6:2.5):numeric(t.lanes,kind==='primary'||kind==='trunk'?3:2)*3.1);
    const bridge=t.bridge==='yes';
    // Westminster's detailed green bridge is rendered separately.
    if(bridge&&t.name==='Westminster Bridge')continue;
    const elevation=bridge?11.1:5.16;
    if(!pedestrian){ribbon(road.p,width+3.6,pavement,elevation-.03);majorRoads.push(road);}
    ribbon(road.p,width,pedestrian?pavement:asphalt,elevation);roadCount++;
    if(!pedestrian&&!bridge&&['primary','secondary','tertiary','trunk'].includes(kind)&&Math.hypot(...road.p[0])<1250){
      let walked=0;
      for(let i=1;i<road.p.length;i++){
        const a=road.p[i-1],c=road.p[i],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
        if(len<.5)continue;
        for(let d=8-walked;d<len;d+=8){const f=(d+1.5)/len;if(f>1)continue;box(a[0]+dx*f,elevation+.022,a[1]+dz*f,2.8,.025,.13,mats.trim,-Math.atan2(dz,dx));}
        walked=(walked+len)%8;
      }
    }
    if(bridge&&!pedestrian){
      let total=0;
      for(let i=1;i<road.p.length;i++){
        const a=road.p[i-1],c=road.p[i],len=Math.hypot(c[0]-a[0],c[1]-a[1]);
        if(len>28){const n=Math.ceil(len/45);for(let j=0;j<n;j++){const f=(j+.5)/n;box(a[0]+(c[0]-a[0])*f,4.3,a[1]+(c[1]-a[1])*f,4,13,width+1,mats.weathered);}}
        total+=len;
      }
    }
  }
  const insideLandmark=(x,z)=>(x>-210&&x< -30&&z>-100&&z<280)||(x>-580&&x<-190&&z>-10&&z<210)||(x>195&&x<250&&z>-430&&z< -260);
  for(const building of data.buildings){
    const [cx,cz]=building.c,t=building.t;
    if(insideLandmark(cx,cz)||Math.hypot(cx,cz)>1950||t.building==='roof'||t.building==='construction')continue;
    if(/Elizabeth Tower|Westminster Abbey|Palace of Westminster|London Eye/.test(t.name||''))continue;
    const id=Number(building.id.slice(1)),h=hash(id),area=building.area;
    const hasHeight=Number.isFinite(parseFloat(t.height))||Number.isFinite(parseFloat(t['building:levels']));
    if(hasHeight)recordedHeights++;
    const levels=numeric(t['building:levels'],['garage','garages','shed','greenhouse'].includes(t.building)?1:area<85?3:area>1500?6:4);
    const min=numeric(t.min_height,0);
    const height=THREE.MathUtils.clamp(numeric(t.height,levels*3.55),2.5,190);
    if(height<=min+.5)continue;
    const pitched=building.roofRect&&building.p.length===1&&building.p[0].length===1&&height>9&&(['gabled','hipped','mansard','pyramidal'].includes(t['roof:shape'])||(!t['roof:shape']&&area<900&&height<28&&h>.3));
    const pitch=pitched?Math.min(numeric(t['roof:height'],3.2),height*.3):0;
    const mappedLevels=numeric(t['building:levels'],0);
    const verticalScale=mappedLevels>0?mappedLevels/(Math.max(height-pitch,1)*4):1/14.4;
    const y0=5+min,y1=5+height-pitch,mat=facades[t.name==='County Hall'?0:Math.floor(h*facades.length)],color=[.8+hash(id+7)*.2,.8+hash(id+11)*.2,.78+hash(id+13)*.2];
    const b=batch(mat,cx,cz);
    for(const polygon of building.p){
      const rings=polygon.map((r,i)=>cleaned(r,i>0));
      for(const ring of rings){
        if(ring.length<3)continue;
        let u=hash(id+4)*12;
        for(let i=0;i<ring.length;i++){
          const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);
          if(len<.08)continue;
          quad(b,[[a[0],y0,a[1]],[c[0],y0,c[1]],[c[0],y1,c[1]],[a[0],y1,a[1]]],[[u/12,min*verticalScale],[(u+len)/12,min*verticalScale],[(u+len)/12,(height-pitch)*verticalScale],[u/12,(height-pitch)*verticalScale]],color);
          u+=len;wallCount++;
          // Low relief cornices break up the silhouettes without flattening the footprints.
          if(len>3&&Math.hypot(cx,cz)<850){
            const angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
            box((a[0]+c[0])/2,y1+.14,(a[1]+c[1])/2,len+.2,.35,.42,mats.trim,angle);
            if(height>10)box((a[0]+c[0])/2,9.2,(a[1]+c[1])/2,len,.2,.24,mats.trim,angle);
          }
        }
      }
      if(pitched){
        const rect=building.roofRect,center=rect.reduce((c,p)=>[c[0]+p[0]/4,c[1]+p[1]/4],[0,0]);
        const e0=[rect[1][0]-rect[0][0],rect[1][1]-rect[0][1]],e1=[rect[2][0]-rect[1][0],rect[2][1]-rect[1][1]],l0=Math.hypot(...e0),l1=Math.hypot(...e1);
        const long=Math.max(l0,l1),short=Math.min(l0,l1),axis=l0>=l1?e0:e1,u=axis.map(v=>v/long),v=[-u[1],u[0]];
        const pos=(du,dv,y)=>[center[0]+u[0]*du+v[0]*dv,y,center[1]+u[1]*du+v[1]*dv];
        const a=pos(-long/2,-short/2,y1),c=pos(long/2,-short/2,y1),d=pos(long/2,short/2,y1),e=pos(-long/2,short/2,y1);
        const r0=pos(-Math.max(0,long/2-short*.55),0,y1+pitch),r1=pos(Math.max(0,long/2-short*.55),0,y1+pitch),rb=batch(slates,cx,cz);
        const face=points=>{for(let i=1;i<points.length-1;i++)triangle(rb,[points[0],points[i],points[i+1]],[points[0],points[i],points[i+1]].map(p=>[p[0]/3,p[2]/3]));};
        face([a,c,r1,r0]);face([c,d,r1]);face([d,e,r0,r1]);face([e,a,r0]);
      }else horizontal([polygon],y1+.03,roof);
    }
    // Individually varied rooftop plant and chimney stacks make the skyline less uniform.
    if(pitched&&Math.hypot(cx,cz)<1300){
      box(cx,5+height+.9,cz,.85,1.8,1.5,masonry);
      box(cx,5+height+1.85,cz,1,.15,1.65,mats.weathered);
      for(const dz of [-.4,.4])cyl(cx,5+height+2.2,cz+dz,.17,.65,terracotta);
    }
    if(!pitched&&area>350&&Math.hypot(cx,cz)<1200){
      const n=Math.min(5,Math.floor(area/500)+1);
      for(let i=0;i<n;i++){
        const x=cx+(hash(id+i*3)-.5)*5,z=cz+(hash(id+i*3+1)-.5)*5;
        if(h>.4){box(x,y1+1.05,z,2+hash(id+i)*2,2,3,mats.roof);box(x,y1+2.1,z,2.2,.12,3.2,mats.weathered);}
        else {box(x,y1+1.2,z,.9,2.4,1.7,masonry);}
      }
    }
    buildingCount++;
  }
  for(let i=0;i<data.trees.length;i++){
    const [x,z]=data.trees[i];
    if((x>-575&&x<-190&&z>-10&&z<210)||Math.hypot(x,z)>1750)continue;
    tree(x,z,9+hash(i+3)*8);treeCount++;
  }
  // Railings and occasional lamps remain tied to real bank segments.
  let walked=0;
  for(const [a,c] of bankSegments){
    const dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz),angle=-Math.atan2(dz,dx),n=Math.ceil(len/7);
    if(len>70)continue;
    for(let i=0;i<n;i++){
      const f=(i+.5)/n,x=a[0]+dx*f,z=a[1]+dz*f;
      box(x,5.95,z,.12,1.25,.12,mats.iron);
      box(x,6.5,z,len/n,.1,.1,mats.iron,angle);
      walked+=len/n;
      if(walked>35){walked=0;lamp(x-dz/len*2,5.3,z+dx/len*2,5.8,true);}
    }
  }
  for(const b of batches.values()){
    if(!b.p.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));
    if(b.mat.vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));
    geometry.setIndex(b.indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,b.mat);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  }
  return {buildings:buildingCount,recordedHeights,walls:wallCount,roads:roadCount,trees:treeCount,source:data.source,majorRoads,nightUniforms:facadeUniforms};
}
