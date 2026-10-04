// TXT/CSV/DOCX/XLSX/PDF/PNG/JPEG selection protection. No uploads, form submission, or disk writes.
(() => {
  "use strict";
  const processors = [IDIATextProcessor, IDIADocxProcessor, IDIAXlsxProcessor, IDIAPdfProcessor, IDIAImageProcessor];
  const pendingInputs = new Map();
  // Tag the exact events we create, rather than exempting all events on an input.
  const replacementEvents = new WeakSet();
  let enabled = true, ready = false, settingsChanged = false;
  let queue = Promise.resolve();
  let pageURL = location.href;
  const settingsReady = new Promise(resolve => {
    chrome.storage.local.get({ enabled: true }, settings => {
      if (chrome.runtime.lastError) console.warn("[IDIA] File settings unavailable; protection defaults to enabled.");
      else if (!settingsChanged) enabled = settings.enabled !== false;
      ready = true;
      resolve();
    });
  });

  function extension(file) { return file.name.match(/\.(txt|csv|docx|xlsx|pdf|png|jpe?g)$/i)?.[0] || ""; }
  function sameFiles(input, files) {
    return input.files?.length === files.length && files.every((file, index) => input.files[index] === file);
  }
  function current(job) {
    return !job.controller.signal.aborted && job.input.isConnected &&
      job.url === location.href && sameFiles(job.input, job.originals);
  }
  function hold(event) {
    event.preventDefault(); // Native input/change may be non-cancelable; propagation is key.
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
  function abort(job) {
    job.controller.abort();
    IDIAReview.close("file", job);
    if (pendingInputs.get(job.input) === job) pendingInputs.delete(job.input);
  }
  function notifySite(input, files) {
    for (const type of ["input", "change"]) {
      // A host callback can synchronously clear/remove/reselect this input.
      if (!input.isConnected || !sameFiles(input, files)) break;
      const event = new Event(type, { bubbles: true, composed: true });
      replacementEvents.add(event);
      input.dispatchEvent(event);
    }
  }
  function safeFileName(file) {
    const suffix = extension(file);
    return `${file.name.slice(0, -suffix.length)}-safe${suffix}`;
  }

  async function reviewFile(job, file, contents, errorMessage = "") {
    if (!await IDIAReview.whenIdle(job.controller.signal) || !current(job)) return null;
    const findings = errorMessage ? [] : contents.findings;
    return new Promise(resolve => {
      const finish = result => {
        job.controller.signal.removeEventListener("abort", cancelled);
        resolve(result);
      };
      const cancelled = () => finish(null);
      job.controller.signal.addEventListener("abort", cancelled, { once: true });
      const shown = IDIAReview.showPrivacyReview(findings, {
        mode: "file", fileName: file.name, errorMessage, owner: job,
        continueOriginal: !errorMessage && contents.continueOriginalWhenEmpty && !findings.length,
        descriptionOverride: contents?.reviewDescription, noteOverride: contents?.reviewNote,
        applyLabelOverride: contents?.applyLabel, processingLabel: contents?.processingLabel,
        onCancel: () => { finish(null); abort(job); },
        onApply: async selectedFindings => {
          if (!enabled || !current(job)) return "The selection changed. Cancel and select the file again.";
          try {
            const safe = await contents.buildFile(selectedFindings, safeFileName(file));
            if (!enabled || !current(job)) return "The file operation was cancelled or the selection changed.";
            console.info("[IDIA] Safe file staged; selected findings:", selectedFindings.length);
            job.protectedCount = (job.protectedCount || 0) + selectedFindings.length; // UI count only.
            finish(safe);
            return null;
          } catch (error) {
            return error.name === "IDIAFileError" ? error.message : "IDIA could not create the safe copy. Cancel and try selecting the file again.";
          }
        }
      });
      if (!shown) finish(null);
      else console.info("[IDIA] File Privacy Check opened; findings:", findings.length);
    });
  }

  async function processSelection(job) {
    await settingsReady;
    if (!current(job)) return;
    // A disabled preference discovered during initialization should pass through.
    if (!enabled) { notifySite(job.input, job.originals); return; }
    const replacements = [...job.originals];
    for (let index = 0; index < job.originals.length; index++) {
      const file = job.originals[index];
      if (!extension(file)) continue; // Keep unsupported entries and their order.
      const processor = processors.find(processor => processor.supports(file));
      let contents;
      if (processor.progressLabel) {
        if (!await IDIAReview.whenIdle(job.controller.signal) || !current(job)) return;
        IDIAReview.showPrivacyReview([], { mode: "file", fileName: file.name, owner: job,
          loadingMessage: processor.progressLabel, onCancel: () => abort(job), onApply: () => {} });
      }
      try { contents = await processor.prepare(file, { signal: job.controller.signal,
        ...(/\.(txt|csv|docx|xlsx)$/i.test(file.name) && globalThis.IDIAReversible ? {
          scanText: IDIAReversible.detect,
          transform: async selected => {
            if(!current(job)||!enabled)throw new Error("The selection changed.");
            const result=await IDIAReversible.replacements(selected);
            if(!current(job)||!enabled)throw new Error("The selection changed.");
            return result;
          }
        } : {}),
        onProgress: progress => { if (current(job)) IDIAReview.updateProgress?.(job, progress); },
        onConfirm: async plan => {
          if(!current(job))return false;
          IDIAReview.close("file",job);
          const confirmed=await new Promise(resolve=>{
            const finish=value=>{job.controller.signal.removeEventListener("abort",cancelled);resolve(value);};
            const cancelled=()=>finish(false);
            job.controller.signal.addEventListener("abort",cancelled,{once:true});
            const shown=IDIAReview.showPrivacyReview([], {mode:"file",fileName:file.name,owner:job,
              titleOverride:plan.title||"Large document",applyLabelOverride:"Continue Scanning",
              descriptionOverride:plan.description||`${plan.pages} pages\n${plan.ocrPages} pages require OCR\n${(plan.fileBytes/1048576).toFixed(1)} MiB\n\nLocal scanning may take several minutes. Estimated scanning time: about ${plan.estimatedSeconds<60?`${plan.estimatedSeconds} seconds`:`${Math.ceil(plan.estimatedSeconds/60)} minutes`}; your device may take longer.`,
              noteOverride:"Your document remains on this device. Continue Scanning only starts local analysis. You will still choose findings before a file is released to this site.",
              onCancel:()=>{finish(false);abort(job);},onApply:()=>{finish(true);}
            });
            if(!shown)finish(false);
          });
          if(!confirmed||!current(job))return false;
          IDIAReview.showPrivacyReview([], {mode:"file",fileName:file.name,owner:job,
            loadingMessage:processor.progressLabel,onCancel:()=>abort(job),onApply:()=>{}});
          return true;
        } }); }
      catch (error) {
        if (processor.progressLabel) IDIAReview.close("file", job);
        if (current(job)) await reviewFile(job, file, null, error.message || "The file could not be read locally.");
        return;
      }
      if (processor.progressLabel) IDIAReview.close("file", job);
      let safe;
      try {
        if (!current(job) || !enabled) return;
        safe = await reviewFile(job, file, contents);
      } finally { await contents?.dispose?.(); contents = null; }
      if (!safe || !current(job)) return; // Cancel leaves the entire original list intact.
      replacements[index] = safe;
    }
    if (!current(job) || !enabled) return;
    try {
      const transfer = new DataTransfer();
      replacements.forEach(file => transfer.items.add(file));
      if (!sameFiles(job.input, replacements)) job.input.files = transfer.files;
      if (!sameFiles(job.input, replacements)) throw new Error("File replacement did not take effect.");
    } catch {
      await reviewFile(job, job.originals.find(extension), null,
        "This browser or website refused file replacement. The original selection was not released. Cancel and try again.");
      return;
    }
    // Remove pending status before site callbacks. Our tagged events bypass only
    // this guard; a new selection dispatched by the site is still intercepted.
    pendingInputs.delete(job.input);
    console.info("[IDIA] Reviewed file selection ready; notifying the site.");
    // Presentation only, after successful FileList assignment. UI errors must not affect delivery.
    try {
      IDIAReview.showConfirmation?.({ mode: "file", protectedCount: job.protectedCount || 0,
        fileNames: replacements.filter((file, index) => file !== job.originals[index]).map(file => file.name),
        originalKept: sameFiles(job.input, job.originals) });
    } catch { /* Protection and event delivery do not depend on the confirmation card. */ }
    notifySite(job.input, replacements);
  }

  function onSelectionEvent(event) {
    if (replacementEvents.has(event)) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    const previous = pendingInputs.get(input);
    if (previous && !sameFiles(input, previous.originals)) abort(previous);
    if (ready && !enabled) return;
    const files = Array.from(input.files || []);
    if (!files.some(extension)) return;
    // File inputs emit input before change. Stop both synchronously, before any
    // await, so target/React handlers cannot see the raw selection through them.
    hold(event);
    if (event.type !== "change" || pendingInputs.has(input)) return;
    const job = { input, originals: files, url: location.href, controller: new AbortController() };
    pendingInputs.set(input, job);
    console.info("[IDIA] File selection intercepted; supported files:", files.filter(extension).length);
    queue = queue.then(() => processSelection(job)).catch(() => {
      console.error("[IDIA] File protection failed; original selection not released to the site.");
    }).finally(() => {
      if (pendingInputs.get(input) === job) pendingInputs.delete(input);
    });
  }
  document.addEventListener("input", onSelectionEvent, true);
  document.addEventListener("change", onSelectionEvent, true);
  document.addEventListener("submit", event => {
    if ([...pendingInputs.values()].some(job => job.input.form === event.target)) hold(event);
  }, true);

  function cancelAll() { for (const job of [...pendingInputs.values()]) abort(job); }
  const observeChanges = () => {
    if (pageURL !== location.href) { pageURL = location.href; cancelAll(); }
    else for (const job of [...pendingInputs.values()]) if (!current(job)) abort(job);
  };
  if(globalThis.IDIASite)IDIASite.subscribe(observeChanges);
  else new MutationObserver(observeChanges).observe(document,{childList:true,subtree:true});
  window.addEventListener("popstate", cancelAll);
  window.addEventListener("hashchange", cancelAll);
  window.addEventListener("pagehide", cancelAll);
  window.addEventListener("idia-conversation-change", cancelAll);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      settingsChanged = true;
      enabled = changes.enabled.newValue !== false;
      if (!enabled) cancelAll(); // Do not replay an unreviewed selection on toggle-off.
    }
  });
  globalThis.IDIAFileGuard = Object.freeze({ hasPending: () => pendingInputs.size > 0 });
  console.info("[IDIA] TXT/CSV/DOCX/XLSX/PDF/PNG/JPEG file guard loaded (v0.6.0).");
})();
