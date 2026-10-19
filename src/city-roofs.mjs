import * as THREE from 'three';
const EPS=1e-7;
const area=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const clean=ring=>ring.filter((p,i)=>!i||Math.hypot(p[0]-ring[i-1][0],p[1]-ring[i-1][1])>EPS).filter((p,i,a)=>i!==a.length-1||Math.hypot(p[0]-a[0][0],p[1]-a[0][1])>EPS);
function ringsOf(polygon){return polygon.map((ring,i)=>{const r=clean(ring);if((area(r)>0)!==(i===0))r.reverse();return r;});}
const convex=p=>p.every((v,i)=>cross(v,p[(i+1)%p.length],p[(i+2)%p.length])>=-EPS);
function clip(subject,boundary){
  let out=subject;const sign=area(boundary)>=0?1:-1;
  for(let i=0;i<boundary.length&&out.length;i++){
    const a=boundary[i],b=boundary[(i+1)%boundary.length],input=out;out=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;
      if(dp>=-EPS)out.push(p);
      if((dp>=-EPS)!==(dq>=-EPS)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
  }
  return clean(out);
}
function triangulated(polygon){
  const rings=ringsOf(polygon),flat=rings.flat();
  return THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p)))).map(t=>t.map(i=>flat[i]));
}
const supported=new Set(['gabled','hipped','mansard','flat_mansard','pyramidal','skillion','shed','gambrel','saltbox','round','butterfly']);

export function roofBuildingHeight(tags,fallbackLevels){
  const height=parseFloat(tags.height);if(Number.isFinite(height))return height;
  const levels=parseFloat(tags['building:levels'])||fallbackLevels,roofHeight=parseFloat(tags['roof:height']),roofLevels=parseFloat(tags['roof:levels']);
  const extra=Number.isFinite(roofHeight)?Math.max(0,roofHeight):Number.isFinite(roofLevels)&&roofLevels>0?roofLevels*3:tags['building:levels']&&supported.has(tags['roof:shape'])?3.2:0;
  return levels*3.55+extra;
}

/** Roof heights are included in total mapped building height. Missing details are estimates. */
export function planRoof(building,height,min=0,seed=.5){
  if(!building.roofRect||building.p.length!==1)return null;
  const t=building.t,tag=t['roof:shape'];
  const inferred=!tag&&building.p[0].length===1&&building.area<900&&height>9&&height<28&&seed>.3;
  if(!supported.has(tag)&&!inferred)return null;
  const shape=inferred?'hipped':tag==='shed'?'skillion':tag;
  const rect=building.roofRect,e0=[rect[1][0]-rect[0][0],rect[1][1]-rect[0][1]],e1=[rect[2][0]-rect[1][0],rect[2][1]-rect[1][1]];
  const axis=Math.hypot(...e0)>=Math.hypot(...e1)?e0:e1,axisLength=Math.hypot(...axis);if(axisLength<.1)return null;
  let u=axis.map(v=>v/axisLength);if(t['roof:orientation']==='across')u=[-u[1],u[0]];
  const v=[-u[1],u[0]],all=building.p[0][0],us=all.map(p=>p[0]*u[0]+p[1]*u[1]),vs=all.map(p=>p[0]*v[0]+p[1]*v[1]);
  const u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs),L=(u1-u0)/2,S=(v1-v0)/2;
  if(Math.min(L,S)<.15)return null;
  const center=[u[0]*(u0+u1)/2+v[0]*(v0+v1)/2,u[1]*(u0+u1)/2+v[1]*(v0+v1)/2];
  const requested=parseFloat(t['roof:height']),roofLevels=parseFloat(t['roof:levels']),angle=parseFloat(t['roof:angle']);
  const bearing=parseFloat(t['roof:direction']),direction=Number.isFinite(bearing)?[Math.sin(bearing*Math.PI/180),-Math.cos(bearing*Math.PI/180)]:v;
  const angleSpan=shape==='skillion'?2*(Math.abs(u[0]*direction[0]+u[1]*direction[1])*L+Math.abs(v[0]*direction[0]+v[1]*direction[1])*S):S;
  const angled=Number.isFinite(angle)&&angle>0&&angle<85?angleSpan*Math.tan(angle*Math.PI/180):NaN;
  const estimated=Number.isFinite(angled)?angled:Number.isFinite(roofLevels)&&roofLevels>0?roofLevels*3:Math.min(3.2,(height-min)*.35);
  const rise=Math.min(Number.isFinite(requested)?Math.max(0,requested):estimated,height-min);
  if(rise<.1)return null;
  const eaves=5+height-rise,top=eaves+rise,faces=[];
  const point=(x,z,y)=>[center[0]+u[0]*x+v[0]*z,y,center[1]+u[1]*x+v[1]*z];
  const ring=(l,s,y)=>[point(-l,-s,y),point(l,-s,y),point(l,s,y),point(-l,s,y)];
  function hip(l,s,y,peak,pyramid=false){const [a,b,c,d]=ring(l,s,y),r=pyramid?0:l>=s?Math.max(0,l-s):l*.35,p=point(-r,0,peak),q=point(r,0,peak);faces.push([a,b,q,p],[b,c,q],[c,d,p,q],[d,a,p]);}
  function profile(p){for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];faces.push([point(-L,a[0],a[1]),point(L,a[0],a[1]),point(L,b[0],b[1]),point(-L,b[0],b[1])]);}}
  if(shape==='gabled'||shape==='saltbox')profile([[-S,eaves],[shape==='saltbox'?-S*.28:0,top],[S,eaves]]);
  else if(shape==='hipped'||shape==='pyramidal')hip(L,S,eaves,top,shape==='pyramidal');
  else if(shape==='mansard'||shape==='flat_mansard'){
    const inset=Math.min(L*.45,S*.33,rise*.45),low=ring(L,S,eaves),highY=shape==='flat_mansard'?top:eaves+rise*.78,high=ring(L-inset,S-inset,highY);
    for(let i=0;i<4;i++)faces.push([low[i],low[(i+1)%4],high[(i+1)%4],high[i]]);
    if(shape==='flat_mansard')faces.push(high);else hip(L-inset,S-inset,highY,top);
  }else if(shape==='gambrel')profile([[-S,eaves],[-S*.55,eaves+rise*.65],[0,top],[S*.55,eaves+rise*.65],[S,eaves]]);
  else if(shape==='round')profile(Array.from({length:13},(_,i)=>[-S*Math.cos(i*Math.PI/12),eaves+rise*Math.sin(i*Math.PI/12)]));
  else if(shape==='butterfly')profile([[-S,top],[0,eaves],[S,top]]);
  else if(shape==='skillion'){
    const corners=ring(L,S,eaves),dots=corners.map(p=>p[0]*direction[0]+p[2]*direction[1]),lo=Math.min(...dots),hi=Math.max(...dots);
    faces.push(corners.map((p,i)=>[p[0],eaves+rise*(hi-dots[i])/(hi-lo),p[2]]));
  }
  const planes=faces.map(points=>{
    points=points.filter((p,i)=>!i||new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...points[i-1]))>EPS);
    let normal=null;for(let i=1;i<points.length-1;i++){const n=new THREE.Vector3().subVectors(new THREE.Vector3(...points[i]),new THREE.Vector3(...points[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[i+1]),new THREE.Vector3(...points[0])));if(n.length()>EPS){normal=n.normalize();break;}}
    if(!normal||Math.abs(normal.y)<EPS)return null;
    const origin=new THREE.Vector3(...points[0]),tangent=new THREE.Vector3(...points[1]).sub(origin).normalize(),bitangent=normal.clone().cross(tangent).normalize();
    const heightAt=p=>origin.y-(normal.x*(p[0]-origin.x)+normal.z*(p[1]-origin.z))/normal.y;
    return {points,polygon:clean(points.map(p=>[p[0],p[2]])),heightAt,uv:p=>{const d=new THREE.Vector3(...p);return [d.dot(tangent)/3,d.dot(bitangent)/3];}};
  }).filter(p=>p&&Math.abs(area(p.polygon))>EPS);
  const heightAt=p=>{for(const plane of planes){const sign=area(plane.polygon)>=0?1:-1;if(plane.polygon.every((a,i)=>cross(a,plane.polygon[(i+1)%plane.polygon.length],p)*sign>=-EPS))return plane.heightAt(p);}return eaves;};
  return {shape,inferred,rise,eaves,top,planes,heightAt};
}

/** Clip roof planes to triangulated footprints, preserving notches and courtyards. */
export function emitRoof(plan,polygon,{roof,wall}){
  const rings=ringsOf(polygon),pieces=rings.length===1&&convex(rings[0])?[rings[0]]:triangulated(rings);
  let triangles=0,gables=0;
  for(const plane of plan.planes)for(const piece of pieces){
    const intersection=clip(piece,plane.polygon);if(intersection.length<3||Math.abs(area(intersection))<EPS)continue;
    for(let i=1;i<intersection.length-1;i++){
      const p=[intersection[0],intersection[i],intersection[i+1]].map(v=>[v[0],plane.heightAt(v),v[1]]);
      if(new THREE.Vector3().subVectors(new THREE.Vector3(...p[1]),new THREE.Vector3(...p[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...p[2]),new THREE.Vector3(...p[0]))).y<0)p.reverse();
      roof(p,p.map(plane.uv));triangles++;
    }
  }
  for(const ring of rings)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),cuts=[0,1];if(length<EPS)continue;
    for(const plane of plan.planes)for(let j=0;j<plane.polygon.length;j++){
      const c=plane.polygon[j],d=plane.polygon[(j+1)%plane.polygon.length],ex=d[0]-c[0],ez=d[1]-c[1],den=dx*ez-dz*ex;if(Math.abs(den)<EPS)continue;
      const t=((c[0]-a[0])*ez-(c[1]-a[1])*ex)/den,s=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den;
      if(t>EPS&&t<1-EPS&&s>=-EPS&&s<=1+EPS)cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);const unique=cuts.filter((t,i)=>!i||t-cuts[i-1]>EPS);
    for(let j=1;j<unique.length;j++){
      const t0=unique[j-1],t1=unique[j],p=[a[0]+dx*t0,a[1]+dz*t0],q=[a[0]+dx*t1,a[1]+dz*t1],h0=plan.heightAt(p),h1=plan.heightAt(q);
      if(Math.max(h0,h1)-plan.eaves<1e-5)continue;
      const verts=[[p[0],plan.eaves,p[1]],[q[0],plan.eaves,q[1]],[q[0],h1,q[1]],[p[0],h0,p[1]]],uv=[[length*t0/3,plan.eaves/3],[length*t1/3,plan.eaves/3],[length*t1/3,h1/3],[length*t0/3,h0/3]];
      for(const order of [[0,2,1],[0,3,2]]){const ps=order.map(i=>verts[i]);if(new THREE.Vector3().subVectors(new THREE.Vector3(...ps[1]),new THREE.Vector3(...ps[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...ps[2]),new THREE.Vector3(...ps[0]))).lengthSq()<EPS)continue;wall(ps,order.map(i=>uv[i]));gables++;}
    }
  }
  return {triangles,gables};
}

/** Exact roof-height range beneath a convex fixture footprint. */
export function roofSurfaceRange(plan,footprint){
  let low=Infinity,high=-Infinity;
  for(const plane of plan.planes)for(const p of clip(footprint,plane.polygon)){const y=plane.heightAt(p);low=Math.min(low,y);high=Math.max(high,y);}
  return Number.isFinite(low)?[low,high]:null;
}

/** Find a supported position with enough clearance for estimated rooftop fixtures. */
export function roofAttachment(polygon,desired,clearance=1){
  const rings=ringsOf(polygon),triangles=triangulated(rings),inside=p=>{
    const inRing=r=>{let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
    return inRing(rings[0])&&!rings.slice(1).some(inRing);
  };
  const candidates=[desired,...triangles.map(t=>[t.reduce((s,p)=>s+p[0],0)/3,t.reduce((s,p)=>s+p[1],0)/3])];
  let chosen=null,best=Infinity;
  for(const p of candidates){
    if(!inside(p))continue;let distance=Infinity;
    for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz,t=len?THREE.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/len,0,1):0;distance=Math.min(distance,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz));}
    const d=Math.hypot(p[0]-desired[0],p[1]-desired[1]);if(distance>=clearance&&d<best){chosen=p;best=d;}
  }
  return chosen;
}
