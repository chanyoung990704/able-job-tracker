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
  const meta = new Map(kept.map(j => [j, sortKeys(j)]));
  return kept.sort(compareBy(state.sort || 'due', j => meta.get(j)));
}

/** The values the comparator needs, computed once per job rather than per comparison. */
export function sortKeys(j) {
  return {
    done: level(j) === 'done',
    days: daysLeft(j.due),
    fit: FIT_WEIGHT[j.strategy?.fit] || 0,
    company: j.company
  };
}

/**
 * Builds the comparator for a sort mode. Exported so it can be checked directly
 * for transitivity — a comparator that is not a consistent total preorder
 * produces an order that depends on the engine's sort algorithm, which is
 * exactly the bug this shape fixes.
 */
export function compareBy(mode, keysOf = sortKeys) {
  return (a, b) => {
    const ma = keysOf(a), mb = keysOf(b);

    // Closed postings always sink to the bottom.
    if (ma.done !== mb.done) return ma.done ? 1 : -1;

    if (mode === 'fit') {
      if (ma.fit !== mb.fit) return mb.fit - ma.fit;
      // Within a fit grade, dated postings come first and sort by deadline;
      // undated ones follow, by name. The original compared dated pairs by
      // deadline but fell back to name whenever either side was undated, which
      // made the comparator non-transitive: for 한국산업은행 (D-169),
      // 에스엘 (D-166) and 인플루엔셜 (no deadline) it reported A<B and B<C but
      // A>C, so the resulting order depended on the engine's sort algorithm and
      // differed between Chromium and Node.
      if ((ma.days === null) !== (mb.days === null)) return ma.days === null ? 1 : -1;
      if (ma.days !== null && ma.days !== mb.days) return ma.days - mb.days;
      return ma.company.localeCompare(mb.company, 'ko');
    }

    if (mode === 'name') return ma.company.localeCompare(mb.company, 'ko');

    // 'due' (default): dated postings first, by deadline, then fit, then name.
    if ((ma.days === null) !== (mb.days === null)) return ma.days === null ? 1 : -1;
    if (ma.days !== null && ma.days !== mb.days) return ma.days - mb.days;
    if (ma.fit !== mb.fit) return mb.fit - ma.fit;
    return ma.company.localeCompare(mb.company, 'ko');
  };
}
