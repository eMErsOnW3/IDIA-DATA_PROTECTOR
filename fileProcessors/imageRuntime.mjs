// Pixels and OCR stay in an extension-origin frame, isolated from the host site.
import {createOcrExtractor} from './pdfOcrExtractor.js';
import {mapFindings,selectedFindings} from './rasterFindings.mjs';
import {inspectImage} from './imageHeader.mjs';
const P=IDIAImageLimits;
class LocalError extends Error {}
let source,plan,snapshot,ocr,canvas,bitmap,disposed=false,reportProgress=()=>{};
function stop(message){throw new LocalError(message);}
function active(){if(disposed)stop('Image protection was cancelled.');}
function releasePixels(){bitmap?.close();bitmap=null;if(canvas)canvas.width=canvas.height=1;canvas=null;}
function dispose(){disposed=true;ocr?.dispose();ocr=null;releasePixels();source=plan=snapshot=null;}
function inspect(buffer,format){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>P.hard.file)stop('This image exceeds the hard file-size limit of 25 MiB.');
  let geometry;try{geometry=inspectImage(buffer,format);}catch(error){stop(error.message);}
  const fileBytes=buffer.byteLength,mime=format==='png'?'image/png':'image/jpeg';
  source=new Blob([buffer],{type:mime});
  plan={...geometry,fileBytes,mime,format,requiresConfirmation:fileBytes>P.soft.file||geometry.pixels>P.soft.pixels,
    title:'Large image',description:`${geometry.width} × ${geometry.height} pixels (${(geometry.pixels/1e6).toFixed(1)} megapixels)\n${(fileBytes/1048576).toFixed(1)} MiB\n\nLocal OCR may take longer on this image. Continue only when you are ready to wait.`};
  return plan;
}
async function decode(){
  active();
  // Apply EXIF orientation once. OCR and output share these upright pixel axes.
  const decoded=await createImageBitmap(source,{imageOrientation:'from-image'});
  if(disposed){decoded.close();active();}bitmap=decoded;
  try{P.dimensions(bitmap.width,bitmap.height);}catch(error){stop(error.message);}
  if(!((bitmap.width===plan.width&&bitmap.height===plan.height)||(bitmap.width===plan.height&&bitmap.height===plan.width)))stop('Image geometry could not be verified.');
  canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d',{alpha:false});if(!context)stop('This image could not be rendered locally.');
  // Flatten transparent content consistently for recognition and output. Fresh
  // encoding carries no source EXIF/GPS, thumbnails, comments, or hidden RGB data.
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0);
  bitmap.close();bitmap=null;return context;
}
async function prepare(confirmed){
  if(!plan||snapshot)stop('The image inspection is no longer active.');
  if(plan.requiresConfirmation&&confirmed!==true)stop('Continue Scanning must be confirmed before processing this image.');
  const started=performance.now();let groups,quality,width,height;
  try{
    await decode();width=canvas.width;height=canvas.height;
    const pixels={width,height,convertToPdfPoint:(x,y)=>[x,y],convertToViewportPoint:(x,y)=>[x,y]};
    ocr=createOcrExtractor({timeoutMs:P.time.ocr});
    reportProgress({message:'Scanning image locally…',fraction:0});
    ({groups,quality}=await ocr.recognize(canvas,pixels,pixels,fraction=>reportProgress({message:'Scanning image locally…',fraction})));
    active();
  } catch(error){if(error instanceof LocalError)throw error;stop('Local image OCR failed. The original selection was not released. Cancel and try again.');}
  finally{ocr?.dispose();ocr=null;releasePixels();}
  if(groups.reduce((n,g)=>n+g.text.length,0)>P.hard.characters)stop('This image has too much recognized text to review safely.');
  // Real fixture verification found a high-confidence OCR word box omitting
  // the first ID digit. Word confidence cannot prove box coverage. Until glyph
  // bounds can be independently verified, images use the complete logical line.
  const findings=mapFindings(groups,{prefix:'image',source:'ocr',quality,wholeLine:true,
    sourceHint:`OCR · complete line${quality.reliable?'':' · low confidence'}`});
  if(findings.length>P.hard.findings)stop('This image has too many findings for one review (limit 2000).');
  snapshot={pages:[{groups}],byId:new Map(findings.map(f=>[f.id,f])),width,height};
  return {findings,quality,metrics:{scanMilliseconds:Math.round(performance.now()-started),pixels:width*height},
    warning:quality.reliable?'':'IDIA could not reliably scan this image. Sensitive information may still be present.'};
}
async function build(ids){
  active();const selected=selectedFindings(snapshot,ids);
  try{
    reportProgress({message:'Creating protected image…',fraction:0});const context=await decode();active();
    if(canvas.width!==snapshot.width||canvas.height!==snapshot.height)stop('The image geometry changed. Cancel and select the file again.');
    context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.fillStyle='#000000';
    for(const finding of selected)for(const box of finding.boxes){
      // Snap JPEG rectangles outwards to 8-pixel DCT blocks to keep compression
      // from mixing source glyph pixels across the black rectangle boundary.
      const step=plan.format==='jpeg'?8:1,x=Math.floor(box.x/step)*step,y=Math.floor(box.y/step)*step;
      const right=Math.min(canvas.width,Math.ceil((box.x+box.width)/step)*step),bottom=Math.min(canvas.height,Math.ceil((box.y+box.height)/step)*step);
      context.fillRect(x,y,right-x,bottom-y);
    }
    const encoded=await new Promise(resolve=>canvas.toBlob(resolve,plan.mime,P.jpegQuality));active();
    if(!encoded||encoded.type!==plan.mime)stop('The protected image could not be encoded in its original format.');
    if(encoded.size>P.hard.output)stop('The protected image exceeds the output size limit.');
    return await encoded.arrayBuffer();
  } finally{releasePixels();}
}
let connected=false;
window.addEventListener('message',event=>{
  if(connected||event.source!==parent||event.data?.type!=='idia-local-connect'||!event.ports[0])return;
  connected=true;const port=event.ports[0];let busy=false;
  port.onmessage=async({data})=>{
    if(data.command==='dispose'){dispose();port.postMessage({disposed:true});port.close();return;}if(busy)return;busy=true;
    reportProgress=progress=>port.postMessage({progress});
    try{
      active();let result;
      if(data.command==='inspect')result=inspect(data.buffer,data.format);
      else if(data.command==='prepare')result=await prepare(data.confirmed);
      else if(data.command==='build')result=await build(data.ids);
      else stop('Unsupported local image operation.');
      active();port.postMessage({id:data.id,result},result instanceof ArrayBuffer?[result]:[]);
    }catch(error){port.postMessage({id:data.id,error:error instanceof LocalError?error.message:'The image could not be processed reliably. It may be damaged or use unsupported features. The original selection was not released.'});dispose();port.postMessage({disposed:true});port.close();}
    finally{busy=false;}
  };port.start();port.postMessage({ready:true});
});
window.addEventListener('pagehide',dispose);
