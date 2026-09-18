/**
 * Render scheduler.
 *
 * The original called render functions straight from every mutator, and
 * renderList() additionally called renderKanbanView() and
 * renderPipelineFunnel() itself (index.html:2429-2430). One card drag therefore
 * rebuilt the kanban board three times, the funnel three times and the 398-card
 * shelf list once — including while that list was display:none.
 *
 * Here, mutators ask for targets and this module coalesces the requests into a
 * single animation frame, rendering each target at most once and skipping
 * whatever the current view mode has hidden.
 */

import { state } from '../state.js';
import { renderKanbanView } from './kanban.js';
import { renderPipelineFunnel } from './funnel.js';
import { renderStats, renderChips, renderAppFilters, renderList } from './shelves.js';
import { renderCompanies } from './company.js';

const TARGETS = {
  list: renderList,
  stats: renderStats,
  chips: renderChips,
  appFilters: renderAppFilters,
  kanban: renderKanbanView,
  funnel: renderPipelineFunnel,
  companies: renderCompanies
};

/** Targets belonging to a view that is currently hidden are skipped entirely. */
function isVisibleTarget(name) {
  if (name === 'list') return state.viewMode !== 'kanban';
  if (name === 'kanban') return state.viewMode === 'kanban';
  return true;
}

const pending = new Set();
let frame = null;

function flush() {
  frame = null;
  const targets = [...pending];
  pending.clear();
  for (const name of targets) {
    if (!isVisibleTarget(name)) continue;
    const fn = TARGETS[name];
    if (!fn) { console.warn('unknown render target:', name); continue; }
    try {
      fn();
    } catch (e) {
      // One broken section must not stop the rest of the page from rendering.
      console.error(`render "${name}" failed:`, e);
    }
  }
}

/**
 * Queues one or more targets for the next frame. Repeated calls within a frame
 * collapse into a single render per target.
 *   requestRender('kanban', 'funnel')
 */
export function requestRender(...names) {
  names.forEach(n => pending.add(n));
  if (frame === null) frame = requestAnimationFrame(flush);
}

/** Renders now, bypassing the frame — used once at boot. */
export function renderAll() {
  pending.clear();
  if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
  Object.keys(TARGETS).forEach(n => pending.add(n));
  flush();
}

/** Everything that depends on the applications store. */
export const APPLICATION_TARGETS = ['stats', 'appFilters', 'kanban', 'funnel', 'list'];
