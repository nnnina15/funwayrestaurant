// 模擬「① 初始化（欄位重排）→ ④ 清除舊表匯入 → ③ 匯入」：node fengwei-app/tests/reimport.test.js <匯入檔轉成的 sheet.json>
const assert = require('assert');
const { createGas } = require('./gas-mock.js');
const data = require(process.argv[2] || './sheet.json');
const g = createGas(); const S = g.ctx.__S;
// 模擬你現在的試算表：設定_店家還是舊格式（有 PIN 欄），而且已經匯入過一次舊資料、App 也記過一筆
g.sheets['設定_店家'].cells = [['店別', '店長PIN', '管理PIN', '手續費率(%)', '現金差額計入盈餘(是/否)', '現金差額警示門檻'], ['大埔店', '1234', '9999', 2.5, '否', 300], ['中正店', '1234', '9999', 2, '否', 500]];
g.addOther('X'.repeat(30), data); g.ctx.importFrom_(g.ctx.SpreadsheetApp.openById('X'.repeat(30)));
g.sheets['進貨'].cells.push(['Dapp1', '2026-11-02 20:00:00', '2026-11-02', '大埔店', '米', 900, '', 'Nina手機']);
// 外送對帳還是舊格式（明細擠在一格文字）
g.sheets['外送對帳'].cells = [['輸入時間', '月份', '店別', '平台', '實際入帳', '備註', '裝置', '明細'],
  ['2026-09-30 23:59:00', '2026-09', '大埔店', 'Panda', 64691, '舊表匯入', '舊表匯入', '9/1-9/15：明細 55672、佣金 -15588、月費 -3296｜9/16-9/30：明細 39182、佣金 -10964、月費 -315'],
  ['2026-11-02 10:00:00', '2026-10', '大埔店', 'Uber', 15000, '', 'Nina手機', '']];
// ① 初始化：照欄名重排
g.ctx.setup();
const st = g.rows('設定_店家');
assert.deepStrictEqual(g.sheets['設定_店家'].cells[0], ['店別', '手續費率(%)', '現金差額計入盈餘(是/否)', '現金差額警示門檻'], 'PIN 欄要移除');
assert.strictEqual(st[0]['手續費率(%)'], 2.5); assert.strictEqual(st[0]['現金差額警示門檻'], 300, '資料要跟著欄名搬，不能錯位');
const dvr = g.rows('外送對帳');
assert.deepStrictEqual(dvr.map(r => [r['月份'], r['平台'], r['期間'], r['費用明細(訂單金額)'], r['佣金'], r['月費'], r['實際入帳']]),
  [['2026-09', 'Panda', '9/1-9/15', 55672, -15588, -3296, 36788], ['2026-09', 'Panda', '9/16-9/30', 39182, -10964, -315, 27903], ['2026-10', 'Uber', '', '', '', '', 15000]],
  '舊的明細文字要拆成每期一列、每項一欄');
// ④ 清除舊表匯入 → ③ 匯入新檔
console.log(g.ctx.clearImported_());
assert.strictEqual(g.rows('進貨').length, 1, '只剩 App 記的那筆');
console.log(g.ctx.importFrom_(g.ctx.SpreadsheetApp.openById('X'.repeat(30))).replace(/\n/g, '；'));
assert.strictEqual(g.rows('進貨').length, 1569);
assert.strictEqual(g.rows('外送對帳').filter(r => r['裝置'] === 'Nina手機').length, 1, 'App 輸入的外送對帳要留著');
g.ctx.buildReports();
const sep = g.rows('報表_月結').find(r => r['月份'] === '2026-09');
console.log('9 月：Panda入帳', sep['Panda入帳'], 'Uber入帳', sep['Uber入帳'], '手續費', sep['線上手續費'], '估計?', sep['手續費是估計'], '盈餘', sep['盈餘']);
// App 讀得到外送明細
g.sheets['設定_帳號'].cells[1][4] = 'Funway#2026';
const a = g.post({ action: 'login', account: '管理員', pin: 'Funway#2026', newPin: 'Admin#2026x' });
const pd = a.data.delivery.find(x => x.month === '2026-09' && x.platform === 'Panda');
assert.deepStrictEqual(pd.periods.map(p => p.label), ['9/1-9/15', '9/16-9/30']); assert.strictEqual(pd.periods[0].gross, 55672);
const feb = a.data.delivery.find(x => x.month === '2026-02' && x.platform === 'Panda');
assert.strictEqual(feb.periods.length, 2, '2 月 Panda 兩期（上半月空的）');
console.log('全部檢查通過 ✓');
