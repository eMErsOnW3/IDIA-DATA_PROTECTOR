// Runs in an extension-origin frame, with PDF parsing in a real dedicated worker.
// No host-page scripts, original PDF objects, or original metadata enter the output.
import * as pdfjs from '../lib/pdfjs/pdf.min.mjs';
import {createOcrExtractor} from './pdfOcrExtractor.js';
import {mapFindings,selectedFindings} from './rasterFindings.mjs';
const LIMITS=IDIAPdfLimits.hard;
class LocalError extends Error {}
let nativeWorker,worker,loading,pdf,renderTask,snapshot,ocr,plan,disposed=false,resourceFailure=false;
let reportProgress=()=>{};
async function dispose() {
  disposed=true;plan=null;
  ocr?.dispose();ocr=null;
  renderTask?.cancel();renderTask=null;
  try {await loading?.destroy();} catch {}
  worker?.destroy();nativeWorker?.terminate();loading=pdf=worker=nativeWorker=snapshot=null;
}
function stop(message){throw new LocalError(message);}
function checkActive(){
  if(disposed)stop('PDF operation cancelled.');
  if(resourceFailure)stop('The PDF exceeded a resource limit or could not be decoded reliably. The original selection was not released.');
}
function checkViewport(viewport){
  const area=Math.ceil(viewport.width)*Math.ceil(viewport.height);
  if(!Number.isFinite(area)||area<=0||area>LIMITS.pagePixels||Math.max(viewport.width,viewport.height)>LIMITS.canvasDimension)stop('This PDF exceeds the rendered-page size limit (8 million pixels / 8192 pixels per dimension).');
  return area;
}
async function checkPageResources(page){
  // PDF.js 5.6.205 can resolve an empty list before rejecting its failed stream.
  // The dedicated-worker error latch below prevents such a page being accepted.
  const operators=await page.getOperatorList({intent:'print',annotationMode:pdfjs.AnnotationMode.DISABLE});
  checkActive();
  if(operators.fnArray.length>LIMITS.pageOperators)stop('This PDF page exceeds the drawing-operation resource limit.');
}
async function textContent(page) {
  const reader=page.streamTextContent({disableNormalization:true,includeMarkedContent:false}).getReader();
  const items=[],styles={};let characters=0;
  try {
    while(true){const chunk=await reader.read();if(chunk.done)break;
      Object.assign(styles,chunk.value.styles);
      for(const item of chunk.value.items){characters+=item.str?.length||0;items.push(item);}
      if(items.length>LIMITS.items||characters>LIMITS.pageCharacters)stop('This PDF has too much text on one page to scan safely.');
    }
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  checkActive();return {items,styles,characters};
}
async function inspect(buffer) {
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>LIMITS.file)stop('This PDF exceeds the hard limit of 25 MiB.');
  const fileBytes=buffer.byteLength;
  if(new TextDecoder('latin1').decode(new Uint8Array(buffer,0,Math.min(8,buffer.byteLength))).indexOf('%PDF-')!==0)stop('This file is not a supported PDF.');
  nativeWorker=new Worker(new URL('../lib/pdfjs/pdf.worker.min.mjs',import.meta.url),{type:'module'});
  // Pinned PDF.js MessageHandler protocol: a stream error has a `reason` and
  // a `stream` discriminator. Register before PDFWorker consumes the message.
  // Keep only a boolean, never arbitrary library error text or document content.
  nativeWorker.addEventListener('message',({data})=>{if(data?.stream&&data.reason)resourceFailure=true;});
  worker=new pdfjs.PDFWorker({port:nativeWorker,verbosity:0});
  loading=pdfjs.getDocument({data:new Uint8Array(buffer),worker,verbosity:0,isEvalSupported:false,
    stopAtErrors:true,disableAutoFetch:true,disableRange:true,disableStream:true,enableXfa:false,
    useWasm:false,useSystemFonts:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,
    standardFontDataUrl:new URL('../lib/pdfjs/standard_fonts/',import.meta.url).href,
    cMapUrl:new URL('../lib/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
    useWorkerFetch:true,canvasMaxAreaInBytes:LIMITS.canvasBytes,maxImageSize:LIMITS.sourceImagePixels});
  pdf=await new Promise((resolve,reject)=>{
    loading.onPassword=()=>{reject(new LocalError('Encrypted/password-protected PDFs are not supported.'));};
    loading.promise.then(resolve,reject);
  });
  if(await pdf.getPermissions()!==null)stop('Encrypted/password-protected PDFs are not supported.');
  if(pdf.isPureXfa)stop('XFA form PDFs are not supported.');
  if(pdf.numPages<1||pdf.numPages>LIMITS.pages)stop('PDF protection supports at most 50 pages (hard safety limit).');
  let totalPixels=0,ocrPixels=0,ocrPages=0,characters=0;
  const sources=[];
  // Inspect text and page geometry only. No OCR engine or page canvas exists yet.
  for(let index=0;index<pdf.numPages;index++){
    checkActive();const page=await pdf.getPage(index+1);
    try {
      const area=checkViewport(page.getViewport({scale:LIMITS.scale}));totalPixels+=area;
      const content=await textContent(page);characters+=content.characters;
      if(characters>LIMITS.characters)stop('This PDF has too much text to scan safely.');
      const source=IDIAOcrGeometry.hasUsableTextLayer(content.items.map(item=>item.str||'').join(' '))?'text':'ocr';
      sources.push(source);if(source==='ocr'){ocrPages++;ocrPixels+=area;}
      reportProgress({message:`Inspecting page ${index+1} of ${pdf.numPages}`,fraction:(index+1)/pdf.numPages});
    } finally {page.cleanup();}
  }
  plan={...IDIAPdfLimits.summarize({fileBytes,pages:pdf.numPages,ocrPages,totalPixels,ocrPixels}),sources};
  return {...plan,sources:undefined};
}
async function prepare(confirmed) {
  if(!plan||snapshot)stop('The PDF inspection is no longer active.');
  if(plan.requiresConfirmation&&confirmed!==true)stop('Continue Scanning must be confirmed before processing this document.');
  const started=performance.now(),pageTimings=[];
  const pages=[],findings=[],warnings=[],byId=new Map();let pixels=0,characters=0,ocrPages=0;
  for(let pageIndex=0;pageIndex<pdf.numPages;pageIndex++){
    checkActive();const pageStarted=performance.now();
    const page=await pdf.getPage(pageIndex+1),viewport=page.getViewport({scale:LIMITS.scale});
    try {
    pixels+=checkViewport(viewport);
    const content=await textContent(page);characters+=content.characters;
    if(characters>LIMITS.characters)stop('This PDF has too much text to scan safely.');
    let groups,source='text',quality;
    if(plan.sources[pageIndex]==='text'){
      reportProgress({message:`Analyzing page ${pageIndex+1} of ${pdf.numPages}`,fraction:(pageIndex+1)/pdf.numPages});
      try {groups=IDIAPdfGeometry.groupItems(content.items,content.styles,viewport,pdfjs.Util.transform);}
      catch {stop("IDIA cannot reliably map this PDF's text to page regions. The file was not protected.");}
    } else {
      source='ocr';ocrPages++;
      ocr ||= createOcrExtractor({timeoutMs:IDIAPdfLimits.time.ocrPage});
      // Recognize upright PDF content. Map through PDF coordinates into the output
      // viewport, including /Rotate, crop-box offsets and UserUnit.
      const ocrViewport=page.getViewport({scale:LIMITS.scale,rotation:0});checkViewport(ocrViewport);
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(ocrViewport.width);canvas.height=Math.ceil(ocrViewport.height);
      try {
        reportProgress({message:`OCR page ${pageIndex+1} of ${pdf.numPages}`,fraction:pageIndex/pdf.numPages});
        await checkPageResources(page);
        const context=canvas.getContext('2d',{alpha:false});if(!context)stop('A PDF page could not be rendered for OCR.');
        renderTask=page.render({canvas,canvasContext:context,viewport:ocrViewport,intent:'print',background:'rgb(255,255,255)',annotationMode:pdfjs.AnnotationMode.DISABLE});
        renderTask.onContinue=next=>setTimeout(next,0);await renderTask.promise;renderTask=null;checkActive();
        ({groups,quality}=await ocr.recognize(canvas,ocrViewport,viewport,fraction=>reportProgress({message:`OCR page ${pageIndex+1} of ${pdf.numPages}`,fraction:(pageIndex+fraction)/pdf.numPages})));
        characters+=groups.reduce((total,group)=>total+group.text.length,0);
        if(groups.reduce((total,group)=>total+group.text.length,0)>LIMITS.pageCharacters||characters>LIMITS.characters)stop('This PDF has too much OCR text to scan safely.');
        if(!quality.reliable)warnings.push(`IDIA could not reliably scan page ${pageIndex+1}. Sensitive information may still be present.`);
      } catch(error){if(error instanceof LocalError)throw error;stop(`Local OCR failed on page ${pageIndex+1}. Cancel and try again. The original selection has not been released.`);}
      finally {canvas.width=canvas.height=1;page.cleanup();await pdf?.cleanup();}
    }
    const mapped=mapFindings(groups,{prefix:'pdf',pageIndex,source,quality,
      sourceHint:`Page ${pageIndex+1} · ${source==='ocr'?'OCR'+(!quality.reliable?' · low confidence':''):'complete text item'}`});
    for(const finding of mapped){findings.push(finding);byId.set(finding.id,finding);}
    if(findings.length>LIMITS.findings)stop('This PDF has too many findings for one review (limit 2000).');
    pages.push({viewport,groups,source,quality});
    pageTimings.push({page:pageIndex+1,source,milliseconds:Math.round(performance.now()-pageStarted)});
    } finally {page.cleanup();}
  }
  ocr?.dispose();ocr=null; // Recognition is finished; review needs only mapped text/boxes.
  snapshot={pages,findings,byId};
  return {findings,warnings,ocrPages,metrics:{scanMilliseconds:Math.round(performance.now()-started),pageTimings,totalPixels:pixels}};
}
async function build(ids) {
  if(!snapshot||!Array.isArray(ids))stop('The PDF review is no longer active. Select the file again.');
  const selected=selectedFindings(snapshot,ids);
  const output=await PDFLib.PDFDocument.create();
  output.setProducer('IDIA Privacy Protector');output.setCreator('IDIA Privacy Protector');
  let encodedBytes=0;
  for(let pageIndex=0;pageIndex<snapshot.pages.length;pageIndex++){
    checkActive();reportProgress({message:`Creating protected page ${pageIndex+1} of ${snapshot.pages.length}`,fraction:pageIndex/snapshot.pages.length});
    const source=await pdf.getPage(pageIndex+1),viewport=snapshot.pages[pageIndex].viewport;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    try {
      await checkPageResources(source);
      const context=canvas.getContext('2d',{alpha:false});if(!context)stop('A PDF page could not be rendered.');
      // Print intent uses asynchronous timers instead of requestAnimationFrame.
      // Chrome suspends animation frames in hidden cross-origin extension frames.
      renderTask=source.render({canvas,canvasContext:context,viewport,intent:'print',background:'rgb(255,255,255)',annotationMode:pdfjs.AnnotationMode.DISABLE});
      renderTask.onContinue=continueRendering=>setTimeout(continueRendering,0);
      await renderTask.promise;renderTask=null;checkActive();
      context.setTransform(1,0,0,1,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';context.fillStyle='#000000';
      for(const finding of selected.filter(f=>f.pageIndex===pageIndex))for(const box of finding.boxes)context.fillRect(box.x,box.y,box.width,box.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)stop('The sanitized PDF page could not be encoded.');
      encodedBytes+=blob.size;if(encodedBytes>LIMITS.output)stop('The protected PDF exceeds the output size limit.');
      const image=await output.embedPng(await blob.arrayBuffer());
      const page=output.addPage([viewport.width/LIMITS.scale,viewport.height/LIMITS.scale]);
      page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});
      // Embed/compress now, so pdf-lib releases the decoded RGB/alpha channels
      // instead of retaining all page images until save(). Compressed streams remain.
      await image.embed();
      await new Promise(resolve=>setTimeout(resolve,0));
    } finally {canvas.width=canvas.height=1;source.cleanup();await pdf?.cleanup();}
  }
  const bytes=await output.save({useObjectStreams:false,objectsPerTick:20,addDefaultPage:false});
  if(bytes.byteLength>LIMITS.output)stop('The protected PDF exceeds the output size limit.');
  return bytes.buffer;
}
let connected=false;
window.addEventListener('message',event=>{
  if(connected||event.source!==parent||event.data?.type!=='idia-local-connect'||!event.ports[0])return;
  connected=true;const port=event.ports[0];let busy=false;
  port.onmessage=async({data})=>{
    if(data.command==='dispose'){await dispose();port.postMessage({disposed:true});port.close();return;}
    if(busy)return;busy=true;
    reportProgress=progress=>port.postMessage({progress});
    try {
      let result;if(data.command==='inspect')result=await inspect(data.buffer);
      else if(data.command==='prepare')result=await prepare(data.confirmed);
      else if(data.command==='build')result=await build(data.ids);
      else throw new LocalError('Unsupported local PDF operation.');
      port.postMessage({id:data.id,result},result instanceof ArrayBuffer?[result]:[]);
    } catch(error) {
      port.postMessage({id:data.id,error:error instanceof LocalError?error.message:'The PDF could not be processed reliably. It may be damaged, encrypted, or use unsupported features. The original selection was not released.'});
      await dispose();
      port.postMessage({disposed:true});port.close();
    } finally {busy=false;}
  };
  port.start();port.postMessage({ready:true});
});
window.addEventListener('pagehide',()=>{ocr?.dispose();nativeWorker?.terminate();renderTask?.cancel();});
