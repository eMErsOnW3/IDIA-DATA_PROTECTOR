// The sole vault writer. No external messaging, network requests, or secret logs.
importScripts('siteAdapters/platforms.js','siteAdapters/chatgpt.js','siteAdapters/gemini.js','siteAdapters/claude.js','siteAdapters/deepseek.js','siteAdapters/copilot.js','siteAdapters/perplexity.js','siteAdapters/grok.js','tokenSyntax.js','tokenVault.js','responseTree.js');
const V=IDIATokenVault;
const ready=chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
let queue=Promise.resolve();
function caller(sender){
  if(sender.id!==chrome.runtime.id)throw new Error('Untrusted sender.');
  const u=new URL(sender.url||'about:blank'),extension=u.protocol==='chrome-extension:'&&u.host===chrome.runtime.id;
  if(extension&&['/popup.html','/decode.html','/responseModal.html'].includes(u.pathname))return {trusted:true,page:u.pathname};
  if(IDIAPlatforms.select(u.href)&&sender.tab?.id!==undefined&&sender.frameId===0)return {trusted:false};
  throw new Error('Unsupported IDIA message source.');
}
function pageScope(state,message,sender,who){
  if(who.trusted)throw new Error('A conversation page is required.');
  if(!IDIAPlatforms.select(message.url)||new URL(message.url).origin!==new URL(sender.url).origin)throw new Error('Invalid page origin.');
  return V.scope(state,{tabId:sender.tab.id,documentId:sender.documentId,url:message.url,
    proof:Array.isArray(message.proof)?message.proof.filter(IDIATokenSyntax.exact).slice(0,100):[]});
}
async function openView(state,scope,tree=null,fileName=''){
  if(!state.scopes[scope])throw new Error('Choose a current session conversation first.');
  const now=Date.now();for(const [id,view] of Object.entries(state.views))if(now-view.createdAt>30*60*1000)delete state.views[id];
  const entries=Object.entries(state.views).sort((a,b)=>a[1].createdAt-b[1].createdAt);
  for(const [id] of entries.slice(0,Math.max(0,entries.length-9)))delete state.views[id];
  const id=IDIATokenSyntax.randomId();state.views[id]={scope,tree,createdAt:now,fileName:typeof fileName==='string'?fileName.slice(0,255):''};
  await V.save(state);await chrome.tabs.create({url:chrome.runtime.getURL('decode.html')+'?view='+id});return {opened:true};
}
async function responseView(state,scope,tree,sender){
  const id=IDIATokenSyntax.randomId(), now=Date.now();
  for(const [key,view] of Object.entries(state.views))if(now-view.createdAt>30*60*1000)delete state.views[key];
  const entries=Object.entries(state.views).sort((a,b)=>a[1].createdAt-b[1].createdAt);
  for(const [key] of entries.slice(0,Math.max(0,entries.length-9)))delete state.views[key];
  const parent=new URL(sender.url);
  state.views[id]={kind:'response',scope,tree,tabId:sender.tab.id,parentOrigin:parent.protocol+'//'+parent.host,createdAt:now};
  await V.save(state);
  return {viewId:id,url:chrome.runtime.getURL('responseModal.html')+'?view='+id};
}
async function handle(message,sender){
  await ready;const who=caller(sender),state=await V.load(),action=message.action;
  if(action==='dismiss-view'){
    const view=state.views[message.viewId];
    if(view?.kind==='response'&&view.tabId===sender.tab?.id){delete state.views[message.viewId];await V.save(state);}
    return {closed:true};
  }
  if(['context','protect','known','arm','disarm','new-chat','manual-view','files'].includes(action)){
    if(action==='new-chat'){delete state.bindings[String(sender.tab?.id)];}
    const scope=pageScope(state,message,sender,who),binding=state.bindings[String(sender.tab.id)];
    if(action==='protect'){
      const tokens=V.create(state,scope,message.items);await V.save(state);return {tokens,scope};
    }
    if(action==='known'){const tokens=Object.keys(V.lookup(state,scope,message.tokens));await V.save(state);return {tokens,scope};}
    if(action==='arm'&&!binding.stable){
      binding.armedTokens=message.tokens?.length?Object.keys(V.lookup(state,scope,message.tokens)):Object.keys(state.scopes[scope].records).slice(0,100);
      binding.armedUntil=Date.now()+120000;
    }
    if(action==='disarm'){delete binding.armedUntil;delete binding.armedTokens;}
    if(action==='manual-view')return responseView(state,scope,null,sender);
    if(action==='files')return openView(state,scope,null,message.fileName);
    await V.save(state);return {scope};
  }
  if(!who.trusted)throw new Error('Original values are never returned to content scripts.');
  if(action==='status'){
    const current=state.bindings[String(message.tabId)]?.scope;
    return {current,scopes:Object.entries(state.scopes).map(([id,s])=>({id,label:s.label,count:Object.keys(s.records).length})),
      count:Object.values(state.scopes).reduce((n,s)=>n+Object.keys(s.records).length,0)};
  }
  if(action==='open-local')return openView(state,message.scope);
  if(who.page==='/decode.html'||who.page==='/responseModal.html'){
    const viewId=new URL(sender.url).searchParams.get('view');
    const view=state.views[viewId];
    if(!view||Date.now()-view.createdAt>30*60*1000||!state.scopes[view.scope])throw new Error('This view expired or the session vault was cleared. Reopen Decode from the current conversation.');
    if(who.page==='/responseModal.html'){
      if(view.kind!=='response'||sender.frameId===0||sender.tab?.id!==view.tabId||state.bindings[String(view.tabId)]?.scope!==view.scope)throw new Error('This response view is not bound to the current conversation.');
    }else if(view.kind==='response')throw new Error('Response views are embedded only.');
    if(action==='view-data')return {...view,label:state.scopes[view.scope].label};
    if(action==='lookup')return {mappings:V.lookup(state,view.scope,message.tokens,true)};
    if(action==='check')return V.diagnose(state,view.scope,message.tokens);
  }
  if(action==='clear'&&who.page==='/popup.html'){
    await chrome.storage.session.remove(V.KEY);
    // Only a notification, never records or originals, is broadcast to pages.
    for(const tab of await chrome.tabs.query({}))chrome.tabs.sendMessage(tab.id,{type:'idia-vault-cleared'}).catch(()=>{});
    return {cleared:true};
  }
  throw new Error('Unsupported local vault operation.');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='idia-vault')return;
  const run=queue.then(()=>handle(message,sender));queue=run.catch(()=>{});
  run.then(result=>reply({ok:true,result}),()=>reply({ok:false,error:'The session vault could not complete this operation. It may be cleared, full, or unavailable. Nothing was submitted.'}));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{
  queue=queue.then(async()=>{await ready;const state=await V.load();delete state.bindings[String(tabId)];await V.save(state);}).catch(()=>{});
});
