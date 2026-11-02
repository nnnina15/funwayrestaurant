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
  // 照紙本結帳單輸入（10/26 那張）
  for (const [id, v] of [['d-site', '29125'], ['d-panda', '6358'], ['d-uber', '4562'], ['d-allpay', '575'], ['d-line', '3713']]) await A.pg.fill('#' + id, v);
  const slip = [['燉滷', '500', '其他支出'], ['油條', '400', '其他支出'], ['蔥', '140', '菜'], ['PT', '800', '薪資／預支'], ['淳', '420', '其他支出']];
  for (let i = 0; i < slip.length; i++) {
    if (i > 0) await A.pg.click('text=＋ 新增一行');
    const row = A.pg.locator('#d-lines .line').nth(i);
    await row.locator('input').nth(0).fill(slip[i][0]); await row.locator('input').nth(1).fill(slip[i][1]);
    await row.locator('select').selectOption(slip[i][2]);
  }
  await A.pg.fill('#d-cash', '22835'); await A.pg.dispatchEvent('#d-cash', 'input');
  assert.strictEqual(await A.pg.textContent('#d-total'), '40,045');
  assert.strictEqual(await A.pg.textContent('#d-spendv'), '-2,260');
  assert.strictEqual(await A.pg.textContent('#d-expected'), '22,577');
  assert.strictEqual(await A.pg.textContent('#d-diff'), '+258');
  await A.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-daily.png'), fullPage: true });
  await A.pg.click('text=儲存今日結帳');
  // 改一筆再存一次：不能重複記
  await A.pg.locator('#d-lines .line').nth(2).locator('input').nth(1).fill('150');
  await A.pg.click('text=儲存今日結帳');
  await A.pg.click('#tb-purchase'); await A.pg.fill('#p-date', '2026-11-01'); await A.pg.dispatchEvent('#p-date', 'change');
  await A.pg.click('#p-cats button:has-text("乾貨/配菜")'); await A.pg.fill('#p-amount', '3200+575+140+200'); await A.pg.click('text=新增這筆');
  await A.pg.click('#p-cats button:has-text("麵")'); await A.pg.fill('#p-amount', '240'); await A.pg.click('text=新增這筆');
  const cats = await A.pg.$$eval('#p-cats button', bs => bs.map(b => b.textContent));
  assert.ok(!cats.includes('牛亨'), '11 月不該出現牛亨');
  const status = await A.pg.textContent('#sync');
  console.log('離線狀態列：', status); assert.ok(/離線｜\d+ 筆待上傳/.test(status));
  assert.ok((await A.pg.textContent('#banner')).includes(status.match(/(\d+) 筆/)[1] + ' 筆'), '提示要和狀態列一致');
  await A.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-offline.png') });
  assert.strictEqual(g.rows(S.PURCHASE).length, 0, '離線時伺服器不該有資料');
  // 恢復網路 → 自動同步
  await A.ctx.setOffline(false);
  await A.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.PURCHASE).length, 3, '手動 2 筆 + 結帳單的蔥 1 筆（改過也只有 1 筆）');
  assert.strictEqual(g.rows(S.PURCHASE).find(r => r['分類'] === '乾貨/配菜')['金額'], 4115);
  assert.strictEqual(g.rows(S.PURCHASE).find(r => r['分類'] === '菜')['金額'], 150);
  assert.deepStrictEqual(g.rows(S.EXPENSE).map(r => r['項目'] + r['金額']).sort(), ['油條400', '淳420', '燉滷500'], 'PT 是薪資，不另記其他支出');
  const day = g.rows(S.DAILY)[0];
  assert.strictEqual(day['現場支出'], 2270); assert.strictEqual(day['現金差額'], 268); assert.strictEqual(day['裝置'], '大埔平板');
  assert.ok(String(day['支出明細']).startsWith('燉滷 500（→其他支出#E'), day['支出明細']);
  console.log('恢復網路後已同步 ✓');

  // 手機（管理）：看得到平板的資料、填人事、看月結
  const B = await device('Nina手機');
  await B.pg.fill('#pin', '9999'); await B.pg.click('#v-login .primary'); await B.pg.waitForSelector('#tab-daily:not(.hide)');
  await B.pg.click('#tb-purchase'); await B.pg.fill('#p-date', '2026-11-01'); await B.pg.dispatchEvent('#p-date', 'change');
  assert.strictEqual(await B.pg.$$eval('#p-list tr', t => t.length), 3, '手機要看到平板的進貨（手動 2 + 結帳單 1）');
  await B.pg.click('#tb-payroll'); await B.pg.click('text=範例計時(請改名)');
  await B.pg.fill('.hours input >> nth=0', '106'); await B.pg.fill('.hours input >> nth=1', '240'); await B.pg.dispatchEvent('.hours input >> nth=0', 'input');
  await B.pg.click('text=＋ 新增項目'); await B.pg.fill('.item-row >> nth=1 >> input >> nth=0', '加班費'); await B.pg.fill('.item-row >> nth=1 >> input >> nth=1', '700'); await B.pg.dispatchEvent('.item-row >> nth=1 >> input >> nth=1', 'input');
  assert.ok((await B.pg.textContent('#s-calc')).includes('26,140'));
  // 常用項目：點「早退（扣）」打正數 → 自動變成扣款；已加入的項目不再出現在按鈕列
  await B.pg.click('#s-presets button:has-text("早退")');
  await B.pg.fill('.item-row >> nth=2 >> input >> nth=1', '300'); await B.pg.dispatchEvent('.item-row >> nth=2 >> input >> nth=1', 'input');
  assert.ok((await B.pg.textContent('#s-calc')).includes('25,840'), await B.pg.textContent('#s-calc'));
  assert.ok(!(await B.pg.textContent('#s-presets')).includes('早退'));
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-payroll.png'), fullPage: true });
  await B.pg.click('.item-row >> nth=2 >> button.danger');
  await B.pg.click('text=儲存這位員工');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.PAYROLL).reduce((a, r) => a + r['金額'], 0), 26140);
  // 固定支出常用項目：點「房租」帶入名稱和類型，記過就不再顯示；下個月會顯示上次金額
  await B.pg.click('#tb-expense'); await B.pg.fill('#e-month', '2026-11'); await B.pg.dispatchEvent('#e-month', 'change');
  await B.pg.click('#e-presets button:has-text("房租")');
  assert.strictEqual(await B.pg.inputValue('#e-item'), '房租'); assert.strictEqual(await B.pg.inputValue('#e-type'), '固定');
  await B.pg.fill('#e-amount', '32000'); await B.pg.click('#tab-expense .primary');
  assert.ok(!(await B.pg.textContent('#e-presets')).includes('房租'), '記過的固定支出不再顯示');
  await B.pg.fill('#e-month', '2026-12'); await B.pg.dispatchEvent('#e-month', 'change');
  assert.ok((await B.pg.textContent('#e-presets')).includes('房租32,000'), '下個月顯示上次金額');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-expense.png'), fullPage: true });
  await B.pg.click('#tb-year'); await B.pg.waitForSelector('.ytable');
  const yt = await B.pg.textContent('#y-body');
  assert.ok(yt.includes('Q4 合計') && yt.includes('2026 全年') && yt.includes('豐吉 60%'), '年度總覽要有季合計、全年、股東欄');
  await B.pg.click('#tb-summary'); await B.pg.fill('#m-month', '2026-11'); await B.pg.dispatchEvent('#m-month', 'change');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-summary.png'), fullPage: true });
  // 店長看不到管理分頁
  const tabsA = await A.pg.$$eval('#tabs button', bs => bs.map(b => b.textContent));
  assert.ok(!tabsA.includes('人事') && !tabsA.includes('月結總覽'));
  console.log('多裝置 + 權限 ✓');
  await b.close(); srv.close();
  console.log('E2E 全部通過 ✓');
})().catch(e => { console.error(e); process.exit(1); });
