/**
 * Company analysis view — the `.cocard` grid and the detail panel that opens
 * beneath it.
 *
 * Ported (behavior-preserving) from index.html:
 *   renderCards  :2437  (renamed to renderCompanies() — see NOTE below)
 *   li/dlist     :2447-2451  (private markup helpers, used only here)
 *   renderDetail :2453
 *
 * NOTE ON SCOPE: the wave-2 task brief listed `renderCards` (index.html:2437)
 * under BOTH src/render/shelves.js's file description AND this file's ("the
 * company card grid (.cocard); grep for it"). Those two instructions
 * contradict each other — renderCards only ever reads COS/#cogrid/.cocard,
 * none of which shelves.js's spec or required-exports list mentions, while
 * this file's own bullet explicitly asks for whatever renders the grid.
 * Treating the shelves.js mention as a copy/paste artifact, the grid
 * renderer lives here, exported as renderCompanies() per this file's
 * required export list. Flagged in the wave-2 report.
 *
 * Changes from the original:
 *   - Bug A5 fix: renderDetail dereferenced c.swot.S, c.role.title, and
 *     several other company fields with no guard, so a company row from
 *     Supabase missing any of those columns threw and blanked the whole
 *     company tab. Every such field now has a safe default (missing ->
 *     empty section) instead of throwing. See defaults right below the
 *     `if (!c) return;` guard in renderDetail. Complete rows render exactly
 *     as before — the defaults only kick in when a field is absent.
 *   - COS/window-global access replaced by data.js's getCompanies() (called
 *     fresh each render, matching the getJobs()/getCompanies() contract).
 *   - No inline onclick handlers were present in the ported markup to begin
 *     with (`.cocard` already used a bare data-id + document-level
 *     delegation, and `#closeDetail`'s handler was already attached via
 *     addEventListener, not an inline attribute) — both are preserved as-is.
 */

import { esc } from '../util.js';
import { getCompanies } from '../data.js';

// index.html:2447 — hardened to tolerate a missing/undefined array (bug A5).
function li(arr) {
  return (arr || []).map(x => `<li>${esc(x)}</li>`).join('');
}

// index.html:2448 — hardened to tolerate a missing/undefined array (bug A5).
function dlist(pairs) {
  return `<dl class="dl">${(pairs || []).map(p =>
    `<div class="it"><dt>${esc(p[0])}</dt><dd>${esc(p[1])}</dd></div>`).join('')}</dl>`;
}

// index.html:2437 (was renderCards)
export function renderCompanies() {
  const el = document.querySelector('#cogrid');
  if (!el) return;
  const cos = getCompanies();
  el.innerHTML = cos.map(c =>
    `<button class="cocard" type="button" data-id="${esc(c.id)}">
      <h3>${esc(c.name)}<span class="en">${esc(c.en)}</span></h3>
      <div class="tagrow">${(c.tags || []).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
      <p>${esc(c.summary)}</p>
      <span class="more">지원 전략 보기 →</span>
    </button>`).join('');
}

// index.html:2453
export function renderDetail(id) {
  const detailEl = document.querySelector('#detail');
  if (!detailEl) return;

  const cos = getCompanies();
  const c = cos.find(x => x.id === id);
  if (!c) return;

  // Bug A5 guard: company rows from Supabase can arrive with any of these
  // columns empty/absent. Default each independently so a missing field
  // renders its own section empty instead of throwing and blanking the
  // whole detail panel (and, before this fix, the whole company tab).
  const facts = c.facts || {};
  const metrics = c.metrics || [];
  const process = c.process || [];
  const swot = c.swot || {};
  const role = c.role || {};

  const factsHtml = Object.entries(facts).map(([k,v])=>
    `<div class="fact"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
  const mets = metrics.map(m=>
    `<div class="met"><div class="k">${esc(m.k)}</div><div class="v">${esc(m.v)}</div><div class="n">${esc(m.n)}</div></div>`).join('');
  const steps = process.map((s,i)=>
    `<span class="step"><span class="i">${String(i+1).padStart(2,'0')}</span>${esc(s)}</span>`)
    .join('<span class="arrow">→</span>');

  detailEl.innerHTML = `
  <div class="dhead">
    <div><h2>${esc(c.name)}</h2><span class="en">${esc(c.en)}</span></div>
    <button class="closeb" type="button" id="closeDetail">닫기</button>
  </div>
  <div class="dbody">
    <div class="sec">
      <h3>기본 정보</h3>
      <div class="facts">${factsHtml}</div>
      <div class="mets">${mets}</div>
      <p class="lede">${esc(c.summary)}</p>
    </div>
    <div class="sec">
      <h3>SWOT</h3>
      <div class="swot">
        <div class="sq s"><h4>STRENGTH 강점</h4><ul>${li(swot.S)}</ul></div>
        <div class="sq w"><h4>WEAKNESS 약점</h4><ul>${li(swot.W)}</ul></div>
        <div class="sq o"><h4>OPPORTUNITY 기회</h4><ul>${li(swot.O)}</ul></div>
        <div class="sq t"><h4>THREAT 위협</h4><ul>${li(swot.T)}</ul></div>
      </div>
    </div>
    <div class="sec">
      <h3>3C — 고객 · 자사 · 경쟁사</h3>
      <p class="lede" style="margin-top:0">${esc(c.customer)}</p>
      <div class="tagrow" style="margin:12px 0 20px">${(c.customerTags || []).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="two">
        <div><p class="subh">Company 자사</p>${dlist(c.company)}</div>
        <div><p class="subh">Competitor 경쟁사</p>${dlist(c.competitor)}</div>
      </div>
    </div>
    <div class="sec">
      <h3>인재상</h3>
      <div class="vals">${(c.values || []).map(v=>
        `<div class="val"><b>${esc(v[0])}</b><span>${esc(v[1])}</span></div>`).join('')}</div>
    </div>
    <div class="sec">
      <h3>채용 프로세스</h3>
      <div class="steps">${steps}</div>
      ${c.processNote?`<p class="note">${esc(c.processNote)}</p>`:''}
      ${c.eligibility && c.eligibility.length?`<p class="subh" style="margin:20px 0 8px">지원 자격</p><ul class="ul">${li(c.eligibility)}</ul>`:''}
      ${c.spec?`<p class="subh" style="margin:20px 0 0">합격자 평균 스펙 (추정)</p><div class="speclist">${c.spec.map(s=>`<span class="spec">${esc(s[0])}<b>${esc(s[1])}</b></span>`).join('')}</div>`:''}
    </div>
    <div class="sec">
      <h3>지원 직무 — ${esc(role.title)}</h3>
      <div class="two">
        <div><p class="subh">주요 업무</p><ul class="ul">${li(role.duty)}</ul></div>
        <div>
          <p class="subh">핵심 역량</p><ul class="ul">${li(role.core)}</ul>
          <p class="subh" style="margin-top:16px">우대 역량</p><ul class="ul">${li(role.plus)}</ul>
        </div>
      </div>
    </div>
    <div class="sec">
      <h3>에이블스쿨 경험 연결 포인트</h3>
      <ul class="checks">${li(c.link)}</ul>
      <div class="pitch"><span class="lbl">한 문장 전략</span>${esc(c.pitch)}</div>
    </div>
  </div>`;
  detailEl.hidden = false;
  const closeBtn = document.querySelector('#closeDetail');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      detailEl.hidden = true;
      const card = document.querySelector('.cocard[data-id="'+id+'"]');
      if (card) card.focus();
    });
  }
  detailEl.scrollIntoView({behavior:'smooth', block:'start'});
}
