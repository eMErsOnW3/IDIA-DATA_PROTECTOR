// Isolated content-script client. It can create/check tokens, never retrieve originals.
(() => {
  'use strict';
  const adapter=IDIASite.getActiveAdapter();
  const proof=()=>adapter.conversationProof();
  async function call(action,payload={}){
    const result=await chrome.runtime.sendMessage({type:'idia-vault',action,url:location.href,proof:action==='manual-view'?[]:proof(),...payload});
    if(!result?.ok)throw new Error('IDIA Session Vault is unavailable. Reload the extension/page and try again.');
    return result.result;
  }
  const detect=text=>{
    const tokens=IDIATokenSyntax.find(text);
    return IDIADetectors.detectSensitiveInfo(text).filter(f=>!tokens.some(t=>t.start<f.end&&f.start<t.end));
  };
  async function replacements(selected){
    if(!selected.length)return selected;
    const {tokens}=await call('protect',{items:selected.map(f=>({type:f.type,value:f.value}))});
    if(tokens.length!==selected.length||tokens.some(t=>!IDIATokenSyntax.exact(t)))throw new Error('Invalid vault response.');
    return selected.map((f,i)=>({...f,replacement:tokens[i]}));
  }
  let currentURL=location.href;
  function sync(){if(currentURL!==location.href){currentURL=location.href;call('context').catch(()=>{});}}
  IDIASite.subscribe(sync);
  window.addEventListener('popstate',sync);
  document.addEventListener('click',event=>{
    if(adapter.isNewConversationAction(event)){call('new-chat').then(()=>window.dispatchEvent(new Event('idia-conversation-change'))).catch(()=>{});return;}
    const a=event.target.closest?.('a[href]');if(!a)return;
    let url;try{url=new URL(a.href);}catch{return;}
    if(url.origin!==location.origin)return;
    if(adapter.isNewConversationLink(url))call('new-chat').then(()=>window.dispatchEvent(new Event('idia-conversation-change'))).catch(()=>{});
    else if(IDIAPlatforms.select(url.href)&&IDIAPlatforms.identity(url.href))call('disarm').catch(()=>{});
  },true);
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message?.type==='idia-get-context'){reply({url:location.href});return;}
    if(message?.type==='idia-vault-cleared')window.dispatchEvent(new Event('idia-vault-cleared'));
  });
  call('context').catch(()=>{});
  globalThis.IDIAReversible=Object.freeze({call,detect,replacements,
    markSend:text=>{const tokens=IDIATokenSyntax.tokens(text);call('arm',{tokens}).catch(()=>{});}});
})();
