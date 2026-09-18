/**
 * Catalog drawer — the "browse all 357 postings, quick-add to pipeline"
 * slide-over opened from the mast header.
 *
 * Ported from index.html:3140 (openCatalogDrawer), :3148 (closeCatalogDrawer),
 * :3155 (filterCatalogDrawerFit -> setCatalogFit) and :3163
 * (renderCatalogDrawerList).
 *
 * assignJobFromCatalog (index.html:3204) is a state mutation and is NOT
 * ported — its stage buttons now carry
 * data-action="catalog-assign" data-job data-status (clear = data-status=""),
 * wired by wave 3's events.js.
 *
 * catalogFit ('all'|'S'|'A') is local module state, mirroring the original
 * module-level `let catalogDrawerFit = 'all'` at index.html:2375. It is
 * intentionally NOT added to src/state.js — it is catalog-drawer-only UI
 * state, not part of the pinned wave-1 state shape, and HARD CONSTRAINT #2
 * says not to add it to a shared module.
 *
 * The fit chips and search input themselves live in the static markup of
 * index.html (:1717-1721) and are out of scope here (index.html is
 * read-only in this wave) — wave 3's rewrite of that markup must point
 * data-action="catalog-fit" data-fit="all|S|A" at setCatalogFit(fit), and
 * the search input's data-action="catalog-search" at
 * renderCatalogDrawerList(value), per CONTRACT.md's markup table.
 */

import { getJobs } from '../data.js';
import { getApplication } from '../store.js';
import { STATUSES } from '../constants.js';
import { esc, ddayLabel } from '../util.js';

let catalogFit = 'all';

// index.html:3140-3146
export function openCatalogDrawer() {
  renderCatalogDrawerList();
  const backdrop = document.getElementById('catalogDrawerBackdrop');
  const drawer = document.getElementById('catalogDrawer');
  if (backdrop) backdrop.classList.add('is-open');
  if (drawer) drawer.classList.add('is-open');
}

// index.html:3148-3153
export function closeCatalogDrawer() {
  const backdrop = document.getElementById('catalogDrawerBackdrop');
  const drawer = document.getElementById('catalogDrawer');
  if (backdrop) backdrop.classList.remove('is-open');
  if (drawer) drawer.classList.remove('is-open');
}

// index.html:3155-3161 filterCatalogDrawerFit, renamed per contract.
// Still updates the fit chips' aria-pressed state and re-renders the list,
// same as the original — a setter that also triggers a render of ITS OWN
// module's list is not a cross-render-module call.
export function setCatalogFit(fit) {
  catalogFit = fit;
  document.querySelectorAll('[data-action="catalog-fit"]').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.fit === fit ? 'true' : 'false');
  });
  const searchInput = document.getElementById('catalogDrawerSearch');
  renderCatalogDrawerList(searchInput ? searchInput.value : '');
}

// index.html:3163-3202. `query` is optional (undefined) so this stays
// callable with no arguments per the render-function contract; when omitted
// it reads the live value of #catalogDrawerSearch instead of defaulting to
// '' the way the original's `q = ''` default parameter did, so a
// content-only re-render (e.g. after a catalog-assign) doesn't clobber
// whatever the user had already typed.
export function renderCatalogDrawerList(query) {
  const container = document.getElementById('catalogDrawerBody');
  if (!container) return;

  const searchInput = document.getElementById('catalogDrawerSearch');
  const raw = query !== undefined ? query : (searchInput ? searchInput.value : '');
  const q = (raw || '').toLowerCase();

  const filtered = getJobs().filter(j => {
    if (catalogFit !== 'all' && (j.strategy?.fit || 'B') !== catalogFit) return false;
    if (q) {
      const text = (j.company + ' ' + j.role + ' ' + (j.strategy?.stackMatch || '')).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  container.innerHTML = filtered.slice(0, 50).map(j => {
    const app = getApplication(j.id) || {};
    const curStatus = app.status || '';

    const stageBtns = STATUSES.map(st => `
      <button type="button" class="catalog-stage-btn ${curStatus === st ? 'active-stage' : ''}" data-action="catalog-assign" data-job="${j.id}" data-status="${st}">
        ${curStatus === st ? '✓ ' : '+ '}${st}
      </button>
    `).join('');

    return `
      <div class="catalog-item-card">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:700;font-size:13.5px;color:var(--ink);">${esc(j.company)}</span>
          <span class="strat-badge badge-${j.strategy?.fit || 'A'}">Fit ${j.strategy?.fit || 'A'}</span>
        </div>
        <div style="font-size:12.5px;color:var(--ink-2);">${esc(j.role)} · <span style="font-family:var(--mono);font-size:11px;color:var(--ink-3);">${esc(ddayLabel(j))}</span></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
          ${stageBtns}
          ${curStatus ? `<button type="button" class="catalog-stage-btn" style="color:var(--urgent)" data-action="catalog-assign" data-job="${j.id}" data-status="">✕ 해제</button>` : ''}
        </div>
      </div>
    `;
  }).join('') + (filtered.length > 50 ? `<div style="text-align:center;color:var(--ink-3);font-size:11.5px;padding:10px;">외 ${filtered.length - 50}개 공고 더 있음 (검색어를 입력해 상세 조회)</div>` : '');
}
