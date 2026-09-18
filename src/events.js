/**
 * All event wiring, in one place.
 *
 * The original had 26 inline onclick attributes, 2 oninput, 5 drag attributes,
 * and a ~200-line delegated click handler made of twenty ordered closest()
 * branches where the order itself was load-bearing. ES module scope is not
 * global, so the inline attributes could not survive the split anyway.
 *
 * Now: rendered markup carries data-action, and the dispatch below resolves the
 * INNERMOST [data-action] via closest() and runs exactly that one. Nesting is
 * therefore unambiguous — a button inside a card wins over the card, with no
 * stopPropagation() needed. Static chrome that the original matched by class
 * (chips, tabs, the config modal) is still matched by class, after the
 * data-action dispatch.
 */

import { state, setState } from './state.js';
import { requestRender } from './render/index.js';
import * as actions from './actions.js';
import * as supabase from './supabase.js';
import { openStrategyDrawer, closeStrategyDrawer } from './render/drawer.js';
import { openCatalogDrawer, closeCatalogDrawer, setCatalogFit, renderCatalogDrawerList } from './render/catalog.js';
import { renderDetail } from './render/company.js';
import { showToast } from './toast.js';

const jobIdOf = el => {
  const n = parseInt(el.dataset.job, 10);
  return Number.isNaN(n) ? null : n;
};

/* ── data-action dispatch ───────────────────────────────────────────── */

const ACTIONS = {
  'drawer-open':     el => openStrategyDrawer(jobIdOf(el)),
  'drawer-close':    () => closeStrategyDrawer(),
  'catalog-close':   () => closeCatalogDrawer(),
  'catalog-fit':     el => setCatalogFit(el.dataset.fit),
  'catalog-assign':  el => { actions.setJobStatus(jobIdOf(el), el.dataset.status || ''); },
  'rail-scroll':     el => actions.scrollJobRail(el.dataset.rail, Number(el.dataset.dir) || 1),
  'bookmark-toggle': el => actions.toggleJobBookmark(jobIdOf(el)),
  'funnel-filter':   el => actions.filterByFunnelStage(el.dataset.stage),
  'kanban-remove':   el => actions.removeJobFromKanban(jobIdOf(el)),
  'stage-advance':   el => actions.advanceJobStatus(jobIdOf(el)),
  'status-set':      el => actions.setJobStatus(jobIdOf(el), el.dataset.status || ''),
  'sync-retry':      () => supabase.retryPendingSync()
};

/* ── static chrome, matched by class as before ──────────────────────── */

function handleChrome(e) {
  const vmBtn = e.target.closest('.view-mode-btn');
  if (vmBtn) { actions.switchViewMode(vmBtn.dataset.view); return true; }

  const sortChip = e.target.closest('.sort-chip');
  if (sortChip && sortChip.dataset.sort) {
    setState({ sort: sortChip.dataset.sort });
    document.querySelectorAll('.sort-chip').forEach(c => {
      const active = c.dataset.sort === state.sort;
      c.classList.toggle('active', active);
      c.setAttribute('aria-pressed', active);
    });
    requestRender('list', 'kanban');
    showToast(`⏱️ 정렬 기준: [${sortChip.textContent.trim()}] 반영 완료`);
    return true;
  }

  if (e.target.closest('#btnOpenCatalogDrawer')) { openCatalogDrawer(); return true; }
  if (e.target.closest('#btnCatalogBrowse')) {
    actions.switchViewMode('list');
    document.getElementById('list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  // Clicks inside the slide-over drawers never fall through to the filters.
  if (e.target.closest('#catalogDrawer') || e.target.closest('#strategyDrawer')) return true;

  const chip = e.target.closest('.chip');
  if (chip) { setState({ cat: chip.dataset.cat }); requestRender('chips', 'list'); return true; }

  const fitChip = e.target.closest('.strat-chip[data-fit]');
  if (fitChip) {
    setState({ fit: fitChip.dataset.fit });
    document.querySelectorAll('.strat-chip[data-fit]').forEach(c => c.setAttribute('aria-pressed', c === fitChip));
    requestRender('list');
    return true;
  }

  const appChip = e.target.closest('.app-chip');
  if (appChip) { setState({ appFilter: appChip.dataset.appFilter }); requestRender('appFilters', 'list'); return true; }

  const statCard = e.target.closest('.stat');
  if (statCard) {
    const label = statCard.querySelector('span')?.textContent || '';
    if (label.includes('북마크')) {
      setState({ appFilter: 'bookmarked' });
      requestRender('appFilters', 'list');
    } else if (label.includes('지원 진행 중')) {
      setState({ appFilter: 'all', cat: '전체' });
      requestRender('chips', 'appFilters', 'list');
    } else if (label.includes('Fit S')) {
      setState({ fit: 'S' });
      document.querySelectorAll('.strat-chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.fit === 'S'));
      requestRender('list');
    } else if (label.includes('개발∙데이터')) {
      setState({ cat: '개발∙데이터' });
      requestRender('chips', 'list');
    }
    return true;
  }

  const card = e.target.closest('.cocard');
  if (card) { renderDetail(card.dataset.id); return true; }

  const tab = e.target.closest('.tab');
  if (tab) {
    document.querySelectorAll('.tab').forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    return true;
  }

  return handleConfigModal(e);
}

function handleConfigModal(e) {
  const modal = document.getElementById('configModal');

  if (e.target.closest('#btnOpenConfig')) {
    const cfg = supabase.getSupabaseConfig() || {};
    document.querySelector('#cfgUrl').value = cfg.url || '';
    document.querySelector('#cfgKey').value = cfg.anonKey || '';
    document.querySelector('#cfgUser').value = cfg.userKey || 'park_chanyoung';
    if (modal) modal.style.display = 'flex';
    return true;
  }

  if (e.target.closest('#btnCloseConfig') || e.target.id === 'configModal') {
    if (modal) modal.style.display = 'none';
    return true;
  }

  if (e.target.closest('#btnSaveConfig')) {
    supabase.saveSupabaseConfig({
      url: document.querySelector('#cfgUrl').value.trim(),
      anonKey: document.querySelector('#cfgKey').value.trim(),
      userKey: document.querySelector('#cfgUser').value.trim() || 'park_chanyoung'
    });
    if (modal) modal.style.display = 'none';
    supabase.initSupabase(true).then(afterRemoteData);
    return true;
  }

  if (e.target.closest('#btnSeedDemo') || e.target.closest('#modalBtnSeed')) {
    actions.seedDemoApplications();
    if (modal) modal.style.display = 'none';
    return true;
  }

  if (e.target.closest('#modalBtnReset')) {
    actions.resetApplications(supabase.deleteAllApplications);
    return true;
  }

  if (e.target.closest('#btnSyncRefresh')) {
    const done = supabase.isConnected() ? supabase.fetchSupabaseData() : supabase.initSupabase(true);
    done.then(afterRemoteData);
    return true;
  }

  return false;
}

/**
 * data.js has no subscribe(), so a Supabase fetch that swaps the job or company
 * arrays cannot notify the scheduler by itself. Every path that can change them
 * calls this.
 */
export function afterRemoteData() {
  actions.syncMastCounts();
  requestRender('stats', 'chips', 'appFilters', 'list', 'kanban', 'funnel', 'companies');
}

/* ── listeners ──────────────────────────────────────────────────────── */

export function initEvents() {
  document.addEventListener('click', e => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const fn = ACTIONS[actionEl.dataset.action];
      if (fn) { fn(actionEl); return; }
      console.warn('unknown data-action:', actionEl.dataset.action);
    }
    handleChrome(e);
  });

  document.addEventListener('input', e => {
    const el = e.target;
    if (!el || !el.dataset) return;

    if (el.dataset.action === 'memo-input') {
      // The single memo path. The original had two — an inline oninput plus a
      // delegated handler reading a data attribute nothing ever set, so every
      // keystroke also wrote a record keyed "NaN" (bug A1).
      const id = jobIdOf(el);
      if (id !== null) actions.setJobMemo(id, el.value);
      return;
    }
    if (el.dataset.action === 'catalog-search') { renderCatalogDrawerList(el.value); return; }
    if (el.id === 'q') { setState({ q: el.value.trim().toLowerCase() }); requestRender('list'); }
  });

  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'showClosed') {
      setState({ closed: e.target.checked });
      requestRender('list');
    }
  });

  initDragAndDrop();
}

/* ── kanban drag & drop, delegated once to the board ────────────────── */

function initDragAndDrop() {
  const board = document.getElementById('kanbanContainer');
  if (!board) return;

  let draggedJobId = null;

  board.addEventListener('dragstart', e => {
    const card = e.target.closest('.kanban-job-card');
    if (!card) return;
    draggedJobId = jobIdOf(card);
    if (e.dataTransfer) e.dataTransfer.setData('text/plain', String(draggedJobId));
    card.classList.add('is-dragging');
  });

  board.addEventListener('dragend', e => {
    e.target.closest('.kanban-job-card')?.classList.remove('is-dragging');
    board.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('is-drag-over'));
  });

  board.addEventListener('dragover', e => {
    const col = e.target.closest('.kanban-column');
    if (!col) return;
    e.preventDefault();
    col.classList.add('is-drag-over');
  });

  board.addEventListener('dragleave', e => {
    e.target.closest('.kanban-column')?.classList.remove('is-drag-over');
  });

  board.addEventListener('drop', e => {
    const col = e.target.closest('.kanban-column');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('is-drag-over');
    const id = draggedJobId ?? parseInt(e.dataTransfer?.getData('text/plain'), 10);
    draggedJobId = null;
    if (id === null || Number.isNaN(id)) return;
    actions.moveJobToStage(id, col.dataset.stage);
  });
}
