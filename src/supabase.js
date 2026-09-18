/**
 * Supabase sync layer — config resolution, connection lifecycle, remote
 * fetch/merge into the local data & store modules, and per-record upload.
 *
 * Ported from:
 *   - getSupabaseConfig        index.html:1840
 *   - resolveSupabaseConfig    index.html:1854
 *   - initSupabase             index.html:1877
 *   - fetchSupabaseData        index.html:1938
 *   - syncApplicationToSupabase index.html:2049 (renamed syncApplication;
 *     single-argument signature — see note below)
 *
 * It still loads @supabase/supabase-js@2 from a CDN via <script> in
 * index.html's <head> and talks to it through the global `window.supabase`.
 * No npm dependency, no CDN import statement added here.
 *
 * ---------------------------------------------------------------------
 * Bug A2 fix — sync failures were completely silent
 * ---------------------------------------------------------------------
 * The original looked up a per-job element id templated from the job id
 * (index.html:2054, :2171) on every upsert/delete attempt to show a
 * "💾 saved locally (waiting for cloud)" message. No markup anywhere ever
 * created that id, so the message
 * never rendered and a failed cloud write was indistinguishable from a
 * successful one (both just sat in localStorage; only a console.warn ever
 * fired). That per-job lookup is dropped entirely here.
 *
 * Instead, every job id whose last upload/delete attempt threw is tracked
 * in the module-level `pendingUploads` Map (job id -> { message, failedAt }),
 * and a single global indicator is injected into the existing #connRibbon
 * (inside its .conn-right group) by renderConnRibbon():
 *
 *   <button type="button" id="connPendingSync" class="conn-btn"
 *           data-action="sync-retry">⚠️ N건 업로드 대기 · 재시도</button>
 *
 * (hidden via inline style when pendingUploads is empty). Clicking it is
 * wave 3's job to wire (data-action="sync-retry" — this is an ADDITION to
 * the CONTRACT.md markup table, not in the original list) to
 * retryPendingSync(), exported below, which just re-runs syncApplication()
 * for every job id currently marked pending. A success clears that job's
 * entry and re-renders the ribbon; nothing more elaborate than that is
 * attempted — this is a visibility fix, not a durable retry queue.
 * ---------------------------------------------------------------------
 */

import { getApplications, getApplication, replaceApplications } from './store.js';
import { setJobs, setCompanies } from './data.js';
import { esc } from './util.js';
import { showToast } from './toast.js';

const STORAGE_KEY_CFG = 'ABLE_SUPABASE_CONFIG';
const DEFAULT_USER_KEY = 'park_chanyoung';

let supabaseClient = null;
let connState = 'local'; // 'local' | 'connecting' | 'connected' | 'error'
let connErrorMessage = '';

// jobId -> { message, failedAt } — uploads/deletes whose last attempt threw
// and are still waiting for a retry. This is the fix for bug A2.
const pendingUploads = new Map();


export function getConnState() {
  return connState;
}

export function getPendingSyncCount() {
  return pendingUploads.size;
}

// index.html:1840-1850, verbatim.
export function getSupabaseConfig() {
  if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey) {
    return window.SUPABASE_CONFIG;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CFG);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.url && parsed.anonKey) return parsed;
    }
  } catch (e) {}
  return null;
}

// Companion to getSupabaseConfig, factored out of the inline
// #btnSaveConfig click handler (index.html:2697-2704) so the localStorage
// key stays private to this module. Reading the modal's <input> values and
// hiding the modal remain wave 3's job (DOM/event concerns); this just
// persists the config object and reconnects.
export function saveSupabaseConfig(cfg) {
  try {
    localStorage.setItem(STORAGE_KEY_CFG, JSON.stringify(cfg));
  } catch (e) {
    console.warn('Supabase config save error:', e);
  }
}

function isPlaceholderConfig(cfg) {
  if (!cfg || !cfg.url || !cfg.anonKey) return true;
  if (cfg.url.includes('your-project-id') || cfg.anonKey.includes('your-anon-public-key')) return true;
  return false;
}

// index.html:1854-1868, verbatim.
export async function resolveSupabaseConfig() {
  // 1. Try Vercel Serverless Function (/api/config)
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const vCfg = await res.json();
      if (vCfg && vCfg.url && vCfg.anonKey && !isPlaceholderConfig(vCfg)) {
        window.SUPABASE_CONFIG = vCfg;
        return vCfg;
      }
    }
  } catch (e) {}

  // 2. Return local / fallback config
  return getSupabaseConfig();
}

// index.html:1877-1936, restructured: all connBadge/connText/btnSyncRefresh
// DOM writes that used to be scattered inline through this function (and
// duplicated again in syncApplicationToSupabase's per-job element-id
// lookups) are consolidated into renderConnRibbon(), called once per state
// transition. Behavior is otherwise unchanged, INCLUDING the pre-existing
// quirk that `supabaseClient` is never reset to null when a later reconnect
// attempt fails — see the risk note in the report.
export async function initSupabase(isManual = false) {
  const cfg = await resolveSupabaseConfig();

  if (isPlaceholderConfig(cfg)) {
    connState = 'local';
    connErrorMessage = '';
    renderConnRibbon();
    return false;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.warn('Supabase JS library not loaded.');
    return false;
  }

  connState = 'connecting';
  renderConnRibbon();

  try {
    const client = window.supabase.createClient(cfg.url, cfg.anonKey);
    const { error } = await client.from('jobs').select('id', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      console.warn('Connection check returned:', error);
    }

    supabaseClient = client;
    connState = 'connected';
    connErrorMessage = '';
    renderConnRibbon();

    await fetchSupabaseData();
    if (isManual) showToast('🟢 Supabase 연결 성공 및 최신 데이터 동기화 완료!');
    return true;
  } catch (err) {
    console.error('Supabase connection error:', err);
    connState = 'error';
    connErrorMessage = (err && err.message) || String(err);
    renderConnRibbon();
    return false;
  }
}

// index.html:1938-2044, with three changes:
//   1. Signature dropped (client, userKey) params — both are read from this
//      module's own state (supabaseClient, getSupabaseConfig()) instead, so
//      the function is callable with no arguments as the contract requires.
//   2. Applications are merged into a plain object and written back with a
//      SINGLE replaceApplications() call instead of mutating
//      window.APPLICATIONS field-by-field — per the "do not reach into the
//      store's internals" instruction.
//   3. All of the original's direct render calls at the end
//      (syncMastCounts/renderCards/renderStats/renderChips/
//      renderAppFilters/renderList) are REMOVED. Render modules must not be
//      called from here (no cross-render calls) — see the report for what
//      this means for wave 3.
export async function fetchSupabaseData() {
  if (!supabaseClient) return;
  const cfg = getSupabaseConfig();
  const userKey = (cfg && cfg.userKey) || DEFAULT_USER_KEY;

  try {
    // 1. 사용자 지원 데이터 가져오기
    const { data: remoteApps, error: appErr } = await supabaseClient
      .from('applications')
      .select('*')
      .eq('user_key', userKey);

    if (!appErr && remoteApps) {
      const merged = { ...getApplications() };
      const pushLocal = [];

      remoteApps.forEach(ra => {
        const jid = ra.job_id;
        const local = merged[jid];
        if (!local || new Date(ra.updated_at) >= new Date(local.updated_at || 0)) {
          if (ra.status || ra.is_bookmarked || ra.memo) {
            merged[jid] = {
              status: ra.status || null,
              is_bookmarked: !!ra.is_bookmarked,
              memo: ra.memo || '',
              applied_at: ra.applied_at,
              updated_at: ra.updated_at
            };
          } else {
            delete merged[jid];
          }
        } else if (local && new Date(local.updated_at || 0) > new Date(ra.updated_at)) {
          pushLocal.push(jid);
        }
      });

      replaceApplications(merged);
      pushLocal.forEach(jid => { syncApplication(jid); });
    }

    // 2. 공고 목록 가져오기 (DB에 데이터가 존재할 경우)
    const { data: remoteJobs, error: jobErr } = await supabaseClient
      .from('jobs')
      .select('*, job_strategies(*)')
      .order('id');

    if (!jobErr && remoteJobs && remoteJobs.length > 0) {
      const jobs = remoteJobs.map(rj => {
        const strat = Array.isArray(rj.job_strategies) && rj.job_strategies.length
          ? rj.job_strategies[0]
          : (rj.job_strategies || {});
        return {
          id: rj.id,
          issue: rj.issue,
          cat: rj.cat,
          org: rj.org,
          company: rj.company,
          role: rj.role,
          type: rj.type,
          dueRaw: rj.due_raw,
          due: rj.due,
          url: rj.url,
          strategy: {
            fit: strat.fit || 'B',
            stackMatch: strat.stack_match || '',
            corePitch: strat.core_pitch || '',
            appealProjects: strat.appeal_projects || [],
            interviewPrep: strat.interview_prep || ''
          }
        };
      });
      setJobs(jobs);
    }

    // 3. 기업 분석 정보 가져오기 (DB에 데이터가 존재할 경우)
    const { data: remoteCos, error: coErr } = await supabaseClient
      .from('companies')
      .select('*')
      .order('name');

    if (!coErr && remoteCos && remoteCos.length > 0) {
      const companies = remoteCos.map(rc => ({
        id: rc.id,
        name: rc.name,
        en: rc.en || '',
        hue: rc.hue || 'general',
        tags: rc.tags || [],
        facts: rc.facts || {},
        metrics: rc.metrics || [],
        summary: rc.summary || '',
        swot: rc.swot || {},
        customer: rc.customer || '',
        customerTags: rc.customer_tags || [],
        company: rc.company_facts || [],
        competitor: rc.competitor || [],
        values: rc.values || [],
        process: rc.process || [],
        processNote: rc.process_note || '',
        eligibility: rc.eligibility || [],
        spec: rc.spec || [],
        role: rc.role_info || {},
        link: rc.link || [],
        pitch: rc.pitch || ''
      }));
      setCompanies(companies);
    }
  } catch (e) {
    console.warn('Background sync error:', e);
  }
}

// index.html:2049-2094 syncApplicationToSupabase, renamed. Single-argument:
// the original's `isDelete` flag is no longer needed because store.js
// already deletes an APPLICATIONS[jobId] record the moment status/memo/
// bookmark all go empty (see store.js's setStatus/setMemo/toggleBookmark),
// so `!app` here already means exactly what `isDelete` meant there.
export async function syncApplication(jobId) {
  if (!supabaseClient) return;
  const cfg = getSupabaseConfig();
  const userKey = (cfg && cfg.userKey) || DEFAULT_USER_KEY;
  const app = getApplication(jobId);

  if (!app || (!app.status && !app.is_bookmarked && !app.memo)) {
    try {
      const { error } = await supabaseClient
        .from('applications')
        .delete()
        .eq('user_key', userKey)
        .eq('job_id', jobId);
      if (error) throw error;
      pendingUploads.delete(jobId);
    } catch (err) {
      console.warn('Supabase delete error:', err);
      pendingUploads.set(jobId, { message: (err && err.message) || String(err), failedAt: new Date().toISOString() });
    }
    renderConnRibbon();
    return;
  }

  try {
    const payload = {
      job_id: jobId,
      user_key: userKey,
      status: app.status || null,
      is_bookmarked: !!app.is_bookmarked,
      memo: app.memo || '',
      applied_at: app.applied_at || null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from('applications')
      .upsert(payload, { onConflict: 'user_key,job_id' });

    if (error) throw error;
    pendingUploads.delete(jobId);
  } catch (err) {
    console.warn('Supabase upsert error:', err);
    pendingUploads.set(jobId, { message: (err && err.message) || String(err), failedAt: new Date().toISOString() });
  }
  renderConnRibbon();
}

// Re-attempts every currently-pending job id. Fire-and-forget, same style as
// the original's un-awaited syncApplicationToSupabase calls — this is
// intentionally not a queue with backoff/ordering guarantees.
export function retryPendingSync() {
  [...pendingUploads.keys()].forEach(jobId => { syncApplication(jobId); });
}

function ensurePendingSyncEl() {
  let el = document.getElementById('connPendingSync');
  if (el) return el;
  const ribbon = document.getElementById('connRibbon');
  if (!ribbon) return null;
  const right = ribbon.querySelector('.conn-right') || ribbon;
  el = document.createElement('button');
  el.type = 'button';
  el.id = 'connPendingSync';
  el.className = 'conn-btn';
  el.dataset.action = 'sync-retry';
  el.style.display = 'none';
  el.style.color = '#DC2626';
  el.style.borderColor = '#FCA5A5';
  right.insertBefore(el, right.firstChild || null);
  return el;
}

function renderPendingIndicator() {
  const el = ensurePendingSyncEl();
  if (!el) return;
  const n = pendingUploads.size;
  if (n > 0) {
    el.style.display = 'inline-flex';
    el.textContent = `⚠️ ${n}건 업로드 대기 · 재시도`;
    el.title = '클라우드 업로드에 실패해 로컬에만 저장된 항목이 있습니다. 클릭하면 다시 시도합니다.';
  } else {
    el.style.display = 'none';
    el.textContent = '';
  }
}

// Consolidates every #connBadge / #connText / #btnSyncRefresh DOM write that
// the original scattered across initSupabase (index.html:1879-1935), plus
// renders the new global pending-sync indicator (bug A2 fix). Callable with
// no arguments; reads connState/connErrorMessage/getSupabaseConfig() itself.
export function renderConnRibbon() {
  const badge = document.getElementById('connBadge');
  const text = document.getElementById('connText');
  const btnSync = document.getElementById('btnSyncRefresh');

  if (badge) {
    if (connState === 'connected') {
      badge.className = 'conn-badge is-connected';
      badge.textContent = '🟢 클라우드 동기화';
    } else if (connState === 'error') {
      badge.className = 'conn-badge is-error';
      badge.textContent = '⚠️ 연결 실패';
    } else if (connState === 'connecting') {
      badge.className = 'conn-badge';
      badge.textContent = '⏳ 연결 중...';
    } else {
      badge.className = 'conn-badge is-local';
      badge.textContent = '⚡ 로컬 모드';
    }
  }

  if (text) {
    if (connState === 'connected') {
      const cfg = getSupabaseConfig();
      const projName = cfg && cfg.url ? cfg.url.replace(/^https?:\/\//, '').split('.')[0] : '';
      const userKey = (cfg && cfg.userKey) || DEFAULT_USER_KEY;
      text.innerHTML = `Supabase 연결 완료 (프로젝트: <strong>${esc(projName)}</strong> · 유저: <strong>${esc(userKey)}</strong>)`;
    } else if (connState === 'error') {
      text.textContent = 'Supabase 연결에 실패하여 로컬 모드로 전환되었습니다: ' + connErrorMessage;
    } else if (connState === 'local') {
      text.textContent = '로컬 브라우저 모드로 동작 중입니다. 모든 지원 현황 및 메모는 LocalStorage에 실시간 저장됩니다.';
    }
    // 'connecting': leave whatever text was already there, same as original.
  }

  if (btnSync) btnSync.style.display = connState === 'connected' ? 'inline-flex' : 'none';

  renderPendingIndicator();
}

/**
 * Deletes every remote application row for the current user. Used by the
 * "reset" action, which in the original talked to the client directly from
 * index.html:2221.
 */
export async function deleteAllApplications() {
  if (!supabaseClient) return;
  const cfg = getSupabaseConfig() || {};
  const userKey = cfg.userKey || 'park_chanyoung';
  try {
    const { error } = await supabaseClient.from('applications').delete().eq('user_key', userKey);
    if (error) throw error;
    pendingUploads.clear();
    renderConnRibbon();
  } catch (e) {
    console.warn('Failed to delete applications from Supabase:', e);
    throw e;
  }
}

/** True once a client has been created — the config modal / refresh flow needs it. */
export function isConnected() {
  return !!supabaseClient;
}
