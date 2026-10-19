import * as THREE from 'three';
import {roadWidth,offsetStreet,weatherGround} from './streets.mjs';
import {planRoof,emitRoof,roofAttachment,roofBuildingHeight,roofSurfaceRange} from './city-roofs.mjs';
import {buildingColours,colourRoofSurface} from './building-colours.mjs';
import {mappedSurface,emitCurtainWall,curtainMaterial,replacedEnvelopes} from './building-surfaces.mjs';
import {createFacadeMaterial} from './facade-material.mjs';
import {emitFacade,facadeAtlases} from './facades.mjs';

const TAU=Math.PI*2;
const signedArea=ring=>ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
const numeric=(value,fallback)=>{const n=parseFloat(value);return Number.isFinite(n)?n:fallback;};
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

/** Render the bundled OSM extract in metres, preserving courtyard holes and street curves. */
export function buildMapCity(scene,data,textures,helpers){
  const {box,cyl,tree,lamp,mats,streetData}=helpers;
  const batches=new Map(),facadeBatches=new Map(),facadeUniforms=[],facadeLODs=[];
  let recessedWindows=0,detailedFrontages=0,glassBuildings=0,recessedGlassPanes=0,mappedMaterials=0,partEnvelopes=0,mappedWallColours=0,mappedRoofColours=0;
  let buildingCount=0,wallCount=0,roadCount=0,treeCount=0,recordedHeights=0;
  const roofShapes={};let mappedRoofs=0,roofGables=0,supportedFixtures=0;
  const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.92,side:THREE.DoubleSide,...options});
  const surface=(name,color,size)=>{
    const tex=textures[name];
    const m=material(color,{map:tex?.color,normalMap:tex?.normal,normalScale:new THREE.Vector2(.25,.25),roughnessMap:tex?.roughness});
    m.userData.tileSize=size;return m;
  };
  const pavement=weatherGround(surface('paving','#deddd5',2.2));
  const asphalt=weatherGround(surface('asphalt','#a1a3a2',5),true);
  const land=weatherGround(surface('paving','#cccac1',2.2));
  const kerb=weatherGround(surface('plaster','#c9c9c1',1.2));
  const paint=material('#e1ded0',{roughness:.87});
  let kerbs=0;
  const grass=material('#89967a',{map:textures.grass,normalMap:textures.grassNormal,normalScale:new THREE.Vector2(.4,.4),roughnessMap:textures.grassRoughness});grass.userData.tileSize=5;
  const masonry=surface('brick','#c9b79c',4),terracotta=material('#99634b');
  const roof=colourRoofSurface(surface('asphalt','#ffffff',7),.10982);
  const slates=colourRoofSurface(surface('roof','#ffffff',3),.25646);
  const gableBrick=colourRoofSurface(surface('brick','#ffffff',3),.1117787);
  const gableStone=colourRoofSurface(surface('plaster','#ffffff',3),.2585658);
  const facades=[makeFacade(textures.facade,facadeAtlases.stone),makeFacade(textures.brickFacade||textures.facade,facadeAtlases.brick),makeFacade(textures.facade,facadeAtlases.stone),makeFacade(textures.brickFacade||textures.facade,facadeAtlases.brick)];
  const glazing=curtainMaterial();facadeUniforms.push(glazing.userData.night);
  function makeFacade(map,atlas){const m=createFacadeMaterial(map,atlas);facadeUniforms.push(m.userData.night);return m;}
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
  const emptyBatch=mat=>({mat,p:[],uv:[],color:[],indices:[]});
  function facadeBatch(mat,x,z){
    const ix=Math.floor(x/220),iz=Math.floor(z/220),key=mat.uuid+':'+ix+':'+iz;
    if(!facadeBatches.has(key))facadeBatches.set(key,{mat,x:(ix+.5)*220,z:(iz+.5)*220,coarse:emptyBatch(mat),fine:emptyBatch(mat),hasDetails:false});
    return facadeBatches.get(key);
  }
  function cleaned(ring,clockwise=false){
    let p=ring.filter((point,i)=>!i||Math.hypot(point[0]-ring[i-1][0],point[1]-ring[i-1][1])>.03);
    if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.1)p=p.slice(0,-1);
    if((signedArea(p)<0)!==clockwise)p.reverse();
    return p;
  }
  function horizontal(polygons,y,mat,color=[1,1,1]){
    for(const rings of polygons){
      const outer=cleaned(rings[0]);if(outer.length<3)continue;
      const holes=rings.slice(1).map(r=>cleaned(r,true)).filter(r=>r.length>2);
      const flat=[outer,...holes].flat(),cx=outer.reduce((s,p)=>s+p[0],0)/outer.length,cz=outer.reduce((s,p)=>s+p[1],0)/outer.length;
      const b=batch(mat,cx,cz),tile=mat.userData.tileSize||4;
      const tris=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(...p)),holes.map(r=>r.map(p=>new THREE.Vector2(...p))));
      for(const tri of tris){const p=tri.map(i=>flat[i]);triangle(b,[p[0],p[2],p[1]].map(a=>[a[0],y,a[1]]),[p[0],p[2],p[1]].map(a=>[a[0]/tile,a[1]/tile]),color);}
    }
  }
  horizontal(data.ground,5,land);
  if(!helpers.hasRegion)horizontal([[[[-6500,-6500],[6500,-6500],[6500,6500],[-6500,6500]],[[-2300,-2300],[-2300,2300],[2300,2300],[2300,-2300]]]],4.97,land);
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
    const left=offsetStreet(points,width/2),right=offsetStreet(points,-width/2);
    const edges=points.map((p,i)=>{const pointY=typeof y==='function'?y(p):y;return [[left[i][0],pointY,left[i][1]],[right[i][0],pointY,right[i][1]]];});
    for(let i=1;i<points.length;i++){
      const next=length+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
      quad(b,[edges[i-1][0],edges[i][0],edges[i][1],edges[i-1][1]],[[0,length/tile],[0,next/tile],[width/tile,next/tile],[width/tile,length/tile]]);
      length=next;
    }
  }
  const majorRoads=[];
  if(streetData){
    horizontal(streetData.pavement,5.30,pavement);
    for(const ring of streetData.kerbRings)for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/1.2);
      if(length<.025)continue;
      for(let j=0;j<count;j++){
        const t=(j+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t;
        if(Math.hypot(x,z)>850)continue;
        box(x,5.23,z,Math.max(.02,length/count-.012),.14,.2,kerb,-Math.atan2(dz,dx));kerbs++;
      }
    }
  }
  for(let roadId=0;roadId<data.roads.length;roadId++){
    const road=data.roads[roadId];
    const t=road.t,kind=t.highway;
    if(road.p.length<2||Math.hypot(...road.p[Math.floor(road.p.length/2)])>2050)continue;
    const {pedestrian,width}=roadWidth(t);
    const bridge=t.bridge==='yes';
    // Westminster's detailed green bridge is rendered separately.
    if(bridge&&t.name==='Westminster Bridge')continue;
    const elevation=bridge?11.1:5.16;
    if(!pedestrian){if(!streetData||bridge)ribbon(road.p,width+3.6,pavement,elevation-.03);majorRoads.push(road);}
    if(!pedestrian||!streetData||bridge)ribbon(road.p,width,pedestrian?pavement:asphalt,pedestrian?elevation+.14:elevation);roadCount++;
    if(!pedestrian&&!bridge&&['primary','secondary','tertiary','trunk'].includes(kind)&&Math.hypot(...road.p[0])<1250){
      let walked=0;
      for(let i=1;i<road.p.length;i++){
        const a=road.p[i-1],c=road.p[i],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
        if(len<.5)continue;
        for(let d=8-walked;d<len;d+=8){const f=(d+1.5)/len;if(f>1)continue;box(a[0]+dx*f,elevation+.022,a[1]+dz*f,2.8,.014,.13,paint,-Math.atan2(dz,dx));}
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
  const abbeyFootprint=data.buildings.find(b=>b.t.name==='Westminster Abbey')?.p||[];
  const inRing=(x,z,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
  const inAbbey=(x,z)=>abbeyFootprint.some(poly=>inRing(x,z,poly[0])&&!poly.slice(1).some(hole=>inRing(x,z,hole)));
  const insideLandmark=(x,z)=>(x>-210&&x< -30&&z>-100&&z<280)||inAbbey(x,z)||(x>195&&x<250&&z>-430&&z< -260);
  const replaced=replacedEnvelopes(data.buildings);
  for(const building of data.buildings){
    if(helpers.excludedBuildings?.has(building.id))continue;
    const [cx,cz]=building.c,t=building.t;
    if(insideLandmark(cx,cz)||Math.hypot(cx,cz)>1950||t.building==='roof'||t.building==='construction')continue;
    if((/Elizabeth Tower|Palace of Westminster|London Eye/.test(t.name||'')||t.name==='Westminster Abbey'))continue;
    if(replaced.has(building.id)){partEnvelopes++;continue;}
    const id=Number(building.id.slice(1)),h=hash(id),area=building.area;
    const hasHeight=Number.isFinite(parseFloat(t.height))||Number.isFinite(parseFloat(t['building:levels']));
    if(hasHeight)recordedHeights++;
    const levels=numeric(t['building:levels'],['garage','garages','shed','greenhouse'].includes(t.building)?1:area<85?3:area>1500?6:4);
    const min=numeric(t.min_height,numeric(t['building:min_level'],0)*3.55);
    const height=THREE.MathUtils.clamp(roofBuildingHeight(t,levels),2.5,190);
    if(height<=min+.5)continue;
    const roofPlan=planRoof(building,height,min,h),pitched=!!roofPlan;
    const pitch=roofPlan?.rise||0;
    if(roofPlan){roofShapes[roofPlan.shape]=(roofShapes[roofPlan.shape]||0)+1;if(!roofPlan.inferred)mappedRoofs++;}
    const mappedLevels=numeric(t['building:levels'],0);
    const type=mappedSurface(t,t.name==='County Hall'?0:Math.floor(h*facades.length));
    if(t['building:material'])mappedMaterials++;if(type==='glass')glassBuildings++;
    const colours=buildingColours(t,type,id),color=colours.wall;
    if(colours.wallMapped)mappedWallColours++;if(colours.roofMapped)mappedRoofColours++;
    const y0=5+min,y1=5+height-pitch,mat=type==='glass'?glazing:facades[type==='brick'?1:h>.5?0:2];
    const riverDistance=data.riverPath?Math.min(...data.riverPath.map(p=>Math.hypot(cx-p[0],cz-p[1]))):Math.abs(cx);
    const detail=Math.hypot(cx,cz)<800&&(riverDistance<280||type==='glass')&&height<90;
    const fb=facadeBatch(mat,cx,cz);
    const floors=Math.max(1,Math.round(mappedLevels?mappedLevels-numeric(t['building:min_level'],min/3.55):((height-pitch-min)/3.55)));
    for(const polygon of building.p){
      const rings=polygon.map((r,i)=>cleaned(r,i>0));
      if(y1>y0+.01)for(const ring of rings){
        if(ring.length<3)continue;
        for(let i=0;i<ring.length;i++){
          const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);
          if(len<.08)continue;
          const detailed=detail&&len>=2.5&&len<160;
          if(type==='glass'){
            const storeyHeight=THREE.MathUtils.clamp(height/(mappedLevels||Math.max(1,Math.round(height/3.55))),2.5,5);
            const args={a,c,bottom:y0,top:y1,storeyHeight,color,seed:id,quad};
            const panes=emitCurtainWall({...args,coarse:fb.coarse,fine:detailed?fb.fine:null});
            if(detailed){recessedGlassPanes+=panes;fb.hasDetails=true;}else emitCurtainWall({...args,coarse:fb.fine});
            wallCount++;continue;
          }
          const count=emitFacade({a,c,bottom:y0,top:y1,floors,bays:Math.max(1,Math.round(len/3.25)),seed:id,atlas:mat.userData.atlas,color,coarse:fb.coarse,fine:detailed?fb.fine:null,quad});
          if(!detailed){
            // Keep identical flat geometry in fine tiles for walls too small to recess.
            emitFacade({a,c,bottom:y0,top:y1,floors,bays:Math.max(1,Math.round(len/3.25)),seed:id,atlas:mat.userData.atlas,color,coarse:fb.fine,quad});
          }else {recessedWindows+=count;detailedFrontages++;fb.hasDetails=true;}
          wallCount++;
          // Low relief cornices break up the silhouettes without flattening the footprints.
          if(len>3&&Math.hypot(cx,cz)<850){
            const angle=-Math.atan2(c[1]-a[1],c[0]-a[0]);
            box((a[0]+c[0])/2,y1+.14,(a[1]+c[1])/2,len+.2,.35,.42,mats.trim,angle);
            if(height>10)box((a[0]+c[0])/2,9.2,(a[1]+c[1])/2,len,.2,.24,mats.trim,angle);
          }
        }
      }
      if(type==='glass'&&min>0)horizontal([polygon],y0,roof,colours.roof);
      if(roofPlan){
        const rb=batch(t['roof:material']==='glass'?glazing:slates,cx,cz),gb=batch(type==='glass'?glazing:type==='brick'?gableBrick:gableStone,cx,cz);
        const emitted=emitRoof(roofPlan,polygon,{roof:(p,uv)=>triangle(rb,p,uv,colours.roof),wall:(p,uv)=>triangle(gb,p,uv,colours.wall)});roofGables+=emitted.gables;
      }else horizontal([polygon],y1+.03,t['roof:material']==='glass'?glazing:roof,colours.roof);
    }
    // Estimated fixtures sit on valid roof area rather than the polygon centroid.
    if(pitched&&type!=='glass'&&height<45&&!['pyramidal','round','skillion','butterfly'].includes(roofPlan.shape)&&Math.hypot(cx,cz)<1300){
      const support=roofAttachment(building.p[0],[cx,cz],1.05);
      if(support){
        const [x,z]=support,range=roofSurfaceRange(roofPlan,[[-.425,-.75],[.425,-.75],[.425,.75],[-.425,.75]].map(([dx,dz])=>[x+dx,z+dz]));
        const bottom=range[0]-.2,top=range[1]+1.7;
        box(x,(bottom+top)/2,z,.85,top-bottom,1.5,masonry);box(x,top+.075,z,1,.15,1.65,mats.weathered);
        for(const dz of [-.4,.4])cyl(x,top+.4,z+dz,.17,.65,terracotta);supportedFixtures++;
      }
    }
    if(!pitched&&area>350&&Math.hypot(cx,cz)<1200){
      const n=Math.min(5,Math.floor(area/500)+1),used=[];
      for(let i=0;i<n;i++){
        const desired=[cx+(hash(id+i*3)-.5)*5,cz+(hash(id+i*3+1)-.5)*5];
        const support=building.p.map(p=>roofAttachment(p,desired,h>.4?2.6:1.05)).find(Boolean);
        if(!support||used.some(p=>Math.hypot(p[0]-support[0],p[1]-support[1])<5.2))continue;
        used.push(support);const [x,z]=support;
        if(h>.4){box(x,y1+1.05,z,2+hash(id+i)*2,2,3,mats.roof);box(x,y1+2.1,z,2.2,.12,3.2,mats.weathered);}
        else box(x,y1+1.2,z,.9,2.4,1.7,masonry);supportedFixtures++;
      }
    }
    buildingCount++;
  }
  for(let i=0;i<data.trees.length;i++){
    const [x,z]=data.trees[i];
    if(inAbbey(x,z)||Math.hypot(x,z)>1750)continue;
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
  function meshFor(b){
    if(!b.p.length)return null;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));
    if(b.mat.vertexColors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));
    geometry.setIndex(b.indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,b.mat);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  }
  for(const b of batches.values()){const mesh=meshFor(b);if(mesh)scene.add(mesh);}
  for(const b of facadeBatches.values()){
    const far=meshFor(b.coarse);if(!far)continue;
    if(!b.hasDetails){scene.add(far);continue;}
    const near=meshFor(b.fine);if(!near)continue;
    const lod=new THREE.LOD();lod.position.set(b.x,20,b.z);
    near.position.set(-b.x,-20,-b.z);far.position.copy(near.position);
    lod.addLevel(near,0);lod.addLevel(far,620,.12);scene.add(lod);facadeLODs.push(lod);
  }
  return {buildings:buildingCount,recordedHeights,walls:wallCount,roads:roadCount,trees:treeCount,source:data.source,kerbs,glassBuildings,recessedGlassPanes,mappedMaterials,partEnvelopes,mappedWallColours,mappedRoofColours,roofShapes,mappedRoofs,roofGables,supportedFixtures,majorRoads,nightUniforms:facadeUniforms,recessedWindows,detailedFrontages,facadeLODs};
}
