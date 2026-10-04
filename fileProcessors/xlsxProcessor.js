// XLSX text entries only. Numeric cells, formulas and other package content stay intact.
(() => {
  "use strict";
  const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const NAMESPACES = new Set([
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "http://purl.oclc.org/ooxml/spreadsheetml/main"
  ]);
  const SHARED = "xl/sharedStrings.xml";
  const isSheet = name => /^xl\/worksheets\/[^/]+\.xml$/.test(name);
  const { LIMITS, fail, checkAbort, open, generateBounded } = IDIAOOXML.createTools({
    format: "XLSX", mime: MIME, required: ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"],
    keepPart: name => isSheet(name) || [SHARED, "xl/workbook.xml", "xl/_rels/workbook.xml.rels"].includes(name)
  });
  const children = (node, name) => Array.from(node.children).filter(child => child.namespaceURI === node.namespaceURI && child.localName === name);
  const first = (node, name) => children(node, name)[0];
  function spreadsheetRoot(document, name) {
    const root = document.documentElement;
    if (!NAMESPACES.has(root.namespaceURI) || root.localName !== name) fail("Unsupported or damaged SpreadsheetML in the XLSX.");
    return root;
  }
  function textNodes(entry) {
    // Phonetic annotations (rPh) are not the displayed cell text.
    return Array.from(entry.getElementsByTagNameNS(entry.namespaceURI, "t")).filter(node =>
      node.parentElement === entry || (node.parentElement.localName === "r" && node.parentElement.parentElement === entry));
  }
  // SpreadsheetML escapes control characters and literal escape-like text.
  // Decode once, per run, so _x005F_x0041_ remains the literal string _x0041_.
  const decodeText = text => text.replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const encodeText = text => text.replace(/_x[0-9a-f]{4}_/gi, value => `_x005F_${value.slice(1)}`)
    .replace(/[\u0000-\u0008\u000b-\u001f\ufffe\uffff]/g, value => `_x${value.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}_`);
  function resolvePart(target) {
    if (!target || /[\\?#:\u0000]/.test(target)) fail("Unsupported XLSX relationship target.");
    const parts = target.startsWith("/") ? [] : ["xl"];
    for (const part of target.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") { if (!parts.length) fail("Unsafe XLSX relationship target."); parts.pop(); }
      else parts.push(part);
    }
    return parts.join("/");
  }

  async function prepare(file, { signal, scanText = IDIADetectors.detectSensitiveInfo, transform = selected => selected, decodeTokens = false, diagnostics } = {}) {
    checkAbort(signal);
    if (!/\.xlsx$/i.test(file.name)) fail("Only .xlsx files can use the XLSX processor.");
    const { archive, xmlParts } = await open(file, signal);
    const types = xmlParts.get("[Content_Types].xml");
    const main = Array.from(types.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/package/2006/content-types", "Override"))
      .find(node => node.getAttribute("PartName") === "/xl/workbook.xml");
    const defaultXML = Array.from(types.getElementsByTagNameNS("http://schemas.openxmlformats.org/package/2006/content-types", "Default"))
      .find(node => node.getAttribute("Extension") === "xml");
    if ((main || defaultXML)?.getAttribute("ContentType") !== `${MIME}.main+xml`) fail("This archive is not a standard non-macro XLSX workbook.");
    const office = Array.from(xmlParts.get("_rels/.rels").getElementsByTagNameNS("*", "Relationship"))
      .find(node => /\/officeDocument$/.test(node.getAttribute("Type") || ""));
    if (!office || office.getAttribute("TargetMode") === "External" || !/^\/?xl\/workbook\.xml$/.test(office.getAttribute("Target"))) fail("The XLSX main workbook relationship is missing or unsupported.");
    const workbook = spreadsheetRoot(xmlParts.get("xl/workbook.xml"), "workbook");
    const relationships = new Map();
    for (const rel of xmlParts.get("xl/_rels/workbook.xml.rels").getElementsByTagNameNS("*", "Relationship")) {
      const id = rel.getAttribute("Id"), type = rel.getAttribute("Type") || "";
      if (!id || relationships.has(id)) fail("Duplicate or missing XLSX relationship IDs.");
      relationships.set(id, rel);
      if (/\/(worksheet|sharedStrings)$/.test(type)) {
        if (rel.getAttribute("TargetMode") === "External") fail("External worksheet/string parts are not supported.");
        const part = resolvePart(rel.getAttribute("Target"));
        if (!xmlParts.has(part) || (/\/sharedStrings$/.test(type) && part !== SHARED)) fail("A required XLSX worksheet/string part is missing or unsupported.");
      }
    }
    const sheetNames = new Map();
    for (const sheet of workbook.getElementsByTagNameNS(workbook.namespaceURI, "sheet")) {
      const id = Array.from(sheet.attributes).find(attr => attr.localName === "id" && /\/relationships$/.test(attr.namespaceURI || ""))?.value;
      const rel = relationships.get(id);
      if (!rel) fail("A worksheet relationship is missing from the XLSX.");
      if (/\/worksheet$/.test(rel.getAttribute("Type") || "")) sheetNames.set(resolvePart(rel.getAttribute("Target")), sheet.getAttribute("name") || "Worksheet");
    }
    if(diagnostics)Object.assign(diagnostics,{xlsxOpened:true,sharedStringsPresent:xmlParts.has(SHARED)});
    const sharedRoot = xmlParts.has(SHARED) ? spreadsheetRoot(xmlParts.get(SHARED), "sst") : null;
    const sharedEntries = sharedRoot ? children(sharedRoot, "si") : [];
    const references = sharedEntries.map(() => []), inlineGroups = [], stringGroups = [];
    let cellCount = 0;
    for (const [part, document] of xmlParts) {
      if (!isSheet(part)) continue;
      const root = spreadsheetRoot(document, "worksheet");
      const cells = Array.from(root.getElementsByTagNameNS(root.namespaceURI, "c"));
      cellCount += cells.length;
      if (cellCount > 200000) fail("The XLSX contains too many cells to scan (limit 200,000).");
      cells.forEach((cell, entryIndex) => {
        const type = cell.getAttribute("t"), formula = !!first(cell, "f");
        const reference = { worksheet: sheetNames.get(part) || "Worksheet", cell: cell.getAttribute("r") || "", sourcePart: part, formula };
        if (type === "s") {
          const value = first(cell, "v")?.textContent.trim();
          if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) >= sharedEntries.length) fail("The XLSX contains an invalid shared-string reference.");
          references[Number(value)].push(reference);
        } else if (type === "inlineStr" && (!formula || decodeTokens)) {
          const entry = first(cell, "is");
          if (!entry) fail("An XLSX inline string is missing its text entry.");
          inlineGroups.push({ sourcePart: part, entryIndex, kind: "inline", entry, references: [reference] });
        }
        if (type === "str" && decodeTokens) {
          const entry=first(cell,"v");
          if(entry)stringGroups.push({sourcePart:part,entryIndex,kind:"string",entry,references:[reference]});
        }
        // Protection still skips formula caches and general numeric/date/error cells.
        // Decode alone can restore exact tokens in explicitly typed string caches;
        // formulas are never evaluated or rewritten.
      });
    }
    const groups = new Map(), byId = new Map(), findings = [];
    const candidates = sharedEntries.map((entry, entryIndex) => ({ sourcePart: SHARED, entryIndex, kind: "shared", entry, references: references[entryIndex] })).concat(inlineGroups,stringGroups);
    for (const group of candidates) {
      // An unusual formula cell referencing an SST entry must keep its cached text.
      if (!decodeTokens && group.references.some(reference => reference.formula)) continue;
      let text = "";
      group.spans = (group.kind === "string" ? [group.entry] : textNodes(group.entry)).map(node => {
        const start = text.length; text += decodeText(node.textContent); return { node, start, end: text.length };
      });
      if (text.length > 100000) fail("An XLSX text entry is too large to scan safely.");
      if(diagnostics){
        const key={shared:"sharedEntriesScanned",inline:"inlineEntriesScanned",string:"otherStringEntriesScanned"}[group.kind];
        diagnostics[key]=(diagnostics[key]||0)+1;
      }
      const detected = scanText(text,{sourcePart:group.sourcePart,sourceKind:group.kind,entryIndex:group.entryIndex,
        formulaCache:group.references.some(r=>r.formula)});
      if (!detected.length) continue;
      const groupId = `${group.sourcePart}#${group.kind}:${group.entryIndex}`;
      group.text = text; groups.set(groupId, group);
      const locations = [...new Set(group.references.map(ref => ref.worksheet))];
      const location = locations.slice(0, 3).join(", ") + (locations.length > 3 ? ", …" : "");
      const sourceHint = group.kind === "shared"
        ? group.references.length > 1 ? `${location} — shared by ${group.references.length} cells. Hiding this updates all of them.`
          : group.references.length ? location : "Unused workbook text entry"
        : `${location}${group.references[0].cell ? ` · ${group.references[0].cell}` : ""}`;
      for (const finding of detected) {
        const mapped = { ...finding, id: `${groupId}:${finding.id}`, groupId, sourcePart: group.sourcePart,
          entryIndex: group.entryIndex, sourceKind: group.kind, formulaCache: group.references.some(r=>r.formula), referenceCount: group.references.length, sourceHint };
        findings.push(mapped); byId.set(mapped.id, mapped);
      }
      if (findings.length > 2000) fail("This XLSX contains too many findings for one review (limit 2000).");
    }
    return {
      findings, continueOriginalWhenEmpty: true,
      async buildFile(selected, name) {
        checkAbort(signal);
        if (!findings.length) return file;
        if (!selected.length) return new File([file], name, { type: MIME, lastModified: Date.now() });
        const selections = new Map(), changed = new Map();
        const canonical = selected.map(f => { const value = byId.get(f.id); if (!value) fail("The selected finding is no longer valid."); return value; });
        const transformed = await transform(canonical); checkAbort(signal);
        const replacements = new Map(transformed.map(f => [f.id, f.replacement]));
        for (const finding of selected) {
          const stored = byId.get(finding.id);
          const original = stored && { ...stored, replacement: replacements.get(stored.id) };
          if (!original) fail("The selected XLSX finding is no longer valid.");
          if (!selections.has(original.groupId)) selections.set(original.groupId, []);
          selections.get(original.groupId).push(original);
        }
        for (const [groupId, chosen] of selections) {
          const group = groups.get(groupId), part = group.sourcePart;
          if (!changed.has(part)) changed.set(part, xmlParts.get(part).cloneNode(true));
          const root = changed.get(part).documentElement;
          const entry = group.kind === "shared" ? children(root, "si")[group.entryIndex]
            : first(root.getElementsByTagNameNS(root.namespaceURI, "c")[group.entryIndex], group.kind === "string" ? "v" : "is");
          const nodes = group.kind === "string" ? [entry] : textNodes(entry);
          nodes[0].textContent = encodeText(IDIAEngine.sanitizeSelected(group.text, chosen));
          nodes[0].setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
          for (const node of nodes.slice(1)) {
            node.textContent = "";
            // Excel rejects empty rich-text runs in the shared string table.
            // Keep the first run's formatting, but omit now-empty trailing runs.
            // Inline strings accept cleared nodes and retain their run containers.
            if (group.kind === "shared" && node.parentElement.localName === "r") node.parentElement.remove();
          }
        }
        const output = new JSZip();
        output.files = Object.assign(Object.create(null), archive.files); output.comment = archive.comment;
        for (const [part, document] of changed) {
          const original = archive.files[part];
          output.file(part, new XMLSerializer().serializeToString(document), { createFolders: false,
            date: original.date, comment: original.comment, unixPermissions: original.unixPermissions, dosPermissions: original.dosPermissions });
        }
        const blob = await generateBounded(output, signal); checkAbort(signal);
        return new File([blob], name, { type: MIME, lastModified: Date.now() });
      }
    };
  }
  globalThis.IDIAXlsxProcessor = Object.freeze({ supports: file => /\.xlsx$/i.test(file.name), prepare, LIMITS });
})();
