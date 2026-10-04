// Service-worker-only storage engine. All mutations are serialized by background.js.
// Originals exist only in chrome.storage.session and short-lived trusted memory.
(() => {
  'use strict';
  const KEY='idiaSessionVault',MAX_RECORDS=5000,MAX_BYTES=2*1024*1024;
  const empty=()=>({scopes:{},conversations:{},bindings:{},views:{}});
  const fail=()=>{throw new Error('The local session vault is unavailable or full. Nothing was released.');};
  async function load(){return (await chrome.storage.session.get(KEY))[KEY]||empty();}
  async function save(state){
    if(new TextEncoder().encode(JSON.stringify(state)).length>MAX_BYTES)fail();
    await chrome.storage.session.set({[KEY]:state});
  }
  function scope(state,{tabId,url,documentId,proof=[]}){
    const platform=IDIAPlatforms.select(url)?.id;
    if(!platform)throw new Error('Unsupported conversation origin.');
    const stable=IDIAPlatforms.identity(url),route=stable||platform+':'+new URL(url).pathname+new URL(url).search;
    const key=String(tabId),old=state.bindings[key];let id,pending=old?.pending;
    // An armed send must establish its new route promptly in the same document.
    // Exact token evidence may arrive much later (especially file-only prompts).
    // Once pinned to that new route, keep the candidate across a same-chat reload.
    // Navigating elsewhere drops it; a preexisting conversation never gets one.
    if(stable&&pending?.target===stable&&old.scope===state.conversations[stable]
      &&state.scopes[pending.scope]&&!state.scopes[pending.scope].conversationId
      &&proof.some(t=>pending.tokens.includes(t))){
      id=pending.scope;
      const provisional=old.scope;
      Object.assign(state.scopes[id].records,state.scopes[provisional].records);
      for(const binding of Object.values(state.bindings))if(binding.scope===provisional)binding.scope=id;
      for(const view of Object.values(state.views))if(view.scope===provisional)view.scope=id;
      delete state.scopes[provisional];pending=null;
      state.scopes[id].conversationId=stable;state.scopes[id].label=stable;
    }
    else if(stable&&state.conversations[stable])id=state.conversations[stable];
    else if(old&&state.scopes[old.scope]&&old.route===route)id=old.scope;
    else if(stable&&old&&!old.stable&&old.platform===platform&&old.documentId===documentId&&old.armedUntil>Date.now()
      &&proof.some(token=>old.armedTokens?.includes(token))){
      id=old.scope;state.scopes[id].conversationId=stable;state.scopes[id].label=stable;
    }
    if(!id){
      if(stable&&old&&!old.stable&&old.platform===platform&&old.documentId===documentId&&old.armedUntil>Date.now())
        pending={scope:old.scope,target:stable,documentId,until:old.armedUntil,tokens:old.armedTokens||[]};
      id=IDIATokenSyntax.randomId();state.scopes[id]={conversationId:stable,label:stable||`New chat · tab ${tabId}`,records:{}};
    }
    if(stable)state.conversations[stable]=id;
    state.bindings[key]={scope:id,route,stable,documentId,platform,...(pending?.target===stable?{pending}:{}),
      ...(old?.scope===id&&!stable?{armedUntil:old.armedUntil,armedTokens:old.armedTokens}: {})};
    return id;
  }
  function create(state,scopeId,items){
    const scope=state.scopes[scopeId];if(!scope||!Array.isArray(items)||items.length>2000)fail();
    let count=Object.values(state.scopes).reduce((n,s)=>n+Object.keys(s.records).length,0);
    const used=new Set(Object.values(state.scopes).flatMap(s=>Object.keys(s.records)));
    const reuse=new Map(Object.entries(scope.records).map(([token,r])=>[r.type+'\0'+r.original,token]));
    return items.map(({type,value})=>{
      if(!/^[A-Z][A-Z0-9]{0,23}$/.test(type)||typeof value!=='string'||!value.length||value.length>100000)fail();
      const key=type+'\0'+value;let token=reuse.get(key);
      if(!token){
        if(++count>MAX_RECORDS)fail();
        do{token=`[IDIA_${type}_${IDIATokenSyntax.randomId()}]`;}while(used.has(token));
        scope.records[token]={original:value,type,createdAt:Date.now()};used.add(token);reuse.set(key,token);
      }
      return token;
    });
  }
  function lookup(state,scopeId,tokens,originals=false){
    if(!Array.isArray(tokens)||tokens.length>2000||tokens.some(t=>!IDIATokenSyntax.exact(t)))throw new Error('Invalid token lookup.');
    const records=state.scopes[scopeId]?.records||{},result={};
    for(const token of new Set(tokens))if(Object.hasOwn(records,token))result[token]=originals?records[token].original:true;
    return result;
  }
  // Only exact requested identifiers leave this function; never records or originals.
  function diagnose(state,scopeId,tokens){
    const current=lookup(state,scopeId,tokens),all=new Set(Object.values(state.scopes).flatMap(s=>Object.keys(s.records)));
    const tokenStatus=[...new Set(tokens)].map(token=>({token,inSession:all.has(token),inScope:Object.hasOwn(current,token)}));
    return {tokens:Object.keys(current),sessionMatches:tokenStatus.filter(t=>t.inSession).length,
      scopeMismatches:tokenStatus.filter(t=>t.inSession&&!t.inScope).length,
      unmapped:tokenStatus.filter(t=>!t.inSession).length,tokenStatus};
  }
  globalThis.IDIATokenVault=Object.freeze({KEY,load,save,scope,create,lookup,diagnose,empty});
})();
