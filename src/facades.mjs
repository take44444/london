// Pixel bounds in the bundled architectural atlases. Portland's fourth row is
// cropped in the source image, so only its three complete storeys are sampled.
export const facadeAtlases={
  stone:{width:1254,height:1254,rows:[0,337,683,1036],columns:[[96,222],[412,536],[723,846],[1032,1159]],windows:[[65,277],[399,617],[746,970]]},
  brick:{width:1322,height:1190,rows:[0,293,592,891,1190],columns:[[116,225],[446,556],[769,882],[1098,1211]],windows:[[66,235],[365,537],[667,838],[970,1134]]},
};

/** Emit one complete wall, with the same atlas layout at both detail levels.
 * `quad` uses the city's outward-facing winding: 0,2,1 and 0,3,2.
 * Positive depth points into the building, including courtyard walls.
 */
export function emitFacade({a,c,bottom,top,floors,bays,seed,atlas,color,coarse,fine,quad}){
  const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
  if(length<.08||top<=bottom)return 0;
  const tx=dx/length,tz=dz/length,nx=tz,nz=-tx;
  const bayWidth=length/bays,floorHeight=(top-bottom)/floors;
  // Integer texture repeats retain the photographed layout while giving each
  // building a night-occupancy seed independent of its wall paint.
  const firstColumn=((seed%4)+4)%4+4*((seed%251+251)%251);
  const rows=atlas.windows.length;
  const point=(s,y,depth=0)=>[a[0]+tx*s-nx*depth,y,a[1]+tz*s-nz*depth];
  let windows=0;
  for(let floor=0;floor<floors;floor++){
    const row=(rows-1-floor%rows),pixelTop=atlas.rows[row],pixelBottom=atlas.rows[row+1];
    const y0=bottom+floor*floorHeight,y1=y0+floorHeight;
    const v0=1-pixelBottom/atlas.height,v1=1-pixelTop/atlas.height;
    // A small storey tint also seeds night occupancy independently per floor.
    const tint=color.map(v=>v*(1-.012*((floor*7+seed)%5)));
    quad(coarse,[point(0,y0),point(length,y0),point(length,y1),point(0,y1)],[[firstColumn/4,v0],[(firstColumn+bays)/4,v0],[(firstColumn+bays)/4,v1],[firstColumn/4,v1]],tint);
    if(!fine)continue;
    for(let bay=0;bay<bays;bay++){
      const column=(firstColumn+bay)%4,u0=(firstColumn+bay)/4;
      const s0=bay*bayWidth,s1=s0+bayWidth;
      const uv=(s,y)=>[u0+(s-s0)/bayWidth/4,v0+(y-y0)/floorHeight*(v1-v0)];
      const [px0,px1]=atlas.columns[column], [py0,py1]=atlas.windows[row];
      const x0=s0+(px0/atlas.width-column/4)*4*bayWidth;
      const x1=s0+(px1/atlas.width-column/4)*4*bayWidth;
      const b=y0+(pixelBottom-py1)/(pixelBottom-pixelTop)*floorHeight;
      const t=y0+(pixelBottom-py0)/(pixelBottom-pixelTop)*floorHeight;
      const rectangle=(l,r,lo,hi,depth=0)=>{
        const pairs=[[l,lo],[r,lo],[r,hi],[l,hi]];
        quad(fine,pairs.map(([s,y])=>point(s,y,depth)),pairs.map(([s,y])=>uv(s,y)),tint);
      };
      // Four masonry strips leave a real opening; no full wall sits behind it.
      rectangle(s0,x0,y0,y1);rectangle(x1,s1,y0,y1);
      rectangle(x0,x1,y0,b);rectangle(x0,x1,t,y1);
      const depth=Math.min(.26,bayWidth*.075);
      rectangle(x0,x1,b,t,depth);
      const reveal=(coords)=>quad(fine,coords.map(([s,y,d])=>point(s,y,d)),coords.map(([s,y])=>uv(s,y)),tint.map(v=>v*.83));
      reveal([[x0,b,0],[x0,b,depth],[x0,t,depth],[x0,t,0]]);
      reveal([[x1,b,depth],[x1,b,0],[x1,t,0],[x1,t,depth]]);
      reveal([[x0,b,0],[x1,b,0],[x1,b,depth],[x0,b,depth]]);
      reveal([[x0,t,depth],[x1,t,depth],[x1,t,0],[x0,t,0]]);
      // The sill projects beyond the masonry, catches sunlight and casts a shadow.
      const sill=(coords)=>quad(fine,coords.map(([s,y,d])=>point(s,y,d)),coords.map(([s,y])=>uv(s,Math.min(y,b-.015))),tint);
      const left=x0-.07,right=x1+.07,low=b-.16,high=b-.035;
      sill([[left,high,-.16],[right,high,-.16],[right,high,.02],[left,high,.02]]);
      sill([[left,low,-.16],[right,low,-.16],[right,high,-.16],[left,high,-.16]]);
      sill([[left,low,.02],[left,low,-.16],[left,high,-.16],[left,high,.02]]);
      sill([[right,low,-.16],[right,low,.02],[right,high,.02],[right,high,-.16]]);
      windows++;
    }
  }
  return windows;
}

/** Exact window mask shared by the near geometry and distant flat frontages. */
export function windowMaskGLSL(atlas){
  const n=value=>Number(value).toFixed(7);
  const lines=[];
  for(let row=0;row<atlas.windows.length;row++)for(let col=0;col<4;col++){
    const [x0,x1]=atlas.columns[col],[y0,y1]=atlas.windows[row];
    lines.push(`windowMask=max(windowMask,cityPane(atlasUv,vec4(${n(x0/atlas.width)},${n(1-y1/atlas.height)},${n(x1/atlas.width)},${n(1-y0/atlas.height)}),atlasEdge));`);
  }
  return lines.join('\n');
}
