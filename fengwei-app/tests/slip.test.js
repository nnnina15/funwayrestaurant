// 每日結帳的 PT 薪資／預支 → 自動記到人事（店長也能存；改了、刪了會跟著變；不會動到其他人事項目）
const assert = require('assert');
const { createGas } = require('./gas-mock.js');
const g = createGas(); g.ctx.setup();
g.sheets['設定_帳號'].cells[1][4] = 'Funway#2026';
g.sheets['設定_帳號'].cells.push(['大埔平板', '店長', '大埔店', '是', 'Tablet#001', '', '']);
const adm = g.post({ action: 'login', account: '管理員', pin: 'Funway#2026', newPin: 'Admin#2026x' });
const mgr = g.post({ action: 'login', account: '大埔平板', pin: 'Tablet#001', newPin: 'Shop#2026x' });
assert.ok(mgr.ok, JSON.stringify(mgr).slice(0, 200));
const sync = (who, acc, ops) => g.post({ action: 'sync', account: acc, token: who.token, store: '大埔店', ops });
// 管理者先存了軒哥 11 月的薪資
sync(adm, '管理員', [{ id: 'p1', type: 'payroll.upsert', data: { month: '2026-11', name: '軒哥', items: [{ item: '月薪', amount: 45910, kind: '薪資' }], editedAt: '2026-11-01 10:00:00' } }]);
// 店長 11/3 日結：PT 1200、軒哥預支 3000
let r = sync(mgr, '大埔平板', [{ id: 's1', type: 'payroll.slip', data: { date: '2026-11-03', items: [
  { name: 'PT', item: 'PT薪資', amount: 1200, kind: '薪資' }, { name: '軒哥', item: '預支', amount: -3000, kind: '預支' }], editedAt: '2026-11-03 22:00:00' } }]);
assert.strictEqual(r.results[0].status, 'ok', '店長可以存日結的人事：' + JSON.stringify(r.results));
const rows = () => g.rows('人事明細').map(x => [x['姓名'], x['項目'], x['金額'], x['類別']]);
assert.deepStrictEqual(rows(), [['軒哥', '月薪', 45910, '薪資'], ['PT', 'PT薪資（日結 11/3）', 1200, '薪資'], ['軒哥', '預支（日結 11/3）', -3000, '預支']]);
// 改成 PT 1500、拿掉預支：舊的會被換掉，月薪不動
sync(mgr, '大埔平板', [{ id: 's2', type: 'payroll.slip', data: { date: '2026-11-03', items: [{ name: 'PT', item: 'PT薪資', amount: 1500, kind: '薪資' }], editedAt: '2026-11-03 22:10:00' } }]);
assert.deepStrictEqual(rows(), [['軒哥', '月薪', 45910, '薪資'], ['PT', 'PT薪資（日結 11/3）', 1500, '薪資']]);
// 另一天的不會被動到
sync(mgr, '大埔平板', [{ id: 's3', type: 'payroll.slip', data: { date: '2026-11-04', items: [{ name: 'PT', item: 'PT薪資', amount: 800, kind: '薪資' }], editedAt: '2026-11-04 22:00:00' } }]);
sync(mgr, '大埔平板', [{ id: 's4', type: 'payroll.slip', data: { date: '2026-11-03', items: [], editedAt: '2026-11-04 22:01:00' } }]);
assert.deepStrictEqual(rows(), [['軒哥', '月薪', 45910, '薪資'], ['PT', 'PT薪資（日結 11/4）', 800, '薪資']]);
// 店長還是不能直接改人事
r = sync(mgr, '大埔平板', [{ id: 'x', type: 'payroll.upsert', data: { month: '2026-11', name: '軒哥', items: [], editedAt: '2026-11-04 23:00:00' } }]);
assert.strictEqual(r.results[0].status, 'error', '店長不能改人事');
// App 端的計算也一樣
const C = require('../../docs/compute.js'); const applyOp = C.applyOp_ || global.applyOp_;
const st = { daily: [], purchase: [], expense: [], payroll: [{ store: '大埔店', month: '2026-11', name: 'PT', item: 'PT薪資（日結 11/3）', amount: 1200, kind: '薪資' }], delivery: [], deduct: [] };
applyOp(st, { type: 'payroll.slip', data: { date: '2026-11-03', items: [{ name: '軒哥', item: '預支', amount: -2000, kind: '預支' }] } }, '大埔店');
assert.deepStrictEqual(st.payroll.map(x => [x.name, x.item, x.amount, x.kind]), [['軒哥', '預支（日結 11/3）', -2000, '預支']]);
console.log('日結 → 人事 ✓');
