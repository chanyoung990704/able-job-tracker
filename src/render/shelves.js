/**
 * Job list ("shelf") view — horizontal rails of job cards, plus the chrome
 * around it: stat tiles, category chips, and application-status chips.
 *
 * Ported (behavior-preserving) from index.html:
 *   renderStats       :2314
 *   renderChips       :2337
 *   renderAppFilters  :2345
 *   renderJobShelves  :2377  (kept private — DOM-building helper for renderList)
 *   renderList        :2414
 *
 * NOTE: `renderCards` (index.html:2437, the `.cocard`/`#cogrid` company grid)
 * was also listed under this file's scope in the wave-2 task brief, but it
 * only ever touches company data (`COS`, `#cogrid`, `.cocard`) — nothing this
 * file's required exports or "job list view" description mentions. It has
 * been placed in src/render/company.js instead (exported as
 * renderCompanies()), which explicitly asks for "whatever renders the
 * company card grid". See the wave-2 report for the full reasoning.
 *
 * Changes from the original:
 *   - renderStats' "내 지원 진행 중" count no longer hardcodes the removed
 *     8-status-model literal ['서류제출','서류합격','코테/과제','면접대기','최종합격'].
 *     It's derived from STATUSES (constants.js) instead — see
 *     IN_PROGRESS_STATUSES below for the exact equivalence chosen.
 *   - All inline onclick handlers (toggleBookmark/openStrategyDrawer/
 *     scrollJobRail) are gone; cards/rail-arrows now carry
 *     data-action/data-job/data-rail/data-dir for wave 3's delegated listener.
 *   - renderList no longer calls renderKanbanView()/renderPipelineFunnel()
 *     (index.html:2429-2430) — wave 3's scheduler owns cross-view re-renders.
 *   - Filtering/sorting/category counts are delegated entirely to
 *     selectors.js (visible()/getCats()); nothing here re-implements them.
 *   - window.APPLICATIONS is replaced by store.js's getApplications().
 *   - The dead `reset` param of renderList, `state.page`/`pageSize`, and
 *     `infiniteObserver` (index.html:2372-2374, 2414) are dropped — the
 *     render-function contract requires renderList() to be callable with no
 *     arguments, and those fields no longer exist on state.js anyway.
 */

import { STATUSES } from '../constants.js';
import { esc, daysLeft, level, ddayLabel } from '../util.js';
import { state } from '../state.js';
import { getJobs, getCompanies } from '../data.js';
import { getApplications } from '../store.js';
import { visible, getCats } from '../selectors.js';

// STATUSES[0] is '관심' (a job the user has merely flagged as interesting —
// no action taken yet). Every other status ('서류준비','서류제출','면접대기',
// '최종합격') means the user has actually started working the application,
// which is the faithful 5-status-model equivalent of the original's intent
// ("내 지원 진행 중" = "an application of mine is in progress"). See the
// wave-2 report for the full reasoning on why '서류준비' is included here
// even though the original's hardcoded list excluded it.
const IN_PROGRESS_STATUSES = STATUSES.filter(s => s !== STATUSES[0]);

// index.html:2314
export function renderStats() {
  const el = document.querySelector('#stats');
  if (!el) return;

  const jobs = getJobs();
  const apps = getApplications();

  const live = jobs.filter(j => level(j) !== 'done');
  const dev = live.filter(j => j.cat === '개발∙데이터');
  const week = live.filter(j => { const n = daysLeft(j.due); return n !== null && n >= 0 && n <= 7; });
  const stratS = live.filter(j => j.strategy && j.strategy.fit === 'S');

  const appList = Object.values(apps);
  const myApplied = appList.filter(a => IN_PROGRESS_STATUSES.includes(a.status)).length;
  const myBm = appList.filter(a => a.is_bookmarked).length;

  const cards = [
    ['is-accent', live.length, '지원 가능한 공고'],
    ['is-accent', dev.length, '개발∙데이터 직무'],
    ['is-urgent', week.length, '7일 내 마감'],
    ['is-accent', stratS.length, 'Fit S 최우선 추천'],
    ['is-accent', myApplied, '내 지원 진행 중'],
    ['', myBm, '★ 북마크 공고'],
    ['', new Set(live.map(j => j.company)).size, '채용 중인 기업'],
    ['', getCompanies().length, '심층 분석 기업']
  ];
  el.innerHTML = cards.map(c =>
    `<div class="stat ${c[0]}"><b>${c[1]}</b><span>${esc(c[2])}</span></div>`).join('');
}

// index.html:2339
export function renderChips() {
  const el = document.querySelector('#catchips');
  if (!el) return;
  const all = [['전체', getJobs().length]].concat(getCats());
  el.innerHTML = all.map(([c, n]) =>
    `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="${c === state.cat}">${esc(c)}<span class="n">${n}</span></button>`
  ).join('');
}

// index.html:2346
export function renderAppFilters() {
  const el = document.querySelector('#appchips');
  if (!el) return;

  const apps = getApplications();
  const allCount = getJobs().length;
  const bmCount = Object.values(apps).filter(a => a.is_bookmarked).length;
  const counts = {};
  STATUSES.forEach(s => counts[s] = 0);
  Object.values(apps).forEach(a => {
    if (a.status && counts[a.status] !== undefined) {
      counts[a.status]++;
    }
  });

  const chips = [
    { key: 'all', label: '전체', count: allCount },
    { key: 'bookmarked', label: '★ 북마크', count: bmCount, isBm: true },
    ...STATUSES.map(s => ({ key: s, label: s, count: counts[s] }))
  ];

  el.innerHTML = chips.map(c => `
    <button class="app-chip ${c.isBm ? 'chip-bm' : ''}" type="button" data-app-filter="${esc(c.key)}" aria-pressed="${c.key === state.appFilter}">
      ${esc(c.label)}<span class="n">${c.count}</span>
    </button>
  `).join('');
}

// index.html:2377 — private: DOM-building helper for renderList.
function renderJobShelves(rows, listEl) {
  const positions = {};
  if (listEl.querySelectorAll) listEl.querySelectorAll('.job-rail').forEach(rail => positions[rail.id] = rail.scrollLeft);
  if (!rows.length) {
    listEl.innerHTML = '<div class="empty">검색 결과가 없습니다. 다른 검색어나 필터로 찾아보세요.</div>';
    return;
  }
  const apps = getApplications();
  const groups = [
    ['priority', '먼저 살펴볼 기회', '나의 경험과 가까운 Fit S 공고', rows.filter(j => j.strategy?.fit === 'S')],
    ['deadline', '마감이 가까워요', '7일 안에 마감되는 공고를 놓치지 마세요', rows.filter(j => daysLeft(j.due) !== null && daysLeft(j.due) >= 0 && daysLeft(j.due) <= 7)],
    ['saved', '마음에 담아둔 공고', '북마크한 기회를 다시 살펴보세요', rows.filter(j => apps[j.id]?.is_bookmarked)],
    ['all', '모든 기회 둘러보기', '현재 검색과 필터에 맞는 전체 공고', rows]
  ];
  listEl.innerHTML = groups.filter(g => g[3].length).map(([key,title,sub,items],groupIndex) => `<section class="job-shelf" aria-labelledby="shelf-title-${key}">
    <div class="shelf-heading"><div><div class="shelf-eyebrow">${String(groupIndex + 1).padStart(2,'0')} / COLLECTION</div><h2 id="shelf-title-${key}">${title}<span>${items.length}</span></h2><p>${sub}</p></div>
      <div class="rail-controls"><button type="button" aria-label="${title} 이전 카드" data-action="rail-scroll" data-rail="${key}" data-dir="-1">←</button><button type="button" aria-label="${title} 다음 카드" data-action="rail-scroll" data-rail="${key}" data-dir="1">→</button></div></div>
    <div class="job-rail" id="rail-${key}" tabindex="0" aria-label="${title}. 좌우 방향키로 탐색">${items.map(j => {
      const app = apps[j.id] || {};
      const fit = j.strategy?.fit || 'B';
      const tone = (j.company.codePointAt(0) + j.id) % 5;
      const stack = (j.strategy?.stackMatch || j.cat || '').split(/[·,]/).map(s => s.trim()).filter(Boolean).slice(0,3);
      return `<article class="discovery-card tone-${tone}">
        <div class="card-art"><span class="card-fit">FIT ${esc(fit)}</span><button class="card-bookmark ${app.is_bookmarked?'is-bookmarked':''}" type="button" data-bm-id="${j.id}" data-action="bookmark-toggle" data-job="${j.id}" aria-label="${esc(j.company)} 북마크" aria-pressed="${!!app.is_bookmarked}">${app.is_bookmarked?'⭐':'☆'}</button>
          <button class="card-company" type="button" data-action="drawer-open" data-job="${j.id}"><span class="company-initial" aria-hidden="true">${esc(j.company.slice(0,2))}</span><strong>${esc(j.company)}</strong><span>${esc(j.org || 'CAREER OPPORTUNITY')}</span></button>
        </div><div class="card-info"><div class="card-meta"><span class="deadline ${level(j)}">${esc(ddayLabel(j))}</span><span>${esc(j.type || '채용공고')}</span></div>
        <h3><button type="button" data-action="drawer-open" data-job="${j.id}">${esc(j.role)}</button></h3><div class="card-stack">${stack.map(s=>`<span>${esc(s)}</span>`).join('')}</div>
        <div class="card-bottom"><button type="button" class="card-detail" data-action="drawer-open" data-job="${j.id}">지원전략 보기 <span>↗</span></button><a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(j.company)} 공고 원문">공고 ↗</a></div>
        ${app.status?`<div class="card-status">${esc(app.status)}</div>`:''}</div></article>`;
    }).join('')}</div></section>`).join('');
  if (listEl.querySelectorAll) listEl.querySelectorAll('.job-rail').forEach(rail => rail.scrollLeft = positions[rail.id] || 0);
}

// index.html:2414
export function renderList() {
  const rows = visible();
  const closedCount = getJobs().filter(j => level(j) === 'done').length;
  const countEl = document.querySelector('#count');
  const hintEl = document.querySelector('#hint');
  if (countEl) countEl.textContent = `${rows.length}개 공고 표시 중`;
  if (hintEl) hintEl.textContent = state.closed ? `(마감 ${closedCount}개 포함)` : `(마감 ${closedCount}개 숨김)`;

  const listEl = document.querySelector('#list');
  if (!listEl) return;
  renderJobShelves(rows, listEl);
}
