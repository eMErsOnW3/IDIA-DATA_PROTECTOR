// Local detectors. Offsets are JavaScript string (UTF-16) offsets.
(() => {
  "use strict";
  const labels = { EMAIL: "Email", PHONE: "Phone", ID: "Chinese ID", SSN: "US Social Security Number", CARD: "Payment card", IPV4: "IPv4 address", ADDRESS: "Address" };
  function collect(text, pattern, type, validate = () => true) {
    return [...text.matchAll(pattern)].filter(match => validate(match[0])).map(match => ({
      type, label: labels[type], value: match[0], start: match.index,
      end: match.index + match[0].length, replacement: `[${type}]`
    }));
  }
  function detectEmails(text) {
    return collect(text, /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi, "EMAIL");
  }
  // Country-specific patterns require full numbers, using horizontal spaces only.
  const phoneRules = [
    { country: "US/Canada", pattern: /(?<![\w+])(?:\+1[ .-]?)?(?:\([2-9]\d{2}\)[ .-]?|[2-9]\d{2}[ .-])[2-9]\d{2}[ .-]\d{4}(?!\d)/g },
    { country: "US/Canada compact international", pattern: /(?<![\w+])\+1[2-9]\d{2}[2-9]\d{6}(?!\d)/g },
    { country: "China mobile", pattern: /(?<![\w+])(?:(?:\+86|0086)[ -]?)?1[3-9]\d[ -]?\d{4}[ -]?\d{4}(?!\d)/g },
    { country: "China landline", pattern: /(?<![\w+])(?:(?:\+86|0086)[ -]?)?0\d{2,3}[ -]\d{7,8}(?!\d)/g },
    { country: "Japan mobile", pattern: /(?<![\w+])(?:\+81[ -]?[789]0|0[789]0)[ -]?\d{4}[ -]?\d{4}(?!\d)/g },
    { country: "Japan landline", pattern: /(?<![\w+])(?:\+81[ -]?[1-6]\d?|0[1-6]\d?)[ -]\d{3,4}[ -]\d{4}(?!\d)/g },
    { country: "UK London", pattern: /(?<![\w+])(?:\+44[ -]?20|020)[ -]?\d{4}[ -]?\d{4}(?!\d)/g },
    { country: "UK regional/mobile", pattern: /(?<![\w+])(?:\+44[ -]?[17]\d{3}|0[17]\d{3})[ -]?\d{6}(?!\d)/g }
  ];
  function detectPhones(text) {
    return phoneRules.flatMap(rule => collect(text, rule.pattern, "PHONE", value => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 && !/^(\d)\1+$/.test(digits);
    }));
  }
  function detectChineseIDs(text) {
    // Birth-date validation, but no checksum: mistyped IDs may still be private.
    return collect(text, /(?<!\w)\d{17}[\dXx](?!\w)/g, "ID", value => {
      const year = Number(value.slice(6, 10)), month = Number(value.slice(10, 12)), day = Number(value.slice(12, 14));
      const date = new Date(Date.UTC(year, month - 1, day));
      return /^[1-9]/.test(value) && year >= 1800 && year <= new Date().getFullYear() &&
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    });
  }
  function detectSSNs(text) {
    // SSA excludes 000/666/900-999 area numbers, 00 groups, and 0000 serials.
    return collect(text, /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, "SSN", value => {
      const [area, group, serial] = value.split("-").map(Number);
      return area > 0 && area !== 666 && area < 900 && group > 0 && serial > 0;
    });
  }
  function luhnCheck(value) {
    const digits = value.replace(/[ -]/g, "");
    if (!/^\d{13,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
    let sum = 0;
    for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
      let digit = Number(digits[i]);
      if (double) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit;
    }
    return sum % 10 === 0;
  }
  function detectCards(text) {
    return collect(text, /(?<!\d[ -]?)(?<![\w+])\d(?:[ -]?\d){12,18}(?![ -]?\d)(?!\w)/g, "CARD", luhnCheck);
  }
  function detectIPv4(text) {
    return collect(text, /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?!\w|\.\d)/g, "IPV4", value =>
      value.split(".").every(octet => Number(octet) <= 255 && (octet === "0" || !octet.startsWith("0"))));
  }
  const suffix = "(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Highway|Hwy)";
  const street = `\\b\\d{1,6}[A-Za-z]?[ \\t]+(?:[A-Z][A-Za-z0-9.'’-]*[ \\t]+){1,5}${suffix}\\b\\.?`;
  const region = "(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)";
  const city = "[A-Z][A-Za-z.'’-]*(?:[ \\t]+[A-Z][A-Za-z.'’-]*){0,3}";
  const postcodeUK = "(?:GIR[ \\t]?0AA|[A-Z]{1,2}\\d[A-Z\\d]?[ \\t]?\\d[A-Z]{2})";
  function detectAddresses(text) {
    const northAmerica = new RegExp(`${street}(?:,[ \\t]*${city},[ \\t]*${region}\\b(?:[ \\t]+(?:\\d{5}(?:-\\d{4})?|[A-Z]\\d[A-Z][ \\t]?\\d[A-Z]\\d))?)?`, "g");
    const uk = new RegExp(`${street}(?:,[ \\t]*${city})?,?[ \\t]+${postcodeUK}\\b`, "g");
    const china = /(?:[\p{Script=Han}]{2,5}省)?[\p{Script=Han}]{2,5}市[\p{Script=Han}]{1,8}(?:区|县)(?:[\p{Script=Han}]{1,8}(?:镇|乡))?[\p{Script=Han}]{1,15}(?:街道|大道|大街|路|街|巷|弄)\d{1,6}号/gu;
    const japan = /(?:東京都|北海道|(?:京都|大阪)府|[\p{Script=Han}]{2,4}県)(?:[\p{Script=Han}]{1,8}(?:市|区|町|村)){1,3}[\p{Script=Han}]{1,10}\d{1,3}丁目\d{1,4}(?:[-−ー]\d{1,4}|番(?:\d{1,4}号)?)/gu;
    return [collect(text, northAmerica, "ADDRESS"), collect(text, uk, "ADDRESS"),
      collect(text, china, "ADDRESS"), collect(text, japan, "ADDRESS")].flat();
  }
  // Future local NER detectors can be added without changing UI/sanitization.
  const detectors = [detectEmails, detectPhones, detectChineseIDs, detectSSNs, detectCards, detectIPv4, detectAddresses];
  const priority = { EMAIL: 7, ID: 6, CARD: 5, SSN: 4, ADDRESS: 3, IPV4: 2, PHONE: 1 };
  function detectSensitiveInfo(text) {
    const candidates = detectors.flatMap(detector => detector(text));
    candidates.sort((a, b) => priority[b.type] - priority[a.type] || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const accepted = [];
    for (const finding of candidates) {
      if (!accepted.some(other => finding.start < other.end && other.start < finding.end)) accepted.push(finding);
    }
    return accepted.sort((a, b) => a.start - b.start).map(finding => ({ ...finding, id: `${finding.type}:${finding.start}:${finding.end}` }));
  }
  globalThis.IDIADetectors = Object.freeze({ detectSensitiveInfo, luhnCheck, phoneRules, detectors });
  console.info("[IDIA] Local detectors loaded (v0.1.0).");
})();
