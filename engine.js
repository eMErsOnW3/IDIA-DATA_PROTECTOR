// Sanitization runs only after the user's selection, separately from detection.
(() => {
  "use strict";
  function sanitizeSelected(text, selectedFindings) {
    const ordered = [...selectedFindings].sort((a, b) => b.start - a.start);
    let result = text, previousStart = text.length;
    const seen = new Set();
    for (const { start, end, value, replacement } of ordered) {
      const key = `${start}:${end}`;
      if (seen.has(key)) continue;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start ||
          end > text.length || text.slice(start, end) !== value || typeof replacement !== "string") {
        throw new Error("The draft no longer matches the review.");
      }
      if (end > previousStart) throw new Error("Overlapping findings cannot be replaced.");
      result = result.slice(0, start) + replacement + result.slice(end);
      previousStart = start;
      seen.add(key);
    }
    return result;
  }
  // Memory-only edit fingerprint, not encryption. This avoids retaining a draft
  // copy after review. Input events also invalidate the remembered decision.
  function draftFingerprint(text) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return `${text.length}:${a >>> 0}:${b >>> 0}`;
  }
  globalThis.IDIAEngine = Object.freeze({ sanitizeSelected, draftFingerprint });
  console.info("[IDIA] Selected-item sanitizer loaded (v0.1.0).");
})();
