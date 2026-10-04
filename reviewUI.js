// Presentation only. Sensitive values use textContent, never HTML interpolation.
(() => {
  "use strict";
  let host, root, active = null, prompt = null;
  let confirmation = null, confirmationTimer = null;
  let decodeToast = null;
  const idleWaiters = new Set();
  const stylesheet = globalThis.chrome?.runtime?.getURL
    ? chrome.runtime.getURL("styles.css") : new URL("styles.css", document.baseURI).href;
  function ensureRoot() {
    if (host?.isConnected) return;
    host = document.createElement("div"); host.id = "idia-privacy-root";
    host.style.setProperty("all", "initial", "important");
    root = host.attachShadow({ mode: "open" });
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = stylesheet;
    root.append(link); document.documentElement.append(host);
  }
  function element(tag, className, text) {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, handler, primary = false) {
    const node = element("button", `idia-button${primary ? " idia-primary" : ""}`, text);
    node.type = "button"; node.addEventListener("click", handler); return node;
  }
  function icon(kind) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "idia-icon"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", { shield: "M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6Z M8.5 12l2.5 2.5 4.5-5",
      file: "M14 3H6v18h12V7Z M14 3v5h4 M9 12h6 M9 16h6", check: "M5 12l4 4L19 6", close: "m6 6 12 12M18 6 6 18" }[kind]);
    svg.append(path); return svg;
  }
  function dismissConfirmation() { clearTimeout(confirmationTimer); confirmation?.remove(); confirmation = null; }
  function showConfirmation({ protectedCount = 0, fileNames = [], mode = "text", originalKept = false } = {}) {
    ensureRoot(); dismissConfirmation();
    const returnFocus = document.activeElement;
    confirmation = element("aside", "idia-confirmation");
    const status = element("div", "idia-confirmation-status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const heading = element("p", "idia-confirmation-heading", protectedCount ? "Protected by IDIA" : "Review complete");
    heading.prepend(icon("check")); status.append(heading);
    status.append(element("p", "idia-confirmation-text", protectedCount
      ? mode === "file" ? "Selected information protected. Your original files are unchanged." : "Selected information protected. Review your draft before sharing."
      : originalKept ? "Original selection kept. No protection was applied." : "No items selected for protection."));
    for (const name of fileNames) status.append(element("p", "idia-confirmation-file", name));
    const dismiss = button("", () => { dismissConfirmation(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }); dismiss.classList.add("idia-dismiss"); dismiss.setAttribute("aria-label", "Dismiss confirmation"); dismiss.append(icon("close"));
    confirmation.append(status, dismiss); root.append(confirmation);
    // A nonmodal, transient status never moves focus or retains detected values.
    confirmationTimer = setTimeout(dismissConfirmation, 8000);
    confirmation.addEventListener("focusin", () => clearTimeout(confirmationTimer));
    confirmation.addEventListener("mouseenter", () => clearTimeout(confirmationTimer));
    const resumeDismissal = () => {
      if (!confirmation?.matches(":hover, :focus-within")) { clearTimeout(confirmationTimer); confirmationTimer = setTimeout(dismissConfirmation, 8000); }
    };
    confirmation.addEventListener("focusout", resumeDismissal);
    confirmation.addEventListener("mouseleave", resumeDismissal);
  }
  function hidePrompt() { prompt?.remove(); prompt = null; }
  function hideDecodeToast() { decodeToast?.remove(); decodeToast = null; }
  function showDecodeToast({ count, onView }) {
    ensureRoot(); hideDecodeToast();
    const toast = element("aside", "idia-decode-toast"); decodeToast = toast;
    toast.setAttribute("aria-label", "IDIA decode notification");
    const status = element("div", "idia-decode-toast-status"); status.setAttribute("role", "status");
    status.append(element("strong", "idia-decode-toast-title", "IDIA · Decode available"),
      element("p", "idia-decode-toast-count", `${count} protected ${count === 1 ? "value" : "values"} found`));
    const dismiss = button("×", hideDecodeToast); dismiss.classList.add("idia-dismiss"); dismiss.setAttribute("aria-label", "Dismiss decode notification");
    const view = button("View →", async event => {
      if (!event.isTrusted) return;
      view.disabled = true;
      try { await onView(); }
      catch { status.lastChild.textContent = "Unable to open the local view. Please retry."; }
      finally { view.disabled = false; }
    });
    view.setAttribute("aria-label", "View decoded response");
    toast.append(status, dismiss, view); root.append(toast);
  }
  function positionDecodeToast(rect) {
    if (!decodeToast) return;
    let bottom = 24;
    const width = Math.min(280, innerWidth - 48);
    if (rect && rect.right > innerWidth - 24 - width && rect.left < innerWidth - 24 && rect.bottom > innerHeight - 130)
      bottom = Math.max(24, Math.min(innerHeight - 140, innerHeight - rect.top + 16));
    decodeToast.style.bottom = `${bottom}px`;
  }
  function showDecodeFrame({ frameURL, viewId, owner, onCancel }) {
    const expected = chrome.runtime.getURL("responseModal.html");
    if (frameURL !== expected + "?view=" + viewId || !/^[A-F0-9]{32}$/.test(viewId)) return false;
    ensureRoot(); hidePrompt(); dismissConfirmation();
    const focus = root.activeElement || document.activeElement;
    const dialog = element("dialog", "idia-frame-dialog"); dialog.setAttribute("aria-label", "IDIA Decode Response");
    const frame = element("iframe", "idia-decode-frame"); frame.title = "IDIA Decode Response"; frame.src = frameURL;
    frame.setAttribute("allow", "clipboard-write");
    const loading = element("div", "idia-frame-loading", "Opening local decode…");
    const cancel = () => { close("decode", owner); onCancel?.(); if (focus?.isConnected) focus.focus({ preventScroll: true }); };
    const escape = button("Close", cancel); loading.append(escape);
    const origin = new URL(expected); const trustedOrigin = origin.protocol + "//" + origin.host;
    const receive = event => {
      if (event.source !== frame.contentWindow || event.origin !== trustedOrigin || event.data?.viewId !== viewId) return;
      if (event.data.type === "idia-response-ready") loading.remove();
      if (event.data.type === "idia-response-close") cancel();
    };
    window.addEventListener("message", receive);
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
    dialog.append(frame, loading); root.append(dialog);
    active = { dialog, mode: "decode", owner, dispose: () => {
      window.removeEventListener("message", receive);
      chrome.runtime.sendMessage({type:"idia-vault",action:"dismiss-view",viewId}).catch(() => {});
    } };
    dialog.showModal(); frame.focus(); return true;
  }
  function showPrompt(count, onReview, reviewed = false) {
    if (active) return;
    ensureRoot(); hidePrompt();
    prompt = button(`IDIA · ${count} sensitive ${count === 1 ? "item" : "items"} · ${reviewed ? "Review again" : "Review"}`, onReview);
    prompt.prepend(icon("shield"));
    prompt.classList.add("idia-prompt"); root.append(prompt);
  }
  function close(mode, owner) {
    if (!active || (mode && active.mode !== mode) || (owner && active.owner !== owner)) return;
    const { dialog, dispose } = active; active = null; dispose?.(); dialog.close(); dialog.remove();
    for (const notify of [...idleWaiters]) notify(true);
  }
  function isOpen(mode) { return !!active && (!mode || active.mode === mode); }
  function whenIdle(signal) {
    if (signal?.aborted) return Promise.resolve(false);
    if (!active) return Promise.resolve(true);
    return new Promise(resolve => {
      const done = available => {
        idleWaiters.delete(done);
        signal?.removeEventListener("abort", abort);
        resolve(available);
      };
      const abort = () => done(false);
      idleWaiters.add(done);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  function showPrivacyReview(findings, { onApply, onCancel, mode = "text", fileName = "", errorMessage = "", owner, continueOriginal = false,
    descriptionOverride, noteOverride, applyLabelOverride, titleOverride, loadingMessage = "", frameURL, viewId, decodeContent, decodeControls }) {
    // A file review must not discard a text review (or another file review).
    if (active) return false;
    if (mode === "decode" && frameURL) return showDecodeFrame({frameURL,viewId,owner,onCancel});
    const decodeMode = mode === "decode";
    // Original values may only be rendered by this component in the extension frame.
    if (decodeMode && (location.protocol !== "chrome-extension:" || location.pathname !== "/responseModal.html")) return false;
    ensureRoot(); hidePrompt(); dismissConfirmation();
    const fileMode = mode === "file";
    const dialog = element("dialog", "idia-dialog");
    dialog.dataset.state = loadingMessage ? "scanning" : errorMessage ? "error" : "review";
    dialog.dataset.mode = mode;
    dialog.dataset.hasFindings = String(findings.length > 0);
    dialog.setAttribute("aria-labelledby", "idia-title"); dialog.setAttribute("aria-describedby", "idia-description");
    const layout = element("div", "idia-layout"), header = element("header", "idia-header");
    const title = element("h2", "idia-title", titleOverride || (decodeMode ? "IDIA Decode Response" : fileMode ? "IDIA File Privacy Check" : "IDIA Privacy Check")); title.id = "idia-title";
    const description = element("p", "idia-description", (loadingMessage ? "Analyzing document…" : "") || descriptionOverride?.replace("in v0.3.0", "in this version") || (errorMessage
      ? "Unable to scan this file.\nThe original selection has not been released to the site."
      : continueOriginal ? "No sensitive information detected. You can continue with the original file or cancel."
      : `${findings.length} sensitive ${findings.length === 1 ? "item" : "items"} detected\nChoose which items to protect before sharing.`));
    description.id = "idia-description";
    const brand = element("div", "idia-brand", "IDIA • LOCAL PRIVACY PROTECTION"); brand.prepend(icon("shield"));
    header.append(brand, title);
    if (fileMode) header.append(element("p", "idia-file-name", `File: ${fileName}`));
    header.append(description);
    const list = element("div", "idia-list");
    list.tabIndex = 0; list.setAttribute("role", "region"); list.setAttribute("aria-label", "Sensitive findings");
    if (decodeMode) { list.classList.add("idia-decoded-preview"); list.setAttribute("aria-label", "Decoded response"); if (decodeContent) list.append(decodeContent); }
    const rows = findings.map(finding => {
      const row = element("label", "idia-row"), checkbox = element("input", "idia-checkbox");
      checkbox.type = "checkbox"; checkbox.checked = true; checkbox.dataset.findingId = finding.id;
      const details = element("span", "idia-details");
      details.append(element("span", "idia-type", finding.label), element("span", "idia-value", finding.value));
      if (finding.sourceHint) details.append(element("span", "idia-source", finding.sourceHint));
      row.append(checkbox, details); list.append(row); return { checkbox, finding };
    });
    const counter = element("span", "idia-selection-count"); counter.setAttribute("role", "status");
    const updateCount = () => { counter.textContent = `${rows.filter(row => row.checkbox.checked).length} selected`; };
    rows.forEach(({ checkbox }) => checkbox.addEventListener("change", updateCount)); updateCount();
    const tools = element("div", "idia-tools");
    tools.append(button("Select All", () => { rows.forEach(row => { row.checkbox.checked = true; }); updateCount(); }),
      button("Clear All", () => { rows.forEach(row => { row.checkbox.checked = false; }); updateCount(); }), counter);
    if (decodeMode) { tools.replaceChildren(); if (decodeControls) tools.append(decodeControls); tools.hidden = !decodeControls; }
    const note = element("p", "idia-note", errorMessage ? "Cancel to close this review. IDIA has not released this selection." : noteOverride || (fileMode
      ? continueOriginal ? "Continue with original notifies this site of the unchanged file; the site may then upload it. Cancel leaves the selection held."
      : "Only checked items are hidden in a new -safe copy. Your disk file stays unchanged. Protect File notifies this site of the copy; the site may then start uploading it. Cancel keeps the original selection without notifying the site."
      : "Unchecked items stay visible. Selecting none and clicking Protect Selected keeps the draft unchanged. Nothing is sent automatically."));
    const error = element("p", "idia-note idia-error", errorMessage); error.setAttribute("role", "alert");
    const notices = element("div", "idia-notices"); notices.append(note, error);
    const progress = element("div", "idia-progress"); progress.setAttribute("role", "status"); progress.hidden = true;
    const spinner = element("span", "idia-spinner"); spinner.setAttribute("aria-hidden", "true");
    const progressText = element("span", "idia-progress-text"); progress.append(spinner, progressText);
    const cancel = () => { close(); onCancel(); };
    const footer = element("footer", "idia-footer");
    const applyLabel = applyLabelOverride || (decodeMode ? "Copy Decoded" : continueOriginal ? "Continue with original" : fileMode ? "Protect File" : "Protect Selected");
    const apply = button(applyLabel, () => {
      if (decodeMode) {
        apply.disabled = true;
        Promise.resolve().then(onApply).then(message => { if (active?.dialog === dialog) { error.classList.remove("idia-error"); error.setAttribute("role", "status"); error.textContent = message || "Decoded text copied locally."; } },
          () => { if (active?.dialog === dialog) { error.classList.add("idia-error"); error.setAttribute("role", "alert"); error.textContent = "Clipboard access failed. Select and copy the preview manually."; } })
          .finally(() => { if (active?.dialog === dialog) apply.disabled = false; });
        return;
      }
      // Text insertion must focus the now-non-inert page. File rebuilding keeps
      // its modal visible; Cancel can abort an in-progress ZIP generation.
      if (!fileMode) dialog.close();
      const complete = message => {
        if (active?.dialog !== dialog) return; // Never revive a cancelled modal.
        if (typeof message === "string") {
          dialog.dataset.state = "error"; progress.hidden = true;
          error.textContent = message;
          apply.disabled = false; apply.textContent = applyLabel;
          for (const input of list.querySelectorAll("input")) input.disabled = false;
          for (const tool of tools.querySelectorAll("button")) tool.disabled = false;
          if (!dialog.open) dialog.showModal();
        } else {
          const protectedCount = rows.filter(row => row.checkbox.checked).length;
          close();
          if (!fileMode) showConfirmation({ protectedCount });
        }
      };
      try {
        const result = onApply(rows.filter(row => row.checkbox.checked).map(row => row.finding));
        if (result && typeof result.then === "function") {
          const busyLabel = continueOriginal ? "Continuing with original…" : "Creating protected copy…";
          dialog.dataset.state = "processing"; progress.hidden = false; progressText.textContent = busyLabel;
          apply.disabled = true; apply.textContent = busyLabel;
          for (const input of list.querySelectorAll("input")) input.disabled = true;
          for (const tool of tools.querySelectorAll("button")) tool.disabled = true;
          result.then(complete, () => complete("IDIA could not finish the operation. Cancel and try again."));
        } else complete(result);
      } catch { complete("IDIA could not finish the operation. Cancel and try again."); }
    }, true);
    apply.disabled = !!errorMessage;
    if (loadingMessage) { apply.disabled = true; apply.textContent = "Scanning locally…"; list.hidden = tools.hidden = true; progress.hidden = false; progressText.textContent = "Scanning locally…"; note.textContent = "Processing locally. No file has been released to this site. You can cancel."; }
    footer.append(button(decodeMode ? "Close" : "Cancel", cancel), apply);
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
    // Native dialog supplies the overlay, focus containment, Escape and inert page.
    if (!findings.length && !decodeMode) list.hidden = tools.hidden = true;
    const body = element("div", "idia-review-body"); body.append(header, list, tools, progress, notices);
    layout.append(body, footer); dialog.append(layout); root.append(dialog);
    active = { dialog, mode, owner }; dialog.showModal(); footer.querySelector("button").focus();
    return true;
  }
  function isOwnEvent(event) { return !!host && event.composedPath().includes(host); }
  function updateProgress(owner, {message, fraction}) {
    if (!active || active.owner !== owner || active.dialog.dataset.state !== "scanning") return;
    active.dialog.querySelector(".idia-progress-text").textContent = message;
    let meter=active.dialog.querySelector("progress");
    if (!meter) { meter=element("progress","idia-progress-meter");meter.max=1;meter.setAttribute("aria-label","Document scan progress");active.dialog.querySelector(".idia-progress").append(meter); }
    meter.value=Number.isFinite(fraction)?Math.max(0,Math.min(1,fraction)):0;
  }
  window.addEventListener("pagehide", dismissConfirmation);
  globalThis.IDIAReview = Object.freeze({ showPrivacyReview, updateProgress, showConfirmation, showPrompt, hidePrompt, showDecodeToast, hideDecodeToast, positionDecodeToast, close, isOwnEvent, isOpen, whenIdle });
})();
