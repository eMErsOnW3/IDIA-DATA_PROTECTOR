// DOCX is an OOXML ZIP. All parsing/rebuilding is local; no privacy rules here.
(() => {
  "use strict";
  const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const MAIN_TYPE = `${MIME}.main+xml`;
  const WORD_NAMESPACES = new Set([
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main"
  ]);
  const scannedPart = name => /^word\/(?:document|header[^/]*|footer[^/]*|comments|footnotes|endnotes)\.xml$/.test(name);
  const { LIMITS, fail, checkAbort, open, generateBounded } = IDIAOOXML.createTools({
    format: "DOCX", mime: MIME, required: ["word/document.xml"], keepPart: scannedPart
  });
  function paragraphNodes(paragraph, namespace) {
    // Nested text-box paragraphs belong to their own group, never to both.
    return Array.from(paragraph.getElementsByTagNameNS(namespace, "t")).filter(node => {
      let parent = node.parentElement;
      while (parent && !(parent.namespaceURI === namespace && parent.localName === "p")) parent = parent.parentElement;
      return parent === paragraph;
    });
  }
  async function prepare(file, { signal, scanText = IDIADetectors.detectSensitiveInfo, transform = selected => selected } = {}) {
    checkAbort(signal);
    if (!/\.docx$/i.test(file.name)) fail("Only .docx files can use the DOCX processor.");
    const { archive, xmlParts } = await open(file, signal);
    const types = xmlParts.get("[Content_Types].xml");
    const main = Array.from(types.getElementsByTagNameNS("http://schemas.openxmlformats.org/package/2006/content-types", "Override"))
      .find(node => node.getAttribute("PartName") === "/word/document.xml");
    if (main?.getAttribute("ContentType") !== MAIN_TYPE) fail("This archive is not a standard non-macro DOCX document.");
    const relationships = xmlParts.get("_rels/.rels");
    const office = Array.from(relationships.getElementsByTagNameNS("*", "Relationship"))
      .find(node => /\/officeDocument$/.test(node.getAttribute("Type") || ""));
    if (!office || office.getAttribute("TargetMode") === "External" || !/^\/?word\/document\.xml$/.test(office.getAttribute("Target"))) fail("The DOCX main document relationship is missing or unsupported.");

    const groups = new Map(), findings = [], byId = new Map();
    for (const [name, document] of xmlParts) {
      if (!scannedPart(name)) continue;
      const namespace = document.documentElement.namespaceURI;
      if (!WORD_NAMESPACES.has(namespace) || (name === "word/document.xml" && document.documentElement.localName !== "document")) fail("Unsupported WordprocessingML in the DOCX.");
      const paragraphs = Array.from(document.getElementsByTagNameNS(namespace, "p"));
      paragraphs.forEach((paragraph, paragraphIndex) => {
        const nodes = paragraphNodes(paragraph, namespace);
        let text = "";
        const spans = nodes.map(node => { const start = text.length; text += node.textContent; return { node, start, end: text.length }; });
        if (text.length > 100000) fail("A DOCX paragraph is too large to scan safely.");
        if (!text) return;
        const groupId = `${name}#${paragraphIndex}`;
        const detected = scanText(text);
        if (!detected.length) return;
        groups.set(groupId, { name, paragraphIndex, namespace, text, spans });
        for (const finding of detected) {
          const mapped = { ...finding, id: `${groupId}:${finding.id}`, sourcePart: name, groupId };
          findings.push(mapped); byId.set(mapped.id, mapped);
        }
        if (findings.length > 2000) fail("This DOCX contains too many findings for one review (limit 2000).");
      });
    }
    return {
      findings, continueOriginalWhenEmpty: true,
      async buildFile(selected, name) {
        checkAbort(signal);
        if (!findings.length) return file; // Explicit Continue with original; no rebuild.
        if (!selected.length) return new File([file], name, { type: MIME, lastModified: Date.now() });
        const selections = new Map();
        const canonical = selected.map(f => { const value = byId.get(f.id); if (!value) fail("The selected finding is no longer valid."); return value; });
        const transformed = await transform(canonical); checkAbort(signal);
        const replacements = new Map(transformed.map(f => [f.id, f.replacement]));
        for (const finding of selected) {
          const stored = byId.get(finding.id);
          const original = stored && { ...stored, replacement: replacements.get(stored.id) };
          if (!original) fail("The selected DOCX finding is no longer valid.");
          if (!selections.has(original.groupId)) selections.set(original.groupId, []);
          selections.get(original.groupId).push(original);
        }
        // Clone only changed XML documents. Never mutate the prepared snapshot:
        // failed/cancelled rebuilds and retries must start from the original ZIP.
        const changed = new Map();
        for (const [groupId, chosen] of selections) {
          const group = groups.get(groupId);
          if (!changed.has(group.name)) changed.set(group.name, xmlParts.get(group.name).cloneNode(true));
          const paragraph = changed.get(group.name).getElementsByTagNameNS(group.namespace, "p")[group.paragraphIndex];
          const nodes = paragraphNodes(paragraph, group.namespace);
          nodes[0].textContent = IDIAEngine.sanitizeSelected(group.text, chosen);
          nodes[0].setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
          for (const node of nodes.slice(1)) node.textContent = "";
        }
        const output = new JSZip();
        output.files = Object.assign(Object.create(null), archive.files); output.comment = archive.comment;
        for (const [part, document] of changed) {
          const original = archive.files[part];
          output.file(part, new XMLSerializer().serializeToString(document), {
            createFolders: false, date: original.date, comment: original.comment,
            unixPermissions: original.unixPermissions, dosPermissions: original.dosPermissions
          });
        }
        const blob = await generateBounded(output, signal); checkAbort(signal);
        return new File([blob], name, { type: MIME, lastModified: Date.now() });
      }
    };
  }
  globalThis.IDIADocxProcessor = Object.freeze({ supports: file => /\.docx$/i.test(file.name), prepare, LIMITS });
})();
