// 測試同步服務：node fengwei-app/tests/server.test.js
const assert = require('assert');
const { createGas } = require('./gas-mock');
const { computeAll_, applyOp_ } = require('../../docs/compute.js');

const g = createGas();
const S = g.ctx.__S;

// 登入
assert.strictEqual(g.post({ action: 'login', store: '大埔店', pin: '0000' }).ok, false);
const mgr = g.post({ action: 'login', store: '大埔店', pin: '1234' });
const adm = g.post({ action: 'login', store: '大埔店', pin: '9999' });
assert.strictEqual(mgr.role, 'manager');
assert.strictEqual(adm.role, 'admin');
assert.ok(!mgr.config.categories.some(c => c.cat === '牛亨' && !c.to), '牛亨要有停用月份');
assert.strictEqual(adm.config.partners.length, 3);
assert.strictEqual(mgr.config.partners.length, 0, '店長看不到股東資料');

const op = (type, data) => ({ id: Math.random().toString(36).slice(2), type, data });

// 店長：每日結帳 + 進貨
let r = g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [
  op('daily.upsert', { date: '2026-10-01', site: 31455, panda: 4974, uber: 555, allpay: 80, line: 1260, spend: 6510, cash: 23605, editedAt: '2026-10-01 21:00:00', device: '平板A' }),
  op('purchase.add', { id: 'p1', date: '2026-10-01', cat: '麵', amount: 1080, editedAt: '2026-10-01 21:01:00', device: '平板A' }),
  op('payroll.upsert', { month: '2026-10', name: 'X', items: [], editedAt: '2026-10-01 21:00:00' })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'ok', 'error'], '店長不能改人事');
r = g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [
  op('expense.add', { id: 'E20261001abc', month: '2026-10', type: '其他', item: '燉滷', amount: 500 }),
  op('expense.add', { id: 'x1', month: '2026-10', type: '固定', item: '房租', amount: 1 })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'error'], '店長只能記結帳單產生的其他支出');
g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [op('expense.del', { id: 'E20261001abc' })] });
assert.strictEqual(g.rows(S.DAILY)[0]['應有現金'], 23605);
assert.strictEqual(g.rows(S.DAILY)[0]['現金差額'], 0);

// 重送同一批（網路斷在回應途中）→ 不會重複
r = g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [
  op('purchase.add', { id: 'p1', date: '2026-10-01', cat: '麵', amount: 1080, editedAt: '2026-10-01 21:01:00' })
]});
assert.strictEqual(r.results[0].status, 'dup');
assert.strictEqual(g.rows(S.PURCHASE).length, 1);

// 兩台裝置改同一天：以較新的為準
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [
  op('daily.upsert', { date: '2026-10-01', site: 30000, cash: 30000, editedAt: '2026-10-01 22:00:00', device: '手機B' })
]});
assert.strictEqual(r.results[0].status, 'ok');
r = g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [
  op('daily.upsert', { date: '2026-10-01', site: 99999, editedAt: '2026-10-01 21:30:00', device: '平板A(離線很久)' })
]});
assert.strictEqual(r.results[0].status, 'stale');
assert.strictEqual(g.rows(S.DAILY).length, 1);
assert.strictEqual(g.rows(S.DAILY)[0]['現場'], 30000);

// 管理：人事（自訂項目）、外送、支出、扣除
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [
  op('payroll.upsert', { month: '2026-10', name: '鴻', items: [
    { item: '時薪', hours: 106, rate: 240, kind: '薪資' }, { item: '加班費', amount: 700, kind: '薪資' },
    { item: '勞退(公司)', amount: 1770, kind: '公司負擔' }, { item: '已預支', amount: -5000, kind: '預支' }], editedAt: '2026-11-01 10:00:00' }),
  op('delivery.upsert', { month: '2026-10', platform: 'Panda', amount: 64000, editedAt: '2026-11-01 10:00:00' }),
  op('expense.add', { id: 'e1', month: '2026-10', type: '固定', item: '房租', amount: 32000 }),
  op('deduct.add', { id: 'x1', month: '2026-10', type: '員工分紅', amount: 12500 }),
  op('purchase.del', { id: 'p1' })
]});
assert.ok(r.results.every(x => x.status === 'ok'), JSON.stringify(r.results));
assert.strictEqual(g.rows(S.PAYROLL).find(x => x['項目'] === '時薪')['金額'], 25440);
assert.strictEqual(g.rows(S.PURCHASE).length, 0);
assert.strictEqual(r.data.payroll.length, 4);

// 報表有產生，伺服器和 App 算出來一樣
const rep = g.rows(S.R_MONTH).find(x => x['月份'] === '2026-10');
assert.ok(rep, '報表_月結 要有 10 月');
const C = r.config, emps = { '大埔店': C.employees.map(e => e.name) };
const local = computeAll_({ stores: [C.store], partners: C.partners, employees: emps, ...r.data }, '2026-11-02');
assert.strictEqual(local.months.find(m => m.month === '2026-10').dist, rep['可分配']);
assert.ok(g.rows(S.R_SHARE).some(x => x['股東'] === '豐吉' && x['比例(%)'] === 60));

// 試算表把輸入時間自動轉成日期時，「以較新為準」仍要正確
g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [op('daily.upsert', { date: '2026-09-20', site: 100, editedAt: '2026-09-20 22:00:00' })] });
const di = g.sheets[S.DAILY].cells.findIndex(c => c[1] === '2026-09-20');
g.sheets[S.DAILY].cells[di][0] = new Date('2026-09-20T14:00:00Z');   // 試算表自動轉成日期（= 台北 22:00）
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [
  op('daily.upsert', { date: '2026-09-20', site: 200, editedAt: '2026-11-02 09:00:00' }),
  op('daily.upsert', { date: '2026-09-20', site: 999, editedAt: '2026-09-20 21:00:00' })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'stale'], '日期格式的舊紀錄要能正確比較新舊');
assert.strictEqual(g.rows(S.DAILY).find(x => x['日期'] === '2026-09-20')['現場'], 200);

// 每日結帳的支出明細：存成好讀的文字，讀回來一樣
const lines = [{ name: '燉滷', amount: 500, cash: true, cat: '' }, { name: '米', amount: 3516, cash: false, cat: '米', pid: 'D20261026ab' },
  { name: 'PT', amount: 800, cash: true, cat: '' }];
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [op('daily.upsert', { date: '2026-10-26', site: 29125, allpay: 575, line: 3713, spend: 1300, cash: 23537, lines, editedAt: '2026-11-02 10:00:00' })] });
const row26 = g.rows(S.DAILY).find(x => x['日期'] === '2026-10-26');
assert.strictEqual(row26['支出明細'], '燉滷 500｜米 3516（記帳→米#D20261026ab）｜PT 800');
assert.strictEqual(row26['應有現金'], 29125 - 575 - 3713 - 1300);
assert.deepStrictEqual(r.data.daily.find(x => x.date === '2026-10-26').lines, lines);

// 常用項目：預設有資料；管理可以改（只改這家店），店長不行
assert.ok(adm.data.presets.some(x => x.use === '每日結帳' && x.name === 'PT' && x.cat === '薪資／預支' && x.store === '全部'));
r = g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [op('presets.set', { use: '每日結帳', items: [{ name: 'X', cat: '米' }] })] });
assert.strictEqual(r.results[0].status, 'error', '店長不能改常用項目');
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [op('presets.set', { use: '每日結帳', items: [{ name: '豬肉', cat: '豬肉攤' }, { name: '米', cat: '米' }] })] });
assert.strictEqual(r.results[0].status, 'ok');
assert.deepStrictEqual(r.data.presets.filter(x => x.use === '每日結帳' && x.store === '大埔店').map(x => x.name), ['豬肉', '米']);
const zz = g.post({ action: 'login', store: '中正店', pin: '9999' });
assert.ok(!zz.data.presets.some(x => x.store === '大埔店'), '中正店看不到大埔店自己的設定');

// 外送對帳明細：照平台對帳單的項目，存成好讀的文字，讀回來一樣
const periods = [{ label: '9/1-9/15', gross: 55672, commission: -15588, monthly: -3296 }, { label: '9/16-9/30', gross: 39182, commission: -10964, monthly: -315 }];
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [op('delivery.upsert', { month: '2026-09', platform: 'Panda', amount: 64691, periods, editedAt: '2026-11-02 12:00:00' })] });
const dv = g.rows(S.DELIVERY).find(x => x['月份'] === '2026-09' && x['平台'] === 'Panda');
assert.strictEqual(dv['明細'], '9/1-9/15：明細 55672、佣金 -15588、月費 -3296｜9/16-9/30：明細 39182、佣金 -10964、月費 -315');
assert.deepStrictEqual(r.data.delivery.find(x => x.month === '2026-09' && x.platform === 'Panda').periods, periods);

// 猜錯 5 次鎖定，連正確 PIN 也暫時不能登入
for (let i = 0; i < 5; i++) assert.strictEqual(g.post({ action: 'login', store: '中正店', pin: '000' + i }).ok, false);
assert.strictEqual(g.mails.length, 1, '第 5 次錯要寄一封信');
assert.strictEqual(g.mails[0].to, 'owner@example.com');
assert.ok(g.mails[0].subject.includes('中正店'));
g.post({ action: 'login', store: '中正店', pin: '0009', device: '陌生裝置' });
assert.strictEqual(g.mails.length, 1, '鎖定期間不要重複寄信');
const locked = g.post({ action: 'login', store: '中正店', pin: '9999' });
assert.strictEqual(locked.ok, false); assert.ok(locked.error.includes('鎖定'));
assert.strictEqual(g.post({ action: 'login', store: '大埔店', pin: '9999' }).ok, true, '別家店不受影響');

// 改 PIN → 舊權杖失效
g.sheets[S.STORE].cells[1][1] = '5678';
r = g.post({ action: 'sync', store: '大埔店', token: mgr.token, ops: [] });
assert.strictEqual(r.ok, false); assert.strictEqual(r.auth, true);
r = g.post({ action: 'sync', store: '大埔店', token: adm.token, ops: [] });
assert.strictEqual(r.ok, true, '管理 PIN 沒改，管理權杖還能用');

// App 端套用操作的結果要和伺服器一致
const st = { daily: [], purchase: [], expense: [], payroll: [], delivery: [], deduct: [] };
applyOp_(st, { type: 'purchase.add', data: { id: 'a', date: '2026-11-01', cat: '米', amount: 900 } }, '大埔店');
applyOp_(st, { type: 'purchase.add', data: { id: 'b', date: '2026-11-01', cat: '麵', amount: 240 } }, '大埔店');
applyOp_(st, { type: 'purchase.del', data: { id: 'a' } }, '大埔店');
applyOp_(st, { type: 'payroll.upsert', data: { month: '2026-11', name: 'A', items: [{ item: '月薪', amount: 1, kind: '薪資' }] } }, '大埔店');
applyOp_(st, { type: 'payroll.upsert', data: { month: '2026-11', name: 'A', items: [{ item: '月薪', amount: 2, kind: '薪資' }] } }, '大埔店');
assert.deepStrictEqual(st.purchase.map(x => x.id), ['b']);
assert.deepStrictEqual(st.payroll.map(x => x.amount), [2]);

// 匯入舊資料：不重複、不覆蓋、範例員工會移除
g.addOther('I'.repeat(30), {
  '設定_員工': [['店別', '姓名', '類型(正職/計時)', '月薪', '時薪', '員工自付健保', '員工自付勞保', '公司勞退', '公司健保', '公司勞保', '在職(是/否)'], ['大埔店', '甲', '正職', 40000, '', '', '', '', '', '', '是']],
  '進貨': [['編號', '輸入時間', '日期', '店別', '分類', '金額', '備註', '裝置'], ['old1', '2026-11-02 00:00:00', '2026-09-01', '大埔店', '米', 900, '', '舊表匯入'], ['old2', '2026-11-02 00:00:00', '2026-09-02', '大埔店', '麵', 240, '', '舊表匯入']],
  '每日營收': [['輸入時間', '日期', '店別', '公休', '現場', 'Panda', 'Uber', '全支付', 'LINE Pay', '現場支出', '點收現金', '應有現金', '現金差額', '備註', '裝置'],
    ['2026-11-02 00:00:00', '2026-10-01', '大埔店', '', 1, 0, 0, 0, 0, 0, 1, 1, 0, '', '舊表匯入'], ['2026-11-02 00:00:00', '2026-09-30', '大埔店', '是', 0, 0, 0, 0, 0, 0, 0, 0, 0, '', '舊表匯入']]
});
let im = g.ctx.importFrom_(g.ctx.SpreadsheetApp.openById('I'.repeat(30)));
assert.ok(im.includes('進貨：新增 2 筆') && im.includes('每日營收：新增 1 筆（已存在略過 1 筆）'), im);
assert.strictEqual(g.rows(S.DAILY).find(r => r['日期'] === '2026-10-01')['現場'], 30000, '已存在的不能被蓋掉');
assert.ok(!g.rows(S.EMP).some(r => String(r['姓名']).includes('範例')));
im = g.ctx.importFrom_(g.ctx.SpreadsheetApp.openById('I'.repeat(30)));
assert.ok(!/新增 [1-9]/.test(im), '第二次匯入不該新增');

console.log('同步服務測試通過 ✓');
