# Fonty

A WhatFont-style Chrome extension that identifies and downloads fonts on any webpage.

## Features
- **Hover** any text → tooltip shows the font family.
- **Click** any text → detail panel shows family stack, style, weight, size, line-height, hex color, and a sample alphabet. Clicks are intercepted, so links are not followed.
- **Download font** button on the detail panel grabs the actual `@font-face` file (woff2/woff/ttf/otf) loaded by the page.
- **Esc** closes the panel; press again or click the toolbar icon to exit inspect mode.

## Install (unpacked)
1. Visit `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the **Fonty** extension. Click the icon on any page to start inspecting.

## Files
- `manifest.json` — MV3 manifest.
- `background.js` — service worker; toggles inspect mode and handles downloads.
- `content.js` — injected on every page; renders the tooltip and detail panel inside a Shadow DOM.
- `content.css` — sets the crosshair cursor in inspect mode.
- `icons/` — toolbar icons.
