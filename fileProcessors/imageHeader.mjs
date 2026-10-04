// Inspect geometry before handing compressed bytes to the browser decoder.
// No EXIF or ancillary metadata is copied to output. Reject animated PNG rather
// than silently protecting only one frame of a multi-frame image.
export function inspectImage(buffer,format) {
  const b=new Uint8Array(buffer),v=new DataView(buffer);let width,height;
  if(format==='png'){
    if(b.length<33||![137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))throw new Error('This file is not a valid PNG image.');
    let offset=8,ended=false;
    while(offset+12<=b.length){
      const size=v.getUint32(offset),end=offset+12+size;
      if(end>b.length)throw new Error('The PNG image is incomplete.');
      const type=String.fromCharCode(...b.subarray(offset+4,offset+8));
      if(offset===8){if(type!=='IHDR'||size!==13)throw new Error('Invalid PNG header.');width=v.getUint32(offset+8);height=v.getUint32(offset+12);}
      if(type==='acTL')throw new Error('Animated PNG images are not supported. Select a still PNG or JPEG.');
      if(type==='IEND'){ended=true;break;}offset=end;
    }
    if(!ended)throw new Error('The PNG image is incomplete.');
  } else if(format==='jpeg'){
    if(b.length<4||b[0]!==255||b[1]!==216)throw new Error('This file is not a valid JPEG image.');
    let offset=2;
    while(offset<b.length){
      if(b[offset++]!==255)throw new Error('Invalid JPEG structure.');
      while(b[offset]===255)offset++;
      const marker=b[offset++];if(marker===217||marker===218)break;
      if(offset+2>b.length)throw new Error('The JPEG image is incomplete.');
      const size=v.getUint16(offset);if(size<2||offset+size>b.length)throw new Error('Invalid JPEG segment.');
      // Baseline, extended sequential, and progressive Huffman JPEG only.
      if([192,193,194].includes(marker)){
        if(size<8)throw new Error('Invalid JPEG dimensions.');
        height=v.getUint16(offset+3);width=v.getUint16(offset+5);break;
      }
      offset+=size;
    }
    if(width===undefined)throw new Error('This JPEG encoding is not supported.');
  } else throw new Error('Only PNG, JPG, and JPEG images are supported.');
  IDIAImageLimits.dimensions(width,height);
  return {width,height,pixels:width*height};
}
