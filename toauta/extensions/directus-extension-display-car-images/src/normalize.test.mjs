import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_URLS,
  MAX_URL_LENGTH,
  fitCount,
  formatPhotoCount,
  normalizeImageUrls,
  normalizeLimit,
} from "./normalize.js";

const A = "https://toautacz.hel1.your-objectstorage.com/cars/a.jpg";
const B = "https://huuzqjakowbbmvlysguw.supabase.co/storage/v1/object/public/car-images/b.webp";

test("empty values normalize to an empty array", () => {
  for (const value of [null, undefined, "", "   ", "{}", "[]", [], "\n\t"]) {
    assert.deepEqual(normalizeImageUrls(value), [], `value ${JSON.stringify(value)}`);
  }
});

test("a JS array of http(s) URLs keeps every URL in stored order", () => {
  assert.deepEqual(normalizeImageUrls([A, B]), [A, B]);
  assert.deepEqual(normalizeImageUrls([B, A, B]), [B, A, B], "duplicates and order are preserved");
  assert.deepEqual(normalizeImageUrls(["http://example.test/x.png"]), ["http://example.test/x.png"]);
});

test("the input array is not mutated and a new array is returned", () => {
  const input = [` ${A} `, "javascript:alert(1)", B];
  const snapshot = [...input];
  const output = normalizeImageUrls(input);
  assert.deepEqual(input, snapshot);
  assert.notEqual(output, input);
  assert.deepEqual(output, [A, B]);
});

test("dangerous and non-http schemes are rejected", () => {
  const rejected = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "java\nscript:alert(1)",
    "java\tscript:alert(1)",
    "\u0000javascript:alert(1)",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "blob:https://example.test/1234",
    "file:///etc/passwd",
    "ftp://example.test/a.jpg",
    "mailto:a@example.test",
    "about:blank",
    "/relative/path.jpg",
    "relative.jpg",
    "//evil.example/protocol-relative.jpg",
    "https://",
    "https:///no-host.jpg",
    "http://user:secret@example.test/a.jpg",
    "https://user@example.test/a.jpg",
    "not a url",
  ];
  for (const url of rejected) {
    assert.deepEqual(normalizeImageUrls([url]), [], `should reject ${JSON.stringify(url)}`);
    assert.deepEqual(normalizeImageUrls(url), [], `should reject string ${JSON.stringify(url)}`);
  }
});

test("only valid URLs survive a mixed array, non-strings are skipped", () => {
  const mixed = [A, null, undefined, 42, true, { url: A }, [B], "javascript:alert(1)", "", "  ", B];
  assert.deepEqual(normalizeImageUrls(mixed), [A, B]);
});

test("surrounding whitespace is trimmed and scheme case is normalized", () => {
  assert.deepEqual(normalizeImageUrls([`  ${A}\n`]), [A]);
  assert.deepEqual(normalizeImageUrls(["HTTPS://EXAMPLE.TEST/A.JPG"]), ["https://example.test/A.JPG"]);
});

test("unsafe characters are percent-encoded by URL serialization", () => {
  const [url] = normalizeImageUrls(['https://example.test/a b"><img src=x onerror=alert(1)>.jpg']);
  assert.ok(url.startsWith("https://example.test/"));
  assert.ok(!url.includes(" "));
  assert.ok(!url.includes('"'));
  assert.ok(!url.includes("<"));
  assert.ok(!url.includes(">"));
});

test("overlong URLs are rejected", () => {
  const long = `https://example.test/${"a".repeat(MAX_URL_LENGTH)}.jpg`;
  assert.deepEqual(normalizeImageUrls([long, A]), [A]);
});

test("very long arrays are capped", () => {
  const many = Array.from({ length: MAX_URLS + 50 }, (_, index) => `https://example.test/${index}.jpg`);
  const output = normalizeImageUrls(many);
  assert.equal(output.length, MAX_URLS);
  assert.equal(output[0], "https://example.test/0.jpg");
});

test("Postgres array literals are parsed", () => {
  assert.deepEqual(normalizeImageUrls(`{${A},${B}}`), [A, B]);
  assert.deepEqual(normalizeImageUrls(`{"${A}","${B}"}`), [A, B]);
  assert.deepEqual(normalizeImageUrls(`{NULL,"${A}",null}`), [A], "unquoted NULL is skipped");
  assert.deepEqual(
    normalizeImageUrls('{"https://example.test/a,b.jpg","https://example.test/q\\"x.jpg"}'),
    ["https://example.test/a,b.jpg", "https://example.test/q%22x.jpg"],
    "quoted commas and escaped quotes stay inside one element",
  );
  assert.deepEqual(normalizeImageUrls("{javascript:alert(1)}"), []);
});

test("malformed Postgres literals never throw", () => {
  for (const value of ["{", "}", '{"unterminated', "{,,,}", '{"a\\', "{{https://example.test/n.jpg}}"]) {
    assert.doesNotThrow(() => normalizeImageUrls(value), `value ${JSON.stringify(value)}`);
    for (const url of normalizeImageUrls(value)) assert.match(url, /^https?:\/\//);
  }
});

test("JSON string arrays are parsed and invalid JSON yields nothing", () => {
  assert.deepEqual(normalizeImageUrls(JSON.stringify([A, B])), [A, B]);
  assert.deepEqual(normalizeImageUrls(JSON.stringify([A, "data:x", 7])), [A]);
  assert.deepEqual(normalizeImageUrls(`[${JSON.stringify(A)}, `), []);
  assert.deepEqual(normalizeImageUrls("[not json"), []);
  assert.deepEqual(normalizeImageUrls(JSON.stringify({ images: [A] })), []);
});

test("a plain string is one URL or a comma/newline separated list", () => {
  assert.deepEqual(normalizeImageUrls(A), [A]);
  assert.deepEqual(normalizeImageUrls(`${A},${B}`), [A, B]);
  assert.deepEqual(normalizeImageUrls(`${A}, ${B}`), [A, B]);
  assert.deepEqual(normalizeImageUrls(`${A}\n${B}\r\n`), [A, B]);
  assert.deepEqual(normalizeImageUrls("https://example.test/a,b.jpg"), ["https://example.test/a,b.jpg"]);
});

test("other value types normalize to an empty array", () => {
  for (const value of [0, 1, NaN, true, false, {}, { 0: A, length: 1 }, Symbol("x"), () => A, new Date(0)]) {
    assert.deepEqual(normalizeImageUrls(value), []);
  }
});

test("normalizeLimit falls back to the default and clamps", () => {
  assert.equal(DEFAULT_LIMIT, 6);
  assert.equal(normalizeLimit(undefined), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(null), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(""), DEFAULT_LIMIT);
  assert.equal(normalizeLimit("abc"), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(NaN), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(0), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(-3), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(3), 3);
  assert.equal(normalizeLimit("4"), 4);
  assert.equal(normalizeLimit(2.9), 2);
  assert.equal(normalizeLimit(10_000), MAX_LIMIT);
  assert.equal(normalizeLimit(Infinity), DEFAULT_LIMIT);
});

test("fitCount keeps the +N counter inside narrow list cells", () => {
  assert.equal(fitCount(undefined, 12, 6), 6, "unmeasured width falls back to the limit");
  assert.equal(fitCount(0, 12, 6), 6);
  assert.equal(fitCount(NaN, 2, 6), 2);
  assert.equal(fitCount(1000, 12, 6), 6, "a wide cell shows the full limit");
  assert.equal(fitCount(1000, 2, 6), 2);
  assert.equal(fitCount(1000, 0, 6), 0);
  assert.equal(fitCount(196, 12, 6), 3, "3 thumbnails + gap + counter fit in 196px, 4 do not");
  assert.equal(fitCount(216, 12, 6), 4, "exact fit");
  assert.equal(fitCount(84, 2, 6), 2, "two thumbnails fit without a counter");
  assert.equal(fitCount(83, 2, 6), 1, "one pixel short: one thumbnail plus counter");
  assert.equal(fitCount(10, 12, 6), 1, "never fewer than one thumbnail");
  assert.equal(fitCount(1000, 12, "junk"), 6);
});

test("formatPhotoCount uses Czech plural forms", () => {
  assert.equal(formatPhotoCount(0), "0 fotografií");
  assert.equal(formatPhotoCount(1), "1 fotografie");
  assert.equal(formatPhotoCount(2), "2 fotografie");
  assert.equal(formatPhotoCount(4), "4 fotografie");
  assert.equal(formatPhotoCount(5), "5 fotografií");
  assert.equal(formatPhotoCount(12), "12 fotografií");
  assert.equal(formatPhotoCount(-1), "0 fotografií");
  assert.equal(formatPhotoCount(Number.NaN), "0 fotografií");
});
