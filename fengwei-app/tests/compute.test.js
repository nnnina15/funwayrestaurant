// 用 Node 測試計算邏輯：node tests/compute.test.js
const assert = require('assert');

const ctx = { computeAll_: require('../../docs/compute.js').computeAll_ };

const D = {
  stores: [{ name: '大埔店', fee: 2, cashIn: false, cashWarn: 500 }],
  partners: [{ store: '大埔店', name: '豐吉', pct: 60 }, { store: '大埔店', name: '浩勤', pct: 20 }, { store: '大埔店', name: '呀肥', pct: 20 }],
  daily: [],
  purchase: [{ store: '大埔店', date: '2026-09-02', cat: '麵', amount: 1000 }, { store: '大埔店', date: '2026-09-03', cat: '米', amount: 2000 }],
  expense: [{ store: '大埔店', month: '2026-09', type: '固定', amount: 32000 }, { store: '大埔店', month: '2026-09', type: '其他', amount: 5000 }],
  payroll: [
    { store: '大埔店', month: '2026-09', name: 'A', kind: '薪資', amount: 45000 },
    { store: '大埔店', month: '2026-09', name: 'A', kind: '公司負擔', amount: 5566 },
    { store: '大埔店', month: '2026-09', name: 'A', kind: '預支', amount: -15000 },
    { store: '大埔店', month: '2026-09', name: 'B', kind: '薪資', amount: 25000 }
  ],
  delivery: [{ store: '大埔店', month: '2026-09', platform: 'Panda', amount: 60000 }],
  deduct: [{ store: '大埔店', month: '2026-09', type: '員工分紅', amount: 12500 }, { store: '大埔店', month: '2026-09', type: '年終預留', amount: 3000 }],
  employees: { '大埔店': ['A', 'B', 'C'] }
};
for (let d = 1; d <= 30; d++) {
  const date = '2026-09-' + String(d).padStart(2, '0');
  if (d === 15) continue; // 漏填一天
  D.daily.push({ store: '大埔店', date, closed: d % 7 === 0, site: 20000, panda: 3000, uber: 500, allpay: 1000, line: 500, cashDiff: d === 10 ? -800 : 0 });
}

const R = ctx.computeAll_(D, '2026-11-01');
const sep = R.months.find(m => m.month === '2026-09');
const workDays = D.daily.filter(r => !r.closed).length;
assert.strictEqual(sep.days, workDays);
assert.strictEqual(sep.site, 20000 * workDays);
assert.strictEqual(sep.actual, 20000 * workDays + 60000);          // Panda 用實際入帳；Uber 未對帳 = 0
assert.strictEqual(sep.staff, 45000 + 5566 + 25000);               // 預支不算成本
assert.strictEqual(sep.fee, Math.round(1500 * workDays * 0.02));
const profit = sep.actual - 3000 - sep.staff - 32000 - 5000 - sep.fee;
assert.strictEqual(sep.profit, profit);                            // 現金差額不計入
assert.strictEqual(sep.dist, profit - 12500 - 3000);
const shares = R.shares.filter(s => s.month === '2026-09');
assert.deepStrictEqual(shares.map(s => s.amount), [Math.round(sep.dist * 0.6), Math.round(sep.dist * 0.2), Math.round(sep.dist * 0.2)]);
const types = R.warns.filter(w => w.month === '2026-09').map(w => w.type);
assert.ok(types.includes('外送未對帳'), 'Uber 未對帳要警示');
assert.ok(types.includes('缺少每日結帳'), '漏填 9/15 要警示');
assert.ok(types.includes('現金差額'), '9/10 差 800 要警示');
assert.ok(!types.includes('人事未填'), '9 月不是上個月，不檢查個別員工');

// 上個月（10 月）有員工沒填 → 警示
D.payroll.push({ store: '大埔店', month: '2026-10', name: 'A', kind: '薪資', amount: 1 });
const R2 = ctx.computeAll_(D, '2026-11-01');
assert.ok(R2.warns.some(w => w.month === '2026-10' && w.type === '人事未填' && w.text.includes('B、C')));

// 比例不是 100%
D.partners.pop();
assert.ok(ctx.computeAll_(D, '2026-11-01').warns.some(w => w.type === '股東設定'));
console.log('全部測試通過 ✓');
