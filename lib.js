// Pure helpers shared between the content script and the test suite.
// Loaded as a content_script alongside content.js (no DOM/Chrome APIs in here).
(function (root) {
  "use strict";

  function rgbToHex(rgb) {
    const m = rgb && rgb.match(/rgba?\(([^)]+)\)/);
    if (!m) return rgb || "";
    const parts = m[1].split(",").map((s) => s.trim());
    const [r, g, b] = parts.map((p) => parseInt(p, 10));
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return a < 1 ? `${hex} (${Math.round(a * 100)}%)` : hex;
  }

  function normalizeFamily(name) {
    return String(name || "").trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  }

  function guessExt(url) {
    const m = String(url || "").match(/\.(woff2|woff|ttf|otf|eot)(\?|#|$)/i);
    return m ? m[1].toLowerCase() : "font";
  }

  // Pick the best @font-face url() candidate from a `src` value. Prefers woff2,
  // falls back to woff → ttf → otf → unknown. Returns absolute URL when a base
  // is provided, otherwise the raw URL string.
  function pickBestUrl(srcValue, baseUrl) {
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)(\s*format\(\s*(['"]?)([^'")]+)\4\s*\))?/g;
    const candidates = [];
    let m;
    while ((m = re.exec(srcValue)) !== null) {
      candidates.push({ url: m[2], format: (m[5] || "").toLowerCase() });
    }
    if (!candidates.length) return null;
    const order = ["woff2", "woff", "truetype", "opentype", ""];
    candidates.sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format));
    let url = candidates[0].url;
    if (baseUrl) {
      try { url = new URL(url, baseUrl).href; } catch { /* return raw */ }
    }
    return url;
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // Distinguish a click from a text-selection drag. Returns true when the
  // pointer travelled less than `threshold` pixels between mousedown/mouseup.
  function isClickNotDrag(downPos, upPos, threshold = 4) {
    if (!downPos) return true; // no recorded mousedown — treat as click
    const dx = upPos.x - downPos.x;
    const dy = upPos.y - downPos.y;
    return Math.hypot(dx, dy) <= threshold;
  }

  // Scan a list of CSSFontFaceRule-shaped objects for the best matching src
  // url() for the given family/weight/style. Stylesheet collection is left to
  // the caller because it requires DOM access.
  function pickFontUrlFromRules(rules, family, weight, style, baseUrl) {
    const target = normalizeFamily(family);
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
      const fam = normalizeFamily(r.family);
      if (fam !== target) continue;
      const url = pickBestUrl(r.src || "", baseUrl);
      if (!url) continue;
      let score = 1;
      const w = String(r.weight || "normal").trim();
      const s = String(r.style || "normal").trim();
      if (
        w === String(weight) ||
        (w === "normal" && String(weight) === "400") ||
        (w === "bold" && String(weight) === "700")
      ) score += 2;
      if (s === style) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return best;
  }

  const api = {
    rgbToHex,
    normalizeFamily,
    guessExt,
    pickBestUrl,
    cssEscape,
    isClickNotDrag,
    pickFontUrlFromRules,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.__fontyLib = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
