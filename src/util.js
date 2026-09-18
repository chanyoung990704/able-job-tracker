/**
 * Pure utility functions — DOM-free, no imports (per contract).
 * Moved verbatim (behavior-preserving) from index.html.
 *
 * NOTE: `$` (the (selector, root) => root.querySelector(selector) helper at
 * index.html:1733) is intentionally NOT included here — it is a DOM query
 * helper and belongs in the DOM/render layer, not this pure layer.
 */

// index.html:1734
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// index.html:1735-1736 — module-scoped helpers used by daysLeft/level/ddayLabel.
// `today` is computed once, at module evaluation time, exactly like the
// original top-level `const today = ...` in the inline script (ES modules
// are singletons/evaluated once, so this preserves "computed once per page
// load" semantics).
const today = (() => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
})();
const DAY = 864e5;

// index.html:1744 — daysLeft(iso): iso is a 'YYYY-MM-DD' string (job.due).
// Returns null for falsy input, otherwise the (rounded) integer number of
// days between `today` and the parsed date. Negative = already past.
export function daysLeft(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - today) / DAY);
}

// index.html:1749 — level(j): j is a job-like object with a `.due` field
// (matches the original param, which is the whole job object, not the date).
export function level(j) {
  const n = daysLeft(j.due);
  if (n === null) return 'always';
  if (n < 0) return 'done';
  if (n <= 3) return 'urgent';
  if (n <= 7) return 'soon';
  return 'open';
}

// index.html:1757 — ddayLabel(j): j is a job-like object with `.due` and
// optionally `.dueRaw` fields.
export function ddayLabel(j) {
  const n = daysLeft(j.due);
  if (n === null) return j.dueRaw || '상시';
  if (n < 0) return '마감';
  if (n === 0) return 'D-DAY';
  return 'D-' + n;
}

// index.html:1764 — typeClass(t): t is the raw employment-type string.
export function typeClass(t) {
  if (!t) return 'p-contract';
  if (t.indexOf('인턴') > -1) return 'p-intern';
  if (t.indexOf('계약') > -1) return 'p-contract';
  return 'p-full';
}

// index.html:1770 — shortType(t): t is the raw employment-type string.
export function shortType(t) {
  if (!t) return '-';
  return t.replace('채용연계형 ', '연계 ').replace('(정규직 전환 가능)', '');
}
