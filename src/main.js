/**
 * Boot sequence.
 *
 * The data now arrives over fetch instead of being inlined in the page, so the
 * first paint happens in two steps: chrome immediately, content once
 * data/*.json lands.
 */

import { loadData } from './data.js';
import { subscribe, loadApplications } from './store.js';
import { requestRender, renderAll, APPLICATION_TARGETS } from './render/index.js';
import { renderDrawer } from './render/drawer.js';
import { initEvents, afterRemoteData } from './events.js';
import { switchViewMode, syncMastCounts } from './actions.js';
import * as supabase from './supabase.js';

function setLoading(on) {
  const el = document.getElementById('list');
  if (!el) return;
  // Inline style rather than a new CSS class: the stylesheets were extracted
  // verbatim in wave 1 and this is the only markup the split itself adds.
  if (on) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3);font-size:14px">공고 데이터를 불러오는 중…</div>';
}

async function boot() {
  initEvents();
  loadApplications();

  // Any store change re-renders the affected views once, on the next frame,
  // and pushes that one record to Supabase. Bulk replacements (a remote fetch,
  // seeding, reset) must not echo back as per-record uploads.
  subscribe(change => {
    requestRender(...APPLICATION_TARGETS);
    renderDrawer();
    if (change.type === 'replace' || change.type === 'load') return;
    supabase.syncApplication(change.jobId);
  });

  setLoading(true);
  const result = await loadData();
  if (!result.ok) {
    console.warn('starting with no local data; waiting for Supabase');
  }

  syncMastCounts();
  renderAll();
  supabase.renderConnRibbon();

  // Discover opportunities first; the pipeline is one click away.
  switchViewMode('list');

  // Connect once the optional local config script has had its chance to load.
  await (window.__configReady || Promise.resolve());
  await supabase.initSupabase(false);
  afterRemoteData();
}

boot().catch(e => console.error('boot failed:', e));

// The Playwright layout test drives the app through this one deliberate entry
// point, replacing the 28 globals the original exposed ad hoc.
import { PIPELINE_STAGES, STATUSES } from './constants.js';
import { getJobs, getCompanies } from './data.js';
import * as store from './store.js';
import { renderKanbanView } from './render/kanban.js';
import { closeStrategyDrawer } from './render/drawer.js';

window.App = {
  get JOBS() { return getJobs(); },
  get COS() { return getCompanies(); },
  get APPLICATIONS() { return store.getApplications(); },
  PIPELINE_STAGES,
  STATUSES,
  store,
  switchViewMode,
  renderKanbanView,
  closeStrategyDrawer,
  renderAll,
  requestRender
};
