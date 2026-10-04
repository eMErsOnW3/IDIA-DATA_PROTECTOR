// Trusted extension frame. Pasted text and originals never leave this frame.
(() => {
 'use strict';
 const $=id=>document.getElementById(id),viewId=new URL(location.href).searchParams.get('view');
 let view=null,disposed=false,generation=0;
 async function call(action,payload={}){const r=await chrome.runtime.sendMessage({type:'idia-vault',action,...payload});if(!r?.ok)throw new Error('View unavailable');return r.result;}
 const files=IDIAFileDecodeUI.create({call});
 function reset(){generation++;$('protected-input').value='';$('decoded-preview').textContent='';$('summary').textContent='';$('status').textContent='';}
 function close(){disposed=true;files.reset();reset();if(view)parent.postMessage({type:'idia-response-close',viewId},view.parentOrigin);view=null;}
 function input(){generation++;$('decoded-preview').textContent='';$('summary').textContent='';$('status').textContent='';$('input-state').hidden=false;$('decoded-state').hidden=true;$('heading').textContent='IDIA · Decode';$('protected-input').focus();}
 $('close').onclick=close;$('clear').onclick=()=>{reset();input();};$('back').onclick=input;
 function mode(file){
  generation++;files.reset();$('decoded-preview').textContent='';$('summary').textContent='';$('status').textContent='';
  $('text-mode').hidden=file;$('file-mode').hidden=!file;$('input-state').hidden=false;$('decoded-state').hidden=true;
  $('heading').textContent=file?'IDIA · Decode File':'IDIA · Decode';
  for(const [id,selected] of [['text-tab',!file],['file-tab',file]]){$(id).setAttribute('aria-selected',String(selected));$(id).tabIndex=selected?0:-1;}
 }
 $('text-tab').onclick=()=>mode(false);$('file-tab').onclick=()=>mode(true);
 for(const id of ['text-tab','file-tab'])$(id).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const file=event.key==='End'||(event.key!=='Home'&&id==='text-tab');mode(file);$(file?'file-tab':'text-tab').focus();}});
 $('decode').onclick=async()=>{
  if(!view||disposed)return;const ticket=++generation,text=$('protected-input').value;
  $('decode').disabled=true;$('status').textContent='Decoding locally…';$('status').classList.remove('idia-error');
  try{
   const tokens=IDIATokenSyntax.tokens(text);if(tokens.length>2000)throw new Error('Limit');
   const {mappings}=await call('lookup',{tokens});if(disposed||ticket!==generation)return;
   const known=Object.keys(mappings),unknown=IDIATokenSyntax.unknownLike(text,known);
   let decoded=text;for(const f of IDIATokenSyntax.find(text).reverse())if(Object.hasOwn(mappings,f.value))decoded=decoded.slice(0,f.start)+mappings[f.value]+decoded.slice(f.end);
   $('decoded-preview').textContent=decoded;
   $('summary').textContent=`${known.length} protected ${known.length===1?'value':'values'} restored locally`+(unknown?` · ${unknown} unrecognized IDIA ${unknown===1?'token':'tokens'}`:'');
   $('input-state').hidden=true;$('decoded-state').hidden=false;$('heading').textContent='IDIA · Decoded';$('status').textContent='';$('back').focus();
  }catch{if(!disposed&&ticket===generation){$('status').textContent='Unable to decode in this session. Check the current conversation or reopen IDIA. Nothing was sent.';$('status').classList.add('idia-error');}}
  finally{if(!disposed)$('decode').disabled=false;}
 };
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('decoded-preview').textContent);if(!disposed)$('status').textContent='Decoded text copied locally.';}catch{if(!disposed)$('status').textContent='Clipboard access failed. Select the preview and copy it manually.';}};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.idiaSessionVault&&!changes.idiaSessionVault.newValue)close();});
 window.addEventListener('pagehide',()=>{disposed=true;files.reset();reset();view=null;});
 call('view-data').then(data=>{if(disposed)return;view=data;files.enable();$('decode').disabled=false;$('protected-input').focus();},()=>{$('status').textContent='This session view is unavailable. Close and reopen IDIA.';});
})();
