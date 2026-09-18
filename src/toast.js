/**
 * The single bottom toast (#trackerToast). Extracted from index.html:1787 so
 * every module shares one timer instead of each keeping its own copy.
 */
let timer = null;

export function showToast(msg) {
  const t = document.getElementById('trackerToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => t.classList.remove('show'), 2600);
}
