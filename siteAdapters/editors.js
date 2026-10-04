// Shared editor IO. No privacy rules or platform selectors.
(() => {
 'use strict';
 const editableSelector='textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
 const own='#idia-privacy-root, #idia-manual-decode';
 function visible(element){return !!element?.isConnected&&element.getClientRects().length>0&&!element.closest('[hidden], [aria-hidden="true"]')&&getComputedStyle(element).visibility!=='hidden';}
 function editors(){return [...document.querySelectorAll(editableSelector)].filter(n=>visible(n)&&!n.disabled&&!n.readOnly&&!n.closest(own)&&!n.parentElement?.closest('[contenteditable="true"], [contenteditable="plaintext-only"]'));}
  function readDraft(editor) {
    return editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement ? editor.value : editor.innerText;
  }

  function insertDraft(editor, text) {
    editor.focus();
    const inputOptions = { bubbles: true, composed: true, inputType: "insertReplacementText", data: text };
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      editor.dispatchEvent(new InputEvent("beforeinput", { ...inputOptions, cancelable: true }));
      const prototype = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      setter.call(editor, text);
      editor.dispatchEvent(new InputEvent("input", inputOptions));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    let inputFired = false;
    const trackInput = () => { inputFired = true; };
    editor.addEventListener("input", trackInput);
    try {
      // Native editing lets ProseMirror observe the change and preserves undo.
      document.execCommand("insertText", false, text);
    } catch {
      console.warn("[IDIA] Native insertion unavailable; using DOM/input fallback.");
    } finally {
      editor.removeEventListener("input", trackInput);
    }
    if (readDraft(editor) !== text) {
      editor.dispatchEvent(new InputEvent("beforeinput", { ...inputOptions, cancelable: true }));
      // A single paragraph with explicit breaks preserves the exact plain-text
      // newlines. Separate paragraphs can introduce extra blank lines in innerText.
      const paragraph = document.createElement("p");
      text.split("\n").forEach((line, index) => {
        if (index) paragraph.append(document.createElement("br"));
        paragraph.append(document.createTextNode(line));
      });
      if (text.endsWith("\n")) paragraph.append(document.createElement("br"));
      editor.replaceChildren(paragraph);
      inputFired = false;
    }
    if (!inputFired) editor.dispatchEvent(new InputEvent("input", inputOptions));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

 globalThis.IDIAEditors=Object.freeze({editableSelector,visible,editors,read:readDraft,write:insertDraft});
})();
