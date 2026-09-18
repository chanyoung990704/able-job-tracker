/**
 * Kanban board: layout sanity plus the interactions that would make the app
 * unusable if they broke. Deliberately not pixel-strict — this is a demo app,
 * so the assertions cover "the board is usable and the data is right", not
 * exact geometry.
 *
 * Run with: npm test
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = __dirname;
const ORIGIN = 'http://tracker.test';
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

// The app is now several files (modules, stylesheets, data), so the test has to
// serve the directory rather than fulfilling one inline document.
async function serveRepo(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();          // no CDN, no Supabase
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.abort();
    route.fulfill({ contentType: MIME[path.extname(file)] || 'text/plain', body: fs.readFileSync(file) });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await serveRepo(page);
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.App && window.App.JOBS.length > 0, null, { timeout: 15000 });

  // Seed a pipeline through the store, then show the board.
  await page.evaluate(() => {
    const { JOBS, PIPELINE_STAGES, store } = window.App;
    const apps = {};
    let cursor = 0;
    [0, 1, 4, 20, 1].forEach((count, stage) => {
      for (let i = 0; i < count; i++) apps[JOBS[cursor++].id] = { status: PIPELINE_STAGES[stage].key, is_bookmarked: false, memo: '' };
    });
    store.replaceApplications(apps);
    window.App.switchViewMode('kanban');
    window.App.renderKanbanView();
  });

  // ── layout ────────────────────────────────────────────────────────────
  for (const width of [375, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const board = document.querySelector('#kanbanContainer');
      const cols = [...board.querySelectorAll('.kanban-column')];
      const list = cols[3].querySelector('.kanban-card-list');
      const headerY = cols[3].querySelector('.kanban-col-header').getBoundingClientRect().top;
      list.scrollTop = list.scrollHeight;
      const rect = list.getBoundingClientRect();
      const last = list.lastElementChild.getBoundingClientRect();
      return {
        columns: cols.length,
        heights: cols.map(c => Math.round(c.getBoundingClientRect().height)),
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        scrolled: list.scrollTop > 0,
        lastVisible: last.bottom <= rect.bottom + 1 && last.top >= rect.top - 1,
        headerFixed: Math.abs(headerY - cols[3].querySelector('.kanban-col-header').getBoundingClientRect().top) < 1
      };
    });
    assert.equal(r.columns, 5, `expected 5 columns at ${width}px`);
    assert.equal(new Set(r.heights).size, 1, `columns not equal height at ${width}px: ${r.heights}`);
    assert.equal(r.pageOverflow, false, `page overflows horizontally at ${width}px`);
    assert.ok(r.scrolled, `column does not scroll internally at ${width}px`);
    assert.ok(r.lastVisible, `last card unreachable at ${width}px`);
    assert.ok(r.headerFixed, `column header does not stay fixed at ${width}px`);
    console.log(`  layout ${width}px OK`, r.heights[0] + 'px columns');
  }

  // ── interactions ──────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.locator('#kanbanContainer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(ROOT, 'kanban-layout-preview.png') });

  const lastCard = page.locator('[data-stage="면접대기"] .kanban-job-card').last();
  const id = Number(await lastCard.locator('.btn-k-del').getAttribute('data-del-id'));

  await lastCard.locator('.btn-open-drawer').click();
  assert.ok(await page.locator('.strategy-drawer.is-open').isVisible(), 'drawer did not open');

  // Regression for the memo bug: typing used to write an APPLICATIONS["NaN"]
  // record on every keystroke via a handler reading an attribute nothing set.
  const memo = page.locator('.strategy-drawer [data-action="memo-input"]').first();
  if (await memo.count()) {
    await memo.fill('테스트 메모입니다');
    const keys = await page.evaluate(() => Object.keys(window.App.APPLICATIONS));
    assert.ok(!keys.some(k => k === 'NaN' || k === 'undefined'), `garbage key written: ${keys}`);
    assert.equal(await page.evaluate(i => window.App.APPLICATIONS[i].memo, id), '테스트 메모입니다');
    console.log('  memo writes exactly one record, no NaN key');
  }

  await page.evaluate(() => window.App.closeStrategyDrawer());
  await lastCard.locator('.btn-advance-stage').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(i => window.App.APPLICATIONS[i].status, id), '최종합격');

  // Advancing past the last stage must stop, not wrap back to 관심.
  const moved = page.locator('[data-stage="최종합격"] .kanban-job-card').filter({ has: page.locator(`[data-del-id="${id}"]`) });
  await moved.locator('.btn-advance-stage').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(i => window.App.APPLICATIONS[i].status, id), '최종합격', 'advancing past the final stage wrapped around');
  console.log('  advance stops at the final stage');

  await moved.dragTo(page.locator('[data-stage="관심"] .kanban-card-list'));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(i => window.App.APPLICATIONS[i].status, id), '관심', 'drag and drop did not move the card');

  await page.locator(`[data-del-id="${id}"]`).click();
  await page.waitForTimeout(150);
  assert.ok(!(await page.evaluate(i => window.App.APPLICATIONS[i]?.status, id)), 'card was not removed');
  console.log('  drawer, advance, drag/drop and removal OK');

  assert.equal(pageErrors.length, 0, 'uncaught page errors:\n' + pageErrors.join('\n'));
  console.log('\nAll checks passed.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
