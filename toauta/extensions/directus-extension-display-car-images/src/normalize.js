// Pure helpers shared by the display and the interface. No Vue or Directus imports,
// so `node --test` can load this file directly.

export const DEFAULT_LIMIT = 6;
export const MAX_LIMIT = 50;
export const MAX_URLS = 200;
export const MAX_URL_LENGTH = 2048;
// Must match the list display CSS in display.vue.
export const THUMB_WIDTH = 40;
export const THUMB_GAP = 4;
export const COUNTER_WIDTH = 40;

const ABSOLUTE_HTTP_URL = /^https?:\/\/[^/\\\s?#@]/i;
const LIST_SEPARATOR = /\r?\n|,(?=\s*https?:\/\/)/i;

/**
 * Returns a safe http(s) URL string, or null.
 * @param {unknown} candidate
 * @returns {string | null}
 */
function toSafeUrl(candidate) {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;
  if (!ABSOLUTE_HTTP_URL.test(trimmed)) return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href;
}

/**
 * Splits a Postgres array literal such as {a,"b,c",NULL} into its elements.
 * Never throws; nested braces are flattened. NULL elements are not URLs, so
 * toSafeUrl drops them later.
 * @param {string} literal
 * @returns {string[]}
 */
function parsePostgresArray(literal) {
  const body = literal.trim().replace(/^\{/, "").replace(/\}$/, "");
  const elements = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < body.length && elements.length < MAX_URLS; index += 1) {
    const character = body[index];
    if (quoted) {
      if (character === "\\" && index + 1 < body.length) {
        index += 1;
        current += body[index];
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      elements.push(current);
      current = "";
    } else if (character !== "{" && character !== "}") {
      current += character;
    }
  }
  elements.push(current);
  return elements;
}

/**
 * Turns a string field value into candidate elements.
 * @param {string} value
 * @returns {unknown[]}
 */
function splitString(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      if (trimmed.startsWith("[")) return [];
      return parsePostgresArray(trimmed);
    }
  }

  return trimmed.split(LIST_SEPARATOR);
}

/**
 * Normalizes a cars.images value (JS array, Postgres array literal, JSON string,
 * plain or comma separated string, or null) into absolute http(s) URLs.
 * Stored order and duplicates are kept; everything else is dropped.
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeImageUrls(value) {
  let candidates;
  if (Array.isArray(value)) candidates = value;
  else if (typeof value === "string") candidates = splitString(value);
  else return [];

  const urls = [];
  for (const candidate of candidates) {
    const url = toSafeUrl(candidate);
    if (url) urls.push(url);
    if (urls.length >= MAX_URLS) break;
  }
  return urls;
}

/**
 * @param {unknown} limit
 * @returns {number}
 */
export function normalizeLimit(limit) {
  const number = typeof limit === "number" ? limit : typeof limit === "string" ? Number(limit) : NaN;
  if (!Number.isFinite(number) || number < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(number), MAX_LIMIT);
}

/**
 * How many list thumbnails fit into `width` pixels while keeping the "+N" counter
 * visible. Unknown width falls back to the limit; at least one thumbnail is shown.
 * @param {unknown} width
 * @param {number} total
 * @param {unknown} limit
 * @returns {number}
 */
export function fitCount(width, total, limit) {
  const max = Math.min(normalizeLimit(limit), total);
  if (max <= 0) return 0;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return max;

  const widthFor = (n, withCounter) =>
    n * THUMB_WIDTH + Math.max(n - 1, 0) * THUMB_GAP + (withCounter ? THUMB_GAP + COUNTER_WIDTH : 0);

  let n = max;
  while (n > 1 && widthFor(n, n < total) > width) n -= 1;
  return n;
}

/**
 * Czech label such as "1 fotografie", "3 fotografie", "12 fotografií".
 * @param {number} count
 * @returns {string}
 */
export function formatPhotoCount(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const noun = n === 1 || (n >= 2 && n <= 4) ? "fotografie" : "fotografií";
  return `${n} ${noun}`;
}
