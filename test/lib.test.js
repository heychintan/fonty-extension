const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../lib.js");

test("rgbToHex: opaque rgb to lowercase hex", () => {
  assert.equal(lib.rgbToHex("rgb(0, 40, 255)"), "#0028ff");
  assert.equal(lib.rgbToHex("rgb(255, 255, 255)"), "#ffffff");
  assert.equal(lib.rgbToHex("rgb(13, 13, 13)"), "#0d0d0d");
});

test("rgbToHex: rgba reports alpha percent when < 1", () => {
  assert.equal(lib.rgbToHex("rgba(0, 0, 0, 0.5)"), "#000000 (50%)");
  assert.equal(lib.rgbToHex("rgba(255, 0, 0, 1)"), "#ff0000");
});

test("rgbToHex: passthrough for non-rgb input", () => {
  assert.equal(lib.rgbToHex("transparent"), "transparent");
  assert.equal(lib.rgbToHex(""), "");
  assert.equal(lib.rgbToHex(null), "");
});

test("normalizeFamily: trims, lowercases, strips quotes", () => {
  assert.equal(lib.normalizeFamily('"GT America"'), "gt america");
  assert.equal(lib.normalizeFamily("'Source Sans Pro'"), "source sans pro");
  assert.equal(lib.normalizeFamily("  Inter  "), "inter");
  assert.equal(lib.normalizeFamily(undefined), "");
});

test("guessExt: detects woff2/woff/ttf/otf/eot, with query/fragment", () => {
  assert.equal(lib.guessExt("https://x.com/a.woff2"), "woff2");
  assert.equal(lib.guessExt("/font.woff?v=2"), "woff");
  assert.equal(lib.guessExt("/font.ttf#hash"), "ttf");
  assert.equal(lib.guessExt("/font.OTF"), "otf");
  assert.equal(lib.guessExt("/no-ext"), "font");
  assert.equal(lib.guessExt(""), "font");
  assert.equal(lib.guessExt(null), "font");
});

test("pickBestUrl: prefers woff2, then woff, then truetype, then opentype", () => {
  const src =
    `url("/a.ttf") format("truetype"), ` +
    `url("/a.woff") format("woff"), ` +
    `url("/a.woff2") format("woff2")`;
  assert.equal(lib.pickBestUrl(src), "/a.woff2");

  const noWoff2 = `url("/a.ttf") format("truetype"), url("/a.woff") format("woff")`;
  assert.equal(lib.pickBestUrl(noWoff2), "/a.woff");

  const onlyOtf = `url("/a.otf") format("opentype")`;
  assert.equal(lib.pickBestUrl(onlyOtf), "/a.otf");
});

test("pickBestUrl: handles unquoted url() and missing format()", () => {
  assert.equal(lib.pickBestUrl("url(/plain.woff2)"), "/plain.woff2");
  assert.equal(
    lib.pickBestUrl("url('/q.woff2') format('woff2'), url(/p.woff)"),
    "/q.woff2"
  );
});

test("pickBestUrl: returns null when no url() found", () => {
  assert.equal(lib.pickBestUrl("local('Helvetica Neue')"), null);
  assert.equal(lib.pickBestUrl(""), null);
});

test("pickBestUrl: resolves relative URLs against baseUrl", () => {
  assert.equal(
    lib.pickBestUrl("url(/a.woff2)", "https://example.com/page"),
    "https://example.com/a.woff2"
  );
  assert.equal(
    lib.pickBestUrl("url(./b.woff2)", "https://example.com/dir/"),
    "https://example.com/dir/b.woff2"
  );
});

test("pickBestUrl: invalid baseUrl falls back to raw url", () => {
  // URL constructor will throw with garbage base; we should still return the raw path.
  assert.equal(lib.pickBestUrl("url(/c.woff2)", "not a url"), "/c.woff2");
});

test("cssEscape: escapes quotes and backslashes for attribute selectors", () => {
  assert.equal(lib.cssEscape('a"b'), 'a\\"b');
  assert.equal(lib.cssEscape("a\\b"), "a\\\\b");
  assert.equal(lib.cssEscape("normal"), "normal");
});

test("isClickNotDrag: pointer movement < threshold counts as click", () => {
  assert.equal(lib.isClickNotDrag({ x: 100, y: 100 }, { x: 102, y: 101 }, 4), true);
  assert.equal(lib.isClickNotDrag({ x: 100, y: 100 }, { x: 100, y: 100 }, 4), true);
});

test("isClickNotDrag: pointer movement > threshold counts as drag", () => {
  assert.equal(lib.isClickNotDrag({ x: 100, y: 100 }, { x: 110, y: 100 }, 4), false);
  assert.equal(lib.isClickNotDrag({ x: 100, y: 100 }, { x: 100, y: 200 }, 4), false);
});

test("isClickNotDrag: missing mousedown defaults to click (don't accidentally swallow real clicks)", () => {
  assert.equal(lib.isClickNotDrag(null, { x: 50, y: 50 }, 4), true);
});

test("pickFontUrlFromRules: matches family and prefers exact weight match", () => {
  const rules = [
    { family: '"Inter"', weight: "400", style: "normal", src: "url(/inter-400.woff2) format('woff2')" },
    { family: "Inter",   weight: "700", style: "normal", src: "url(/inter-700.woff2) format('woff2')" },
    { family: "Roboto",  weight: "400", style: "normal", src: "url(/roboto.woff2) format('woff2')" },
  ];
  assert.equal(lib.pickFontUrlFromRules(rules, "Inter", "700", "normal"), "/inter-700.woff2");
  assert.equal(lib.pickFontUrlFromRules(rules, "Inter", "400", "normal"), "/inter-400.woff2");
});

test("pickFontUrlFromRules: weight=400 matches `normal`, weight=700 matches `bold`", () => {
  const rules = [
    { family: "X", weight: "normal", style: "normal", src: "url(/x-normal.woff2)" },
    { family: "X", weight: "bold",   style: "normal", src: "url(/x-bold.woff2)" },
  ];
  assert.equal(lib.pickFontUrlFromRules(rules, "X", "400", "normal"), "/x-normal.woff2");
  assert.equal(lib.pickFontUrlFromRules(rules, "X", "700", "normal"), "/x-bold.woff2");
});

test("pickFontUrlFromRules: returns null when no rule matches the family", () => {
  const rules = [{ family: "Inter", weight: "400", style: "normal", src: "url(/inter.woff2)" }];
  assert.equal(lib.pickFontUrlFromRules(rules, "Helvetica", "400", "normal"), null);
});

test("pickFontUrlFromRules: ignores rules with no usable url()", () => {
  const rules = [
    { family: "X", weight: "400", style: "normal", src: "local('System X')" },
    { family: "X", weight: "400", style: "normal", src: "url(/x.woff2) format('woff2')" },
  ];
  assert.equal(lib.pickFontUrlFromRules(rules, "X", "400", "normal"), "/x.woff2");
});

test("pickFontUrlFromRules: resolves relative URLs against baseUrl", () => {
  const rules = [{ family: "X", weight: "400", style: "normal", src: "url(/x.woff2)" }];
  assert.equal(
    lib.pickFontUrlFromRules(rules, "X", "400", "normal", "https://site.example/"),
    "https://site.example/x.woff2"
  );
});
