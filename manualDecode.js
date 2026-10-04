// Manual launcher only. No assistant observation, response scraping or automatic lookup.
(() => {
  'use strict';
  let host,root,button,frame,viewId,opening=false,epoch=0,resizeObserver,observedComposer,healthNote;
  function health(){if(healthNote)healthNote.hidden=!!frame||IDIASite.status().health!=='degraded';position();}
  function position(){
    if(!host)return;
    const adapter=IDIASite.getActiveAdapter(),bottom=adapter.getFloatingUIOffset();
    const composer=adapter.findComposer();
    host.style.setProperty('bottom',bottom+'px','important');
    if(composer!==observedComposer){resizeObserver?.disconnect();observedComposer=composer;resizeObserver=composer?new ResizeObserver(position):null;if(composer)resizeObserver.observe(composer);}
    if(frame)frame.style.maxHeight=Math.max(120,innerHeight-bottom-86)+'px';
  }
  function close(){
    const returnFocus=!!frame;
    epoch++;opening=false;frame?.remove();frame=null;button?.setAttribute('aria-expanded','false');
    if(viewId)chrome.runtime.sendMessage({type:'idia-vault',action:'dismiss-view',viewId}).catch(()=>{});
    viewId=null;if(button){button.disabled=false;button.title='';if(returnFocus)button.focus({preventScroll:true});}health();
  }
  async function toggle(event){
    if(!event.isTrusted)return;
    if(frame){close();return;}if(opening)return;
    opening=true;const generation=++epoch;button.disabled=true;
    try{
      const view=await IDIAReversible.call('manual-view');
      if(generation!==epoch){chrome.runtime.sendMessage({type:'idia-vault',action:'dismiss-view',viewId:view.viewId}).catch(()=>{});return;}
      const expected=chrome.runtime.getURL('responseModal.html')+'?view='+view.viewId;
      if(view.url!==expected||!/^[A-F0-9]{32}$/.test(view.viewId))throw new Error('Invalid view');
      document.documentElement.append(host); // Keep this explicit view above older IDIA confirmations.
      viewId=view.viewId;frame=document.createElement('iframe');frame.className='idia-manual-frame';frame.title='IDIA manual decode panel';frame.src=expected;frame.allow='clipboard-write';root.append(frame);
      button.setAttribute('aria-expanded','true');health();frame.focus();
    }catch{button.title='Unable to open IDIA. Refresh this page and try again.';}
    finally{opening=false;button.disabled=false;}
  }
  function start(){
    if(host)return;
    host=document.createElement('div');host.id='idia-manual-decode';
    host.style.cssText='all:initial!important;position:fixed!important;right:24px!important;z-index:2147483647!important;';
    root=host.attachShadow({mode:'closed'});
    const css=document.createElement('link');css.rel='stylesheet';css.href=chrome.runtime.getURL('manualDecode.css');root.append(css);
    button=document.createElement('button');button.type='button';button.className='idia-button idia-manual-launcher';button.textContent='IDIA · Decode';button.setAttribute('aria-label','Open IDIA Decode');button.setAttribute('aria-expanded','false');button.addEventListener('click',toggle);
    healthNote=document.createElement('aside');healthNote.className='idia-adapter-notice';healthNote.setAttribute('role','status');healthNote.textContent="IDIA could not identify this site's composer. Text protection is temporarily unavailable. Manual Decode remains available.";root.append(button,healthNote);document.documentElement.append(host);health();
  }
  window.addEventListener('message',event=>{
    const u=new URL(chrome.runtime.getURL('/'));
    if(frame&&event.source===frame.contentWindow&&event.origin===u.protocol+'//'+u.host&&event.data?.viewId===viewId&&event.data.type==='idia-response-close')close();
  });
  IDIASite.subscribe(({refreshed})=>{if(refreshed)position();});
  window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});
  window.addEventListener('idia-adapter-health',health);
  window.addEventListener('idia-conversation-change',()=>{close();resizeObserver?.disconnect();resizeObserver=null;position();});
  window.addEventListener('idia-vault-cleared',close);
  window.addEventListener('pagehide',()=>{close();resizeObserver?.disconnect();host?.remove();});
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
