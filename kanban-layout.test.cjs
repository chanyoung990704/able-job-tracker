const fs = require('fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.CODEX_NODE_MODULES + '/playwright');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const page = await browser.newPage();
  // No production API or application state is reachable from this test.
  await page.route('**/*', route => route.request().url() === 'http://tracker.test/'
    ? route.fulfill({contentType:'text/html',body:html}) : route.abort());
  await page.goto('http://tracker.test/');
  await page.evaluate(() => {
    window.supabase = null;
    window.SUPABASE_CONFIG = null;
    window.APPLICATIONS = {};
    let cursor = 0;
    [0,1,4,20,1].forEach((count,stage) => {
      for (let i=0;i<count;i++) window.APPLICATIONS[JOBS[cursor++].id] = {status:PIPELINE_STAGES[stage].key};
    });
    switchViewMode('kanban');
    renderKanbanView();
  });
  for (const width of [375,768,1366,1920]) {
    await page.setViewportSize({width,height:1000});
    const result = await page.evaluate(() => {
      const board = document.querySelector('#kanbanContainer');
      const cols = [...board.querySelectorAll('.kanban-column')];
      const list = cols[3].querySelector('.kanban-card-list');
      const headerY = cols[3].querySelector('.kanban-col-header').getBoundingClientRect().top;
      list.scrollTop = list.scrollHeight;
      const last = list.lastElementChild.getBoundingClientRect();
      const rect = list.getBoundingClientRect();
      board.scrollLeft = board.scrollWidth;
      return {width:board.clientWidth,scrollWidth:board.scrollWidth,
        heights:cols.map(c=>c.getBoundingClientRect().height),
        pageOverflow:document.documentElement.scrollWidth > innerWidth,
        scrolled:list.scrollTop>0,lastVisible:last.bottom<=rect.bottom && last.top>=rect.top,
        headerFixed:headerY===cols[3].querySelector('.kanban-col-header').getBoundingClientRect().top,
        finalColumnVisible:cols[4].getBoundingClientRect().right<=board.getBoundingClientRect().right+1};
    });
    assert.equal(new Set(result.heights).size,1);
    assert.equal(result.pageOverflow,false);
    assert.ok(result.scrolled && result.lastVisible && result.headerFixed && result.finalColumnVisible);
    assert.equal(result.scrollWidth > result.width,result.width < 1248);
    console.log(width,result);
  }
  await page.setViewportSize({width:1920,height:1000});
  await page.locator('#kanbanContainer').scrollIntoViewIfNeeded();
  await page.screenshot({path:__dirname+'/kanban-layout-preview.png'});
  const lastCard = page.locator('[data-stage="면접대기"] .kanban-job-card').last();
  const id = await lastCard.locator('.btn-k-del').getAttribute('data-del-id');
  await lastCard.locator('.btn-open-drawer').click();
  assert.ok(await page.locator('.strategy-drawer.is-open').isVisible());
  await page.evaluate(()=>closeStrategyDrawer());
  await lastCard.locator('.btn-advance-stage').click();
  assert.equal(await page.evaluate(id=>window.APPLICATIONS[id].status,id),'최종합격');
  const moved = page.locator(`[data-stage="최종합격"] .kanban-job-card`).filter({has:page.locator(`[data-del-id="${id}"]`)});
  await moved.dragTo(page.locator('[data-stage="관심"] .kanban-card-list'));
  assert.equal(await page.evaluate(id=>window.APPLICATIONS[id].status,id),'관심');
  await page.locator(`[data-del-id="${id}"]`).click();
  assert.ok(!(await page.evaluate(id=>window.APPLICATIONS[id]?.status,id)));
  console.log('Scrolled card: strategy, advance, drag/drop, removal passed');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
