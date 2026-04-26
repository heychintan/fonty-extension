(() => {
  if (window.__fontyInjected) return;
  window.__fontyInjected = true;

  const HOST_ID = "fonty-host";
  let active = false;
  let host = null;
  let shadow = null;
  let tooltipEl = null;
  let panelLayer = null;
  let toastLayer = null;
  const panels = []; // stack of open panel elements

  const TEXT_TAGS = new Set([
    "P","SPAN","A","H1","H2","H3","H4","H5","H6","LI","TD","TH","DIV",
    "LABEL","BUTTON","BLOCKQUOTE","CODE","PRE","STRONG","EM","SMALL","B","I",
    "DT","DD","FIGCAPTION","CITE","Q","SUMMARY","CAPTION","ARTICLE","SECTION","ASIDE","HEADER","FOOTER","NAV","MAIN"
  ]);

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;";
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);

    tooltipEl = document.createElement("div");
    tooltipEl.className = "fonty-tooltip";
    tooltipEl.style.display = "none";
    shadow.appendChild(tooltipEl);

    panelLayer = document.createElement("div");
    panelLayer.className = "fonty-panel-layer";
    shadow.appendChild(panelLayer);

    toastLayer = document.createElement("div");
    toastLayer.className = "fonty-toast-layer";
    shadow.appendChild(toastLayer);

    document.documentElement.appendChild(host);
  }

  function activate() {
    if (active) return;
    active = true;
    ensureHost();
    document.body && document.body.classList.add("fonty-active");
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    document.body && document.body.classList.remove("fonty-active");
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("keydown", onKeyDown, true);
    hideTooltip();
    closeAllPanels(true);
  }

  function onKeyDown(e) {
    if (e.key !== "Escape") return;
    if (panels.length > 0) {
      // Close most recently opened panel.
      const top = panels[panels.length - 1];
      removePanel(top);
    } else {
      deactivate();
    }
  }

  function isInsideShadowHost(node) {
    return node && (node === host || (host && host.contains(node)));
  }

  function isTextish(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isInsideShadowHost(el)) return false;
    if (!el.textContent || !el.textContent.trim()) return false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return TEXT_TAGS.has(el.tagName);
  }

  function findTextElement(el) {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (isInsideShadowHost(cur)) return null;
      if (isTextish(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function onMouseOver(e) {
    const el = findTextElement(e.target);
    if (!el) {
      hideTooltip();
      return;
    }
    showTooltip(el, e.clientX, e.clientY);
  }

  function onMouseOut() {
    hideTooltip();
  }

  function onMouseMove(e) {
    if (tooltipEl && tooltipEl.style.display !== "none") {
      positionTooltip(e.clientX, e.clientY);
    }
  }

  function onClickCapture(e) {
    if (isInsideShadowHost(e.target)) return;
    const el = findTextElement(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    hideTooltip();
    openPanel(el, e.clientX, e.clientY);
  }

  function getPrimaryFont(el) {
    const cs = getComputedStyle(el);
    const stack = cs.fontFamily || "";
    const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    return { primary: first, stack, cs };
  }

  function showTooltip(el, x, y) {
    const { primary } = getPrimaryFont(el);
    if (!primary) return hideTooltip();
    tooltipEl.textContent = primary;
    if (tooltipEl.style.display === "none") {
      tooltipEl.style.display = "block";
      tooltipEl.classList.remove("is-in");
      // force reflow then enter
      void tooltipEl.offsetWidth;
      tooltipEl.classList.add("is-in");
    }
    positionTooltip(x, y);
  }

  function positionTooltip(x, y) {
    const pad = 14;
    const r = tooltipEl.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + r.width > window.innerWidth - 4) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 4) top = y - r.height - pad;
    tooltipEl.style.left = `${Math.max(4, left)}px`;
    tooltipEl.style.top = `${Math.max(4, top)}px`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove("is-in");
    tooltipEl.style.display = "none";
  }

  function rgbToHex(rgb) {
    const m = rgb && rgb.match(/rgba?\(([^)]+)\)/);
    if (!m) return rgb || "";
    const parts = m[1].split(",").map((s) => s.trim());
    const [r, g, b] = parts.map((p) => parseInt(p, 10));
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return a < 1 ? `${hex} (${Math.round(a * 100)}%)` : hex;
  }

  function openPanel(el, clickX, clickY) {
    const { primary, stack, cs } = getPrimaryFont(el);
    const weight = cs.fontWeight;
    const styleVal = cs.fontStyle;
    const size = cs.fontSize;
    const lineHeight = cs.lineHeight === "normal" ? "normal" : cs.lineHeight;
    const colorRgb = cs.color;
    const colorHex = rgbToHex(colorRgb);
    const fontUrl = findFontUrlForFamily(primary, weight, styleVal);

    const panel = document.createElement("div");
    panel.className = "fonty-panel";
    const restOfStack = stack.replace(primary, "").replace(/^,\s*/, ", ");
    panel.innerHTML = `
      <div class="fp-head">
        <div class="fp-title">${escapeHtml(primary)} — ${escapeHtml(weight)} ${styleVal && styleVal !== "normal" ? escapeHtml(styleVal) : "regular"}</div>
        <button class="fp-close" aria-label="Close">×</button>
      </div>
      <div class="fp-section">
        <div class="fp-label">Family</div>
        <div class="fp-stack"><u>${escapeHtml(primary)}</u>${escapeHtml(restOfStack)};</div>
      </div>
      <div class="fp-grid">
        <div class="fp-cell"><div class="fp-label">Style</div><div class="fp-val">${escapeHtml(styleVal || "normal")}</div></div>
        <div class="fp-cell"><div class="fp-label">Weight</div><div class="fp-val">${escapeHtml(weight)}</div></div>
        <div class="fp-cell"></div>
        <div class="fp-cell"><div class="fp-label">Size</div><div class="fp-val">${escapeHtml(size)}</div></div>
        <div class="fp-cell"><div class="fp-label">Line Height</div><div class="fp-val">${escapeHtml(lineHeight)}</div></div>
        <div class="fp-cell"><div class="fp-label">Color</div><div class="fp-val fp-color"><span>${escapeHtml(colorHex)}</span><i style="background:${escapeAttr(colorRgb)}"></i></div></div>
      </div>
      <div class="fp-foot">
        <button class="fp-download" ${fontUrl ? "" : "disabled"} title="${fontUrl ? "Download font file" : "No downloadable font file found (likely a system font or cross-origin stylesheet)"}">
          ${fontUrl ? "Download font" : "Download unavailable"}
        </button>
      </div>
    `;

    // Position near click, clamped to viewport. Cascade if overlapping existing panels.
    const PANEL_W = 440;
    const PANEL_EST_H = 230;
    let left = clickX + 16;
    let top = clickY + 16;
    if (left + PANEL_W > window.innerWidth - 8) left = window.innerWidth - PANEL_W - 12;
    if (top + PANEL_EST_H > window.innerHeight - 8) top = Math.max(12, window.innerHeight - PANEL_EST_H - 12);
    if (left < 12) left = 12;
    if (top < 12) top = 12;
    // cascade offset if overlapping existing
    let attempts = 0;
    while (attempts < 8 && panels.some((p) => Math.abs(parseFloat(p.style.left) - left) < 8 && Math.abs(parseFloat(p.style.top) - top) < 8)) {
      left += 24;
      top += 24;
      if (left + PANEL_W > window.innerWidth - 8) left = 24;
      if (top + PANEL_EST_H > window.innerHeight - 8) top = 24;
      attempts++;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    panelLayer.appendChild(panel);
    panels.push(panel);

    // entrance animation
    requestAnimationFrame(() => panel.classList.add("is-in"));

    // wire interactions
    panel.addEventListener("mousedown", () => bringToFront(panel));
    panel.querySelector(".fp-close").addEventListener("click", () => removePanel(panel));
    const dl = panel.querySelector(".fp-download");
    if (dl && fontUrl) {
      dl.addEventListener("click", () => {
        dl.classList.add("is-pulse");
        setTimeout(() => dl.classList.remove("is-pulse"), 400);
        downloadFont(fontUrl, primary, weight, styleVal);
      });
    }

    bringToFront(panel);
  }

  function bringToFront(panel) {
    const idx = panels.indexOf(panel);
    if (idx === -1) return;
    panels.splice(idx, 1);
    panels.push(panel);
    panels.forEach((p, i) => (p.style.zIndex = String(10 + i)));
  }

  function removePanel(panel, immediate = false) {
    const idx = panels.indexOf(panel);
    if (idx === -1) return;
    panels.splice(idx, 1);
    if (immediate) {
      panel.remove();
      return;
    }
    panel.classList.remove("is-in");
    panel.classList.add("is-out");
    panel.addEventListener("transitionend", () => panel.remove(), { once: true });
    // safety
    setTimeout(() => panel.isConnected && panel.remove(), 300);
  }

  function closeAllPanels(immediate = false) {
    [...panels].forEach((p) => removePanel(p, immediate));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function collectFontFaceRules() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let cssRules;
      try { cssRules = sheet.cssRules; } catch { continue; }
      if (!cssRules) continue;
      for (const r of cssRules) {
        if (r.type === CSSRule.FONT_FACE_RULE) rules.push(r);
      }
    }
    return rules;
  }

  function normalizeFamily(name) {
    return String(name || "").trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  }

  function findFontUrlForFamily(family, weight, style) {
    const target = normalizeFamily(family);
    const rules = collectFontFaceRules();
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
      const fam = normalizeFamily(r.style.getPropertyValue("font-family"));
      if (fam !== target) continue;
      const w = (r.style.getPropertyValue("font-weight") || "normal").trim();
      const s = (r.style.getPropertyValue("font-style") || "normal").trim();
      const src = r.style.getPropertyValue("src") || "";
      const url = pickBestUrl(src);
      if (!url) continue;
      let score = 1;
      if (w === String(weight) || (w === "normal" && String(weight) === "400") || (w === "bold" && String(weight) === "700")) score += 2;
      if (s === style) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return best;
  }

  function pickBestUrl(srcValue) {
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
    try { url = new URL(url, document.baseURI).href; } catch {}
    return url;
  }

  function downloadFont(url, family, weight, style) {
    const ext = guessExt(url);
    const safeFam = String(family).replace(/[^a-z0-9_-]+/gi, "_");
    const filename = `${safeFam}-${weight}${style && style !== "normal" ? "-" + style : ""}.${ext}`;
    showToast(`Downloading ${filename}…`, { variant: "loading", id: filename });
    chrome.runtime.sendMessage({ type: "FONTY_DOWNLOAD", url, filename }, (resp) => {
      if (!resp || resp.error) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Downloaded ${filename}`, { variant: "success", replaceId: filename });
      }
      // success path is handled by FONTY_DOWNLOAD_DONE message from background
    });
  }

  function showToast(message, opts = {}) {
    if (!toastLayer) ensureHost();
    const { variant = "success", replaceId, id, duration } = opts;
    if (replaceId) {
      const prev = toastLayer.querySelector(`[data-toast-id="${cssEscape(replaceId)}"]`);
      if (prev) prev.remove();
    }
    const t = document.createElement("div");
    t.className = `fonty-toast fonty-toast--${variant}`;
    if (id) t.setAttribute("data-toast-id", id);
    t.innerHTML = `
      <span class="ft-icon">${variant === "loading" ? `<span class="ft-spinner"></span>` : variant === "error" ? "!" : "✓"}</span>
      <span class="ft-msg"></span>
    `;
    t.querySelector(".ft-msg").textContent = message;
    toastLayer.appendChild(t);
    requestAnimationFrame(() => t.classList.add("is-in"));
    if (variant !== "loading") {
      const ms = duration ?? 2600;
      setTimeout(() => dismissToast(t), ms);
    }
    return t;
  }

  function dismissToast(t) {
    if (!t || !t.isConnected) return;
    t.classList.remove("is-in");
    t.classList.add("is-out");
    t.addEventListener("transitionend", () => t.remove(), { once: true });
    setTimeout(() => t.isConnected && t.remove(), 400);
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  function guessExt(url) {
    const m = url.match(/\.(woff2|woff|ttf|otf|eot)(\?|#|$)/i);
    return m ? m[1].toLowerCase() : "font";
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "FONTY_TOGGLE") {
      active ? deactivate() : activate();
    } else if (msg?.type === "FONTY_DOWNLOAD_DONE") {
      ensureHost();
      showToast(`Downloaded ${msg.filename}`, { variant: "success", replaceId: msg.filename });
    } else if (msg?.type === "FONTY_DOWNLOAD_FAILED") {
      ensureHost();
      showToast(`Download failed: ${msg.filename}`, { variant: "error", replaceId: msg.filename });
    }
  });

  const SHADOW_CSS = `
    :host, * { box-sizing: border-box; }

    .fonty-tooltip {
      position: fixed; left: 0; top: 0;
      background: #111; color: #fff;
      font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 8px 12px; border-radius: 6px;
      pointer-events: none;
      box-shadow: 0 6px 20px rgba(0,0,0,.28);
      white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
      opacity: 0; transform: translateY(4px) scale(.96);
      transition: opacity 120ms ease-out, transform 160ms cubic-bezier(.2,.8,.2,1);
      will-change: opacity, transform;
    }
    .fonty-tooltip.is-in { opacity: 1; transform: translateY(0) scale(1); }

    .fonty-panel-layer {
      position: fixed; inset: 0; pointer-events: none;
    }

    .fonty-panel {
      position: fixed; width: 440px; max-width: calc(100vw - 24px);
      background: #0d0d0d; color: #f5f5f5;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border-radius: 12px; padding: 18px 20px 16px;
      border: 1px solid rgba(255,255,255,.06);
      box-shadow: 0 24px 60px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4);
      pointer-events: auto;
      opacity: 0; transform: translateY(-6px) scale(.97);
      transition: opacity 180ms ease-out, transform 220ms cubic-bezier(.2,.9,.2,1.05), box-shadow 180ms ease;
      will-change: opacity, transform;
    }
    .fonty-panel.is-in { opacity: 1; transform: translateY(0) scale(1); }
    .fonty-panel.is-out { opacity: 0; transform: translateY(-4px) scale(.97); transition-duration: 140ms; }

    .fp-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px; gap: 12px; }
    .fp-title { font-weight: 600; font-size: 16px; letter-spacing: .005em; }
    .fp-close {
      all: unset; cursor: pointer; color: #aaa; font-size: 20px; line-height: 1;
      width: 26px; height: 26px; display: grid; place-items: center;
      border-radius: 6px;
      transition: background 140ms ease, color 140ms ease, transform 140ms ease;
    }
    .fp-close:hover { color: #fff; background: rgba(255,255,255,.08); transform: rotate(90deg); }

    .fp-section { margin-bottom: 14px; }
    .fp-label {
      color: #8a8a8a; font-size: 11px; letter-spacing: .04em;
      margin-bottom: 4px; text-transform: none;
    }
    .fp-val { font-size: 14px; color: #f0f0f0; }
    .fp-stack { font-size: 13px; color: #f0f0f0; word-break: break-word; }
    .fp-stack u { text-decoration: underline; text-underline-offset: 3px; }

    .fp-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      column-gap: 16px;
      row-gap: 14px;
      margin-bottom: 14px;
    }
    .fp-cell { min-width: 0; }

    .fp-color { display: flex; align-items: center; gap: 8px; }
    .fp-color i {
      display:inline-block; width: 14px; height: 14px; border-radius: 3px;
      border: 1px solid rgba(255,255,255,.18);
      box-shadow: 0 0 0 0 rgba(255,255,255,0);
      animation: fp-swatch-pop 360ms cubic-bezier(.2,.9,.2,1.4) both;
    }
    @keyframes fp-swatch-pop {
      0% { transform: scale(.6); opacity: 0; }
      60% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }

    .fp-foot { display: flex; justify-content: flex-end; }
    .fp-download {
      all: unset; cursor: pointer; background: #fff; color: #111;
      padding: 9px 16px; border-radius: 8px; font-weight: 600; font-size: 13px;
      transition: transform 120ms ease, background 140ms ease, box-shadow 160ms ease;
      box-shadow: 0 1px 0 rgba(0,0,0,.05), 0 6px 14px rgba(0,0,0,.18);
    }
    .fp-download[disabled] { background: #2a2a2a; color: #888; cursor: not-allowed; box-shadow: none; }
    .fp-download:not([disabled]):hover { background: #f0f0f0; transform: translateY(-1px); box-shadow: 0 2px 0 rgba(0,0,0,.05), 0 10px 20px rgba(0,0,0,.22); }
    .fp-download:not([disabled]):active { transform: translateY(0); }
    .fp-download.is-pulse { animation: fp-pulse 360ms ease; }
    @keyframes fp-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(.96); }
      100% { transform: scale(1); }
    }

    .fonty-toast-layer {
      position: fixed; left: 0; right: 0; bottom: 24px;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      pointer-events: none;
    }
    .fonty-toast {
      pointer-events: auto;
      display: inline-flex; align-items: center; gap: 10px;
      background: #0d0d0d; color: #f5f5f5;
      border: 1px solid rgba(255,255,255,.08);
      font: 500 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 10px 14px; border-radius: 999px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.25);
      opacity: 0; transform: translateY(8px) scale(.98);
      transition: opacity 180ms ease-out, transform 220ms cubic-bezier(.2,.9,.2,1.05);
      max-width: min(560px, calc(100vw - 32px));
    }
    .fonty-toast.is-in { opacity: 1; transform: translateY(0) scale(1); }
    .fonty-toast.is-out { opacity: 0; transform: translateY(6px) scale(.98); transition-duration: 160ms; }

    .fonty-toast .ft-icon {
      display: grid; place-items: center;
      width: 18px; height: 18px; border-radius: 999px;
      font-size: 11px; font-weight: 700; line-height: 1;
      flex: 0 0 auto;
    }
    .fonty-toast--success .ft-icon { background: #1f9d55; color: #fff; }
    .fonty-toast--error   .ft-icon { background: #d24545; color: #fff; }
    .fonty-toast--loading .ft-icon { background: transparent; }

    .fonty-toast .ft-msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .ft-spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.25);
      border-top-color: #fff;
      animation: ft-spin 700ms linear infinite;
    }
    @keyframes ft-spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .fonty-tooltip, .fonty-panel, .fp-close, .fp-download, .fp-color i,
      .fonty-toast, .ft-spinner {
        transition: none !important; animation: none !important;
      }
    }
  `;
})();
