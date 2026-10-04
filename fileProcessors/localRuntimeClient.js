// Shared private connection for PDF/image processing in extension-owned frames.
// Only the MessagePort carries document bytes; the host window receives no data.
(() => {
  'use strict';
  const failure=message=>Object.assign(new Error(message),{name:'IDIAFileError'});
  function connect({path,label,signal,onProgress=()=>{},startup=10000,deadline=120000}) {
    if(location.protocol==='file:')throw failure(`Open the local test page from the IDIA extension popup for ${label} protection.`);
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    const url=globalThis.chrome?.runtime?.getURL?chrome.runtime.getURL(path):new URL(path,document.baseURI).href;
    const frame=document.createElement('iframe');frame.hidden=true;frame.setAttribute('aria-hidden','true');frame.src=url;
    const channel=new MessageChannel(),pending=new Map();let nextId=0,closed=false,readyTimer,disposeTimer,resolveDisposed;
    const disposed=new Promise(resolve=>{resolveDisposed=resolve;});
    function removeFrame(){closed=true;clearTimeout(disposeTimer);clearTimeout(readyTimer);signal?.removeEventListener('abort',abort);channel.port1.close();channel.port2.close();frame.remove();resolveDisposed();}
    function dispose() {
      if(closed)return disposed;closed=true;clearTimeout(readyTimer);signal?.removeEventListener('abort',abort);
      for(const request of pending.values()){clearTimeout(request.timer);request.reject(failure(`${label} operation cancelled. Select the file again.`));}
      // Keep the frame alive just long enough to run explicit worker/canvas
      // cleanup. Removing it immediately can discard the queued dispose message.
      pending.clear();disposeTimer=setTimeout(removeFrame,1500);channel.port1.postMessage({command:'dispose'});
      return disposed;
    }
    const abort=()=>dispose();signal?.addEventListener('abort',abort,{once:true});
    const ready=new Promise((resolve,reject)=>{
      pending.set(0,{reject});
      readyTimer=setTimeout(()=>{reject(failure(`The local ${label} runtime could not start. Reload IDIA and refresh the page.`));dispose();},startup);
      channel.port1.onmessage=({data})=>{
        if(data.disposed){removeFrame();return;}
        if(closed)return;
        if(data.progress){onProgress(data.progress);return;}
        if(data.ready){clearTimeout(readyTimer);pending.delete(0);resolve();return;}
        const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);
        if(data.error)request.reject(failure(data.error));else request.resolve(data.result);
      };channel.port1.start();
    });
    frame.addEventListener('load',()=>{
      if(closed)return;const target=new URL(url);
      frame.contentWindow.postMessage({type:'idia-local-connect'},target.protocol==='chrome-extension:'?`${target.protocol}//${target.host}`:target.origin,[channel.port2]);
    },{once:true});
    (document.body||document.documentElement).append(frame);
    function request(command,payload={},transfer=[],timeout=deadline) {
      if(closed)return Promise.reject(failure(`The ${label} review is no longer active.`));
      return new Promise((resolve,reject)=>{
        const id=++nextId,timer=setTimeout(()=>{reject(failure(`${label} processing exceeded its time limit. Try a smaller file.`));dispose();},timeout);
        pending.set(id,{resolve,reject,timer});channel.port1.postMessage({id,command,...payload},transfer);
      });
    }
    return {ready,request,dispose,get closed(){return closed;}};
  }
  globalThis.IDIALocalRuntime=Object.freeze({connect});
})();
