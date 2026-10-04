// Presentation/lifecycle only. All parsing and replacement uses IDIADecodeProcessor.
(() => {
  'use strict';
  function create({call}) {
    const $=id=>document.getElementById(id);
    let revision=0, controller=null, prepared=null, downloadURL=null, ready=false;
    function reset() {
      revision++;controller?.abort();controller=null;prepared=null;
      if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;
      $('download-file').removeAttribute('href');$('download-file').removeAttribute('download');
      $('decode-file').value='';$('file-name').textContent='';$('file-summary').textContent='';$('file-summary').classList.remove('idia-error');$('file-hints').replaceChildren();
      $('file-review-actions').hidden=$('file-success-actions').hidden=true;$('file-picker').hidden=false;
      $('build-file').disabled=true;
    }
    function showDiagnostics(d){
      if(!d?.xlsx)return;
      const item=document.createElement('li'),details=document.createElement('details'),title=document.createElement('summary'),text=document.createElement('pre');
      title.textContent='Safe XLSX diagnostics (counts and token metadata only)';text.textContent=IDIADecodeProcessor.diagnosticLines(d);text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';
      details.append(title,text);item.append(details);$('file-hints').append(item);
    }
    function error(message){$('file-summary').textContent=message;$('file-summary').classList.add('idia-error');$('build-file').disabled=true;}
    async function scan(file) {
      if(!ready)return;reset();if(!file)return;
      const ticket=revision;controller=new AbortController();
      $('file-name').textContent=file.name;$('file-review-actions').hidden=false;$('file-summary').textContent='Inspecting exact tokens locally…';
      try {
        const next=await IDIADecodeProcessor.prepare(file,{signal:controller.signal,
          check:async tokens=>await call('check',{tokens}),
          lookup:async tokens=>(await call('lookup',{tokens})).mappings});
        if(ticket!==revision)return;prepared=next;
        $('file-summary').textContent=IDIADecodeProcessor.summary(next);showDiagnostics(next.diagnostics);
        if(!next.known)return;
        $('build-file').disabled=false;
        if(next.findings.some(f=>f.formulaCache)){const li=document.createElement('li');li.textContent='Only cached string results are decoded. Formula expressions are unchanged; spreadsheet recalculation may replace these cached results.';$('file-hints').append(li);}
        for(const hint of new Set(next.findings.filter(f=>f.referenceCount>1).map(f=>`${f.referenceCount} cells share one entry. Decoding updates all those cells.`))){const li=document.createElement('li');li.textContent=hint;$('file-hints').append(li);}
      }catch(e){if(ticket===revision){prepared=null;showDiagnostics(e.decodeDiagnostics);error(e.message==='View unavailable'?'Session mappings are unavailable. Close and reopen IDIA in the original conversation.':e.message||'Unable to scan this file. Nothing was downloaded.');}}
    }
    $('choose-file').onclick=()=>$('decode-file').click();
    $('decode-file').onchange=()=>scan($('decode-file').files[0]);
    $('cancel-file').onclick=()=>{reset();$('file-summary').textContent='Cancelled. Nothing was downloaded.';};
    $('another-file').onclick=()=>{reset();$('choose-file').focus();};
    $('build-file').onclick=async()=>{
      if(!prepared)return;const ticket=revision, operation=prepared;
      $('build-file').disabled=true;$('file-summary').textContent='Creating decoded copy locally…';
      try{
        const file=await operation.build();if(ticket!==revision)return;
        downloadURL=URL.createObjectURL(file);const link=$('download-file');link.href=downloadURL;link.download=file.name;
        $('file-name').textContent=file.name;$('file-summary').textContent=`✓ File decoded locally · ${operation.known} protected ${operation.known===1?'value':'values'} restored`+(operation.unknown?` · ${operation.unknown} unknown IDIA ${operation.unknown===1?'token remains':'tokens remain'} unchanged`:'');
        prepared=null;controller=null;$('file-picker').hidden=$('file-review-actions').hidden=true;$('file-success-actions').hidden=false;link.focus();
      }catch(e){if(ticket===revision){prepared=null;showDiagnostics(e.decodeDiagnostics);error(e.message==='View unavailable'?'The session mapping is unavailable. Scan the file again.':e.message||'Decode failed. No decoded copy was created.');}}
    };
    // Drop is handled only inside this extension frame, never on ChatGPT's document.
    $('file-mode').addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});
    $('file-mode').addEventListener('drop',event=>{
      event.preventDefault();if(!ready)return;
      if(event.dataTransfer?.files.length!==1){reset();error('Choose one protected TXT, CSV, DOCX or XLSX file at a time.');return;}
      scan(event.dataTransfer.files[0]);
    });
    return {reset,enable(){ready=true;$('choose-file').disabled=$('decode-file').disabled=false;}};
  }
  globalThis.IDIAFileDecodeUI=Object.freeze({create});
})();
