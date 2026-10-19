/** Encode top-to-bottom linear RGBA radiance as standard scanline-RLE RGBE. */
export function encodeReflectionHDR(pixels,width,height){
 const bytes=new Uint8Array(width*height*4);
 for(let i=0;i<pixels.length;i+=4){const maximum=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(maximum<1e-30)continue;const exponent=Math.floor(Math.log2(maximum))+1,scale=256/Math.pow(2,exponent);for(let j=0;j<3;j++)bytes[i+j]=Math.min(255,Math.max(0,Math.round(pixels[i+j]*scale)));bytes[i+3]=exponent+128;}
 return encodeReflectionRGBE(bytes,width,height);
}

/** RGBE scanlines may come bottom-up from WebGL readback. */
export function encodeReflectionRGBE(bytes,width,height,bottomUp=false){
 const parts=[Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y '+height+' +X '+width+'\n')];
 for(let rowIndex=0;rowIndex<height;rowIndex++){const y=bottomUp?height-1-rowIndex:rowIndex;parts.push(Buffer.from([2,2,width>>8,width&255]));for(let channel=0;channel<4;channel++){const row=Uint8Array.from({length:width},(_,x)=>bytes[(y*width+x)*4+channel]);for(let x=0;x<width;){let run=1;while(x+run<width&&run<127&&row[x+run]===row[x])run++;if(run>=4){parts.push(Buffer.from([128+run,row[x]]));x+=run;}else{const start=x;x+=run;while(x<width&&x-start<128){let next=1;while(x+next<width&&next<4&&row[x+next]===row[x])next++;if(next>=4)break;x++;}const end=Math.min(x,start+128);parts.push(Buffer.from([end-start]),Buffer.from(row.subarray(start,end)));x=end;}}}}
 return Buffer.concat(parts);
}
