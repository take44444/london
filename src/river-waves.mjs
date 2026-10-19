/** Gravity-wave spectrum for sheltered urban water; lengths and heights in metres. */
const bands=[
  {length:7.4,steepness:.022,bearing:20},
  {length:3.1,steepness:.036,bearing:34},
  {length:1.35,steepness:.028,bearing:12},
  {length:.65,steepness:.026,bearing:63},
  {length:.29,steepness:.019,bearing:-24},
  {length:.13,steepness:.012,bearing:41},
];
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
// Independent phases, lengths and headings avoid a repeating set of parallel crests.
export const riverWaves=bands.flatMap((band,i)=>Array.from({length:5},(_,j)=>{
 const seed=i*5+j+1;
 return {length:band.length*(.75+hash(seed)*.57),steepness:band.steepness*1.85/Math.sqrt(5),bearing:band.bearing+(hash(seed+71)-.5)*125,phase:hash(seed+131)*Math.PI*2};
}));
const f=n=>n.toFixed(9);
export const riverWaveInfo={bands:bands.length,components:riverWaves.length,wavelengths:bands.map(w=>w.length),rmsSlope:Math.sqrt(riverWaves.reduce((sum,w)=>sum+w.steepness**2/2,0)),rmsHeight:Math.sqrt(riverWaves.reduce((sum,w)=>sum+(w.steepness*w.length/(2*Math.PI))**2/2,0)),maximumHeight:riverWaves.reduce((sum,w)=>sum+w.steepness*w.length/(2*Math.PI),0),pixelFiltering:true};
export function riverWaveGLSL(){return riverWaves.map(w=>{
 const angle=w.bearing*Math.PI/180,k=2*Math.PI/w.length;
 return `{
   vec2 direction=vec2(${f(Math.sin(angle))},${f(Math.cos(angle))});
   float phase=dot(p,direction)*${f(k)}-time*${f(Math.sqrt(9.81*k))}+${f(w.phase)};
   float resolved=1.-smoothstep(${f(w.length*.12)},${f(w.length*.45)},footprint);
   slope+=direction*sin(phase)*${f(w.steepness)}*resolved;
   riverVariance+=${f(w.steepness**2*.5)}*(1.-resolved*resolved);
 }`;
}).join('\n');}
