// 測試同步服務：node fengwei-app/tests/server.test.js
const assert = require('assert');
const { createGas } = require('./gas-mock');
const { computeAll_, applyOp_ } = require('../../docs/compute.js');

const g = createGas();
const S = g.ctx.__S;

// ===== 帳號登入 =====
// 新增帳號（管理者在試算表「設定_帳號」做的事）
const addAcc = (name, role, stores, temp) => g.sheets[S.ACCOUNT].cells.push([name, role, stores, '是', temp, '', '']);
assert.ok(g.rows(S.ACCOUNT).some(r => r['帳號'] === '管理員' && r['臨時PIN'] === 'Funway#2026'), '初始化要建一個管理員帳號');
addAcc('大埔店長', '店長', '大埔店', 'Temp#0001');
addAcc('雙店店長', '店長', '大埔店,中正店', 'Temp#0002');
const login = (account, pin, extra) => g.post(Object.assign({ action: 'login', account, pin }, extra || {}));
// 第一次登入：臨時 PIN 一定要換成自己的，而且要符合規則
let x = login('管理員', 'Funway#2026');
assert.strictEqual(x.ok, false); assert.strictEqual(x.needNewPin, true);
for (const [bad, why] of [['short#1', '8 個字元'], ['abcdefg#', '數字'], ['12345678#', '英文'], ['abcd1234', '符號']]) {
  x = login('管理員', 'Funway#2026', { newPin: bad });
  assert.ok(x.needNewPin && x.error.includes(why), bad + ' 要被擋：' + x.error);
}
const adm = login('管理員', 'Funway#2026', { newPin: 'Admin#2026' });
assert.strictEqual(adm.ok, true); assert.strictEqual(adm.role, 'admin');
assert.deepStrictEqual(adm.stores, ['大埔店', '中正店'], '管理可以用兩家店');
const accRow = g.rows(S.ACCOUNT).find(r => r['帳號'] === '管理員');
assert.strictEqual(accRow['臨時PIN'], '', '臨時 PIN 用完要清掉');
assert.ok(accRow['PIN(加密，勿改)'].includes('$') && !accRow['PIN(加密，勿改)'].includes('Admin#2026'), 'PIN 要加密存');
assert.strictEqual(login('管理員', 'Funway#2026').ok, false, '臨時 PIN 不能再用');
const mgr = login('大埔店長', 'Temp#0001', { newPin: 'Shop#1234' });
assert.strictEqual(mgr.role, 'manager'); assert.deepStrictEqual(mgr.stores, ['大埔店']);
const two = login('雙店店長', 'Temp#0002', { newPin: 'Two#5678x', store: '中正店' });
assert.deepStrictEqual(two.stores, ['大埔店', '中正店']); assert.strictEqual(two.store, '中正店');
// 帳號打錯、PIN 打錯都進不了（不透露是哪個錯）
assert.ok(login('大埔店長 ', 'Shop#1234').ok, '前後空白可以容忍');
// 帳號不分大小寫：Nina 建立的帳號，打 nina、NINA 都能登入，而且回傳試算表上的寫法
addAcc('Nina', '店長', '大埔店', 'Temp#0003');
const nina = login('nina', 'Temp#0003', { newPin: 'Nina#2026x' });
assert.ok(nina.ok, '小寫帳號要能登入'); assert.strictEqual(nina.account, 'Nina');
assert.ok(login('NINA', 'Nina#2026x').ok, '大寫帳號要能登入');
assert.ok(g.post({ action: 'sync', account: 'nINa', token: nina.token, store: '大埔店', ops: [] }).ok, '同步時大小寫不同也認得');
assert.strictEqual(login('大埔店', 'Shop#1234').error.startsWith('帳號或 PIN 錯誤'), true);
assert.strictEqual(login('大埔店長', 'Shop#12345').error.startsWith('帳號或 PIN 錯誤'), true);
// 店長只能用自己有權限的店
x = g.post({ action: 'sync', account: '大埔店長', account: mgr.account, token: mgr.token, store: '中正店', ops: [] });
assert.strictEqual(x.ok, false); assert.ok(x.error.includes('權限'));
assert.strictEqual(g.post({ action: 'sync', account: '雙店店長', token: two.token, store: '大埔店', ops: [] }).ok, true, '雙店店長可以切到大埔店');
assert.ok(!mgr.config.categories.some(c => c.cat === '牛亨' && !c.to), '牛亨要有停用月份');
assert.strictEqual(adm.config.partners.length, 3);
assert.strictEqual(mgr.config.partners.length, 3, '店長看得到股東比例');

const op = (type, data) => ({ id: Math.random().toString(36).slice(2), type, data });

// 店長：每日結帳 + 進貨
let r = g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [
  op('daily.upsert', { date: '2026-10-01', site: 31455, panda: 4974, uber: 555, allpay: 80, line: 1260, spend: 6510, cash: 23605, editedAt: '2026-10-01 21:00:00', device: '平板A' }),
  op('purchase.add', { id: 'p1', date: '2026-10-01', cat: '麵', amount: 1080, editedAt: '2026-10-01 21:01:00', device: '平板A' }),
  op('deduct.add', { id: 'mg1', month: '2026-10', type: '員工分紅', amount: 1 }),
  op('payroll.upsert', { month: '2026-10', name: 'X', items: [], editedAt: '2026-10-01 21:00:00' })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'ok', 'ok', 'ok'], '店長和管理一樣：可以改分紅、人事');
g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [op('deduct.del', { id: 'mg1' })] });
r = g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [
  op('expense.add', { id: 'E20261001abc', month: '2026-10', type: '其他', item: '燉滷', amount: 500 }),
  op('expense.add', { id: 'x1', month: '2026-10', type: '固定', item: '房租', amount: 1 })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'ok'], '店長可以記固定／其他支出');
g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [op('expense.del', { id: 'E20261001abc' }), op('expense.del', { id: 'x1' })] });
// 員工：只能每日結帳、進貨、固定／其他支出；拿不到人事、外送、分紅、股東
g.sheets['設定_帳號'].cells.push(['大埔員工', '員工', '大埔店', '是', 'Staff#2026a', '', '']);
const stf = g.post({ action: 'login', account: '大埔員工', pin: 'Staff#2026a', newPin: 'Staff#2026b' });
assert.ok(stf.ok && stf.role === 'staff', '員工角色');
assert.deepStrictEqual([stf.data.payroll.length, stf.data.delivery.length, stf.data.deduct.length, stf.config.partners.length, stf.config.employees.length], [0, 0, 0, 0, 0], '員工看不到人事、外送、分紅、股東、員工名單');
r = g.post({ action: 'sync', store: '大埔店', account: stf.account, token: stf.token, ops: [
  op('expense.add', { id: 'st1', month: '2026-10', type: '其他', item: '清潔劑', amount: 120 }),
  op('payroll.upsert', { month: '2026-10', name: 'X', items: [], editedAt: '2026-10-01 21:00:00' }),
  op('deduct.add', { id: 'dd1', month: '2026-10', type: '員工分紅', amount: 1 })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'error', 'error'], '員工可以記支出，不能改人事、分紅');
assert.ok(r.results[1].error.includes('員工沒有權限'));
g.post({ action: 'sync', store: '大埔店', account: stf.account, token: stf.token, ops: [op('expense.del', { id: 'st1' })] });
assert.strictEqual(g.rows(S.DAILY)[0]['應有現金'], 23605);
assert.strictEqual(g.rows(S.DAILY)[0]['現金差額'], 0);

// 重送同一批（網路斷在回應途中）→ 不會重複
r = g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [
  op('purchase.add', { id: 'p1', date: '2026-10-01', cat: '麵', amount: 1080, editedAt: '2026-10-01 21:01:00' })
]});
assert.strictEqual(r.results[0].status, 'dup');
assert.strictEqual(g.rows(S.PURCHASE).length, 1);

// 兩台裝置改同一天：以較新的為準
r = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [
  op('daily.upsert', { date: '2026-10-01', site: 30000, cash: 30000, editedAt: '2026-10-01 22:00:00', device: '手機B' })
]});
assert.strictEqual(r.results[0].status, 'ok');
r = g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [
  op('daily.upsert', { date: '2026-10-01', site: 99999, editedAt: '2026-10-01 21:30:00', device: '平板A(離線很久)' })
]});
assert.strictEqual(r.results[0].status, 'stale');
assert.strictEqual(g.rows(S.DAILY).length, 1);
assert.strictEqual(g.rows(S.DAILY)[0]['現場'], 30000);

// 管理：人事（自訂項目）、外送、支出、扣除
r = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [
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

// 報表平常不產生（同步不重算）；需要時按選單才產生，算出來和 App 一樣
assert.strictEqual(g.sheets[S.R_MONTH], undefined, '平常不要有報表分頁');
g.ctx.buildReports();
const rep = g.rows(S.R_MONTH).find(x => x['月份'] === '2026-10');
assert.ok(rep, '報表_月結 要有 10 月');
const C = r.config, emps = { '大埔店': C.employees.map(e => e.name) };
const local = computeAll_({ stores: [C.store], partners: C.partners, employees: emps, ...r.data }, '2026-11-02');
assert.strictEqual(local.months.find(m => m.month === '2026-10').dist, rep['可分配']);
assert.ok(g.rows(S.R_SHARE).some(x => x['股東'] === '豐吉' && x['比例(%)'] === 60));

// 試算表把輸入時間自動轉成日期時，「以較新為準」仍要正確
g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [op('daily.upsert', { date: '2026-09-20', site: 100, editedAt: '2026-09-20 22:00:00' })] });
const di = g.sheets[S.DAILY].cells.findIndex(c => c[1] === '2026-09-20');
g.sheets[S.DAILY].cells[di][0] = new Date('2026-09-20T14:00:00Z');   // 試算表自動轉成日期（= 台北 22:00）
r = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [
  op('daily.upsert', { date: '2026-09-20', site: 200, editedAt: '2026-11-02 09:00:00' }),
  op('daily.upsert', { date: '2026-09-20', site: 999, editedAt: '2026-09-20 21:00:00' })
]});
assert.deepStrictEqual(r.results.map(x => x.status), ['ok', 'stale'], '日期格式的舊紀錄要能正確比較新舊');
assert.strictEqual(g.rows(S.DAILY).find(x => x['日期'] === '2026-09-20')['現場'], 200);

// 每日結帳的支出明細：存成好讀的文字，讀回來一樣
const lines = [{ name: '燉滷', amount: 500, cash: true, cat: '' }, { name: '米', amount: 3516, cash: false, cat: '米', pid: 'D20261026ab' },
  { name: 'PT', amount: 800, cash: true, cat: '' }];
r = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [op('daily.upsert', { date: '2026-10-26', site: 29125, allpay: 575, line: 3713, spend: 1300, cash: 23537, lines, editedAt: '2026-11-02 10:00:00' })] });
const row26 = g.rows(S.DAILY).find(x => x['日期'] === '2026-10-26');
assert.strictEqual(row26['支出明細'], '燉滷 500｜米 3516（記帳→米#D20261026ab）｜PT 800');
assert.strictEqual(row26['應有現金'], 29125 - 575 - 3713 - 1300);
assert.deepStrictEqual(r.data.daily.find(x => x.date === '2026-10-26').lines, lines);

// 常用項目：預設有資料；管理、店長都可以改（只改這家店）
assert.ok(adm.data.presets.some(x => x.use === '每日結帳' && x.name === 'PT' && x.cat === 'PT薪資' && x.store === '全部'));
r = g.post({ action: 'sync', store: '大埔店', account: mgr.account, token: mgr.token, ops: [op('presets.set', { use: '每日結帳', items: [{ name: 'X', cat: '米' }] })] });
assert.strictEqual(r.results[0].status, 'ok', '店長和管理一樣，可以改自己店的常用項目');
r = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [op('presets.set', { use: '每日結帳', items: [{ name: '豬肉', cat: '豬肉攤' }, { name: '米', cat: '米' }] })] });
assert.strictEqual(r.results[0].status, 'ok');
assert.deepStrictEqual(r.data.presets.filter(x => x.use === '每日結帳' && x.store === '大埔店').map(x => x.name), ['豬肉', '米']);
const zz = login('管理員', 'Admin#2026', { store: '中正店' });
assert.ok(!zz.data.presets.some(x => x.store === '大埔店'), '中正店看不到大埔店自己的設定');

// 外送對帳明細：照平台對帳單的項目，存成好讀的文字，讀回來一樣
const periods = [{ label: '9/1-9/15', gross: 55672, commission: -15588, monthly: -3296 }, { label: '9/16-9/30', gross: 39182, commission: -10964, monthly: -315 }];
r = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [op('delivery.upsert', { month: '2026-09', platform: 'Panda', amount: 64691, periods, editedAt: '2026-11-02 12:00:00' })] });
const dv = g.rows(S.DELIVERY).filter(x => x['月份'] === '2026-09' && x['平台'] === 'Panda');
assert.deepStrictEqual(dv.map(x => [x['期間'], x['費用明細(訂單金額)'], x['佣金'], x['月費'], x['實際入帳']]),
  [['9/1-9/15', 55672, -15588, -3296, 36788], ['9/16-9/30', 39182, -10964, -315, 27903]], '每期一列、每項一欄');
assert.strictEqual(r.data.delivery.find(x => x.month === '2026-09' && x.platform === 'Panda').amount, 64691, '兩期加總＝當月入帳');
assert.deepStrictEqual(r.data.delivery.find(x => x.month === '2026-09' && x.platform === 'Panda').periods, periods);

// 猜錯 5 次鎖定（每個帳號分開算），寄一封信
const mails0 = g.mails.length;
for (let i = 0; i < 5; i++) assert.strictEqual(login('雙店店長', 'Wrong#000' + i).ok, false);
assert.strictEqual(g.mails.length, mails0 + 1, '第 5 次錯要寄一封信');
assert.strictEqual(g.mails[mails0].to, 'owner@example.com');
assert.ok(g.mails[mails0].subject.includes('雙店店長'));
login('雙店店長', 'Wrong#0009', { device: '陌生裝置' });
assert.strictEqual(g.mails.length, mails0 + 1, '鎖定期間不要重複寄信');
const locked = login('雙店店長', 'Two#5678x');
assert.strictEqual(locked.ok, false); assert.ok(locked.error.includes('鎖定'));
assert.strictEqual(login('管理員', 'Admin#2026').ok, true, '別的帳號不受影響');

// 改 PIN：舊 PIN 不對不行、新 PIN 要符合規則；改了之後舊權杖失效
x = g.post({ action: 'changePin', account: '大埔店長', token: mgr.token, oldPin: 'nope', newPin: 'New#12345' });
assert.ok(!x.ok && x.error.includes('舊 PIN'));
x = g.post({ action: 'changePin', account: '大埔店長', token: mgr.token, oldPin: 'Shop#1234', newPin: 'abc' });
assert.ok(!x.ok && x.error.includes('8 個字元'));
x = g.post({ action: 'changePin', account: '大埔店長', token: mgr.token, oldPin: 'Shop#1234', newPin: 'New#12345' });
assert.strictEqual(x.ok, true);
r = g.post({ action: 'sync', account: '大埔店長', token: mgr.token, store: '大埔店', ops: [] });
assert.strictEqual(r.ok, false); assert.strictEqual(r.auth, true, '舊權杖要失效');
assert.strictEqual(g.post({ action: 'sync', account: '大埔店長', token: x.token, store: '大埔店', ops: [] }).ok, true, '新權杖可以用');
assert.strictEqual(login('大埔店長', 'New#12345').ok, true);
// 停用帳號 → 馬上不能用
g.sheets[S.ACCOUNT].cells.find(c => c[0] === '大埔店長')[3] = '否';
assert.strictEqual(g.post({ action: 'sync', account: '大埔店長', token: x.token, store: '大埔店', ops: [] }).auth, true, '停用後權杖失效');
// 忘記 PIN：管理者填臨時 PIN → 可以重設
const row = g.sheets[S.ACCOUNT].cells.find(c => c[0] === '大埔店長'); row[3] = '是'; row[4] = 'Reset#999';
assert.strictEqual(login('大埔店長', 'Reset#999', { newPin: 'Again#2026' }).ok, true);

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

// 新店家：只在「設定_店家」加一列，沒有分類、股東、員工也能用
g.sheets[S.STORE].cells.push(['師大店', 2, '否', 500]);
g.sheets[S.CAT].cells = g.sheets[S.CAT].cells.filter((r, i) => i === 0 || r[0] !== '全部');   // 模擬已經改成每家店各自分類
r = g.post({ action: 'sync', store: '師大店', account: adm.account, token: adm.token, ops: [op('daily.upsert', { date: '2026-11-03', site: 5000, cash: 5000, editedAt: '2026-11-03 22:00:00' })] });
assert.ok(r.ok, JSON.stringify(r).slice(0, 200)); assert.ok(r.stores.includes('師大店'), '管理自動看得到新店');
assert.ok(r.config.categories.length > 5 && r.config.categories.some(c => c.cat === '麵'), '新店沒有分類時用預設分類');
const sd = computeAll_({ stores: [r.config.store], partners: r.config.partners, employees: r.config.employees, ...r.data }, '2026-11-04');
assert.ok(sd, '沒有股東也能算總覽');
// 管理在 App 改員工名單、進貨分類
r = g.post({ action: 'sync', store: '師大店', account: adm.account, token: adm.token, ops: [
  op('employees.set', { items: [{ name: '小明', type: '正職', salary: 40000, selfHealth: 500, active: true }, { name: '阿華', type: '計時', hourly: 200, active: false }] }),
  op('categories.set', { items: [{ cat: '麵', from: '', to: '' }, { cat: '飲料', from: '', to: '2026-12' }] })] });
assert.ok(r.results.every(x => x.status === 'ok'), JSON.stringify(r.results));
assert.deepStrictEqual(r.config.employees.map(e => e.name), ['小明'], '離職的不在人事名單');
assert.deepStrictEqual(r.config.employeesAll.map(e => e.name + e.active), ['小明true', '阿華false']);
assert.deepStrictEqual(r.config.categories.map(c => c.cat + c.to), ['麵', '飲料2026-12']);
const other = g.post({ action: 'sync', store: '大埔店', account: adm.account, token: adm.token, ops: [] });
assert.ok(other.config.categories.length > 5, '別家店的分類不受影響');
assert.ok(g.rows(S.EMP).some(e => e['店別'] === '大埔店'), '別家店的員工不受影響');
addAcc('師大店長', '店長', '師大店', 'Temp#0009');
const sdm = login('師大店長', 'Temp#0009', { newPin: 'Shida#2026' });
const mgrTry = g.post({ action: 'sync', store: '師大店', account: sdm.account, token: sdm.token, ops: [op('employees.set', { items: [] })] });
assert.ok(mgrTry.ok && mgrTry.results[0].status === 'ok', '店長可以改自己店的員工名單：' + JSON.stringify(mgrTry).slice(0, 150));
const sdOther = g.post({ action: 'sync', store: '大埔店', account: sdm.account, token: sdm.token, ops: [op('employees.set', { items: [] })] });
assert.ok(!sdOther.ok && /權限/.test(sdOther.error), '店長不能改別家店');
assert.ok(g.rows(S.EMP).some(e => e['店別'] === '大埔店'), '別家店的員工不受影響');
console.log('同步服務測試通過 ✓');
