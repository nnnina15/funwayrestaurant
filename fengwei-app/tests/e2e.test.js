// 瀏覽器端到端測試（需要 Playwright）：node fengwei-app/tests/e2e.test.js
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const assert = require('assert');
const { createGas } = require('./gas-mock.js');
const DOCS = path.join(__dirname, '..', '..', 'docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DOCS, p); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
const URL_ = 'https://script.google.com/macros/s/TEST/exec';
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const g = createGas(); const S = g.ctx.__S;
  const b = await chromium.launch();
  async function device(name) {
    const ctx = await b.newContext({ viewport: { width: 820, height: 1180 } });
    await ctx.route(URL_, async (route) => { const body = JSON.parse(route.request().postData()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(g.post(body)) }); });
    const pg = await ctx.newPage(); pg.on('pageerror', e => console.log(name, 'PAGEERROR', e.message)); pg.on('dialog', d => d.accept());
    await pg.goto('http://localhost:8765/');
    await pg.fill('#cfg-url', URL_); await pg.fill('#cfg-device', name); await pg.click('text=測試連線並儲存');
    await pg.waitForSelector('#storeChips button'); await pg.click('#storeChips button:has-text("大埔店")');
    return { ctx, pg };
  }
  // 平板（店長）
  const A = await device('大埔平板');
  await A.pg.fill('#pin', '1234'); await A.pg.click('#v-login .primary'); await A.pg.waitForSelector('#tab-daily:not(.hide)');
  await A.pg.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 5000 }).catch(() => A.pg.reload());
  await A.pg.waitForTimeout(500);
  // 斷網
  await A.ctx.setOffline(true);
  await A.pg.reload(); await A.pg.waitForSelector('#tab-daily:not(.hide)');            // 沒網路也能打開
  await A.pg.fill('#d-date', '2026-11-01'); await A.pg.dispatchEvent('#d-date', 'change');
  for (const [id, v] of [['d-site', '31455'], ['d-panda', '4974'], ['d-uber', '555'], ['d-allpay', '80'], ['d-line', '1260'], ['d-spend', '6510'], ['d-cash', '23400']]) await A.pg.fill('#' + id, v);
  await A.pg.dispatchEvent('#d-cash', 'input');
  await A.pg.click('text=儲存今日結帳');
  await A.pg.click('#tb-purchase'); await A.pg.fill('#p-date', '2026-11-01'); await A.pg.dispatchEvent('#p-date', 'change');
  await A.pg.click('#p-cats button:has-text("乾貨/配菜")'); await A.pg.fill('#p-amount', '3200+575+140+200'); await A.pg.click('text=新增這筆');
  await A.pg.click('#p-cats button:has-text("麵")'); await A.pg.fill('#p-amount', '240'); await A.pg.click('text=新增這筆');
  const cats = await A.pg.$$eval('#p-cats button', bs => bs.map(b => b.textContent));
  assert.ok(!cats.includes('牛亨'), '11 月不該出現牛亨');
  const status = await A.pg.textContent('#sync');
  console.log('離線狀態列：', status); assert.ok(/離線｜3 筆待上傳/.test(status));
  assert.ok((await A.pg.textContent('#banner')).includes('3 筆'), '提示要和狀態列一致');
  await A.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-offline.png') });
  assert.strictEqual(g.rows(S.PURCHASE).length, 0, '離線時伺服器不該有資料');
  // 恢復網路 → 自動同步
  await A.ctx.setOffline(false);
  await A.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.PURCHASE).length, 2); assert.strictEqual(g.rows(S.PURCHASE).find(r => r['分類'] === '乾貨/配菜')['金額'], 4115);
  assert.strictEqual(g.rows(S.DAILY)[0]['現金差額'], -205); assert.strictEqual(g.rows(S.DAILY)[0]['裝置'], '大埔平板');
  console.log('恢復網路後已同步 ✓');

  // 手機（管理）：看得到平板的資料、填人事、看月結
  const B = await device('Nina手機');
  await B.pg.fill('#pin', '9999'); await B.pg.click('#v-login .primary'); await B.pg.waitForSelector('#tab-daily:not(.hide)');
  await B.pg.click('#tb-purchase'); await B.pg.fill('#p-date', '2026-11-01'); await B.pg.dispatchEvent('#p-date', 'change');
  assert.strictEqual(await B.pg.$$eval('#p-list tr', t => t.length), 2, '手機要看到平板的進貨');
  await B.pg.click('#tb-payroll'); await B.pg.click('text=範例計時(請改名)');
  await B.pg.fill('.hours input >> nth=0', '106'); await B.pg.fill('.hours input >> nth=1', '240'); await B.pg.dispatchEvent('.hours input >> nth=0', 'input');
  await B.pg.click('text=＋ 新增項目'); await B.pg.fill('.item-row >> nth=1 >> input >> nth=0', '加班費'); await B.pg.fill('.item-row >> nth=1 >> input >> nth=1', '700'); await B.pg.dispatchEvent('.item-row >> nth=1 >> input >> nth=1', 'input');
  assert.ok((await B.pg.textContent('#s-calc')).includes('26,140'));
  await B.pg.click('text=儲存這位員工');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.PAYROLL).reduce((a, r) => a + r['金額'], 0), 26140);
  await B.pg.click('#tb-summary'); await B.pg.fill('#m-month', '2026-11'); await B.pg.dispatchEvent('#m-month', 'change');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-summary.png'), fullPage: true });
  // 店長看不到管理分頁
  const tabsA = await A.pg.$$eval('#tabs button', bs => bs.map(b => b.textContent));
  assert.ok(!tabsA.includes('人事') && !tabsA.includes('月結總覽'));
  console.log('多裝置 + 權限 ✓');
  await b.close(); srv.close();
  console.log('E2E 全部通過 ✓');
})().catch(e => { console.error(e); process.exit(1); });
