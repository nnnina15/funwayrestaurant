// 使用者自己在試算表換欄位順序（外送對帳的「期間」搬到「月份」旁邊）：讀寫都要照欄名，初始化也不能排回去
const assert = require('assert');
const { createGas } = require('./gas-mock.js');
const g = createGas(); g.ctx.setup();
const H = ['輸入時間', '月份', '期間', '店別', '平台', '費用明細(訂單金額)', '佣金', '月費', '拒單費用', '其他調整', '實際入帳', '備註', '裝置'];
g.sheets['外送對帳'].cells = [H,
  ['2026-09-30 23:59:00', '2026-09', '上半月', '大埔店', 'Panda', 55672, -15588, -3296, '', '', 36788, '舊表匯入', '舊表匯入'],
  ['2026-09-30 23:59:00', '2026-09', '下半月', '大埔店', 'Panda', 39182, -10964, -315, '', '', 27903, '舊表匯入', '舊表匯入']];
g.ctx.setup();
assert.deepStrictEqual(g.sheets['外送對帳'].cells[0], H, '初始化要保留你排的順序');
g.sheets['設定_帳號'].cells[1][4] = 'Funway#2026';
const a = g.post({ action: 'login', account: '管理員', pin: 'Funway#2026', newPin: 'Admin#2026x' });
assert.strictEqual(a.config.serverVersion, g.ctx.SERVER_VERSION || '4.0.4');
const st = a.stores.indexOf('大埔店') >= 0 ? '大埔店' : a.stores[0];
const s = g.post({ action: 'sync', account: '管理員', token: a.token, store: '大埔店', ops: [] });
const pd = s.data.delivery.find(x => x.month === '2026-09' && x.platform === 'Panda');
assert.ok(pd, '換順序後 App 還是要讀得到外送對帳'); assert.strictEqual(pd.amount, 64691);
// App 新存一筆 Uber，要寫到對的欄
g.post({ action: 'sync', account: '管理員', token: a.token, store: '大埔店', ops: [{ id: 'op1', type: 'delivery.upsert',
  data: { month: '2026-09', platform: 'Uber', amount: 15344, periods: [{ label: '整月', gross: 24384, commission: -9040 }], editedAt: '2026-11-03 10:00:00', device: 'x' } }] });
const last = g.sheets['外送對帳'].cells.find(r => r[4] === 'Uber');
assert.ok(last, 'Uber 那列要存在');
assert.deepStrictEqual([last[1], last[2], last[3], last[4], last[5], last[6], last[10]], ['2026-09', '整月', '大埔店', 'Uber', 24384, -9040, 15344], '新資料照欄名寫到對的欄');
console.log('欄位換順序 ✓');
