(() => {
 'use strict';
 const E=IDIAEditors,excluded='nav, aside, [role="dialog"], dialog, [data-message-author-role], [data-testid="conversation-turn"], #idia-privacy-root, #idia-manual-decode';
 const promptLabel=/prompt|message|ask|chat|提问|输入|訊息|消息|询问|質問|メッセージ/i;
 function create(config,{local=false,generic=false}={}){
  let manualEditor=null;
  const api={id:config.id,name:config.name,hostnames:config.hostnames||[],generic,
   capabilities:{textProtection:true,sendReview:!generic||local,fileInterception:true,decodePanel:!generic||local,validation:'fixture-only'},
   findComposers(){
    const all=E.editors();if(local)return all;
    if(generic){const active=all.find(n=>n===document.activeElement&&!n.closest(excluded));if(active)manualEditor=active;return manualEditor&&all.includes(manualEditor)?[manualEditor]:[];}
    const exact=all.filter(n=>!n.closest(excluded)&&config.composers.some(s=>n.matches(s)));
    if(exact.length)return exact;
    const fallback=all.filter(n=>!n.closest(excluded)&&promptLabel.test([n.getAttribute('aria-label'),n.getAttribute('placeholder'),n.getAttribute('data-placeholder')].join(' '))&&
      (n.matches('textarea, [role="textbox"], [contenteditable="true"], [contenteditable="plaintext-only"]')));
    return fallback.length===1?fallback:[];
   },
   findComposer(){const nodes=api.findComposers();return nodes.find(n=>n===document.activeElement||n.contains(document.activeElement))||nodes[0]||null;},
   isComposer:node=>api.findComposers().includes(node),readComposerText:E.read,writeComposerText:E.write,
   belongsToComposer(button,editor){
    const scope=editor.closest(config.containers||'form');if(scope&&(scope.contains(button)||button.form===scope))return true;
    for(let p=editor.parentElement,d=0;p&&d<6;p=p.parentElement,d++){if(p.matches('main,body,html,[role="main"],article'))break;if(p.contains(button))return true;}return false;
   },
   isSendButton(button){
    if(generic&&!local)return false;
    if(button.disabled||button.getAttribute('aria-disabled')==='true')return false;
    const test=button.getAttribute('data-testid')||'',label=[button.getAttribute('aria-label'),button.getAttribute('title'),button.textContent].join(' ');
    if(/stop|cancel|停止|取消/i.test(test+' '+label))return false;
    return config.sendIds?.includes(test)||config.sendElementIds?.includes(button.id)||/\bsend\b|\bsubmit\b|发送|發送|送出/i.test(label)||
      (button instanceof HTMLButtonElement&&button.type==='submit'&&!!button.form)||button.getAttribute('type')==='submit';
   },
   findSendButton(){const editor=api.findComposer();return editor?[...document.querySelectorAll('button,[role="button"],input[type="submit"]')].find(b=>api.isSendButton(b)&&api.belongsToComposer(b,editor))||null:null;},
   isEnterSend(event,editor){
    if(event.key!=='Enter'||event.shiftKey||event.altKey||event.isComposing||event.keyCode===229)return false;
    if(local)return editor.matches('#prompt-textarea, .ProseMirror')||!!editor.closest('[data-testid="composer"], #composer-background');
    return !generic&&api.isComposer(editor)&&config.enter&&(event.ctrlKey||event.metaKey||config.enter===true);
   },
   findFileInputs:()=>[...document.querySelectorAll('input[type="file"]')],
   getConversationIdentity:()=>generic?null:IDIAPlatforms.identity(location.href),
   isSupportedPage:()=>local||!!IDIAPlatforms.select(location.href),
   conversationProof(){return config.transcript?[...document.querySelectorAll(config.transcript)].slice(-8).flatMap(n=>IDIATokenSyntax.tokens(n.textContent||'')).slice(0,100):[];},
   isNewConversationLink:url=>config.newPaths?.includes(url.pathname)&&!url.search,
   isNewConversationAction(event){const button=event.composedPath().find(n=>n instanceof Element&&n.matches('button,[role="button"]'));return !!button&&/^(?:new chat|new conversation|start new chat|新对话|新聊天|新建聊天|新しいチャット)$/i.test((button.getAttribute('aria-label')||button.textContent||'').trim());},
   getFloatingUIOffset(){const editor=api.findComposer(),r=(editor?.closest(config.containers||'form')||editor)?.getBoundingClientRect();return r?.width&&r.right>innerWidth-110&&r.bottom>innerHeight-100?Math.min(innerHeight-100,Math.max(24,innerHeight-r.top+12)):24;}
  };return Object.freeze(api);
 }
 globalThis.IDIABaseAdapter=Object.freeze({create});
})();
