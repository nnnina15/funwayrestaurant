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

// 猜錯 5 次鎖定，連正確 PIN 也暫時不能登入
for (let i = 0; i < 5; i++) assert.strictEqual(g.post({ action: 'login', store: '中正店', pin: '000' + i }).ok, false);
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

console.log('同步服務測試通過 ✓');
