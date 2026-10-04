// Only extension-local assets. One LSTM worker per operation; never a searchable OCR layer.
export function createOcrExtractor({timeoutMs=90000}={}) {
  let engine,initializing,disposed=false,progress=()=>{},rejectFatal=()=>{};
  const workers=new Set(),NativeWorker=globalThis.Worker;
  // Track even a worker whose initialization fails or is cancelled before createWorker resolves.
  class OwnedWorker extends NativeWorker {
    constructor(...args){super(...args);workers.add(this);this.addEventListener('error',()=>rejectFatal(new Error('Local OCR worker failed.')));}
    terminate(){workers.delete(this);super.terminate();}
  }
  const local=path=>new URL('../lib/'+path,import.meta.url).href;
  function dispose(){
    if(disposed)return;disposed=true;
    // Settle a pending recognition/initialization race too, so its deadline and
    // canvas references are released without waiting for a killed worker reply.
    rejectFatal(new Error('OCR cancelled.'));
    for(const worker of [...workers])worker.terminate();
    engine?.terminate().catch(()=>{});engine=null;initializing=null;
  }
  async function getEngine(){
    if(disposed)throw new Error('OCR cancelled.');
    if(!initializing){
      globalThis.Worker=OwnedWorker;
      try {
        initializing=Tesseract.createWorker('eng+chi_sim+jpn',1,{
          workerPath:local('tesseract/worker.min.js'),corePath:local('tesseract/tesseract-core-lstm.js'),
          langPath:local('tessdata'),workerBlobURL:false,gzip:false,cacheMethod:'none',
          logger:message=>progress(Math.max(0,Math.min(1,message.progress||0))),errorHandler:()=>rejectFatal(new Error('Local OCR engine or language data failed.'))
        });
      } finally {globalThis.Worker=NativeWorker;}
    }
    engine=await initializing;
    if(disposed){engine.terminate();throw new Error('OCR cancelled.');}
    await engine.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',user_defined_dpi:'144'});
    return engine;
  }
  async function recognize(canvas,sourceViewport,targetViewport,onProgress){
    progress=onProgress;let timer;
    const fatal=new Promise((_,reject)=>{rejectFatal=reject;});
    try {
      return await Promise.race([(async()=>{
        const worker=await getEngine();
        // Blocks retain word boxes; output PDF, HOCR and OCR image exports stay disabled.
        const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true,hocr:false,tsv:false,pdf:false});
        if(disposed)throw new Error('OCR cancelled.');
        const words=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]);
        const groups=IDIAOcrGeometry.groupWords(words,canvas.width,canvas.height);
        const quality=IDIAOcrGeometry.reliability(groups,data.confidence);
        for(const group of groups)for(const span of group.spans)span.box=IDIAOcrGeometry.mapBox(span.box,sourceViewport,targetViewport);
        return {groups,quality};
      })(),fatal,new Promise((_,reject)=>{timer=setTimeout(()=>{dispose();reject(new Error('OCR time limit exceeded.'));},timeoutMs);})]);
    } finally {clearTimeout(timer);progress=()=>{};rejectFatal=()=>{};}
  }
  return {recognize,dispose};
}
