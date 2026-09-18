/**
 * User actions: everything that changes state in response to an interaction.
 *
 * Split out of the render modules deliberately. In the original, renderers,
 * mutators and event handling were tangled together — setJobStatus called five
 * render functions itself (index.html:2153), which is what made one drag
 * rebuild the board three times. Here, actions mutate the store and the store's
 * subscriber decides what to re-render.
 */

import { PIPELINE_STAGES, STATUSES } from './constants.js';
import { getJobs, getCompanies, getJobById } from './data.js';
import { state, setState } from './state.js';
import * as store from './store.js';
import { showToast } from './toast.js';
import { requestRender } from './render/index.js';
import { closeStrategyDrawer } from './render/drawer.js';

const STAGE_FLOW = PIPELINE_STAGES.map(s => s.key);

function companyName(jobId) {
  const j = getJobById(jobId);
  return j ? j.company : '공고';
}

/* ── status ─────────────────────────────────────────────────────────── */

export function setJobStatus(jobId, status, silent = false) {
  store.setStatus(jobId, status);
  if (!silent) {
    showToast(status ? `지원 단계가 [${status}] 로 변경되었습니다.` : '지원 단계가 초기화되었습니다.');
  }
}

/**
 * Advances one stage. Unlike the original (index.html:2996) this stops at the
 * last stage instead of wrapping 최종합격 back around to 관심.
 */
export function advanceJobStatus(jobId) {
  const app = store.getApplication(jobId);
  const cur = app && app.status;

  if (!cur) {
    store.setStatus(jobId, STAGE_FLOW[0]);
    showToast(`🚀 [${companyName(jobId)}] 칸반 파이프라인('${STAGE_FLOW[0]}')에 추가되었습니다.`);
    return;
  }

  const idx = STAGE_FLOW.indexOf(cur);
  if (idx === STAGE_FLOW.length - 1) {
    showToast(`🏆 [${companyName(jobId)}] 이미 마지막 단계입니다.`);
    return;
  }

  const next = STAGE_FLOW[idx >= 0 ? idx + 1 : 0];
  store.setStatus(jobId, next);
  showToast(`🚀 [${companyName(jobId)}] '${next}' 단계로 전진했습니다.`);
}

export function moveJobToStage(jobId, stageKey) {
  if (!STATUSES.includes(stageKey)) return;
  store.setStatus(jobId, stageKey);
  showToast(`🚀 [${companyName(jobId)}] '${stageKey}' 단계로 이동되었습니다.`);
}

/**
 * Removes a job from the pipeline. The original took a `skipConfirm` flag and
 * guarded a confirm() behind it, but all three call sites passed true, so the
 * prompt never once appeared. Current behavior (delete immediately) is kept and
 * the dead parameter is gone.
 */
export function removeJobFromKanban(jobId) {
  const name = companyName(jobId);
  closeStrategyDrawer();
  store.setStatus(jobId, '');
  showToast(`🗑️ [${name}] 파이프라인에서 삭제되었습니다.`);
}

export function toggleJobBookmark(jobId) {
  store.toggleBookmark(jobId);
}

export function setJobMemo(jobId, memo) {
  store.setMemo(jobId, memo);
}

/* ── view ───────────────────────────────────────────────────────────── */

export function switchViewMode(mode) {
  setState({ viewMode: mode });

  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });

  const kanbanEl = document.getElementById('kanbanContainer');
  const listEl = document.getElementById('list');
  if (kanbanEl) kanbanEl.style.display = mode === 'kanban' ? 'grid' : 'none';
  if (listEl) listEl.style.display = mode === 'kanban' ? 'none' : 'flex';

  requestRender(mode === 'kanban' ? 'kanban' : 'list', 'funnel');
}

export function scrollJobRail(key, direction) {
  const rail = document.getElementById('rail-' + key);
  if (!rail) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  rail.scrollBy({ left: direction * rail.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
}

export function filterByFunnelStage(stageKey) {
  if (state.viewMode !== 'kanban') switchViewMode('kanban');
  const col = document.querySelector(`.kanban-column[data-stage="${stageKey}"]`);
  if (!col) return;
  col.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  col.classList.add('is-drag-over');
  setTimeout(() => col.classList.remove('is-drag-over'), 800);
}

/** The counts in the masthead. index.html:2723 syncMastCounts. */
export function syncMastCounts() {
  const el = document.querySelector('.mast .src');
  if (!el) return;
  const jobs = getJobs();
  el.innerHTML =
    '<span>공고 ' + jobs.length + '건</span>' +
    '<span>기업 ' + new Set(jobs.map(j => j.company)).size + '곳</span>' +
    '<span>수집 회차 ' + new Set(jobs.map(j => j.issue)).size + '개</span>' +
    '<span>분석 리포트 ' + getCompanies().length + '건</span>';
}

/* ── demo data ──────────────────────────────────────────────────────── */

const SEED_TIMESTAMP = '2026-09-01T00:00:00.000Z';

export function seedDemoApplications() {
  const seed = (status, is_bookmarked, memo) => ({ status, is_bookmarked, memo, updated_at: SEED_TIMESTAMP });
  store.replaceApplications({
    1:  seed('관심', true,  '서울대 전산직무 - 서류 일정 확인 및 우대사항 검토'),
    4:  seed('관심', false, 'CJ대한통운 AI/빅데이터 - 물류 최적화 도메인 분석'),
    28: seed('관심', true,  '현대자동차 Security Engineering - HMAC 보안 토큰 마이그레이션 경험 어필'),
    2:  seed('서류준비', true,  '한국산업은행 AI/IT - 대규모 트랜잭션 무결성 및 사전 집계 인덱스 튜닝 중심 기술기술서 작성 중'),
    11: seed('서류준비', true,  'CJ올리브영 백엔드 개발 - Kafka 80초 지연 202 분리 및 p95 50ms 최적화 서술'),
    33: seed('서류준비', false, '서한그룹 IT - Spring 내부 동작 검증 및 REST API 연동 포트폴리오 첨부'),
    5:  seed('서류제출', true,  'CJ대한통운 IT 개발 - 지원서 접수 완료 (접수번호 CJ-2026-IT05)'),
    22: seed('서류제출', false, '한화오션 AI 개발 - 지원 완료, 인성검사 대기'),
    26: seed('서류제출', true,  '현대자동차 SW Development - 지원 완료, 코딩테스트 일정 대기 (백준 플래티넘 5 역량 준비)'),
    19: seed('면접대기', true,  'KT&G SW개발 - 1차 실무 기술 면접 대기 (Resilience4j 서킷브레이커 및 동시성 방어선 집중 대비)'),
    36: seed('면접대기', false, '에스엘 SW개발 - 1차 직무 인터뷰 준비'),
    42: seed('최종합격', true,  '한국피앤지 IT - 최종 합격 오퍼 수락')
  });
  showToast('🧪 12개 테크 기업의 풍성한 샘플 전형 데이터가 세팅되었습니다.');
}

export async function resetApplications(deleteRemote) {
  if (!confirm('모든 지원 현황 및 메모를 완전히 초기화하시겠습니까?')) return;
  store.replaceApplications({});
  if (typeof deleteRemote === 'function') {
    try { await deleteRemote(); } catch (e) { console.warn('remote reset failed:', e); }
  }
  showToast('지원 현황이 초기화되었습니다.');
}
