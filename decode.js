// Trusted extension page. Originals never travel back to a ChatGPT content script.
(() => {
  'use strict';
  const $=id=>document.getElementById(id);let view,prepared,controller,downloadURL,revision=0,cleared=false,mode='protected';
  async function call(action,payload={}){const response=await chrome.runtime.sendMessage({type:'idia-vault',action,...payload});if(!response?.ok)throw new Error('The vault or local view is unavailable. Reopen Decode from the current conversation.');return response.result;}
  function revoke(){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;$('download-link').hidden=true;$('download-link').removeAttribute('href');}
  function protectedView(){if(view?.tree)$('response-view').replaceChildren(IDIAResponseTree.render(view.tree,document));mode='protected';$('copy').disabled=true;$('protected').setAttribute('aria-pressed','true');$('decoded').setAttribute('aria-pressed','false');}
  async function decodedView(){
    if(cleared||!view?.tree)return;const current=++revision;
    try{
      const text=IDIAResponseTree.plain(view.tree),{mappings}=await call('lookup',{tokens:IDIATokenSyntax.tokens(text)});
      if(current!==revision||cleared)return;
      const root=IDIAResponseTree.render(view.tree,document);IDIAResponseTree.decode(root,mappings);$('response-view').replaceChildren(root);
      mode='decoded';$('copy').disabled=false;$('protected').setAttribute('aria-pressed','false');$('decoded').setAttribute('aria-pressed','true');
      $('status').textContent=`${Object.keys(mappings).length} known values restored locally. ${IDIATokenSyntax.unknownLike(text,Object.keys(mappings))} unrecognized IDIA-like tokens left unchanged.`;
    }catch(error){protectedView();$('status').textContent=error.message;}
  }
  $('protected').addEventListener('click',()=>{revision++;protectedView();$('status').textContent='Protected view. ChatGPT’s original response remains unchanged.';});
  $('decoded').addEventListener('click',decodedView);
  $('copy').addEventListener('click',async()=>{if(mode!=='decoded'||cleared)return;try{await navigator.clipboard.writeText($('response-view').innerText);$('status').textContent='Decoded text copied locally.';}catch{$('status').textContent='Clipboard access failed. Select and copy the text manually.';}});
  function cancel(){revision++;controller?.abort();controller=null;prepared=null;revoke();$('download').disabled=true;$('file-hints').replaceChildren();}
  $('cancel-file').addEventListener('click',()=>{cancel();$('decode-file').value='';$('file-summary').textContent='File operation cancelled. Nothing was downloaded.';});
  $('decode-file').addEventListener('change',async()=>{
    cancel();const file=$('decode-file').files[0];if(!file||cleared)return;controller=new AbortController();const current=revision;
    $('file-summary').textContent='Inspecting exact tokens locally…';
    try{
      const next=await IDIADecodeProcessor.prepare(file,{signal:controller.signal,
        check:async tokens=>await call('check',{tokens}),lookup:async tokens=>(await call('lookup',{tokens})).mappings});
      if(current!==revision||cleared)return;prepared=next;
      $('file-summary').textContent=IDIADecodeProcessor.summary(next);
      $('download').disabled=!next.known;
      for(const hint of [...new Set(next.findings.filter(f=>f.referenceCount>1).map(f=>`${f.referenceCount} cells share one entry. Decoding it updates all those cells.`))]){
        const li=document.createElement('li');li.textContent=hint;$('file-hints').append(li);
      }
    }catch(error){if(current===revision)$('file-summary').textContent=error.message||'The protected file could not be read.';}
  });
  $('download').addEventListener('click',async()=>{
    if(!prepared||cleared)return;const current=revision;$('download').disabled=true;$('file-summary').textContent='Creating decoded copy locally…';
    try{
      const file=await prepared.build();if(current!==revision||cleared)return;revoke();downloadURL=URL.createObjectURL(file);
      const link=$('download-link');link.href=downloadURL;link.download=file.name;link.textContent='Download '+file.name;link.hidden=false;link.click();
      $('file-summary').textContent=`${file.name} created locally. The protected original is unchanged.`;
    }catch(error){if(current===revision)$('file-summary').textContent=error.message||'Decode failed. Nothing was downloaded.';}
    finally{if(current===revision&&!cleared)$('download').disabled=false;}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='session'&&changes.idiaSessionVault&&!changes.idiaSessionVault.newValue){
      cleared=true;cancel();protectedView();$('decoded').disabled=true;$('decode-file').disabled=true;
      $('status').textContent='Session vault cleared. Originals can no longer be decoded.';$('file-summary').textContent='Decoded download links have been revoked.';
    }
  });
  window.addEventListener('pagehide',()=>{cancel();view=null;$('response-view').replaceChildren();});
  (async()=>{try{view=await call('view-data');$('scope').textContent='Conversation: '+view.label;
    if(view.tree){$('response').hidden=false;protectedView();await decodedView();}
    else $('status').textContent=view.fileName?`Download ${view.fileName} from ChatGPT, then choose that local file below.`:'Choose a protected local file. Only this conversation’s exact tokens can be decoded.';
  }catch(error){cleared=true;$('decode-file').disabled=true;$('status').textContent=error.message;}})();
})();
