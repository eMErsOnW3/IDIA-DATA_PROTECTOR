// Small bridge to the isolated local PDF runtime. Existing fileGuard owns all uploads.
(() => {
  "use strict";
  const NOTE="PDF protection covers complete text items or OCR words/lines, so nearby text or unchecked findings in the same region may also be covered. Every page becomes an image: searchable text, links, forms, metadata, and editability are removed. OCR can miss or misread information; review the protected copy. Images on searchable pages are not independently scanned. Protect File notifies this site of the copy; it may then upload it.";
  function failure(message){const error=new Error(message);error.name="IDIAFileError";return error;}
  async function prepare(file,{signal,onProgress=()=>{},onConfirm}={}) {
    if(file.size>IDIAPdfLimits.hard.file)throw failure("This PDF exceeds the hard limit of 25 MiB.");
    const runtime=IDIALocalRuntime.connect({path:'fileProcessors/pdfRuntime.html',label:'PDF',signal,onProgress,
      startup:IDIAPdfLimits.time.startup,deadline:IDIAPdfLimits.time.inspect});
    const {ready,request,dispose}=runtime;
    try {
      await ready;const buffer=await file.arrayBuffer();
      const plan=await request("inspect",{buffer},[buffer]);
      // There is no processing timer while a human is deciding. Missing confirmation
      // UI fails closed; mere passage of time never authorizes scanning or upload.
      let confirmed=false;
      if(plan.requiresConfirmation){
        confirmed=await onConfirm?.(plan)===true;
        if(!confirmed||signal?.aborted||runtime.closed)throw failure("Large-document scanning was cancelled. The original selection was not released.");
      }
      const result=await request("prepare",{confirmed},[],IDIAPdfLimits.scanDeadline(plan));
      const warning=(result.warnings||[]).join("\n");
      return {findings:result.findings,continueOriginalWhenEmpty:true,dispose,metrics:result.metrics,
        reviewDescription:warning?`${result.findings.length} sensitive items detected.\n${warning}`:result.findings.length?undefined:"No sensitive patterns were found in the analyzed text. This is not a guarantee that the PDF contains no private information.",
        applyLabel:warning&&!result.findings.length?"Keep original (unprotected)":undefined,
        reviewNote:result.findings.length?NOTE+(warning?" Some pages could not be reliably scanned; protecting these findings does not resolve that uncertainty.":""):"Continue with original keeps the PDF unchanged and notifies this site; the site may upload it. Cancel leaves the selection held.",
        processingLabel:"Creating safe PDF…",
        async buildFile(selected,name) {
          if(!result.findings.length)return file;
          const bytes=await request("build",{ids:selected.map(f=>f.id)},[],IDIAPdfLimits.buildDeadline(plan.pages));
          return new File([bytes],name,{type:"application/pdf",lastModified:Date.now()});
        }
      };
    } catch(error) {await dispose();throw error;}
  }
  globalThis.IDIAPdfProcessor=Object.freeze({supports:file=>/\.pdf$/i.test(file.name),progressLabel:"Scanning PDF…",prepare});
})();
