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
    const ctx = await b.newContext({ viewport: { width: 1100, height: 1300 } });
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
  // 日期左右的 ‹ ›：往前一天再往後一天，回到原本那天
  await A.pg.click('#d-date ~ .step'); assert.strictEqual(await A.pg.inputValue('#d-date'), '2026-11-02');
  await A.pg.locator('.stepper:has(#d-date) .step').first().click(); assert.strictEqual(await A.pg.inputValue('#d-date'), '2026-11-01');
  // 照紙本結帳單輸入（10/26 那張）
  for (const [id, v] of [['d-site', '29125'], ['d-panda', '6358'], ['d-uber', '4562'], ['d-allpay', '575'], ['d-line', '3713']]) await A.pg.fill('#' + id, v);
  const slip = [['燉滷', '500', '其他支出'], ['油條', '400', '其他支出'], ['蔥', '140', '菜'], ['PT', '800', '薪資／預支'], ['淳', '420', '其他支出']];
  for (let i = 0; i < slip.length; i++) {
    if (i > 0) await A.pg.click('text=＋ 新增一行');
    const row = A.pg.locator('#d-lines .line').nth(i);
    await row.locator('input').nth(0).fill(slip[i][0]); await row.locator('input').nth(1).fill(slip[i][1]);
    await row.locator('select').selectOption(slip[i][2]);
  }
  // 常用項目：已經加過的不顯示；點「米」會新增一行並帶入分類
  const chips = await A.pg.textContent('#d-presets');
  assert.ok(!chips.includes('蔥') && chips.includes('米') && chips.includes('油條') === false, '已加入的項目要隱藏：' + chips);
  await A.pg.click('#d-presets button:has-text("米")');
  const mi = A.pg.locator('#d-lines .line').last();
  assert.strictEqual(await mi.locator('input').nth(0).inputValue(), '米'); assert.strictEqual(await mi.locator('select').inputValue(), '米');
  await mi.locator('button.danger').click();
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
  await B.pg.click('#tb-payroll'); await B.pg.click('text=範例正職(請改名)');
  assert.ok((await B.pg.textContent('#s-name')).includes('1/2'));
  await B.pg.click('#s-name .step >> nth=1');                        // › 下一位
  assert.ok((await B.pg.textContent('#s-name')).includes('範例計時(請改名)') && (await B.pg.textContent('#s-name')).includes('2/2'), '› 要切到下一位');
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
  await B.pg.click('#tb-expense'); await B.pg.fill('#e-month', '2026-01'); await B.pg.dispatchEvent('#e-month', 'change');
  await B.pg.locator('.stepper:has(#e-month) .step').first().click(); assert.strictEqual(await B.pg.inputValue('#e-month'), '2025-12', '月份 ‹ 要能跨年');
  // 固定支出常用項目：點「房租」帶入名稱和類型，記過就不再顯示；下個月會顯示上次金額
  await B.pg.click('#tb-expense'); await B.pg.fill('#e-month', '2026-11'); await B.pg.dispatchEvent('#e-month', 'change');
  await B.pg.click('#e-presets button:has-text("房租")');
  assert.strictEqual(await B.pg.inputValue('#e-item'), '房租'); assert.strictEqual(await B.pg.inputValue('#e-type'), '固定');
  await B.pg.fill('#e-amount', '32000'); await B.pg.click('#tab-expense .primary');
  assert.ok(!(await B.pg.textContent('#e-presets')).includes('房租'), '記過的固定支出不再顯示');
  await B.pg.fill('#e-month', '2026-12'); await B.pg.dispatchEvent('#e-month', 'change');
  assert.ok((await B.pg.textContent('#e-presets')).includes('房租32,000'), '下個月顯示上次金額');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-expense.png'), fullPage: true });
  // 外送對帳：照對帳單填（9 月 Panda 兩期、Uber 一期），總收＝實際入帳
  await B.pg.click('#tb-delivery'); await B.pg.fill('#v-month', '2026-09'); await B.pg.dispatchEvent('#v-month', 'change');
  const fillDv = async (p, row, col, v) => { const inp = B.pg.locator('#dv-' + p + ' tbody tr').nth(row).locator('input').nth(col); await inp.fill(v); await inp.dispatchEvent('input'); };
  await fillDv('Panda', 0, 0, '55672'); await fillDv('Panda', 1, 0, '15588'); await fillDv('Panda', 2, 0, '3296');
  await fillDv('Panda', 0, 1, '39182'); await fillDv('Panda', 1, 1, '10964'); await fillDv('Panda', 2, 1, '315');
  await fillDv('Uber', 0, 0, '24384'); await fillDv('Uber', 1, 0, '8540'); await fillDv('Uber', 2, 0, '500');
  assert.strictEqual(await B.pg.textContent('#dv-Panda-tot'), '64,691'); assert.strictEqual(await B.pg.textContent('#dv-Uber-tot'), '15,344');
  // 線上支付：本月收款來自每日結帳；這個測試月份沒有全支付，所以只驗證欄位存在且可存
  assert.ok(await B.pg.isVisible('#op-0') && await B.pg.isVisible('#op-1'));
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-delivery.png'), fullPage: true });
  await B.pg.click('#tab-delivery .primary');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  const dvr = g.rows('外送對帳').filter(r => r['月份'] === '2026-09');
  assert.deepStrictEqual(dvr.map(r => r['平台'] + r['實際入帳']).sort(), ['Panda64691', 'Uber15344']);
  await B.pg.dispatchEvent('#v-month', 'change');
  assert.strictEqual(await B.pg.inputValue('#dv-Panda tbody tr:nth-child(2) input >> nth=0'), '15588', '重新打開要看到存過的明細');

  // 總覽：年
  await B.pg.click('#tb-overview'); await B.pg.click('#ov-seg button[data-v="year"]'); await B.pg.waitForSelector('#y-body .ytable');
  assert.strictEqual(await B.pg.evaluate(() => document.querySelector('header').getBoundingClientRect().top), 0, '總覽上方不能有白邊');
  const yt = await B.pg.textContent('#y-body');
  assert.ok(yt.includes('Q4 合計') && yt.includes('2026 全年') && yt.includes('豐吉 60%'), '年：要有季合計、全年、股東欄');
  // 總覽：日（看 2026-11 每天的營收和進貨）
  await B.pg.click('#ov-seg button[data-v="day"]'); await B.pg.fill('#m-month', '2026-11'); await B.pg.dispatchEvent('#m-month', 'change');
  const dt = await B.pg.textContent('#dd-body');
  assert.ok(dt.includes('實際營收') && dt.includes('支出計算') && dt.includes('11/1週日') && dt.includes('40,045'), '日：每天一行、總營收 40,045');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-day.png'), fullPage: true });
  assert.ok(await B.pg.isHidden('#m-body') && await B.pg.isHidden('#y-body'));
  // 線上支付：11 月全支付收款 575，月底實際入帳 560 → 手續費 15；月結不再顯示「估計」
  await B.pg.click('#tb-delivery'); await B.pg.fill('#v-month', '2026-11'); await B.pg.dispatchEvent('#v-month', 'change');
  await B.pg.fill('#op-0', '560'); await B.pg.dispatchEvent('#op-0', 'input');
  assert.ok((await B.pg.textContent('#op-fee-0')).startsWith('15'), await B.pg.textContent('#op-fee-0'));
  await B.pg.fill('#op-1', '3640'); await B.pg.dispatchEvent('#op-1', 'input');
  await B.pg.click('#tab-delivery .primary');
  await B.pg.click('#tb-overview');
  // 日期／月份置頂：捲到下面時，月份列仍貼在分頁列下方
  await B.pg.evaluate(() => window.scrollTo(0, 2000)); await B.pg.waitForTimeout(200);
  const pin = await B.pg.evaluate(() => { const b = document.getElementById('pickbar').getBoundingClientRect(), t = document.getElementById('tabs').getBoundingClientRect(); return [Math.round(b.top), Math.round(t.bottom), !!document.querySelector('#pickbar #m-month')]; });
  assert.ok(pin[2] && Math.abs(pin[0] - pin[1]) <= 1, '月份要置頂：' + pin);
  await B.pg.evaluate(() => window.scrollTo(0, 0));
  // 總覽：月
  await B.pg.click('#ov-seg button[data-v="month"]');
  assert.ok((await B.pg.textContent('#m-body')).includes('可分配給股東'));
  const mb = await B.pg.textContent('#m-body');
  assert.ok(mb.includes('線上支付手續費') && !mb.includes('線上支付手續費（估計）'), '對帳後不再是估計');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-summary.png'), fullPage: true });
  // 店長看不到管理分頁
  const tabsA = await A.pg.$$eval('#tabs button', bs => bs.map(b => b.textContent));
  assert.ok(!tabsA.includes('人事') && !tabsA.includes('總覽'));
  assert.deepStrictEqual(tabsA, ['每日結帳', '進貨', '裝置'], '店長只有三個分頁');
  console.log('多裝置 + 權限 ✓');
  // 常用項目設定：把每日結帳的清單改成「豬肉、米」，存檔同步後平板（店長）也看得到
  await B.pg.click('#tb-settings');
  assert.ok(await B.pg.isVisible('#set-presets-card'), '管理要看得到常用項目設定');
  while (await B.pg.locator('#pe-list .pe-row').count() > 1) await B.pg.locator('#pe-list .pe-row .danger').first().click();
  await B.pg.locator('#pe-list .pe-row input').first().fill('米'); await B.pg.locator('#pe-list .pe-row select').first().selectOption('米');
  await B.pg.click('#tab-settings .addline'); const nr = B.pg.locator('#pe-list .pe-row').last();
  await nr.locator('input').fill('豬肉'); await nr.locator('select').selectOption('豬肉攤');
  await B.pg.locator('#pe-list .pe-row .pe-mv').nth(2).click();   // 豬肉 上移
  await B.pg.click('#pe-save');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.deepStrictEqual(g.rows('設定_常用項目').filter(r => r['店別'] === '大埔店' && r['用途'] === '每日結帳').map(r => r['名稱'] + '/' + r['分類']), ['豬肉/豬肉攤', '米/米']);
  await A.pg.evaluate(() => trySync(true)); await A.pg.waitForTimeout(500);
  await A.pg.click('#tb-daily');
  assert.strictEqual((await A.pg.textContent('#d-presets')).replace(/[0-9,]/g, ''), '＋豬肉＋米', '平板的按鈕要照新清單');
  assert.ok(!(await A.pg.isVisible('#set-presets-card')), '店長看不到常用項目設定');

  // 手機：下方分頁列、「更多」、右下角亮／暗切換
  await B.pg.setViewportSize({ width: 390, height: 844 });
  assert.ok(await B.pg.isVisible('#bottombar') && !(await B.pg.isVisible('#tabs')), '手機要用下方分頁列');
  assert.deepStrictEqual(await B.pg.$$eval('#tabs button', bs => bs.map(b => b.textContent)),
    ['每日結帳', '進貨', '固定/其他支出', '總覽', '人事', '外送對帳', '分紅扣除', '裝置'], '分頁順序');
  assert.deepStrictEqual(await B.pg.$$eval('#bottombar button', bs => bs.map(b => b.textContent)), ['結帳', '進貨', '支出', '總覽', '更多']);
  assert.deepStrictEqual(await B.pg.$$eval('#moregrid button', bs => bs.map(b => b.textContent)), ['人事', '外送對帳', '分紅扣除', '裝置']);
  await B.pg.click('#bb-more'); await B.pg.click('#moregrid button:has-text("人事")');
  assert.ok(await B.pg.isVisible('#tab-payroll') && (await B.pg.getAttribute('#bb-more', 'class')).includes('on'));
  await B.pg.click('#bb-daily');
  await B.pg.click('#themeBtn'); assert.strictEqual(await B.pg.getAttribute('html', 'data-theme'), 'light');
  await B.pg.click('#themeBtn'); assert.strictEqual(await B.pg.getAttribute('html', 'data-theme'), 'dark');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-phone-dark.png'), fullPage: true });
  await B.pg.click('#themeBtn'); assert.strictEqual(await B.pg.getAttribute('html', 'data-theme'), null);
  console.log('手機分頁列 + 亮暗切換 ✓');
  await b.close(); srv.close();
  console.log('E2E 全部通過 ✓');
})().catch(e => { console.error(e); process.exit(1); });
