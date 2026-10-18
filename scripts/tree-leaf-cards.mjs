/** Fit each connected leaf surface to its own textured plane, retaining every leaf. */
export function leafCards(positions,normals,uv,indices){
  const count=positions.length/3,parent=Int32Array.from({length:count},(_,i)=>i);
  const root=x=>{let r=x;while(parent[r]!==r)r=parent[r];while(parent[x]!==x){const n=parent[x];parent[x]=r;x=n;}return r;};
  for(let i=0;i<indices.length;i+=3){const r=root(indices[i]);parent[root(indices[i+1])]=r;parent[root(indices[i+2])]=r;}
  const components=new Map();
  for(let i=0;i<count;i++){
    const r=root(i);let c=components.get(r);
    if(!c){c={n:0,s:new Float64Array(20),min:[Infinity,Infinity],max:[-Infinity,-Infinity]};components.set(r,c);}
    const u=uv[i*2],v=uv[i*2+1],x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2],s=c.s;
    c.n++;s[0]+=u;s[1]+=v;s[2]+=u*u;s[3]+=u*v;s[4]+=v*v;
    for(let k=0;k<3;k++){const p=positions[i*3+k];s[5+k]+=p;s[8+k]+=u*p;s[11+k]+=v*p;s[14+k]+=normals[i*3+k];}
    c.min[0]=Math.min(c.min[0],u);c.min[1]=Math.min(c.min[1],v);c.max[0]=Math.max(c.max[0],u);c.max[1]=Math.max(c.max[1],v);
  }
  const pOut=[],nOut=[],uvOut=[],indexOut=[];
  let cards=0;
  for(const c of components.values()){
    const s=c.s,u=s[0]/c.n,v=s[1]/c.n,uu=s[2]-s[0]*u,vv=s[4]-s[1]*v,uvCov=s[3]-s[0]*v,det=uu*vv-uvCov*uvCov;
    if(det<1e-18)continue;
    const a=[],b=[],center=[];
    for(let k=0;k<3;k++){
      center[k]=s[5+k]/c.n;
      const up=s[8+k]-s[0]*center[k],vp=s[11+k]-s[1]*center[k];
      a[k]=(up*vv-vp*uvCov)/det;b[k]=(vp*uu-up*uvCov)/det;
    }
    const normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...normal);
    if(length<1e-12)continue;
    const sign=normal.reduce((sum,n,k)=>sum+n*s[14+k],0)<0?-1:1;
    const offset=pOut.length/3;
    for(const [cu,cv] of [[c.min[0],c.min[1]],[c.max[0],c.min[1]],[c.max[0],c.max[1]],[c.min[0],c.max[1]]]){
      for(let k=0;k<3;k++){pOut.push(center[k]+a[k]*(cu-u)+b[k]*(cv-v));nOut.push(normal[k]/length*sign);}
      uvOut.push(cu,cv);
    }
    indexOut.push(...(sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]).map(i=>i+offset));cards++;
  }
  return {positions:new Float32Array(pOut),normals:new Float32Array(nOut),uv:new Float32Array(uvOut),indices:new Uint32Array(indexOut),cards,components:components.size};
}
