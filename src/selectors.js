/**
 * Derived views over data + state + store. Pure reads, no DOM, no mutation.
 *
 * Extracted from index.html:2237 (getCats) and :2243 (visible). Two changes
 * from the original, both deliberate:
 *   - visible() no longer writes `j._idx` onto each job. The original mutated
 *     the data inside a filter callback (index.html:2245); nothing outside the
 *     old table view read it back.
 *   - the sort comparator no longer re-parses each due date on every
 *     comparison. Dates are resolved once per call, which matters because the
 *     comparator runs O(n log n) times over 398 jobs.
 * Ordering and filtering results are otherwise identical to the original.
 */

import { getJobs } from './data.js';
import { state } from './state.js';
import { getApplications } from './store.js';
import { level, daysLeft } from './util.js';

const FIT_WEIGHT = { S: 3, A: 2, B: 1 };

export function getCats() {
  const m = new Map();
  getJobs().forEach(j => m.set(j.cat, (m.get(j.cat) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function visible() {
  const apps = getApplications();

  const kept = getJobs().filter((j, idx) => {
    const jid = j.id || (idx + 1);
    const app = apps[jid];
    const hasApp = !!(app && (app.status || app.is_bookmarked || app.memo));

    // Closed postings stay hidden unless the user asked for them or already
    // tracked them.
    if (!state.closed && level(j) === 'done' && state.appFilter === 'all' && !hasApp) return false;
    if (state.cat !== '전체' && j.cat !== state.cat) return false;
    if (state.fit !== 'all' && j.strategy && j.strategy.fit !== state.fit) return false;

    if (state.appFilter === 'bookmarked') {
      if (!app || !app.is_bookmarked) return false;
    } else if (state.appFilter !== 'all') {
      if (!app || app.status !== state.appFilter) return false;
    }

    if (state.q) {
      const st = j.strategy ? (j.strategy.stackMatch + ' ' + j.strategy.corePitch + ' ' + (j.strategy.fit || '')) : '';
      const memo = app ? (app.memo || '') : '';
      const hay = (j.company + ' ' + j.role + ' ' + (j.cat || '') + ' ' + (j.type || '') + ' ' + st + ' ' + memo).toLowerCase();
      if (hay.indexOf(state.q) < 0) return false;
    }
    return true;
  });

  // Resolve each job's sort keys once instead of inside the comparator.
  const meta = new Map(kept.map(j => [j, {
    done: level(j) === 'done',
    days: daysLeft(j.due),
    fit: FIT_WEIGHT[j.strategy?.fit] || 0
  }]));

  const sortMode = state.sort || 'due';

  return kept.sort((a, b) => {
    const ma = meta.get(a), mb = meta.get(b);

    // Closed postings always sink to the bottom.
    if (ma.done !== mb.done) return ma.done ? 1 : -1;

    if (sortMode === 'due') {
      if (ma.days !== null && mb.days !== null) {
        if (ma.days !== mb.days) return ma.days - mb.days;
      } else if (ma.days !== null) {
        return -1;
      } else if (mb.days !== null) {
        return 1;
      }
      if (ma.fit !== mb.fit) return mb.fit - ma.fit;
      return a.company.localeCompare(b.company, 'ko');
    }

    if (sortMode === 'fit') {
      if (ma.fit !== mb.fit) return mb.fit - ma.fit;
      if (ma.days !== null && mb.days !== null && ma.days !== mb.days) return ma.days - mb.days;
      return a.company.localeCompare(b.company, 'ko');
    }

    if (sortMode === 'name') return a.company.localeCompare(b.company, 'ko');

    return 0;
  });
}
