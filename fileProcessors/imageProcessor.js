// File-processor adapter only; fileGuard still owns review and DataTransfer.
(() => {
  'use strict';
  const failure=message=>Object.assign(new Error(message),{name:'IDIAFileError'});
  async function prepare(file,{signal,onProgress=()=>{},onConfirm}={}){
    const P=IDIAImageLimits;
    if(file.size>P.hard.file)throw failure('This image exceeds the hard file-size limit of 25 MiB.');
    const runtime=IDIALocalRuntime.connect({path:'fileProcessors/imageRuntime.html',label:'Image',signal,onProgress,startup:P.time.startup,deadline:P.time.inspect});
    try{
      await runtime.ready;const buffer=await file.arrayBuffer(),format=/\.png$/i.test(file.name)?'png':'jpeg';
      const plan=await runtime.request('inspect',{buffer,format},[buffer]);let confirmed=false;
      if(plan.requiresConfirmation){confirmed=await onConfirm?.(plan)===true;if(!confirmed||signal?.aborted||runtime.closed)throw failure('Image scanning was cancelled. The original selection was not released.');}
      const result=await runtime.request('prepare',{confirmed},[],P.time.scan),warning=result.warning;
      return {findings:result.findings,continueOriginalWhenEmpty:true,dispose:runtime.dispose,metrics:result.metrics,
        reviewDescription:warning?`${result.findings.length} sensitive items detected.\n${warning}`:result.findings.length?undefined:'No sensitive patterns were found in the recognized text. OCR can miss information; this is not a guarantee that the image contains no private information.',
        applyLabel:warning&&!result.findings.length?'Keep original (unprotected)':undefined,
        reviewNote:result.findings.length?'Selecting a finding covers its complete OCR line with opaque pixels because word boxes can omit character edges. Unchecked text on that same line is also covered. OCR can miss information; inspect the copy. Output drops source metadata and flattens transparency onto white. JPEG is re-encoded. Protect File notifies this site of the copy; it may upload it.'+(warning?' Protecting these findings does not resolve the scanning uncertainty.':''):'Continue with original keeps all image content and metadata unchanged and notifies this site; it may upload it. Cancel leaves the selection held.',
        processingLabel:'Creating protected image…',
        async buildFile(selected,name){
          if(!result.findings.length)return file;
          const bytes=await runtime.request('build',{ids:selected.map(f=>f.id)},[],P.time.build);
          return new File([bytes],name,{type:plan.mime,lastModified:Date.now()});
        }
      };
    }catch(error){await runtime.dispose();throw error;}
  }
  globalThis.IDIAImageProcessor=Object.freeze({supports:file=>/\.(png|jpe?g)$/i.test(file.name),progressLabel:'Analyzing image locally…',prepare});
})();
