/**
 * Pipeline funnel renderer. Moved verbatim (behavior-preserving) from
 * index.html:2771 (renderPipelineFunnel).
 *
 * Changes vs. the original:
 *  - `JOBS` / `window.APPLICATIONS` globals replaced with getJobs()/
 *    getApplications() so this stays correct after Supabase swaps the data
 *    arrays at runtime (see src/data.js, src/store.js).
 *  - The stage chip's `onclick="filterByFunnelStage(...)"` becomes
 *    `data-action="funnel-filter" data-stage="<key>"`. filterByFunnelStage
 *    itself (view-mode switch + scrollIntoView) is NOT here — it mutates
 *    state/DOM outside this render and moves to wave 3's events.js per the
 *    render-function contract ("render functions only read and render").
 *  - The `typeof JOBS === 'undefined'` guard is gone: getJobs() always
 *    returns an array (starts as [] in data.js), so that guard's condition
 *    can no longer occur.
 */

import { PIPELINE_STAGES } from '../constants.js';
import { getJobs } from '../data.js';
import { getApplications } from '../store.js';

export function renderPipelineFunnel() {
  const container = document.getElementById('pipelineFunnel');
  if (!container) return;

  const apps = getApplications();
  const jobs = getJobs();

  const totalTracked = Object.values(apps).filter(a => a.status).length;
  const activeCount = Object.values(apps).filter(a => a.status && a.status !== '관심').length;
  const activeRate = totalTracked > 0 ? Math.round((activeCount / totalTracked) * 100) : 0;

  let stepsHtml = PIPELINE_STAGES.map(st => {
    const matchingJobs = jobs.filter(j => {
      const app = apps[j.id] || {};
      return app.status === st.key;
    });
    const count = matchingJobs.length;
    const pct = totalTracked > 0 ? Math.round((count / totalTracked) * 100) : 0;

    return `
      <div class="funnel-step" style="--step-color:${st.color}" data-action="funnel-filter" data-stage="${st.key}">
        <span class="funnel-step-name">${st.name}</span>
        <div class="funnel-step-count">
          <span>${count}</span>
          <span class="funnel-step-pct">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="funnel-header">
      <div class="funnel-title">
        <span>⚡ 전형 진행 퍼널 현황</span>
        <span class="funnel-rate-badge">전형 활성 진척율 ${activeRate}%</span>
      </div>
      <div style="font-size:12px;color:var(--ink-3);font-family:var(--mono);">
        총 <b>${totalTracked}</b>개 전형 추적 중 (목표 달성 순항)
      </div>
    </div>
    <div class="funnel-steps">
      ${stepsHtml}
    </div>
  `;
}
