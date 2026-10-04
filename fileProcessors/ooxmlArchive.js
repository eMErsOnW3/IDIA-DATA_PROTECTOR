// Shared local ZIP/XML limits and integrity checks extracted from the DOCX processor.
(() => {
  "use strict";
  function createTools({ format, mime, required, keepPart }) {
    const LIMITS = Object.freeze({ file: 5 * 1024 * 1024, entries: 1000, entry: 8 * 1024 * 1024, expanded: 40 * 1024 * 1024, output: 50 * 1024 * 1024 });
    function fail(message) { throw new Error(message); }
    function checkAbort(signal) { if (signal?.aborted) throw new DOMException("Document operation cancelled.", "AbortError"); }

    // Inspect the central directory before allowing JSZip to expand anything.
    // v0.2.0 deliberately rejects ZIP64, encryption and multi-volume archives.
    function inspectArchive(buffer) {
      const bytes = new Uint8Array(buffer), view = new DataView(buffer);
      if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) fail(`This file is not a supported ${format} ZIP archive.`);
      let end = -1;
      for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
        if (view.getUint32(p, true) === 0x06054b50 && p + 22 + view.getUint16(p + 20, true) === bytes.length) { end = p; break; }
      }
      if (end < 0) fail(`The ${format} ZIP directory is missing or damaged.`);
      const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
      if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count !== view.getUint16(end + 8, true)) fail(`Multi-volume ${format} archives are not supported.`);
      if (!count || count > LIMITS.entries) fail(`The ${format} contains too many archive entries (limit 1000).`);
      if (start + size !== end || start === 0xffffffff || size === 0xffffffff) fail(`Unsupported or damaged ${format} ZIP directory.`);
      const entries = new Map(), spans = [];
      let cursor = start, expanded = 0;
      for (let i = 0; i < count; i++) {
        if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) fail(`The ${format} ZIP directory is damaged.`);
        const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
        const crc = view.getUint32(cursor + 16, true), compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
        const nameSize = view.getUint16(cursor + 28, true), extraSize = view.getUint16(cursor + 30, true), commentSize = view.getUint16(cursor + 32, true);
        const local = view.getUint32(cursor + 42, true), next = cursor + 46 + nameSize + extraSize + commentSize;
        if (next > end || flags & 0x41 || ![0, 8].includes(method) || view.getUint16(cursor + 34, true)) fail(`Encrypted or unsupported ${format} ZIP entries.`);
        let name;
        try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize)); }
        catch { fail(`Unsupported ${format} archive filename encoding.`); }
        if (!name || /[\\\u0000]/.test(name) || name.startsWith("/") || name.split("/").some(part => part === ".." || part === ".") || entries.has(name)) fail(`Unsafe or duplicate ${format} archive entries.`);
        expanded += uncompressed;
        if (uncompressed > LIMITS.entry || expanded > LIMITS.expanded) fail(`The decompressed ${format} is too large (8 MiB per entry, 40 MiB total).`);
        if (local + 30 > start || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== method) fail(`Damaged ${format} ZIP entry.`);
        const localNameSize = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
        const dataStart = local + 30 + localNameSize + localExtra;
        if (localNameSize !== nameSize || dataStart + compressed > start || (method === 0 && compressed !== uncompressed)) fail(`Invalid ${format} ZIP entry sizes.`);
        for (let n = 0; n < nameSize; n++) if (bytes[local + 30 + n] !== bytes[cursor + 46 + n]) fail(`Inconsistent ${format} ZIP filenames.`);
        spans.push([local, dataStart + compressed]);
        entries.set(name, { uncompressed, crc });
        cursor = next;
      }
      spans.sort((a, b) => a[0] - b[0]);
      if (cursor !== end || spans.some((span, i) => i && span[0] < spans[i - 1][1])) fail(`Overlapping or damaged ${format} archive entries.`);
      for (const part of [...required, "[Content_Types].xml", "_rels/.rels"]) {
        if (!entries.has(part)) fail(`The ${format} is missing ${part}.`);
      }
      return entries;
    }

    const crcTable = Array.from({ length: 256 }, (_, n) => {
      for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
      return n >>> 0;
    });
    // Count actual expanded bytes, not just attacker-controlled ZIP size claims.
    function readEntry(entry, metadata, budget, keep, signal) {
      return new Promise((resolve, reject) => {
        const stream = entry.internalStream("uint8array");
        let size = 0, crc = 0xffffffff, settled = false;
        const chunks = [];
        const stop = error => {
          if (settled) return; settled = true; stream.pause(); chunks.length = 0;
          signal?.removeEventListener("abort", abort); reject(error);
        };
        const abort = () => stop(new DOMException("Document operation cancelled.", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        stream.on("data", chunk => {
          if (settled) return;
          size += chunk.length; budget.bytes += chunk.length;
          if (size > metadata.uncompressed || size > LIMITS.entry || budget.bytes > LIMITS.expanded) {
            stop(new Error(`The ${format} expands beyond its declared size or safety limit.`)); return;
          }
          for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
          if (keep) chunks.push(chunk);
        }).on("error", () => stop(new Error(`A ${format} archive entry could not be decompressed.`)))
          .on("end", () => {
            if (settled) return;
            if (size !== metadata.uncompressed || ((crc ^ 0xffffffff) >>> 0) !== metadata.crc) { stop(new Error(`The ${format} archive failed its size or integrity check.`)); return; }
            settled = true; signal?.removeEventListener("abort", abort);
            if (!keep) { resolve(null); return; }
            const result = new Uint8Array(size); let offset = 0;
            chunks.forEach(chunk => { result.set(chunk, offset); offset += chunk.length; });
            resolve(result);
          });
        if (signal?.aborted) abort(); else stream.resume();
      });
    }
    function parseXML(bytes) {
      let xml;
      try {
        const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
        xml = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch { fail(`Unsupported text encoding in ${format} XML.`); }
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail(`${format} XML with document types or entities is not supported.`);
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.getElementsByTagNameNS("*", "parsererror").length) fail(`The ${format} contains malformed XML.`);
      return document;
    }
    function generateBounded(zip, signal) {
      return new Promise((resolve, reject) => {
        const stream = zip.generateInternalStream({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
        const chunks = []; let size = 0, settled = false;
        const stop = error => { if (settled) return; settled = true; stream.pause(); chunks.length = 0; signal?.removeEventListener("abort", abort); reject(error); };
        const abort = () => stop(new DOMException("Document operation cancelled.", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        stream.on("data", chunk => {
          if (settled) return;
          size += chunk.length;
          if (size > LIMITS.output) { stop(new Error(`The rebuilt ${format} exceeds the output safety limit.`)); return; }
          chunks.push(chunk);
        }).on("error", () => stop(new Error(`The protected ${format} could not be rebuilt.`)))
          .on("end", () => { if (settled) return; settled = true; signal?.removeEventListener("abort", abort); resolve(new Blob(chunks, { type: mime })); });
        if (signal?.aborted) abort(); else stream.resume();
      });
    }

    async function open(file, signal) {
      checkAbort(signal);
      if (file.size > LIMITS.file) fail(`This ${format} exceeds the limit of 5 MiB.`);
      const buffer = await file.arrayBuffer(); checkAbort(signal);
      const directory = inspectArchive(buffer);
      let archive;
      try { archive = await JSZip.loadAsync(buffer, { createFolders: false, checkCRC32: false }); }
      catch { fail(`This ${format} archive cannot be opened. It may be encrypted or damaged.`); }
      if (Object.keys(archive.files).length !== directory.size) fail(`The ${format} ZIP entry list is inconsistent.`);
      const xmlParts = new Map(), budget = { bytes: 0 };
      for (const [name, metadata] of directory) {
        checkAbort(signal);
        const entry = archive.files[name];
        if (!entry || (entry.unsafeOriginalName && entry.unsafeOriginalName !== name)) fail(`The ${format} ZIP entry paths are inconsistent.`);
        const keep = keepPart(name) || name === "[Content_Types].xml" || name === "_rels/.rels";
        const bytes = await readEntry(entry, metadata, budget, keep, signal);
        if (keep) xmlParts.set(name, parseXML(bytes));
      }
      return { archive, xmlParts };
    }
    return Object.freeze({ LIMITS, fail, checkAbort, open, generateBounded });
  }
  globalThis.IDIAOOXML = Object.freeze({ createTools });
})();
