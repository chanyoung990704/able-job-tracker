/**
 * Strategy drawer — the slide-over panel showing one job's pipeline status,
 * memo and strategy notes.
 *
 * Ported from index.html:3033 (openStrategyDrawer) and :3121
 * (closeStrategyDrawer), plus the drawer-body markup that used to be built
 * inline inside openStrategyDrawer (index.html:3053-3110).
 *
 * Split into renderDrawer() (pure content refresh, no args) so wave 3's
 * scheduler can re-render the open drawer's content after a store change
 * (e.g. a bookmark toggle or status change coming from elsewhere) without
 * re-running the open animation / re-adding the is-open classes. It reads
 * which job is open from state.openedId (part of the pinned wave-1 state
 * shape) instead of taking a jobId argument, per the render-function
 * contract ("모든 렌더 함수는 인자 없이 호출 가능해야 한다").
 *
 * State-mutating logic that used to live inline here is NOT ported — it
 * becomes data-action markup for wave 3's events.js to wire up:
 *   - stage buttons + "✕ 상태 해제"  -> data-action="status-set" data-job data-status
 *     (index.html:3049 setJobStatusFromDrawer, index.html:3078 clear button;
 *     STATUSES is imported from constants.js instead of the old inline
 *     5-string literal at index.html:3044)
 *   - bookmark toggle                -> data-action="bookmark-toggle" data-job
 *     (index.html:3065; the original also re-called openStrategyDrawer(id)
 *     inline to re-render itself after toggling — wave 3's scheduler should
 *     do this by re-invoking renderDrawer() when state.openedId matches the
 *     job whose bookmark just changed)
 *   - "🗑️ 파이프라인에서 삭제"        -> data-action="kanban-remove" data-job
 *     (index.html:3081; reuses the existing kanban-remove action rather than
 *     inventing a new one, since it is the same removeJobFromKanban
 *     operation. The original also called closeStrategyDrawer() right after
 *     — wave 3 should do the same when wiring this action from inside the
 *     drawer.)
 *   - memo textarea                  -> data-action="memo-input" data-job
 *     (index.html:3092). This fixes bug A1: the original textarea carried
 *     BOTH its own oninput AND was separately (mis-)handled by a dead
 *     delegated listener at index.html:2731-2736 that read
 *     a `dataset` field keyed off the memo job id (index.html:2733) that
 *     nothing ever set, so every keystroke also called setJobMemo(NaN, ...),
 *     persisting a garbage
 *     APPLICATIONS["NaN"] localStorage record and firing a Supabase upsert
 *     with job_id: null that failed silently. Here there is exactly one
 *     data-job-carrying element and no inline handler, so wave 3 must wire
 *     exactly one delegated path — do not port the dead handler.
 *
 * setJobStatusFromDrawer itself (index.html:3129) is not ported at all; it
 * is a pure state-mutation wrapper and belongs to wave 3's events.js.
 */

import { getJobById } from '../data.js';
import { getApplication } from '../store.js';
import { state, setState } from '../state.js';
import { STATUSES } from '../constants.js';
import { esc, ddayLabel } from '../util.js';

// index.html:3053-3110 — drawer body markup, unchanged apart from the
// data-action substitutions documented above.
export function renderDrawer() {
  const drawerBody = document.getElementById('drawerBody');
  if (!drawerBody) return;

  const jobId = state.openedId;
  if (jobId == null) return;

  const j = getJobById(jobId);
  if (!j) return;

  const app = getApplication(j.id) || {};
  const currentStatus = app.status || '';
  const isBm = app.is_bookmarked || false;
  const memo = app.memo || '';

  const drawerCo = document.getElementById('drawerCo');
  const drawerRole = document.getElementById('drawerRole');
  if (drawerCo) drawerCo.textContent = j.company;
  if (drawerRole) {
    drawerRole.innerHTML = `${esc(j.role)} <span style="margin:0 6px;opacity:0.4;">|</span> <span class="strat-badge badge-${j.strategy?.fit || 'A'}">Fit ${j.strategy?.fit || 'A'}</span> <span style="margin:0 6px;opacity:0.4;">|</span> ${esc(ddayLabel(j))}`;
  }

  const stageBtnsHtml = STATUSES.map(st => `
    <button type="button" class="app-status-btn ${currentStatus === st ? 'is-active' : ''}" data-action="status-set" data-job="${j.id}" data-status="${st}">
      ${st}
    </button>
  `).join('');

  const projectsHtml = (j.strategy?.appealProjects || []).map(p => `
    <li style="margin-bottom:8px;line-height:1.55;">${esc(p)}</li>
  `).join('');

  drawerBody.innerHTML = `
    <!-- Top Action Row -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--line-2);flex-wrap:wrap;">
      <a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer" class="btn-cta" style="font-size:12.5px;padding:6px 14px;">
        🔗 채용공고 원문 바로가기
      </a>
      <button type="button" class="btn-drawer-bm ${isBm ? 'is-bookmarked' : ''}" data-bm-id="${j.id}" data-action="bookmark-toggle" data-job="${j.id}" style="font-size:13px;display:inline-flex;align-items:center;gap:6px;">
        <span>${isBm ? '⭐ 북마크 해제' : '☆ 북마크 저장'}</span>
      </button>
    </div>

    <!-- Status Change Group -->
    <div class="strat-app-box" style="margin:0;">
      <div class="strat-app-header">
        <span class="strat-app-title">📊 전형 단계 변경</span>
        <span class="strat-app-sync">실시간 클라우드 자동 저장</span>
      </div>
      <div class="strat-status-btns" style="margin-bottom:14px;">
        ${stageBtnsHtml}
        <button type="button" class="app-status-btn btn-clear-status" data-action="status-set" data-job="${j.id}" data-status="">
          ✕ 상태 해제
        </button>
        <button type="button" class="app-status-btn btn-del-pipeline" data-action="kanban-remove" data-job="${j.id}" style="color:#EF4444;border-color:rgba(239,68,68,0.4);" title="파이프라인에서 완전히 삭제">
          🗑️ 파이프라인에서 삭제
        </button>
      </div>

      <!-- Memo Editor -->
      <div class="strat-memo-group">
        <div class="strat-memo-header">
          <label for="drawerMemoInput">📝 지원 메모 &amp; 전형 일정</label>
          <span class="strat-memo-hint">자동 저장됨</span>
        </div>
        <textarea id="drawerMemoInput" class="strat-memo-input" placeholder="예: 9/15 코딩테스트 응시, 면접 시 SENTINEL Kafka 처리량 강조" data-action="memo-input" data-job="${j.id}">${esc(memo)}</textarea>
      </div>
    </div>

    <!-- Core Pitch -->
    <div class="strat-pitch-box" style="margin:0;">
      <div class="strat-pitch-title">🎯 박찬영 맞춤 핵심 피치</div>
      <div class="strat-pitch-desc">${esc(j.strategy?.corePitch || '근거 기반 엔지니어링 역량 어필')}</div>
    </div>

    <!-- Appeal Projects -->
    <div class="strat-card-sec">
      <h4 class="strat-sec-h">💡 1:1 매칭 실측 프로젝트</h4>
      <ul class="strat-ul">${projectsHtml}</ul>
    </div>

    <!-- Interview Prep -->
    <div class="strat-card-sec">
      <h4 class="strat-sec-h">🛡️ 기술 면접 예상 질문 &amp; 방어선</h4>
      <div class="strat-interview-text">${esc(j.strategy?.interviewPrep || '도메인 특화 동시성 방어 및 DB 쿼리 최적화 의사결정 근거')}</div>
    </div>
  `;
}

// index.html:3033-3119 openStrategyDrawer, split: state + visibility here,
// content building in renderDrawer().
export function openStrategyDrawer(jobId) {
  const j = getJobById(jobId);
  if (!j) return;

  setState({ openedId: jobId });
  renderDrawer();

  const bd = document.getElementById('drawerBackdrop');
  const dr = document.getElementById('strategyDrawer');
  if (bd) bd.classList.add('is-open');
  if (dr) dr.classList.add('is-open');
}

// index.html:3121-3127 closeStrategyDrawer, verbatim plus clearing
// state.openedId so a later store notification does not try to re-render a
// drawer that is no longer showing anything.
export function closeStrategyDrawer() {
  const bd = document.getElementById('drawerBackdrop');
  const dr = document.getElementById('strategyDrawer');
  if (bd) bd.classList.remove('is-open');
  if (dr) dr.classList.remove('is-open');
  setState({ openedId: null });
}
