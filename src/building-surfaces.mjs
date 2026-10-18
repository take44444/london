import * as THREE from 'three';

/** Respect explicit mapped wall materials before applying a fallback. */
export function mappedSurface(tags,fallback=0){
  const value=(tags['building:material']||'').toLowerCase();
  if(value.split(';').includes('glass'))return 'glass';
  if(/brick/.test(value))return 'brick';
  if(/stone|sandstone|plaster|concrete|metal|tiles/.test(value))return 'stone';
  return fallback===1?'brick':'stone';
}

/** A whole curtain-wall elevation. Fine panes sit behind continuous mullions. */
export function emitCurtainWall({a,c,bottom,top,storeyHeight,color,seed=0,coarse,fine,quad}){
  const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length<.08||top<=bottom)return 0;
  const nx=dz/length,nz=-dx/length,bays=Math.max(1,Math.round(length/1.5)),bayWidth=length/bays;
  const point=(s,y,d=0)=>[a[0]+dx*s/length-nx*d,y,a[1]+dz*s/length-nz*d];
  const uv=(s,y)=>[s/bayWidth+seed%97,(y-5)/storeyHeight];
  const patch=(target,l,r,lo,hi,d=0)=>{if(r<=l||hi<=lo)return;const pairs=[[l,lo],[r,lo],[r,hi],[l,hi]];quad(target,pairs.map(([s,y])=>point(s,y,d)),pairs.map(([s,y])=>uv(s,y)),color);};
  patch(coarse,0,length,bottom,top);
  if(!fine)return 0;
  let panes=0;
  const first=Math.floor((bottom-5)/storeyHeight),last=Math.ceil((top-5)/storeyHeight);
  for(let floor=first;floor<last;floor++)for(let bay=0;bay<bays;bay++){
    const floorBottom=5+floor*storeyHeight,floorTop=floorBottom+storeyHeight;
    const x0=bay*bayWidth,x1=x0+bayWidth,l=x0+.045,r=x1-.045;
    const b=Math.max(bottom,floorBottom+.12),t=Math.min(top,floorTop-.12),lo=Math.max(bottom,floorBottom),hi=Math.min(top,floorTop);
    if(t<=b){patch(fine,x0,x1,lo,hi);continue;}
    patch(fine,x0,l,lo,hi);patch(fine,r,x1,lo,hi);patch(fine,l,r,lo,b);patch(fine,l,r,t,hi);
    patch(fine,l,r,b,t,.10);
    const reveal=coords=>quad(fine,coords.map(([s,y,d])=>point(s,y,d)),coords.map(([s,y])=>uv(s,y)),color);
    reveal([[l,b,0],[l,b,.1],[l,t,.1],[l,t,0]]);reveal([[r,b,.1],[r,b,0],[r,t,0],[r,t,.1]]);
    reveal([[l,b,0],[r,b,0],[r,b,.1],[l,b,.1]]);reveal([[l,t,.1],[r,t,.1],[r,t,0],[l,t,0]]);panes++;
  }
  return panes;
}

/** Opaque backing represents unmodelled rooms; the outer pane remains dielectric. */
export function curtainMaterial(){
  const night={value:0};
  const material=new THREE.MeshPhysicalMaterial({color:'#ffffff',roughness:.18,metalness:0,ior:1.5,envMapIntensity:1.8,vertexColors:true,side:THREE.DoubleSide});
  material.userData.night=night;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uCurtainNight=night;
    shader.vertexShader='varying vec2 vCurtainUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCurtainUv=uv;');
    shader.fragmentShader=`varying vec2 vCurtainUv;uniform float uCurtainNight;
      float curtainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      \n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 curtainCell=floor(vCurtainUv),curtainFraction=fract(vCurtainUv);
      vec2 curtainEdge=min(curtainFraction,1.-curtainFraction),curtainAA=max(fwidth(vCurtainUv),vec2(.0001));
      vec2 curtainPane=smoothstep(vec2(.025,.034)-curtainAA,vec2(.025,.034)+curtainAA,curtainEdge);
      float curtainGlass=curtainPane.x*curtainPane.y;
      float curtainRandom=curtainHash(curtainCell+floor(vColor.rg*64.));
      float curtainSpandrel=1.-smoothstep(.17-curtainAA.y,.17+curtainAA.y,curtainFraction.y);
      vec3 roomBacking=mix(vec3(.035,.055,.062),vec3(.095,.12,.13),curtainRandom);
      roomBacking*=mix(1.,.4,curtainSpandrel);
      diffuseColor.rgb*=mix(vec3(.31,.34,.35),roomBacking,curtainGlass);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(.5,.13+curtainRandom*.1,curtainGlass);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>\nmetalnessFactor=mix(.62,0.,curtainGlass);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float curtainOccupied=step(.76,curtainRandom)*(1.-curtainSpandrel)*curtainGlass;
      totalEmissiveRadiance+=vec3(1.,.67,.35)*uCurtainNight*curtainOccupied*.42;`);
  };
  material.customProgramCacheKey=()=> 'mapped-curtain-wall-v1';return material;
}

/** Suppress explicit 2D envelopes only when mapped parts cover their height. */
export function replacedEnvelopes(buildings){
  const parts=buildings.filter(b=>b.t['building:part']&&b.t['building:part']!=='no'),replaced=new Set();
  const inRing=(p,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
  for(const parent of buildings){
    if(parent.t['building:part']!=='no')continue;
    const height=parseFloat(parent.t.height);if(!Number.isFinite(height))continue;
    const ranges=parts.filter(b=>b.area<=parent.area*1.03&&parent.p.some(poly=>inRing(b.c,poly[0])&&!poly.slice(1).some(h=>inRing(b.c,h)))).map(b=>[parseFloat(b.t.min_height)||0,parseFloat(b.t.height)]).filter(r=>Number.isFinite(r[1])&&r[1]>r[0]).sort((a,b)=>a[0]-b[0]);
    let covered=parseFloat(parent.t.min_height)||0;
    for(const [bottom,top] of ranges){if(bottom>covered+.75)break;covered=Math.max(covered,top);}
    if(covered>=height-.5)replaced.add(parent.id);
  }
  return replaced;
}
