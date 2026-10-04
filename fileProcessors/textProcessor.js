// Existing v0.1.1 TXT/CSV behavior, behind the shared file-processor interface.
(() => {
  "use strict";
  async function prepare(file, { scanText = IDIADetectors.detectSensitiveInfo, transform = selected => selected } = {}) {
    if (file.size > 5 * 1024 * 1024) throw new Error("This file exceeds the limit of 5 MiB. The selection was not released to the site.");
    const [text, buffer] = await Promise.all([file.text(), file.arrayBuffer()]);
    try { new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { throw new Error("This file is not valid UTF-8. Save a UTF-8 TXT/CSV copy and select it again."); }
    if (text.includes("\u0000")) throw new Error("This file contains binary or UTF-16 data. Only UTF-8 TXT/CSV is supported.");
    const bytes = new Uint8Array(buffer);
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    return {
      findings: scanText(text),
      async buildFile(selected, name) {
        const sanitized = IDIAEngine.sanitizeSelected(text, await transform(selected));
        return new File(sanitized === text ? [file] : [bom ? "\uFEFF" : "", sanitized], name, {
          type: file.type || (/\.csv$/i.test(file.name) ? "text/csv" : "text/plain"), lastModified: Date.now()
        });
      }
    };
  }
  globalThis.IDIATextProcessor = Object.freeze({ supports: file => /\.(txt|csv)$/i.test(file.name), prepare });
})();
