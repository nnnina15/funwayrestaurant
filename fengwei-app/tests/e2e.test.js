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
    await ctx.route(URL_, async (route) => { const body = JSON.parse(route.request().postData()); const res = g.post(body); if (ctx.__delay) await new Promise(r => setTimeout(r, ctx.__delay)); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) }); });
    const pg = await ctx.newPage(); pg.on('pageerror', e => console.log(name, 'PAGEERROR', e.message)); pg.on('dialog', d => d.accept(pg.__ans));
    await pg.goto('http://localhost:8765/?api=' + encodeURIComponent(URL_));   // 測試用的同步網址（正式的是內建網址）
    await pg.waitForSelector('#login-acc');
    return { ctx, pg };
  }
  // 帳號：在試算表「設定_帳號」新增（管理者做的事）
  g.sheets['設定_帳號'].cells.push(['大埔平板', '店長', '大埔店', '是', 'Tablet#001', '', '']);
  g.sheets['設定_帳號'].cells[1][0] = 'Nina手機';
  // 第一次登入：臨時 PIN → 一定要設新 PIN（規則不符會被擋）
  async function firstLogin(D, acc, temp, newPin) {
    await D.pg.fill('#login-acc', acc); await D.pg.fill('#login-pin', temp); await D.pg.click('#v-login .primary');
    await D.pg.waitForSelector('#newpin-box:not(.hide)');
    await D.pg.fill('#login-new', 'weak'); await D.pg.fill('#login-new2', 'weak'); await D.pg.dispatchEvent('#login-new', 'input');
    assert.ok(!(await D.pg.textContent('#login-new-hint')).includes('✓ 符號'));
    await D.pg.click('#v-login .primary'); assert.ok(await D.pg.isVisible('#v-login'), '弱 PIN 不能登入');
    await D.pg.fill('#login-new', newPin); await D.pg.fill('#login-new2', newPin); await D.pg.click('#v-login .primary');
    await D.pg.waitForSelector('#tab-daily:not(.hide)');
  }
  // 平板（店長）
  const A = await device('大埔平板');
  // 帳號打錯進不了
  await A.pg.fill('#login-acc', '大埔平版'); await A.pg.fill('#login-pin', 'Tablet#001'); await A.pg.click('#v-login .primary');
  await A.pg.waitForTimeout(300); assert.ok(await A.pg.isVisible('#v-login') && (await A.pg.isHidden('#newpin-box')), '帳號打錯不能進');
  await firstLogin(A, '大埔平板', 'Tablet#001', 'Shop#2026a');
  assert.strictEqual(await A.pg.$('#storeSel'), null, '只有一家店的店長沒有切換選單');
  await A.pg.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 5000 }).catch(() => A.pg.reload());
  await A.pg.waitForTimeout(500);
  // 斷網
  await A.ctx.setOffline(true);
  await A.pg.reload(); await A.pg.waitForSelector('#tab-daily:not(.hide)');            // 沒網路也能打開
  await A.pg.fill('#d-date', '2026-11-01'); await A.pg.dispatchEvent('#d-date', 'change');
  // 日期左右的 ‹ ›：往前一天再往後一天，回到原本那天
  assert.strictEqual(await A.pg.textContent('.stepper:has(#d-date) .pk-label'), '2026/11/1', '日期顯示成 2026/11/1（不用瀏覽器自己的格式）');
  await A.pg.locator('.stepper:has(#d-date) .step').last().click(); assert.strictEqual(await A.pg.inputValue('#d-date'), '2026-11-02');
  assert.strictEqual(await A.pg.textContent('.stepper:has(#d-date) .pk-label'), '2026/11/2', '按 › 之後顯示也要跟著變');
  await A.pg.locator('.stepper:has(#d-date) .step').first().click(); assert.strictEqual(await A.pg.inputValue('#d-date'), '2026-11-01');
  // 照紙本結帳單輸入（10/26 那張）
  for (const [id, v] of [['d-site', '29125'], ['d-panda', '6358'], ['d-uber', '4562'], ['d-allpay', '575'], ['d-line', '3713']]) await A.pg.fill('#' + id, v);
  const slip = [['燉滷', '500', '其他支出'], ['油條', '400', '其他支出'], ['蔥', '140', '菜'], ['PT', '800', 'PT薪資'], ['淳', '420', '其他支出']];
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
  assert.deepStrictEqual(g.rows('人事明細').map(r => [r['姓名'], r['項目'], r['金額'], r['類別']]), [['PT', 'PT薪資（日結 11/1）', 800, '薪資']], '日結的 PT 自動記到人事（存兩次也只有一筆）');
  const day = g.rows(S.DAILY)[0];
  assert.strictEqual(day['現場支出'], 2270); assert.strictEqual(day['現金差額'], 268); assert.strictEqual(day['裝置'], '大埔平板');
  assert.ok(String(day['支出明細']).startsWith('燉滷 500（→其他支出#E'), day['支出明細']);
  console.log('恢復網路後已同步 ✓');

  // 手機（管理）：看得到平板的資料、填人事、看月結
  const B = await device('Nina手機');
  await firstLogin(B, 'Nina手機', 'Funway#2026', 'Nina#2026x');
  assert.deepStrictEqual(await B.pg.$$eval('#storeSel option', o => o.map(x => x.textContent)), ['大埔店', '中正店'], '管理可以切兩家店');
  // 試算表新增店家：同步後店別選單馬上多出來（不用重新登入）
  g.sheets[S.STORE].cells.push(['師大店', 2, '否', 500]);
  await B.pg.evaluate(() => trySync(true)); await B.pg.waitForFunction(() => document.querySelectorAll('#storeSel option').length === 3, null, { timeout: 8000 });
  g.sheets[S.STORE].cells.pop();
  await B.pg.evaluate(() => trySync(true)); await B.pg.waitForFunction(() => document.querySelectorAll('#storeSel option').length === 2, null, { timeout: 8000 });
  await B.pg.click('#tb-purchase'); await B.pg.fill('#p-date', '2026-11-01'); await B.pg.dispatchEvent('#p-date', 'change');
  assert.strictEqual(await B.pg.$$eval('#p-list tr', t => t.length), 3, '手機要看到平板的進貨（手動 2 + 結帳單 1）');
  await B.pg.click('#tb-payroll');
  // 沒填的員工不自動列出：只看到日結自動記的 PT，名單上的人在「＋ 其他人」後面
  assert.ok(!(await B.pg.textContent('#s-emps')).includes('範例正職'), '沒填的員工不要自動列出來');
  assert.ok((await B.pg.textContent('#s-roster')).includes('＋範例正職(請改名)'), '沒填的員工放在＋其他人後面');
  await B.pg.click('#s-roster button:has-text("範例正職")');
  assert.ok((await B.pg.textContent('#s-emps')).includes('範例正職'), '點了才加入名單');
  assert.ok((await B.pg.textContent('#s-name')).includes('1/2'), '範例正職，加上日結自動記的 PT');
  assert.ok(await B.pg.isVisible('#s-temp .seg') && !(await B.pg.$('#s-temp .rename')), '名單上的人可以選正職／計時，但不能改名');
  assert.ok(await B.pg.isVisible('#s-temp .del-emp'), '要有刪除這位');
  // 正職：月薪、扣健保(自付)、扣勞保(自付) 固定在最上面，沒有刪除鈕，常用項目也不再出現
  assert.deepStrictEqual(await B.pg.$$eval('.item-row.fixed', rs => rs.map(r => r.querySelector('.fx-name').textContent + (r.querySelector('.danger') || r.querySelector('select') ? 'X' : ''))), ['月薪', '扣健保(自付)', '扣勞保(自付)'], '正職固定三項');
  assert.ok(!(await B.pg.textContent('#s-presets')).includes('扣健保'), '固定項目不能再加一次');
  // 換成計時：固定項目變成「上班時數 × 時薪」；再換回正職
  await B.pg.click('#s-temp .seg button:has-text("計時")');
  assert.strictEqual(await B.pg.$$eval('.item-row.fixed', rs => rs.length), 1); assert.ok(await B.pg.isVisible('.item-row.fixed .hours'), '計時要有時數×時薪');
  await B.pg.click('#s-temp .seg button:has-text("正職")');
  assert.strictEqual(await B.pg.$$eval('.item-row.fixed', rs => rs.length), 3);
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-payroll-fixed.png'), fullPage: false });
  await B.pg.click('#s-roster button:has-text("範例計時")');
  assert.ok((await B.pg.textContent('#s-name')).includes('範例計時(請改名)') && (await B.pg.textContent('#s-name')).includes('1/2'), '換成範例計時（剛剛沒存的範例正職不留在名單）');
  // 計時：固定一行「上班時數 × 時薪」，時薪先帶設定（250），可以調，這行不能刪
  assert.strictEqual(await B.pg.inputValue('.hours input >> nth=1'), '250'); assert.ok(!(await B.pg.$eval('.hours input >> nth=1', e => e.readOnly)), '時薪可以調');
  assert.strictEqual(await B.pg.$$eval('.item-row >> nth=0', r => r[0].querySelector('.danger') === null), true, '時薪那行不能刪');
  await B.pg.fill('.hours input >> nth=0', '106'); await B.pg.dispatchEvent('.hours input >> nth=0', 'input');
  await B.pg.click('text=＋ 新增項目'); await B.pg.fill('.item-row >> nth=1 >> input >> nth=0', '加班費'); await B.pg.fill('.item-row >> nth=1 >> input >> nth=1', '700'); await B.pg.dispatchEvent('.item-row >> nth=1 >> input >> nth=1', 'input');
  assert.ok((await B.pg.textContent('#s-calc')).includes('27,200'));
  // 常用項目：點「早退（扣）」打正數 → 自動變成扣款；已加入的項目不再出現在按鈕列
  await B.pg.click('#s-presets button:has-text("早退")');
  await B.pg.fill('.item-row >> nth=2 >> input >> nth=1', '300'); await B.pg.dispatchEvent('.item-row >> nth=2 >> input >> nth=1', 'input');
  assert.ok((await B.pg.textContent('#s-calc')).includes('26,900'), await B.pg.textContent('#s-calc'));
  assert.ok(!(await B.pg.textContent('#s-presets')).includes('早退'));
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-payroll.png'), fullPage: true });
  await B.pg.click('.item-row >> nth=2 >> button.danger');
  await B.pg.click('text=儲存這位員工');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.PAYROLL).reduce((a, r) => a + r['金額'], 0), 27200 + 800, '人事頁存的 27,200 ＋ 日結自動記的 PT 800');
  // 其他人：可以改名、分到計時
  B.pg.__ans = '臨時工';
  await B.pg.click('text=＋ 其他人（不在員工名單）');
  assert.ok(await B.pg.isVisible('#s-temp'), '名單外的人要有改名／分組');
  B.pg.__ans = '小王';
  await B.pg.click('#s-temp .rename');
  assert.ok((await B.pg.textContent('#s-name')).includes('小王'), '改名');
  B.pg.__ans = undefined;
  await B.pg.click('#s-temp .seg button:has-text("計時")');
  assert.strictEqual(await B.pg.$$eval('.item-row', r => r.length), 1, '選計時後，空白的「薪資」預設項目拿掉');
  await B.pg.fill('.hours input >> nth=0', '10'); await B.pg.fill('.hours input >> nth=1', '150'); await B.pg.dispatchEvent('.hours input >> nth=1', 'input');
  await B.pg.click('text=儲存這位員工');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  const wang = g.rows(S.PAYROLL).filter(r => r['姓名'] === '小王');
  assert.ok(wang.length === 1 && wang[0]['分組'] === '計時' && wang[0]['金額'] === 1500, '小王存成計時：' + JSON.stringify(wang));
  assert.ok(!g.rows(S.PAYROLL).some(r => r['姓名'] === '臨時工'), '舊名字不留');
  const grpText = await B.pg.$$eval('#s-emps .grp', gs => gs.map(x => x.textContent));
  // 刪除這位：小王這個月的資料拿掉
  await B.pg.click('#s-emps button:has-text("小王")');
  await B.pg.click('#s-temp .del-emp');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.ok(!g.rows(S.PAYROLL).some(r => r['姓名'] === '小王'), '刪除這位');
  assert.ok(!(await B.pg.textContent('#s-emps')).includes('小王'));
  assert.ok(grpText.some(t => t.startsWith('計時') && t.includes('小王')), '小王要在計時組：' + grpText.join(' / '));
  assert.ok(!grpText.some(t => t.startsWith('其他')), '不再有「其他」組');
  assert.ok(grpText.some(t => t.startsWith('計時') && t.includes('PT')), '日結記的 PT 放計時');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-payroll-temp.png'), fullPage: true });
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
  assert.deepStrictEqual(dvr.map(r => r['平台'] + r['期間'] + '=' + r['實際入帳']).sort(), ['Panda上半月=36788', 'Panda下半月=27903', 'Uber整月=15344'], '外送對帳每期一列');
  await B.pg.dispatchEvent('#v-month', 'change');
  assert.strictEqual(await B.pg.inputValue('#dv-Panda tbody tr:nth-child(2) input >> nth=0'), '15588', '重新打開要看到存過的明細');

  // 總覽：年
  await B.pg.click('#tb-overview'); await B.pg.click('#ov-seg button[data-v="year"]'); await B.pg.waitForSelector('#y-body .ytable');
  assert.strictEqual(await B.pg.evaluate(() => document.querySelector('header').getBoundingClientRect().top), 0, '總覽上方不能有白邊');
  const yt = await B.pg.textContent('#y-body');
  assert.ok(yt.includes('2026 全年') && yt.includes('豐吉') && yt.includes('結餘') && yt.includes('上一年盈餘') && yt.includes('人事') && yt.includes('貨款'), '年：要有季合計、全年、股東欄');
  // 年表的表頭複本只黏在自己的表格範圍：捲到下面的「平均細項」時，上面那張表的表頭不能還黏著；兩張表頭要完全重疊
  await B.pg.setViewportSize({ width: 1100, height: 520 });
  const algn = await B.pg.evaluate(() => { const w = document.querySelector('#y-body .tblwrap'); const h = w.querySelector('.xhead').getBoundingClientRect(), t = w.querySelector('thead').getBoundingClientRect(); return Math.abs(h.top - t.top); });
  assert.ok(algn <= 1, '表頭複本要蓋在原本表頭上：差 ' + algn);
  await B.pg.evaluate(() => { const ws = document.querySelectorAll('#y-body .tblwrap'); ws[ws.length - 1].scrollIntoView(); window.scrollBy(0, 120); });
  await B.pg.waitForTimeout(150);
  const stuck = await B.pg.evaluate(() => { const ws = document.querySelectorAll('#y-body .tblwrap'), a = ws[0].querySelector('.xhead').getBoundingClientRect(), b = ws[ws.length - 1].getBoundingClientRect(); return ws.length > 1 && a.bottom > b.top + 2 && a.top < b.bottom; });
  assert.ok(!stuck, '上一張表的表頭不能蓋到下一張表');
  await B.pg.setViewportSize({ width: 1100, height: 1300 });
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
  // 日期／月份置頂：捲到下面時，月份列仍貼在標題列（分頁在標題列裡）下方
  await B.pg.evaluate(() => window.scrollTo(0, 2000)); await B.pg.waitForTimeout(200);
  const pin = await B.pg.evaluate(() => { const b = document.getElementById('pickbar').getBoundingClientRect(), t = document.querySelector('header').getBoundingClientRect(); return [Math.round(b.top), Math.round(t.bottom), !!document.querySelector('#pickbar #m-month')]; });
  assert.ok(pin[2] && Math.abs(pin[0] - pin[1]) <= 1, '月份要置頂：' + pin);
  await B.pg.evaluate(() => window.scrollTo(0, 0));
  // 總覽：月
  await B.pg.click('#ov-seg button[data-v="month"]');
  assert.ok((await B.pg.textContent('#m-body')).includes('可分配給股東'));
  const mb = await B.pg.textContent('#m-body');
  assert.ok(mb.includes('線上支付手續費') && !mb.includes('線上支付手續費（估計）'), '對帳後不再是估計');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-summary.png'), fullPage: true });
  // 店長：看得到總覽、人事、外送對帳、分紅扣除；人事／外送／分紅只能看
  const tabsA = await A.pg.$$eval('#tabs button', bs => bs.map(b => b.textContent));
  assert.deepStrictEqual(tabsA, ['每日結帳', '進貨', '固定/其他支出', '總覽', '人事', '外送對帳', '分紅扣除', '借還款', '裝置'], '店長的分頁');
  await A.pg.click('#tb-payroll'); await A.pg.waitForTimeout(200);
  assert.ok(await A.pg.isVisible('#tab-payroll .ro-note'), '店長在人事頁看到「只能看」');
  assert.ok(!(await A.pg.isVisible('#tab-payroll button.ghost')), '店長看不到新增按鈕');
  await A.pg.click('#tb-expense'); await A.pg.waitForTimeout(200);
  assert.ok(!(await A.pg.isVisible('#tab-expense .ro-note')) && await A.pg.isVisible('#tab-expense .primary'), '固定／其他支出店長可以新增');
  await A.pg.click('#tb-daily');
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
  assert.ok(!(await A.pg.isVisible('#set-presets-card')) && !(await A.pg.isVisible('#set-def-card')), '店長看不到常用項目設定、預設');

  // 管理切換到中正店：資料分開，再切回大埔店資料還在
  await B.pg.selectOption('#storeSel', '中正店'); await B.pg.waitForFunction(() => ST.sess.store === '中正店' && ST.snap);
  await B.pg.click('#tb-purchase'); await B.pg.fill('#p-date', '2026-11-01'); await B.pg.dispatchEvent('#p-date', 'change');
  assert.ok((await B.pg.textContent('#p-list')).includes('還沒有進貨紀錄'), '中正店看不到大埔店的進貨');
  await B.pg.selectOption('#storeSel', '大埔店'); await B.pg.waitForFunction(() => ST.sess.store === '大埔店');
  await B.pg.click('#tb-purchase'); await B.pg.fill('#p-date', '2026-11-01'); await B.pg.dispatchEvent('#p-date', 'change');
  assert.ok(!(await B.pg.textContent('#p-list')).includes('還沒有進貨紀錄'), '切回大埔店資料還在');
  // 快速切換店別：大埔店記一筆、同步還沒回來就切到中正店 → 中正店不能出現大埔店的資料，那筆只上傳一次
  const dp0 = g.rows(S.PURCHASE).filter(r => r['店別'] === '大埔店').length;
  B.ctx.__delay = 1200;
  await B.pg.click('#p-cats button:has-text("麵")'); await B.pg.fill('#p-amount', '777'); await B.pg.click('text=新增這筆');
  await B.pg.selectOption('#storeSel', '中正店'); await B.pg.waitForFunction(() => ST.sess.store === '中正店');
  await B.pg.selectOption('#storeSel', '大埔店'); await B.pg.waitForFunction(() => ST.sess.store === '大埔店');
  await B.pg.selectOption('#storeSel', '中正店'); await B.pg.waitForFunction(() => ST.sess.store === '中正店');
  await B.pg.waitForTimeout(4000); B.ctx.__delay = 0;
  await B.pg.waitForFunction(() => !ST.syncing && ST.outbox.length === 0, null, { timeout: 8000 });
  await B.pg.click('#tb-purchase'); await B.pg.fill('#p-date', '2026-11-01'); await B.pg.dispatchEvent('#p-date', 'change');
  assert.ok((await B.pg.textContent('#p-list')).includes('還沒有進貨紀錄'), '快速切換後，中正店不能出現大埔店的進貨');
  assert.ok(await B.pg.evaluate(() => ST.snap.config.store.name === '中正店'), '中正店的畫面要是中正店的資料');
  assert.strictEqual(g.rows(S.PURCHASE).filter(r => r['店別'] === '大埔店').length, dp0 + 1, '那筆只上傳一次');
  await B.pg.selectOption('#storeSel', '大埔店'); await B.pg.waitForFunction(() => ST.sess.store === '大埔店');
  await B.pg.waitForFunction(() => ST.outbox.length === 0 && ST.snap.config.store.name === '大埔店', null, { timeout: 8000 });
  assert.ok((await B.pg.textContent('#p-list')).includes('777'), '切回大埔店看得到剛剛那筆');
  // 更改 PIN（規則要符合）
  await B.pg.click('#tb-settings'); await B.pg.fill('#cp-old', 'Nina#2026x'); await B.pg.fill('#cp-new', 'Nina#2027y'); await B.pg.fill('#cp-new2', 'Nina#2027y');
  await B.pg.click('#set-pin-card .primary'); await B.pg.waitForFunction(() => /PIN 已更改/.test(document.getElementById('toast').textContent));
  // 常用項目設定：換店別後要顯示那家店的清單，分類不認得時照原本顯示
  await B.pg.click('#tb-settings');
  const peA = await B.pg.$$eval('#pe-list .pe-row > input', i => i.map(x => x.value));
  await B.pg.selectOption('#storeSel', '中正店'); await B.pg.waitForFunction(() => ST.sess.store === '中正店' && ST.snap);
  await B.pg.click('#tb-settings');
  const peB = await B.pg.evaluate(() => presetsFor('每日結帳').map(p => p.name));
  assert.deepStrictEqual(await B.pg.$$eval('#pe-list .pe-row > input', i => i.map(x => x.value)), peB, '換店後常用項目要是中正店的：' + peA);
  await B.pg.selectOption('#storeSel', '大埔店'); await B.pg.waitForFunction(() => ST.sess.store === '大埔店');
  console.log('帳號登入、切店、改 PIN ✓');
  // 裝置：管理可以改員工名單、進貨分類；字體大小併進「這台裝置」，卡片順序：常用項目 → 員工 → 分類
  await B.pg.click('#tb-settings');
  assert.deepStrictEqual(await B.pg.$$eval('#tab-settings > .card:not(.hide) h2', h => h.map(x => x.textContent)).then(x => x.slice(0, 4)), ['這台裝置', '常用項目設定', '預設', '更改 PIN']);
  assert.deepStrictEqual(await B.pg.$$eval('#pe-uses button', b => b.map(x => x.textContent)), ['每日結帳・支出明細', '固定／其他支出', '人事']);
  assert.deepStrictEqual(await B.pg.$$eval('#def-tabs button', b => b.map(x => x.textContent)), ['店家', '員工名單', '股東', '進貨分類']);
  await B.pg.click('#def-tabs button:has-text("員工名單")');
  await B.pg.click('text=＋ 新增員工');
  await B.pg.fill('.ee-item.open .ee-body > label input', '阿寶');
  await B.pg.fill('.ee-nums label:has-text("月薪") input', '45000');
  await B.pg.click('#ee-save');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.ok(g.rows(S.EMP).some(r => r['姓名'] === '阿寶' && r['店別'] === '大埔店' && r['月薪'] === 45000 && r['在職(是/否)'] === '是'), '員工存到試算表');
  await B.pg.click('#tb-payroll');
  assert.ok((await B.pg.textContent('#s-roster')).includes('＋阿寶'), '人事頁馬上有阿寶');
  await B.pg.click('#tb-settings');
  await B.pg.click('#def-tabs button:has-text("進貨分類")');
  await B.pg.click('text=＋ 新增分類');
  await B.pg.fill('.ce-row:last-child input >> nth=0', '飲料');
  await B.pg.click('#ce-save');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.ok(g.rows(S.CAT).some(r => r['分類'] === '飲料' && r['店別(全部/店名)'] === '大埔店'), '分類存到試算表');
  assert.ok(g.rows(S.CAT).some(r => r['店別(全部/店名)'] === '中正店'), '中正店的分類保留');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-settings.png'), fullPage: true });
  await B.pg.click('#tb-purchase');
  assert.ok((await B.pg.textContent('#p-cats')).includes('飲料'), '進貨頁馬上有新分類');
  // 股東：比例改成 50/30/20 存回試算表
  await B.pg.click('#tb-settings'); await B.pg.click('#def-tabs button:has-text("股東")');
  assert.deepStrictEqual(await B.pg.$$eval('#pp-list .pp-row > input', i => i.map(x => x.value)), ['豐吉', '浩勤', '呀肥']);
  await B.pg.fill('#pp-list .pp-row >> nth=0 >> .pp-pct input', '50'); await B.pg.fill('#pp-list .pp-row >> nth=1 >> .pp-pct input', '30');
  assert.ok((await B.pg.textContent('#pp-sum')).includes('100%'));
  await B.pg.click('#pp-save');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.deepStrictEqual(g.rows(S.PARTNER).filter(r => r['店別'] === '大埔店').map(r => r['股東'] + r['比例(%)']), ['豐吉50', '浩勤30', '呀肥20']);
  assert.ok(g.rows(S.PARTNER).some(r => r['店別'] === '中正店'), '中正店股東不受影響');
  // 店家：警示門檻存回設定_店家
  await B.pg.click('#def-tabs button:has-text("店家")');
  await B.pg.fill('#sp-warn', '800'); await B.pg.click('text=儲存店家設定');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.STORE).find(r => r['店別'] === '大埔店')['現金差額警示門檻'], 800, '店家設定存到試算表');
  console.log('裝置：員工名單、進貨分類 ✓');
  // 員工借還款：借出 5 萬、還 2 萬 → 欠 3 萬；年總覽多「借還款」欄，結餘扣 3 萬
  await B.pg.click('#tb-loan');
  await B.pg.fill('#xl-month', '2026-10'); await B.pg.fill('#xl-who', '建燁'); await B.pg.fill('#xl-amount', '50000'); await B.pg.fill('#xl-note', '9月借');
  await B.pg.click('#xl-btn');
  await B.pg.click('#xl-kind button:has-text("還款")');
  assert.ok((await B.pg.textContent('#xl-chips')).includes('建燁'), '還款時列出還有欠錢的人');
  await B.pg.click('#xl-chips button:has-text("建燁")'); await B.pg.fill('#xl-amount', '20000'); await B.pg.click('#xl-btn');
  assert.ok((await B.pg.textContent('#xl-sum')).includes('30,000'), '欠款要算出 30,000：' + await B.pg.textContent('#xl-sum'));
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.ok(g.rows(S.DEDUCT).some(r => r['類型'] === '員工借款' && r['備註'] === '建燁（9月借）' && r['金額'] === 50000), '借款存到試算表');
  await B.pg.click('#tb-overview'); await B.pg.click('#ov-seg button[data-v="year"]'); await B.pg.waitForSelector('#y-body .ytable');
  const heads = await B.pg.$$eval('#y-body table.ytable thead th', t => t.map(x => x.textContent));
  assert.ok(!heads.includes('借還款'), '借還款不放總覽');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-loan-year.png'), fullPage: true });
  await B.pg.click('#tb-loan');
  assert.ok((await B.pg.textContent('#xl-list')).includes('建燁（9月借）'), '借還款分頁有每一筆紀錄');
  assert.ok((await B.pg.textContent('#xl-years')).includes('30,000'), '每年年底還沒收回：建燁 30,000');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-loan.png'), fullPage: true });
  console.log('員工借還款 ✓');
  // 記錄股東分紅：選股東自動照比例算金額
  await B.pg.click('#tb-deduct'); await B.pg.fill('#xs-month', '2026-11'); await B.pg.dispatchEvent('#xs-month', 'change');
  assert.strictEqual(await B.pg.$$eval('#xp-rows .wc', c => c.length), 3, '預設選三位股東');
  assert.ok((await B.pg.textContent('#xp-rows')).includes('50%'), '要有比例');
  await B.pg.click('#xp-chips button:has-text("呀肥")');   // 取消呀肥
  assert.strictEqual(await B.pg.$$eval('#xp-rows .wc', c => c.length), 2);
  assert.ok(/記錄 2 筆分紅/.test(await B.pg.textContent('#xp-btn')));
  await B.pg.setViewportSize({ width: 390, height: 844 }); await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-xp-sel.png') }); await B.pg.setViewportSize({ width: 1100, height: 1300 });
  // 備用基金：留 10,000，豐吉（50%）少 5,000
  const fengA = Number(await B.pg.inputValue('#xp-rows .wc[data-name="豐吉"] .card-amt'));
  await B.pg.fill('#xp-range .xp-amt input', '10000'); await B.pg.dispatchEvent('#xp-range .xp-amt input', 'change');
  await B.pg.waitForTimeout(500);
  const fengB = Number(await B.pg.inputValue('#xp-rows .wc[data-name="豐吉"] .card-amt'));
  assert.strictEqual(fengA - fengB, 5000, '留備用基金 10,000，豐吉 50% 要少 5,000：' + fengA + '→' + fengB);
  assert.ok((await B.pg.textContent('#xp-range')).includes('這次可以分'), '要顯示這次可以分多少');
  await B.pg.fill('#xp-range .xp-amt input', ''); await B.pg.dispatchEvent('#xp-range .xp-amt input', 'change'); await B.pg.waitForTimeout(500);
  const before = g.rows(S.DEDUCT).filter(r => r['類型'] === '股東分紅（已發）').length;
  await B.pg.click('#xp-btn');
  await B.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.DEDUCT).filter(r => r['類型'] === '股東分紅（已發）').length, before + 2, '一次記兩筆');
  assert.ok((await B.pg.textContent('#xp-done')).includes('豐吉'), '看得到這個月發給誰');
  assert.strictEqual(await B.pg.$$eval('#xp-chips .who.done', c => c.length), 2, '已發的變綠色');
  await B.pg.setViewportSize({ width: 390, height: 844 });
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-deduct-phone.png'), fullPage: true });
  assert.ok(await B.pg.evaluate(() => document.documentElement.scrollWidth <= 392), '手機上不能左右超出畫面');
  await B.pg.setViewportSize({ width: 1100, height: 1300 });
  // 平板／電腦：人事員工名字黏在月份列下面，不能疊在一起
  await B.pg.click('#tb-payroll'); await B.pg.click('#s-emps button >> nth=0');
  await B.pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await B.pg.waitForTimeout(200);
  const ov = await B.pg.evaluate(() => { const a = document.getElementById('pickbar').getBoundingClientRect(), b = document.getElementById('s-name').getBoundingClientRect(); return [a.bottom, b.top]; });
  assert.ok(ov[1] >= ov[0] - 1, '員工名字不能被月份列蓋住：' + ov);
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-pay-sticky.png') });
  // 歷年：一年一列，最後一欄當年盈餘＝年總覽卡片
  await B.pg.click('#tb-overview'); await B.pg.click('#ov-seg button[data-v="all"]'); await B.pg.waitForSelector('#y-body table.ytable');
  const allHead = await B.pg.$$eval('#y-body table.ytable thead th', t => t.map(x => x.textContent));
  assert.ok(allHead[0] === '項目' && allHead.some(x => x.startsWith('2026')) && allHead.includes('全部'), '歷年：年份放欄：' + allHead);
  const allRows = await B.pg.$$eval('#y-body table.ytable tbody th', t => t.map(x => x.textContent));
  assert.ok(allRows.includes('當年盈餘') && allRows.includes('借出−還款'), '歷年列：' + allRows);
  assert.ok((await B.pg.textContent('#y-body .kpis')).includes('累積盈餘'), '歷年要有卡片');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-allyears.png') });
  await B.pg.click('#ov-seg button[data-v="month"]');
  // 記錄分紅／分配前扣除在同一張卡片，用分頁切換
  await B.pg.click('#tb-deduct');
  assert.ok(await B.pg.isVisible('#xpane-pay') && await B.pg.isHidden('#xpane-ded'));
  await B.pg.click('#x-tabs button[data-v="ded"]');
  assert.ok(await B.pg.isVisible('#xpane-ded') && await B.pg.isHidden('#xpane-pay'), '切到分配前扣除');
  await B.pg.click('#x-tabs button[data-v="pay"]');
  console.log('股東分紅自動算 ✓');

  // 手機：下方分頁列、「更多」、右下角亮／暗切換
  await B.pg.setViewportSize({ width: 390, height: 844 });
  assert.ok(await B.pg.isVisible('#bottombar') && !(await B.pg.isVisible('#tabs')), '手機要用下方分頁列');
  assert.deepStrictEqual(await B.pg.$$eval('#tabs button', bs => bs.map(b => b.textContent)),
    ['每日結帳', '進貨', '固定/其他支出', '總覽', '人事', '外送對帳', '分紅扣除', '借還款', '裝置'], '分頁順序');
  assert.deepStrictEqual(await B.pg.$$eval('#bottombar button', bs => bs.map(b => b.textContent)), ['結帳', '進貨', '支出', '總覽', '更多']);
  assert.deepStrictEqual(await B.pg.$$eval('#moregrid button', bs => bs.map(b => b.textContent)), ['人事', '外送對帳', '分紅扣除', '借還款', '裝置']);
  await B.pg.click('#bb-more'); await B.pg.click('#moregrid button:has-text("人事")');
  assert.ok(await B.pg.isVisible('#tab-payroll') && (await B.pg.getAttribute('#bb-more', 'class')).includes('on'));
  await B.pg.click('#bb-daily');
  const t0 = await B.pg.getAttribute('html', 'data-theme'); assert.ok(t0 === 'light' || t0 === 'dark', '一開始照裝置決定亮或暗');
  await B.pg.click('#themeBtn'); const t1 = await B.pg.getAttribute('html', 'data-theme'); assert.ok(t1 !== t0 && (t1 === 'light' || t1 === 'dark'));
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-phone-dark.png'), fullPage: true });
  await B.pg.click('#themeBtn'); assert.strictEqual(await B.pg.getAttribute('html', 'data-theme'), t0, '只在亮色／暗色之間切換，沒有自動');
  await B.pg.click('#bb-more'); await B.pg.click('#moregrid button:has-text("裝置")');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-phone-settings.png'), fullPage: true });
  await B.pg.click('#bb-daily');
  // 手機：裝置頁的常用項目（人事）、進貨分類不能跑版
  await B.pg.click('#bb-more'); await B.pg.click('#moregrid button:has-text("裝置")');
  await B.pg.click('#pe-uses button:has-text("人事")');
  const peTops = await B.pg.$$eval('#pe-list .pe-row.pay', rs => rs.slice(0, 3).map(r => { const k = [...r.children].map(c => Math.round(c.getBoundingClientRect().top)); return Math.max(...k) - Math.min(...k); }));
  assert.ok(peTops.every(d => d < 12), '人事常用項目每項要在同一行：' + peTops);
  await B.pg.click('#def-tabs button:has-text("進貨分類")');
  await B.pg.evaluate(() => { ST.ce.items[0].to = '2026-11'; renderCatEditor(); });
  const ceOver = await B.pg.$$eval('#ce-list .ce-row', rs => rs.some(r => [...r.children].some((c, i, a) => i && c.getBoundingClientRect().left < a[i - 1].getBoundingClientRect().right - 1)));
  assert.ok(!ceOver, '進貨分類有停用月份時不能重疊');
  await B.pg.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-phone-settings2.png'), fullPage: true });
  await B.pg.evaluate(() => { ST.ce = null; ST.pe = null; });
  await B.pg.click('#bb-daily');
  console.log('手機分頁列 + 亮暗切換 ✓');
  // 登出時沒上傳的資料要保留：離線記一筆 → 登出 → 登入畫面提醒 → 同帳號再登入自動上傳
  const n0 = g.rows(S.PURCHASE).length;
  await A.ctx.setOffline(true);
  await A.pg.click('#tb-purchase'); await A.pg.fill('#p-date', '2026-11-03'); await A.pg.dispatchEvent('#p-date', 'change');
  await A.pg.click('#p-cats button:has-text("麵")'); await A.pg.fill('#p-amount', '321'); await A.pg.click('text=新增這筆');
  await A.pg.click('#tb-settings'); await A.pg.click('text=登出（沒上傳的資料會保留）');
  await A.pg.waitForSelector('#v-login:not(.hide)');
  assert.ok((await A.pg.textContent('#login-left')).includes('大埔平板 1 筆'), '登入畫面要提醒：' + await A.pg.textContent('#login-left'));
  await A.ctx.setOffline(false);
  await A.pg.fill('#login-acc', '大埔平板'); await A.pg.fill('#login-pin', 'Shop#2026a'); await A.pg.click('#v-login .primary');
  await A.pg.waitForSelector('#v-app:not(.hide)');
  await A.pg.waitForFunction(() => /已同步/.test(document.getElementById('sync').textContent), null, { timeout: 8000 });
  assert.strictEqual(g.rows(S.PURCHASE).length, n0 + 1, '再登入後上傳');
  assert.ok(g.rows(S.PURCHASE).some(r => r['金額'] === 321));
  console.log('登出保留沒上傳的資料 ✓');
  await b.close(); srv.close();
  console.log('E2E 全部通過 ✓');
})().catch(e => { console.error(e); process.exit(1); });
