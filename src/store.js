/**
 * Applications store — DOM-free. Owns the APPLICATIONS state that used to
 * live as `window.APPLICATIONS` in index.html. The render/DOM layer
 * subscribes to this module instead of this module calling into render
 * functions directly (inversion vs. the original inline script, which
 * called renderStats()/renderList()/etc. straight from setJobStatus,
 * setJobMemo, toggleBookmark).
 *
 * Record shape (found in index.html, e.g. toggleBookmark:2099,
 * setJobStatus:2131, setJobMemo:2157, seedDemoApplications:~2172):
 *   {
 *     status?: string,        // one of STATUSES, or absent/deleted to mean "no status"
 *     is_bookmarked: boolean, // NOTE: field is `is_bookmarked`, not `bookmark`
 *     memo: string,
 *     updated_at?: string,    // ISO timestamp, set on every mutation
 *     applied_at?: string     // ISO timestamp, set once when status first becomes '서류제출'
 *   }
 * Records are dropped entirely (delete APPLICATIONS[jobId]) once they have
 * no status, no memo, and are not bookmarked — this module preserves that
 * convention everywhere.
 *
 * localStorage key: 'ABLE_JOB_APPLICATIONS' (STORAGE_KEYS.applications).
 */

import { STATUSES, STORAGE_KEYS } from './constants.js';

let APPLICATIONS = {};
let listeners = [];

// ---- localStorage helpers (guarded: throws in private-mode Safari etc.) ----

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

// ---- jobId guard -----------------------------------------------------------
// Fixes a real bug in the original code: setJobStatus/setJobMemo never
// validated jobId, so calling them with a NaN/undefined id would write a
// record keyed literally "NaN"/"undefined" into localStorage. Every mutator
// below must refuse to write when jobId is null/undefined/NaN or coerces to
// the string "NaN".
function isInvalidJobId(jobId) {
  if (jobId === null || jobId === undefined) return true;
  if (typeof jobId === 'number' && Number.isNaN(jobId)) return true;
  if (String(jobId) === 'NaN') return true;
  return false;
}

function notify(changeInfo) {
  // Iterate a copy so a listener unsubscribing itself mid-notify is safe.
  listeners.slice().forEach(fn => {
    try {
      fn(changeInfo);
    } catch (e) {
      console.warn('store subscriber threw:', e);
    }
  });
}

export function saveApplications() {
  safeSetItem(STORAGE_KEYS.applications, JSON.stringify(APPLICATIONS));
}

// ---- one-time purge (index.html:1796 loadLocalApplications, verbatim) -----
function runLegacyPurge() {
  try {
    if (safeGetItem(STORAGE_KEYS.purge)) return;
    const demoJobIds = [1, 2, 4, 5, 11, 19, 22, 26, 28, 33, 36, 42, 165, 166, 167, 170, 172];
    let changed = false;
    demoJobIds.forEach(id => {
      const app = APPLICATIONS[id];
      if (
        app &&
        (app.memo?.includes('어필') ||
          app.memo?.includes('강조') ||
          app.memo?.includes('등록 완료') ||
          app.memo?.includes('AIVLE') ||
          app.memo?.includes('트랜잭션') ||
          app.status)
      ) {
        if (app.is_bookmarked && !app.memo?.includes('AIVLE')) {
          delete app.status;
        } else {
          delete APPLICATIONS[id];
        }
        changed = true;
      }
    });
    if (changed) saveApplications();
    safeSetItem(STORAGE_KEYS.purge, '1');
  } catch (e) {
    console.warn('Local applications purge error:', e);
  }
}

// ---- one-time status migration (8-value STATUSES -> 5-value STATUSES) -----
// '서류합격' and '코테/과제' collapse into '면접대기'. '불합격' and any other
// status no longer in STATUSES is cleared, but memo/bookmark are preserved.
// Gated on STORAGE_KEYS.migration exactly like the purge above is gated on
// STORAGE_KEYS.purge, so it only ever runs once.
const STATUS_MIGRATION_MAP = {
  서류합격: '면접대기',
  '코테/과제': '면접대기'
};

function runStatusMigration() {
  try {
    if (safeGetItem(STORAGE_KEYS.migration)) return;
    let changed = false;
    Object.keys(APPLICATIONS).forEach(id => {
      const app = APPLICATIONS[id];
      if (!app) return;
      if (Object.prototype.hasOwnProperty.call(STATUS_MIGRATION_MAP, app.status)) {
        app.status = STATUS_MIGRATION_MAP[app.status];
        changed = true;
      } else if (app.status && !STATUSES.includes(app.status)) {
        // Covers '불합격' and any unrecognized legacy status.
        delete app.status;
        changed = true;
      }
      if (!app.status && !app.memo && !app.is_bookmarked) {
        delete APPLICATIONS[id];
        changed = true;
      }
    });
    if (changed) saveApplications();
    safeSetItem(STORAGE_KEYS.migration, '1');
  } catch (e) {
    console.warn('Status migration error:', e);
  }
}

// ---- public API -------------------------------------------------------

export function loadApplications() {
  try {
    const raw = safeGetItem(STORAGE_KEYS.applications);
    APPLICATIONS = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Local applications load error:', e);
    APPLICATIONS = {};
  }
  runLegacyPurge();
  runStatusMigration();
  notify({ type: 'load', jobId: null, record: null });
  return APPLICATIONS;
}

export function getApplications() {
  return APPLICATIONS;
}

export function getApplication(jobId) {
  return APPLICATIONS[jobId];
}

export function setStatus(jobId, status) {
  if (isInvalidJobId(jobId)) return;
  const app = APPLICATIONS[jobId] || { is_bookmarked: false, memo: '' };
  if (!status) {
    delete app.status;
    if (!app.is_bookmarked && !app.memo) {
      delete APPLICATIONS[jobId];
    } else {
      app.updated_at = new Date().toISOString();
      APPLICATIONS[jobId] = app;
    }
  } else {
    app.status = status;
    if (status === '서류제출' && !app.applied_at) {
      app.applied_at = new Date().toISOString();
    }
    app.updated_at = new Date().toISOString();
    APPLICATIONS[jobId] = app;
  }
  saveApplications();
  notify({ type: 'status', jobId, record: APPLICATIONS[jobId] });
}

export function setMemo(jobId, memo) {
  if (isInvalidJobId(jobId)) return;
  const app = APPLICATIONS[jobId] || { is_bookmarked: false, memo: '' };
  app.memo = memo;
  app.updated_at = new Date().toISOString();
  if (!app.memo && !app.is_bookmarked && !app.status) {
    delete APPLICATIONS[jobId];
  } else {
    APPLICATIONS[jobId] = app;
  }
  saveApplications();
  notify({ type: 'memo', jobId, record: APPLICATIONS[jobId] });
}

export function toggleBookmark(jobId) {
  if (isInvalidJobId(jobId)) return;
  if (!APPLICATIONS[jobId]) {
    APPLICATIONS[jobId] = { is_bookmarked: false, memo: '' };
  }
  const app = APPLICATIONS[jobId];
  app.is_bookmarked = !app.is_bookmarked;
  app.updated_at = new Date().toISOString();

  const newValue = app.is_bookmarked;
  if (!app.is_bookmarked && !app.status && !app.memo) {
    delete APPLICATIONS[jobId];
  }
  saveApplications();
  notify({ type: 'bookmark', jobId, record: APPLICATIONS[jobId] });
  return newValue;
}

export function removeApplication(jobId) {
  if (isInvalidJobId(jobId)) return;
  delete APPLICATIONS[jobId];
  saveApplications();
  notify({ type: 'remove', jobId, record: undefined });
}

export function subscribe(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

export function replaceApplications(obj) {
  APPLICATIONS = obj || {};
  saveApplications();
  notify({ type: 'replace', jobId: null, record: null });
}
