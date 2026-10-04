// One active adapter and one shared DOM/navigation observer. No response decoding.
(() => {
 'use strict';
 const local=location.protocol==='file:'||location.protocol==='chrome-extension:',config=IDIAPlatforms.select(location.href);
 const adapter=config?IDIABaseAdapter.create(config):IDIAGenericAdapter.create({local});
 const listeners=new Set();let url=location.href,timer,started=Date.now(),health='checking';
 function status(){return {id:adapter.id,name:adapter.name,health,capabilities:{...adapter.capabilities,textProtection:health==='ready',sendReview:health==='ready'&&adapter.capabilities.sendReview},validation:'Simulated compatibility; live validation pending'};}
 function refresh(){
  clearTimeout(timer);const changed=url!==location.href;if(changed){url=location.href;started=Date.now();health='checking';window.dispatchEvent(new Event('idia-conversation-change'));}
  const next=adapter.findComposer()?'ready':Date.now()-started>=5000?'degraded':'checking';
  if(next!==health){health=next;window.dispatchEvent(new Event('idia-adapter-health'));}
  for(const fn of listeners)fn({changed,health,refreshed:true});
 }
 const observer=new MutationObserver(records=>{
  if(url!==location.href){refresh();return;}
  for(const fn of listeners)fn({changed:false,health});
  if(records.some(r=>r.removedNodes.length||![...r.addedNodes].every(n=>n.nodeType===3))){clearTimeout(timer);timer=setTimeout(refresh,400);}
 });observer.observe(document,{childList:true,subtree:true});
 window.addEventListener('popstate',refresh);window.addEventListener('hashchange',refresh);
 // A low-frequency URL check catches pushState with no DOM mutation. No DOM polling.
 const routeTimer=setInterval(()=>{if(url!==location.href)refresh();},1000);
 const initial=setTimeout(refresh,5500);window.addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(timer);clearTimeout(initial);clearInterval(routeTimer);listeners.clear();});
 globalThis.IDIASite=Object.freeze({getActiveAdapter:()=>adapter,subscribe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},status});
 if(globalThis.chrome?.runtime?.onMessage)chrome.runtime.onMessage.addListener((m,_sender,reply)=>{if(m?.type==='idia-site-status'){refresh();reply(status());}});
})();
