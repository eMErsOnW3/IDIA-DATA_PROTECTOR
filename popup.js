"use strict";
const toggle = document.getElementById("enabled");
const status = document.getElementById("status");
function showStatus() {
  status.textContent = toggle.checked ? "Protection active" : "Protection paused";
  document.body.dataset.state = toggle.checked ? "active" : "paused";
  for (const id of ["text-state", "file-state"]) document.getElementById(id).textContent = toggle.checked ? "ON" : "OFF";
}
chrome.storage.local.get({ enabled: true }, settings => {
  if (chrome.runtime.lastError) {
    status.textContent = "Could not load settings. Reopen the popup to retry.";
    document.body.dataset.state = "error";
    return;
  }
  toggle.checked = settings.enabled !== false;
  toggle.disabled = false;
  showStatus();
});
toggle.addEventListener("change", () => {
  toggle.disabled = true;
  chrome.storage.local.set({ enabled: toggle.checked }, () => {
    toggle.disabled = false;
    if (chrome.runtime.lastError) {
      toggle.checked = !toggle.checked;
      showStatus();
      status.textContent = "Could not save the setting. Please try again.";
      document.body.dataset.state = "error";
      return;
    }
    showStatus();
    console.info(`[IDIA] Protection ${toggle.checked ? "enabled" : "disabled"}.`);
  });
});
async function vaultCall(action,payload={}) {
  const result=await chrome.runtime.sendMessage({type:'idia-vault',action,...payload});
  if(!result?.ok)throw new Error('Vault unavailable.');return result.result;
}
async function refreshVault(){
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const result=await vaultCall('status',{tabId:tab?.id}),select=document.getElementById('vault-scope');select.replaceChildren();
    document.getElementById('vault-count').textContent=`Active protected values: ${result.count}`;
    for(const scope of result.scopes){const option=document.createElement('option');option.value=scope.id;option.textContent=`${scope.label} (${scope.count})`;select.append(option);}
    if(result.current)select.value=result.current;
    select.disabled=!result.scopes.length;document.getElementById('decode-local').disabled=!result.scopes.length;
    document.getElementById('clear-vault').disabled=false;
  }catch{document.getElementById('vault-count').textContent='Session vault unavailable. Reload IDIA and reopen the popup.';}
}
document.getElementById('decode-local').addEventListener('click',async()=>{
  try{await vaultCall('open-local',{scope:document.getElementById('vault-scope').value});}
  catch{document.getElementById('vault-count').textContent='Could not open local decode. Select a current conversation and try again.';}
});
const confirm=document.getElementById('clear-confirm');
document.getElementById('clear-vault').addEventListener('click',()=>{confirm.showModal();document.getElementById('cancel-clear').focus();});
document.getElementById('cancel-clear').addEventListener('click',()=>confirm.close());
document.getElementById('confirm-clear').addEventListener('click',async()=>{
  try{await vaultCall('clear');confirm.close();await refreshVault();}
  catch{document.getElementById('vault-count').textContent='The vault could not be cleared. Try again.';confirm.close();}
});
refreshVault();
async function refreshSite(){
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const site=await chrome.tabs.sendMessage(tab.id,{type:'idia-site-status'});
    if(!site)throw new Error('Unavailable');
    document.getElementById('site-name').textContent=site.name;
    document.getElementById('site-health').textContent=site.health==='ready'?'Composer detected':site.health==='checking'?'Waiting for composer…':'Text protection unavailable · Manual Decode available';
    document.getElementById('site-capabilities').textContent=`Text: ${site.capabilities.textProtection?'ready':'unavailable'} · Files: ${site.capabilities.fileInterception?'standard inputs':'unavailable'} · Decode: ${site.capabilities.decodePanel?'ready':'unavailable'}`;
    document.getElementById('site-validation').textContent=site.validation;
  }catch{document.getElementById('site-name').textContent='No active supported page';document.getElementById('site-health').textContent='Open a supported AI site and refresh it after updating IDIA.';}
}
refreshSite();
console.info("[IDIA] Popup loaded (v0.6.0).");
