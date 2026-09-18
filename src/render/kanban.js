/**
 * Kanban board renderer. Moved verbatim (behavior-preserving) from
 * index.html:2827 (renderKanbanView), including the card markup at
 * index.html:2874-2918 and the column markup at index.html:2921-2940.
 *
 * Changes vs. the original:
 *  - `JOBS` / `window.APPLICATIONS` globals replaced with getJobs()/
 *    getApplication() so this stays correct after Supabase swaps the data
 *    array at runtime (see src/data.js, src/store.js). Both are re-read on
 *    every call, not cached.
 *  - All inline handlers removed per the wave-2 markup contract:
 *      - card: `ondragstart`/`ondragend`/`onclick` -> the card just carries
 *        `draggable="true" data-job="<id>" data-action="drawer-open"`.
 *        Drag listeners are attached once to #kanbanContainer by wave 3.
 *      - column: `ondragover`/`ondragleave`/`ondrop` removed entirely; the
 *        column keeps `data-stage="<key>"` only.
 *      - .btn-k-bm  -> data-action="bookmark-toggle" data-job="<id>"
 *      - .btn-k-del -> data-action="kanban-remove"   data-job="<id>"
 *        (keeps its existing data-del-id, per the selector contract)
 *      - .btn-advance-stage -> data-action="stage-advance" data-job="<id>"
 *      - .btn-open-drawer   -> data-action="drawer-open"   data-job="<id>"
 *    No `data-stop="1"` is added anywhere in this file: every one of the
 *    above is itself a `[data-action]` element nested inside the card's own
 *    `data-action="drawer-open"`, and the markup contract states a
 *    delegated handler resolves to the nearest `[data-action]` ancestor via
 *    closest(), so a button click can never fall through to the card's
 *    action. That already reproduces what the original's per-button
 *    `event.stopPropagation()` and the `.kjc-quick-advance` wrapper's
 *    `onclick="event.stopPropagation()"` did by hand; the wrapper's onclick
 *    is dropped for the same reason.
 *  - advanceJobStatus/removeJobFromKanban/handleKanbanDrop and the actual
 *    setStatus mutation are NOT here — they move to wave 3's events.js.
 *    This module only reads jobs/applications/state and builds markup.
 *  - The `typeof JOBS === 'undefined'` guard is gone: getJobs() always
 *    returns an array (starts as [] in data.js), so that guard's condition
 *    can no longer occur. The "container missing" half of the guard is kept.
 */

import { PIPELINE_STAGES } from '../constants.js';
import { getJobs } from '../data.js';
import { getApplication } from '../store.js';
import { state } from '../state.js';
import { esc, level, daysLeft, ddayLabel } from '../util.js';

export function renderKanbanView() {
  const kContainer = document.getElementById('kanbanContainer');
  if (!kContainer) return;

  // Filtered pool based on current search, category, and fit, sorted by deadline / active sort mode
  const filteredJobs = getJobs().filter(j => {
    if (state.cat !== '전체' && j.cat !== state.cat) return false;
    if (state.fit !== 'all' && (j.strategy?.fit || 'B') !== state.fit) return false;
    if (state.q) {
      const q = state.q;
      const memo = getApplication(j.id)?.memo || '';
      const text = (j.company + ' ' + j.role + ' ' + (j.strategy?.stackMatch || '') + ' ' + (j.strategy?.corePitch || '') + ' ' + memo).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    const la = level(a), lb = level(b);
    if ((la === 'done') !== (lb === 'done')) return la === 'done' ? 1 : -1;
    const na = daysLeft(a.due), nb = daysLeft(b.due);
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb; // earliest deadline at the top!
    } else if (na !== null) return -1;
    else if (nb !== null) return 1;
    const fitWeight = {'S':3, 'A':2, 'B':1};
    return (fitWeight[b.strategy?.fit] || 0) - (fitWeight[a.strategy?.fit] || 0);
  });

  kContainer.innerHTML = PIPELINE_STAGES.map(st => {
    const matchingJobs = filteredJobs.filter(j => {
      const app = getApplication(j.id) || {};
      return app.status === st.key;
    });

    const cardsHtml = matchingJobs.map(j => {
      const app = getApplication(j.id) || {};
      const isBm = app.is_bookmarked;
      const memo = app.memo || '';
      const dday = ddayLabel(j);
      const lvl = level(j);

      // Extract stack pills
      const stacks = (j.strategy?.stackMatch || 'Java/Spring')
        .split(/[,/·\s]+/)
        .map(s => s.trim())
        .filter(s => s && s.length > 1 && !['및','등','기반','활용'].includes(s))
        .slice(0, 3);

      return `
        <div class="kanban-job-card"
             draggable="true"
             data-job="${j.id}"
             data-action="drawer-open">
          <div class="kjc-header">
            <div class="kjc-co-group">
              <span class="kjc-avatar">${esc(j.company.slice(0, 2))}</span>
              <span class="kjc-co">${esc(j.company)}</span>
            </div>
            <div class="kjc-top-actions">
              <span class="strat-badge badge-${j.strategy?.fit || 'A'}">Fit ${j.strategy?.fit || 'A'}</span>
              <button type="button" class="btn-k-bm ${isBm ? 'is-bm' : ''}" data-bm-id="${j.id}" title="북마크 토글" data-action="bookmark-toggle" data-job="${j.id}">
                ${isBm ? '⭐' : '☆'}
              </button>
              <button type="button" class="btn-k-del" data-del-id="${j.id}" title="파이프라인에서 삭제" aria-label="파이프라인에서 삭제" data-action="kanban-remove" data-job="${j.id}">
                ✕
              </button>
            </div>
          </div>

          <div class="kjc-role">${esc(j.role)}</div>

          <div class="kjc-stacks">
            ${stacks.map(s => `<span class="kjc-stack-pill">#${esc(s)}</span>`).join('')}
          </div>

          ${memo ? `<div class="kjc-memo-box">📝 ${esc(memo)}</div>` : ''}

          <div class="kjc-meta">
            <span style="color:var(--ink-3);">${esc(j.type || '정규직')}</span>
            <span class="kjc-dday-badge ${lvl === 'urgent' ? 'urgent' : (lvl === 'soon' ? 'soon' : 'normal')}">${esc(dday)}</span>
          </div>

          <div class="kjc-quick-advance">
            <button type="button" class="btn-advance-stage" data-action="stage-advance" data-job="${j.id}" title="다음 전형 단계로 전진">
              <span>➔ 다음 단계</span>
            </button>
            <button type="button" class="btn-open-drawer" data-action="drawer-open" data-job="${j.id}">
              공략 전략 보기 ›
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="kanban-column"
           data-stage="${st.key}">
        <div class="kanban-col-header" style="color:${st.color};">
          <span>${st.name}</span>
          <span class="kanban-col-count">${matchingJobs.length}</span>
        </div>
        <div class="kanban-card-list" tabindex="0" role="region" aria-label="${st.name} 공고 목록">
          ${cardsHtml || `
            <div style="color:var(--ink-3);font-size:12px;text-align:center;padding:48px 12px;border:1px dashed var(--line);border-radius:8px;">
              <div>이 단계의 공고가 없습니다</div>
              <div style="font-size:11px;margin-top:6px;opacity:0.7;">카드를 여기로 드래그하거나 [관심 추가]해 보세요</div>
            </div>
          `}
        </div>
      </div>
    `;
  }).join('');
}
