(() => {
  "use strict";
  let enabled = true;
  let ready = false;
  const adapter=IDIASite.getActiveAdapter();
  const {visible}=IDIAEditors;
  const editors=()=>adapter.findComposers();
  const readDraft=editor=>adapter.readComposerText(editor);
  const insertDraft=(editor,text)=>adapter.writeComposerText(editor,text);
  let blockedEnter=false;

  let review = null;
  let lastEditor = null;
  let scanTimer = null;
  let reviewed = new WeakMap();
  let pageURL = location.href;
  const detectSensitiveInfo = globalThis.IDIAReversible?.detect || IDIADetectors.detectSensitiveInfo;
  const { sanitizeSelected, draftFingerprint } = IDIAEngine;

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type === "keydown") blockedEnter = true;
    console.info("[IDIA] Send blocked for review");
  }

  function approved(editor, text) {
    return reviewed.get(editor) === draftFingerprint(text);
  }

  function scan(editor) {
    clearTimeout(scanTimer);
    if (!ready || !enabled || review || IDIAReview.isOpen() || !editor || !visible(editor) || !adapter.isComposer(editor)) return;
    const text = readDraft(editor);
    const findings = detectSensitiveInfo(text);
    if (findings.length) {
      // Only counts and an editor reference survive the scan; no retained values.
      IDIAReview.showPrompt(findings.length, () => beginReview(editor), approved(editor, text));
    } else IDIAReview.hidePrompt();
  }

  function scheduleScan(editor) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(editor), 450);
  }

  function cancelReview() {
    const editor = review?.editor;
    review = null;
    if (editor?.isConnected) {
      editor.focus();
      scheduleScan(editor);
    }
    console.info("[IDIA] Review cancelled; draft unchanged");
  }

  async function applySelection(selectedFindings) {
    const operation = review;
    if (!operation || !enabled) return "Protection is no longer enabled. Cancel this review.";
    const { editor, text, url } = operation;
    if (!visible(editor) || url !== location.href || readDraft(editor) !== text) {
      return "The draft changed while this review was open. Cancel and review the current draft again.";
    }
    let protectedText;
    try {
      const chosen = globalThis.IDIAReversible ? await IDIAReversible.replacements(selectedFindings) : selectedFindings;
      if(review!==operation||!enabled||!visible(editor)||url!==location.href||readDraft(editor)!==text)
        return "The draft changed or protection was cancelled. Review the current draft again.";
      protectedText = sanitizeSelected(text, chosen);
      // Clear All + Protect Selected explicitly keeps all items. Cancel never approves.
      if (protectedText !== text) insertDraft(editor, protectedText);
      if (readDraft(editor).replace(/\r\n/g, "\n").trimEnd() !== protectedText.replace(/\r\n/g, "\n").trimEnd()) {
        return "The website did not accept the update. Cancel and check the draft before trying again.";
      }
    } catch {
      return "IDIA could not update this editor. Nothing was submitted. Cancel and check the draft.";
    }
    reviewed.set(editor, draftFingerprint(readDraft(editor)));
    review = null; // Drop the original draft and findings as soon as review ends.
    console.info("[IDIA] Protected draft inserted; selected items:", selectedFindings.length);
    queueMicrotask(() => { if (editor.isConnected) editor.focus(); scheduleScan(editor); });
    return null;
  }

  function beginReview(editor, findings) {
    if (!enabled || review || IDIAReview.isOpen() || !visible(editor) || !adapter.isComposer(editor)) return;
    clearTimeout(scanTimer);
    const text = readDraft(editor);
    findings = findings || detectSensitiveInfo(text);
    if (!findings.length) { IDIAReview.hidePrompt(); return; }
    review = { editor, text, url: location.href };
    IDIAReview.showPrivacyReview(findings, { onApply: applySelection, onCancel: cancelReview });
    console.info("[IDIA] Privacy Check opened; findings:", findings.length);
  }

  function protect(event, editor) {
    if (ready && !enabled) return false;
    if (!ready) { stop(event); return true; }
    if (review || IDIAReview.isOpen() || globalThis.IDIAFileGuard?.hasPending()) { stop(event); return true; }
    try {
      const text = readDraft(editor);
      if (approved(editor, text)) {
        globalThis.IDIAReversible?.markSend(text);
        console.info("[IDIA] User-reviewed draft, allowing send");
        return false;
      }
      const findings = detectSensitiveInfo(text);
      if (!findings.length) {
        globalThis.IDIAReversible?.markSend(text);
        console.info("[IDIA] No sensitive data, allowing send");
        return false;
      }
      stop(event);
      beginReview(editor, findings);
    } catch {
      stop(event);
      console.error("[IDIA] Local privacy check failed; send remains blocked. Reload the page to retry.");
    }
    return true;
  }

  function eventEditor(event) {
    if (IDIAReview.isOwnEvent(event)) return null;
    return editors().find(editor => event.composedPath().includes(editor));
  }

  // Local scans never change text or steal focus while typing/pasting.
  document.addEventListener("input", event => {
    const editor = eventEditor(event);
    if (!editor) return;
    reviewed.delete(editor);
    lastEditor = editor;
    if (!event.isComposing) scheduleScan(editor);
  }, true);
  document.addEventListener("compositionend", event => {
    const editor = eventEditor(event);
    if (editor) scheduleScan(editor);
  }, true);
  document.addEventListener("focusin", event => {
    const editor = eventEditor(event);
    if (editor) { lastEditor = editor; scheduleScan(editor); }
    else if (!IDIAReview.isOwnEvent(event) && !review) { clearTimeout(scanTimer); IDIAReview.hidePrompt(); }
  }, true);

  // Delegated capture listeners preserve the existing ChatGPT interception.
  document.addEventListener("keydown", event => {
    if (IDIAReview.isOwnEvent(event) || event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    const editor = eventEditor(event);
    if (!editor) return;
    if (!adapter.isEnterSend(event,editor)) return;
    console.info("[IDIA] Enter send detected");
    if (event.repeat && blockedEnter) { stop(event); return; }
    protect(event, editor);
  }, true);
  document.addEventListener("keyup", event => { if (event.key === "Enter") blockedEnter = false; }, true);
  window.addEventListener("blur", () => { blockedEnter = false; });
  document.addEventListener("click", event => {
    if (IDIAReview.isOwnEvent(event)) return;
    const button = event.composedPath().find(node => node instanceof Element && node.matches('button, [role="button"], input[type="submit"]'));
    if (!button || !adapter.isSendButton(button)) return;
    const associated = editors().filter(editor => adapter.belongsToComposer(button, editor));
    if (!associated.length) return;
    console.info("[IDIA] Send button click detected");
    for (const editor of associated) if (protect(event, editor)) break;
  }, true);
  document.addEventListener("submit", event => {
    if (!adapter.capabilities.sendReview) return;
    if (IDIAReview.isOwnEvent(event)) return;
    const associated = editors().filter(editor => editor.form === event.target || editor.closest("form") === event.target);
    for (const editor of associated) if (protect(event, editor)) break;
  }, true);

  function resetReview() {
    clearTimeout(scanTimer);
    IDIAReview.close("text"); IDIAReview.hidePrompt();
    review = null; lastEditor = null; reviewed = new WeakMap(); blockedEnter = false;
  }
  // Release temporary drafts if React detaches the editor or navigation occurs.
  IDIASite.subscribe(()=>{
    if(pageURL!==location.href){pageURL=location.href;resetReview();}
    else if((review&&!review.editor.isConnected)||(lastEditor&&!lastEditor.isConnected))resetReview();
  });
  window.addEventListener("pagehide", resetReview);
  window.addEventListener("idia-conversation-change", resetReview);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (!enabled) resetReview();
      else if (document.activeElement) scheduleScan(editors().find(editor => editor === document.activeElement || editor.contains(document.activeElement)));
      console.info(`[IDIA] Protection ${enabled ? "enabled" : "disabled"}.`);
    }
  });
  chrome.storage.local.get({ enabled: true }, settings => {
    if (chrome.runtime.lastError) console.warn("[IDIA] Settings unavailable; protection defaults to enabled.");
    else enabled = settings.enabled !== false;
    ready = true;
    scheduleScan(editors().find(editor => editor === document.activeElement || editor.contains(document.activeElement)));
    console.info(`[IDIA] Content script ready. Protection ${enabled ? "enabled" : "disabled"}.`);
  });
  console.info("[IDIA] Content script loaded (v0.6.0). Detect → review → protect selected.");
})();
