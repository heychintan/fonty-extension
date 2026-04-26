(() => {
  if (window.__fontyInjected) return;
  window.__fontyInjected = true;

  const lib = window.__fontyLib;
  if (!lib) {
    console.error("Fonty: lib.js failed to load before content.js");
    return;
  }
  const { rgbToHex, guessExt, cssEscape, isClickNotDrag } = lib;

  const HOST_ID = "fonty-host";
  let active = false;
  let host = null;
  let shadow = null;
  let tooltipEl = null;
  let panelLayer = null;
  let toastLayer = null;
  const panels = []; // [{ el, left, top }]
  let tooltipDims = { w: 0, h: 0 };
  let lastFocusedBeforePanel = null;
  let mouseDownPos = null; // for drag-vs-click detection

  const TEXT_TAGS = new Set([
    "P","SPAN","A","H1","H2","H3","H4","H5","H6","LI","TD","TH","DIV",
    "LABEL","BUTTON","BLOCKQUOTE","CODE","PRE","STRONG","EM","SMALL","B","I",
    "DT","DD","FIGCAPTION","CITE","Q","SUMMARY","CAPTION","ARTICLE","SECTION","ASIDE","HEADER","FOOTER","NAV","MAIN"
  ]);

  let dialogIdCounter = 0;

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
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.setAttribute("aria-live", "polite");
    tooltipEl.setAttribute("aria-atomic", "true");
    shadow.appendChild(tooltipEl);

    panelLayer = document.createElement("div");
    panelLayer.className = "fonty-panel-layer";
    shadow.appendChild(panelLayer);

    toastLayer = document.createElement("div");
    toastLayer.className = "fonty-toast-layer";
    toastLayer.setAttribute("role", "status");
    toastLayer.setAttribute("aria-live", "polite");
    toastLayer.setAttribute("aria-atomic", "false");
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
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKeyDown, true);
    // Clear stale drag state if pointer leaves the window or a drag completes
    // outside our click handler — otherwise the next click can be misclassified.
    window.addEventListener("blur", clearMouseDownPos, true);
    document.addEventListener("dragend", clearMouseDownPos, true);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    document.body && document.body.classList.remove("fonty-active");
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", clearMouseDownPos, true);
    document.removeEventListener("dragend", clearMouseDownPos, true);
    hideTooltip();
    closeAllPanels(true);
  }

  function clearMouseDownPos() { mouseDownPos = null; }

  function onKeyDown(e) {
    if (e.key !== "Escape") return;
    if (panels.length > 0) {
      const top = panels[panels.length - 1];
      removePanel(top.el);
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
    if (tooltipEl && tooltipEl.classList.contains("is-in")) {
      positionTooltip(e.clientX, e.clientY);
    }
  }

  function onMouseDown(e) {
    if (isInsideShadowHost(e.target)) return;
    mouseDownPos = { x: e.clientX, y: e.clientY };
  }

  function onClickCapture(e) {
    if (isInsideShadowHost(e.target)) return;
    const isClick = isClickNotDrag(mouseDownPos, { x: e.clientX, y: e.clientY }, 4);
    mouseDownPos = null;
    if (!isClick) return; // drag — let the page handle text selection
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
    if (tooltipEl.textContent !== primary) {
      tooltipEl.textContent = primary;
      // Measure once after content change. offsetWidth/offsetHeight are layout
      // reads, but they happen on text change only — not per mousemove.
      tooltipDims = { w: tooltipEl.offsetWidth, h: tooltipEl.offsetHeight };
    }
    tooltipEl.classList.add("is-in");
    positionTooltip(x, y);
  }

  function positionTooltip(x, y) {
    const pad = 14;
    const { w, h } = tooltipDims;
    let left = x + pad;
    let top = y + pad;
    if (left + w > window.innerWidth - 4) left = x - w - pad;
    if (top + h > window.innerHeight - 4) top = y - h - pad;
    left = Math.max(4, left);
    top = Math.max(4, top);
    tooltipEl.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.classList.remove("is-in");
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
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    const titleId = `fonty-title-${++dialogIdCounter}`;
    panel.setAttribute("aria-labelledby", titleId);

    const restOfStack = stack.replace(primary, "").replace(/^,\s*/, ", ");
    panel.innerHTML = `
      <div class="fp-head">
        <h2 class="fp-title" id="${titleId}">${escapeHtml(primary)} — ${escapeHtml(weight)} ${styleVal && styleVal !== "normal" ? escapeHtml(styleVal) : "regular"}</h2>
        <button class="fp-close" type="button" aria-label="Close font details">
          <span class="fp-close-glyph" aria-hidden="true">×</span>
        </button>
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
        <div class="fp-cell"><div class="fp-label">Color</div><div class="fp-val fp-color"><span>${escapeHtml(colorHex)}</span><i style="background:${escapeHtml(colorRgb)}" aria-hidden="true"></i></div></div>
      </div>
      <div class="fp-foot">
        <button class="fp-download" type="button" ${fontUrl ? "" : "disabled"} title="${fontUrl ? "Download font file" : "No downloadable font file found (likely a system font or cross-origin stylesheet)"}">
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
    let attempts = 0;
    while (
      attempts < 8 &&
      panels.some((p) => Math.abs(p.left - left) < 8 && Math.abs(p.top - top) < 8)
    ) {
      left += 24;
      top += 24;
      if (left + PANEL_W > window.innerWidth - 8) left = 24;
      if (top + PANEL_EST_H > window.innerHeight - 8) top = 24;
      attempts++;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    panelLayer.appendChild(panel);
    const entry = { el: panel, left, top };
    panels.push(entry);

    requestAnimationFrame(() => panel.classList.add("is-in"));

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

    // Focus management: remember the element that had focus, then move focus
    // to the close button so keyboard users can dismiss/tab into the panel.
    if (!lastFocusedBeforePanel && document.activeElement && document.activeElement !== document.body) {
      lastFocusedBeforePanel = document.activeElement;
    }
    requestAnimationFrame(() => {
      const closeBtn = panel.querySelector(".fp-close");
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    });

    bringToFront(panel);
  }

  function bringToFront(panel) {
    const idx = panels.findIndex((p) => p.el === panel);
    if (idx === -1) return;
    const [entry] = panels.splice(idx, 1);
    panels.push(entry);
    panels.forEach((p, i) => (p.el.style.zIndex = String(10 + i)));
  }

  function removePanel(panel, immediate = false) {
    const idx = panels.findIndex((p) => p.el === panel);
    if (idx === -1) return;
    panels.splice(idx, 1);
    const finish = () => {
      panel.remove();
      if (panels.length === 0) {
        restoreFocusAfterPanels();
        lastFocusedBeforePanel = null;
      }
    };
    if (immediate) finish();
    else animateOut(panel, finish, 300);
  }

  function restoreFocusAfterPanels() {
    const target = lastFocusedBeforePanel;
    if (target && target.isConnected) {
      try { target.focus({ preventScroll: true }); } catch { /* fall through */ }
      if (document.activeElement === target) return;
    }
    // Explicit fallback: blur whatever inherited focus from the removed dialog
    // so it doesn't sit on a detached element.
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
  }

  function closeAllPanels(immediate = false) {
    [...panels].forEach((p) => removePanel(p.el, immediate));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // Run an exit transition then call `finish`. Falls back to a timeout if no
  // transition fires (e.g. reduced-motion strips transitions). Idempotent.
  function animateOut(el, finish, fallbackMs = 300) {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      finish();
    };
    el.classList.remove("is-in");
    el.classList.add("is-out");
    el.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, fallbackMs);
  }

  function collectFontFaceRules() {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let cssRules;
      try { cssRules = sheet.cssRules; } catch { continue; }
      if (!cssRules) continue;
      for (const r of cssRules) {
        if (r.type === CSSRule.FONT_FACE_RULE) {
          rules.push({
            family: r.style.getPropertyValue("font-family"),
            weight: r.style.getPropertyValue("font-weight"),
            style: r.style.getPropertyValue("font-style"),
            src: r.style.getPropertyValue("src"),
          });
        }
      }
    }
    return rules;
  }

  function findFontUrlForFamily(family, weight, style) {
    return lib.pickFontUrlFromRules(collectFontFaceRules(), family, weight, style, document.baseURI);
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
    if (variant === "error") {
      t.setAttribute("role", "alert");
    } else {
      t.setAttribute("role", "status");
    }
    if (id) t.setAttribute("data-toast-id", id);
    t.innerHTML = `
      <span class="ft-icon" aria-hidden="true">${variant === "loading" ? `<span class="ft-spinner"></span>` : variant === "error" ? "!" : "✓"}</span>
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
    animateOut(t, () => t.remove(), 400);
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
    :host {
      /* Design tokens — single source of truth for the popover surface. */
      --fonty-bg: #0d0d0d;
      --fonty-bg-elev: #111;
      --fonty-fg: #f5f5f5;
      --fonty-fg-muted: #8a8a8a;
      --fonty-border: rgba(255,255,255,.06);
      --fonty-border-strong: rgba(255,255,255,.18);
      --fonty-accent-success: #1f9d55;
      --fonty-accent-error: #d24545;
      --fonty-radius-sm: 6px;
      --fonty-radius-md: 8px;
      --fonty-radius-lg: 12px;
      --fonty-radius-pill: 999px;
      --fonty-shadow-sm: 0 6px 20px rgba(0,0,0,.28);
      --fonty-shadow-lg: 0 24px 60px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4);
      --fonty-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --fonty-focus-ring: 0 0 0 2px var(--fonty-bg), 0 0 0 4px #4c9aff;
    }
    :host, * { box-sizing: border-box; }

    .fonty-tooltip {
      position: fixed; left: 0; top: 0;
      transform: translate3d(0, 0, 0);
      background: var(--fonty-bg-elev); color: #fff;
      font: 500 13px/1.2 var(--fonty-font);
      padding: 8px 12px; border-radius: var(--fonty-radius-sm);
      pointer-events: none;
      box-shadow: var(--fonty-shadow-sm);
      white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis;
      visibility: hidden; opacity: 0;
      transition: opacity 120ms ease-out, visibility 0s linear 120ms;
      will-change: opacity, transform;
    }
    .fonty-tooltip.is-in {
      visibility: visible; opacity: 1;
      transition: opacity 120ms ease-out, visibility 0s linear 0s;
    }

    .fonty-panel-layer { position: fixed; inset: 0; pointer-events: none; }

    .fonty-panel {
      position: fixed; width: 440px; max-width: calc(100vw - 24px);
      background: var(--fonty-bg); color: var(--fonty-fg);
      font: 14px/1.4 var(--fonty-font);
      border-radius: var(--fonty-radius-lg); padding: 18px 20px 16px;
      border: 1px solid var(--fonty-border);
      box-shadow: var(--fonty-shadow-lg);
      pointer-events: auto;
      opacity: 0; transform: translateY(-6px) scale(.97);
      transition: opacity 180ms ease-out, transform 220ms cubic-bezier(.2,.9,.2,1.05), box-shadow 180ms ease;
      will-change: opacity, transform;
    }
    .fonty-panel.is-in { opacity: 1; transform: translateY(0) scale(1); }
    .fonty-panel.is-out { opacity: 0; transform: translateY(-4px) scale(.97); transition-duration: 140ms; }

    .fp-head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px; gap: 12px; }
    .fp-title {
      font: 600 16px/1.25 var(--fonty-font);
      letter-spacing: .005em;
      margin: 0;
      color: var(--fonty-fg);
    }
    .fp-close {
      all: unset;
      cursor: pointer;
      color: #aaa;
      width: 36px; height: 36px;
      display: grid; place-items: center;
      border-radius: var(--fonty-radius-sm);
      transition: background 140ms ease, color 140ms ease, transform 140ms ease;
    }
    .fp-close-glyph {
      font-size: 20px; line-height: 1;
      transition: transform 140ms ease;
      display: inline-block;
    }
    .fp-close:hover { color: #fff; background: rgba(255,255,255,.08); }
    .fp-close:hover .fp-close-glyph { transform: rotate(90deg); }
    .fp-close:focus-visible { box-shadow: var(--fonty-focus-ring); color: #fff; }

    .fp-section { margin-bottom: 14px; }
    .fp-label {
      color: var(--fonty-fg-muted); font-size: 11px; letter-spacing: .04em;
      margin-bottom: 4px;
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
      border: 1px solid var(--fonty-border-strong);
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
      padding: 9px 16px; border-radius: var(--fonty-radius-md);
      font: 600 13px/1 var(--fonty-font);
      min-height: 36px; min-width: 44px;
      display: inline-flex; align-items: center; justify-content: center;
      transition: transform 120ms ease, background 140ms ease, box-shadow 160ms ease;
      box-shadow: 0 1px 0 rgba(0,0,0,.05), 0 6px 14px rgba(0,0,0,.18);
    }
    .fp-download[disabled] { background: #2a2a2a; color: #888; cursor: not-allowed; box-shadow: none; }
    .fp-download:not([disabled]):hover { background: #f0f0f0; transform: translateY(-1px); box-shadow: 0 2px 0 rgba(0,0,0,.05), 0 10px 20px rgba(0,0,0,.22); }
    .fp-download:not([disabled]):active { transform: translateY(0); }
    .fp-download:focus-visible { box-shadow: var(--fonty-focus-ring); }
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
      background: var(--fonty-bg); color: var(--fonty-fg);
      border: 1px solid rgba(255,255,255,.08);
      font: 500 13px/1.3 var(--fonty-font);
      padding: 10px 14px; border-radius: var(--fonty-radius-pill);
      box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.25);
      opacity: 0; transform: translateY(8px) scale(.98);
      transition: opacity 180ms ease-out, transform 220ms cubic-bezier(.2,.9,.2,1.05);
      max-width: min(560px, calc(100vw - 32px));
    }
    .fonty-toast.is-in { opacity: 1; transform: translateY(0) scale(1); }
    .fonty-toast.is-out { opacity: 0; transform: translateY(6px) scale(.98); transition-duration: 160ms; }

    .fonty-toast .ft-icon {
      display: grid; place-items: center;
      width: 18px; height: 18px; border-radius: var(--fonty-radius-pill);
      font-size: 11px; font-weight: 700; line-height: 1;
      flex: 0 0 auto;
    }
    .fonty-toast--success .ft-icon { background: var(--fonty-accent-success); color: #fff; }
    .fonty-toast--error   .ft-icon { background: var(--fonty-accent-error);  color: #fff; }
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
      .fonty-tooltip, .fonty-panel, .fp-close, .fp-close-glyph, .fp-download, .fp-color i,
      .fonty-toast, .ft-spinner {
        transition: none !important; animation: none !important;
      }
    }
  `;
})();
