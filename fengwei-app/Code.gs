/**
 * 風味記帳系統 v1
 * ------------------------------------------------------------
 * 資料都存在這份 Google 試算表裡：
 *   設定_*   ：只有管理者改（店家、股東比例、進貨分類、員工）
 *   資料分頁 ：只透過平板網頁新增（每日營收、進貨、人事明細…）
 *   報表_*   ：程式自動產生，不要手動改
 */

const TZ = 'Asia/Taipei';

const S = {
  STORE: '設定_店家',
  PARTNER: '設定_股東',
  CAT: '設定_進貨分類',
  EMP: '設定_員工',
  DAILY: '每日營收',
  PURCHASE: '進貨',
  EXPENSE: '其他支出',
  PAYROLL: '人事明細',
  DELIVERY: '外送對帳',
  DEDUCT: '分配前扣除',
  R_MONTH: '報表_月結',
  R_SHARE: '報表_分紅',
  R_CAT: '報表_進貨分類',
  R_WARN: '警示'
};

const HEAD = {};
HEAD[S.STORE] = ['店別', '店長PIN', '管理PIN', '手續費率(%)', '現金差額計入盈餘(是/否)', '現金差額警示門檻'];
HEAD[S.PARTNER] = ['店別', '股東', '比例(%)'];
HEAD[S.CAT] = ['店別(全部/店名)', '分類', '啟用月份(yyyy-MM)', '停用月份(yyyy-MM)'];
HEAD[S.EMP] = ['店別', '姓名', '類型(正職/計時)', '月薪', '時薪', '員工自付健保', '員工自付勞保', '公司勞退', '公司健保', '公司勞保', '在職(是/否)'];
HEAD[S.DAILY] = ['輸入時間', '日期', '店別', '公休', '現場', 'Panda', 'Uber', '全支付', 'LINE Pay', '現場支出', '點收現金', '應有現金', '現金差額', '備註'];
HEAD[S.PURCHASE] = ['編號', '輸入時間', '日期', '店別', '分類', '金額', '備註'];
HEAD[S.EXPENSE] = ['編號', '輸入時間', '月份', '店別', '類型', '項目', '金額', '備註'];
HEAD[S.PAYROLL] = ['輸入時間', '月份', '店別', '姓名', '項目', '金額', '類別', '時數', '時薪'];
HEAD[S.DELIVERY] = ['輸入時間', '月份', '店別', '平台', '實際入帳', '備註'];
HEAD[S.DEDUCT] = ['編號', '輸入時間', '月份', '店別', '類型', '金額', '備註'];
HEAD[S.R_MONTH] = ['店別', '月份', '狀態', '工作天', '現場營收', 'Panda營業額', 'Panda入帳', 'Uber營業額', 'Uber入帳',
  '實際營收', '日均營收', '進貨', '人事成本', '固定支出', '其他支出', '線上手續費', '現金差額', '盈餘',
  '員工分紅', '年終預留', '其他扣除', '可分配', '進貨佔比', '人事佔比', '警示數'];
HEAD[S.R_SHARE] = ['店別', '月份', '狀態', '股東', '比例(%)', '分紅金額'];
HEAD[S.R_CAT] = ['店別', '月份', '分類', '金額', '佔實際營收'];
HEAD[S.R_WARN] = ['店別', '月份', '類型', '說明'];

// 這些欄位一律存成「文字」，避免試算表自動轉成日期或去掉 PIN 前面的 0
const TEXT_COLS = ['日期', '月份', '店長PIN', '管理PIN', '編號', '啟用月份(yyyy-MM)', '停用月份(yyyy-MM)'];

const PAYROLL_KINDS = ['薪資', '公司負擔', '預支'];   // 薪資＋公司負擔 = 公司成本；薪資＋預支 = 實發
const EXPENSE_TYPES = ['固定', '其他'];
const DEDUCT_TYPES = ['員工分紅', '年終預留', '其他扣除'];
const PLATFORMS = ['Panda', 'Uber'];

/* ============================================================
 * 試算表選單 & 初始化
 * ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('風味記帳')
    .addItem('① 初始化（第一次使用）', 'setup')
    .addItem('② 重新計算報表', 'buildReports')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEAD).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const h = HEAD[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#f3efe6');
    sh.setFrozenRows(1);
    h.forEach(function (k, i) {
      if (TEXT_COLS.indexOf(k) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  });

  seed_(S.STORE, [
    ['大埔店', '1234', '9999', 2, '否', 500],
    ['中正店', '1234', '9999', 2, '否', 500]
  ]);
  seed_(S.PARTNER, [
    ['大埔店', '豐吉', 60], ['大埔店', '浩勤', 20], ['大埔店', '呀肥', 20],
    ['中正店', '浩勤', 65], ['中正店', '豐吉', 35]
  ]);
  const cats = ['麵', '雞蛋', '菜', '洋蔥/火腿丁', '瓦斯', '萬昌肉品', '豬肉攤', '牛亨', '雞肉', '海鮮/蒜', '蝦仁',
    '米', '免洗', '銘利行', '乾貨/配菜', '鹽水/醬油', '五金/文具', '大禹商行', '員工飲/食'];
  seed_(S.CAT, cats.map(function (c) { return ['全部', c, '', c === '牛亨' ? '2026-10' : '']; }));
  seed_(S.EMP, [
    ['大埔店', '範例正職(請改名)', '正職', 45000, '', 485, 738, 1770, 1428, 2368, '是'],
    ['大埔店', '範例計時(請改名)', '計時', '', 250, '', '', '', '', '', '是']
  ]);

  // 每天凌晨 2 點自動重算報表
  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'buildReports'; });
  if (!has) ScriptApp.newTrigger('buildReports').timeBased().everyDays(1).atHour(2).create();

  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  buildReports();
  SpreadsheetApp.getUi().alert('初始化完成！\n\n請到「設定_店家」改 PIN 碼，並在「設定_員工」填入真實員工資料。');
}

function seed_(name, rows) {
  const sh = sheet_(name);
  if (sh.getLastRow() > 1) return;              // 已經有資料就不覆蓋
  const h = HEAD[name];
  append_(name, rows.map(function (r) {
    const o = {}; h.forEach(function (k, i) { o[k] = r[i] === undefined ? '' : r[i]; }); return o;
  }));
}

/* ============================================================
 * 平板網頁
 * ============================================================ */

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('風味記帳')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

/* ============================================================
 * 共用小工具
 * ============================================================ */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('找不到分頁「' + name + '」，請先在試算表選單執行「風味記帳 → 初始化」');
  return sh;
}

function rows_(name) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const h = HEAD[name];
  return sh.getRange(2, 1, n - 1, h.length).getValues().map(function (r, i) {
    const o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}

function append_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const h = HEAD[name];
  const start = sh.getLastRow() + 1;
  h.forEach(function (k, i) {
    if (TEXT_COLS.indexOf(k) >= 0) sh.getRange(start, i + 1, objs.length, 1).setNumberFormat('@');
  });
  sh.getRange(start, 1, objs.length, h.length)
    .setValues(objs.map(function (o) { return h.map(function (k) { return o[k] === undefined ? '' : o[k]; }); }));
}

function deleteWhere_(name, pred) {
  const sh = sheet_(name);
  const rs = rows_(name).filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  rs.forEach(function (r) { sh.deleteRow(r); });
  return rs.length;
}

function writeTable_(name, data, formats) {
  const sh = sheet_(name);
  const h = HEAD[name];
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, sh.getMaxColumns()).clearContent();
  if (!data.length) return;
  sh.getRange(2, 1, data.length, h.length).setValues(data);
  Object.keys(formats || {}).forEach(function (col) {
    const i = h.indexOf(col);
    if (i >= 0) sh.getRange(2, i + 1, data.length, 1).setNumberFormat(formats[col]);
  });
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function uid_() { return Utilities.getUuid().slice(0, 8); }

function num_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v === undefined || v === null ? '' : v).replace(/[,\s$]/g, ''));
  return isFinite(n) ? n : 0;
}

function yes_(v) {
  return v === true || /^(是|y|yes|true|1|v|✓)$/i.test(String(v).trim());
}

function str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = str_(v).replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]) : '';
}

function monthKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM');
  const m = str_(v).replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})/);
  return m ? m[1] + '-' + pad2_(m[2]) : '';
}

function pad2_(x) { return ('0' + x).slice(-2); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ============================================================
 * 讀取設定
 * ============================================================ */

function stores_() {
  return rows_(S.STORE).filter(function (r) { return str_(r['店別']); }).map(function (r) {
    return {
      name: str_(r['店別']),
      pin: str_(r['店長PIN']),
      admin: str_(r['管理PIN']),
      fee: num_(r['手續費率(%)']),
      cashIn: yes_(r['現金差額計入盈餘(是/否)']),
      cashWarn: num_(r['現金差額警示門檻']) || 500
    };
  });
}

function auth_(store, pin, needAdmin) {
  const s = stores_().filter(function (x) { return x.name === store; })[0];
  if (!s) throw new Error('找不到店別：' + store);
  pin = str_(pin);
  if (pin && pin === s.admin) return { store: s, admin: true };
  if (!needAdmin && pin && pin === s.pin) return { store: s, admin: false };
  throw new Error(needAdmin ? '這個功能需要「管理PIN」' : 'PIN 碼錯誤');
}

function categoriesFor_(store, month) {
  return rows_(S.CAT).filter(function (r) {
    const st = str_(r['店別(全部/店名)']) || '全部';
    const from = monthKey_(r['啟用月份(yyyy-MM)']);
    const to = monthKey_(r['停用月份(yyyy-MM)']);
    return str_(r['分類']) && (st === '全部' || st === store) && (!from || month >= from) && (!to || month < to);
  }).map(function (r) { return str_(r['分類']); });
}

function employees_(store) {
  return rows_(S.EMP).filter(function (r) {
    return str_(r['店別']) === store && str_(r['姓名']) && str_(r['在職(是/否)']) !== '否';
  }).map(function (r) {
    return {
      name: str_(r['姓名']),
      type: str_(r['類型(正職/計時)']) || '正職',
      salary: num_(r['月薪']), hourly: num_(r['時薪']),
      selfHealth: num_(r['員工自付健保']), selfLabor: num_(r['員工自付勞保']),
      pension: num_(r['公司勞退']), health: num_(r['公司健保']), labor: num_(r['公司勞保'])
    };
  });
}

function payrollDefaults_(e) {
  const items = [];
  if (e.type === '計時') items.push({ name: '時薪', amount: 0, kind: '薪資', hours: '', rate: e.hourly });
  else if (e.salary) items.push({ name: '月薪', amount: e.salary, kind: '薪資' });
  if (e.selfHealth) items.push({ name: '扣健保(自付)', amount: -e.selfHealth, kind: '薪資' });
  if (e.selfLabor) items.push({ name: '扣勞保(自付)', amount: -e.selfLabor, kind: '薪資' });
  if (e.pension) items.push({ name: '勞退(公司)', amount: e.pension, kind: '公司負擔' });
  if (e.health) items.push({ name: '健保(公司)', amount: e.health, kind: '公司負擔' });
  if (e.labor) items.push({ name: '勞保(公司)', amount: e.labor, kind: '公司負擔' });
  return items;
}

/* ============================================================
 * 網頁呼叫的 API
 * ============================================================ */

function apiStores() {
  return stores_().map(function (s) { return s.name; });
}

function apiLogin(store, pin) {
  const a = auth_(store, pin, false);
  return {
    store: a.store.name, admin: a.admin, today: today_(),
    feeRate: a.store.fee, cashWarn: a.store.cashWarn,
    kinds: PAYROLL_KINDS, expenseTypes: EXPENSE_TYPES, deductTypes: DEDUCT_TYPES
  };
}

function apiCategories(store, pin, month) {
  auth_(store, pin, false);
  return categoriesFor_(store, monthKey_(month));
}

/* ---------- 每日結帳 ---------- */

function apiGetDaily(store, pin, date) {
  auth_(store, pin, false);
  date = dateKey_(date);
  const r = rows_(S.DAILY).filter(function (x) { return str_(x['店別']) === store && dateKey_(x['日期']) === date; })[0];
  if (!r) return null;
  return {
    closed: yes_(r['公休']), site: num_(r['現場']), panda: num_(r['Panda']), uber: num_(r['Uber']),
    allpay: num_(r['全支付']), line: num_(r['LINE Pay']), spend: num_(r['現場支出']),
    cash: num_(r['點收現金']), note: str_(r['備註']), savedAt: str_(r['輸入時間'])
  };
}

function apiSaveDaily(store, pin, d) {
  const a = auth_(store, pin, false);
  const date = dateKey_(d.date);
  if (!date) throw new Error('日期格式錯誤');
  const site = num_(d.site), allpay = num_(d.allpay), line = num_(d.line), spend = num_(d.spend), cash = num_(d.cash);
  const expected = site - allpay - line - spend;
  const diff = d.closed ? 0 : cash - expected;
  withLock_(function () {
    deleteWhere_(S.DAILY, function (x) { return str_(x['店別']) === store && dateKey_(x['日期']) === date; });
    append_(S.DAILY, [{
      '輸入時間': now_(), '日期': date, '店別': store, '公休': d.closed ? '是' : '',
      '現場': site, 'Panda': num_(d.panda), 'Uber': num_(d.uber), '全支付': allpay, 'LINE Pay': line,
      '現場支出': spend, '點收現金': cash, '應有現金': expected, '現金差額': diff, '備註': str_(d.note)
    }]);
  });
  buildReports();
  return { diff: diff, warn: Math.abs(diff) > a.store.cashWarn };
}

/* ---------- 進貨 ---------- */

function apiListPurchases(store, pin, date) {
  auth_(store, pin, false);
  date = dateKey_(date);
  return rows_(S.PURCHASE).filter(function (x) {
    return str_(x['店別']) === store && dateKey_(x['日期']) === date;
  }).map(function (x) {
    return { id: str_(x['編號']), cat: str_(x['分類']), amount: num_(x['金額']), note: str_(x['備註']) };
  });
}

function apiAddPurchase(store, pin, p) {
  auth_(store, pin, false);
  const date = dateKey_(p.date);
  if (!date || !str_(p.cat)) throw new Error('請選日期和分類');
  if (!num_(p.amount)) throw new Error('請輸入金額');
  withLock_(function () {
    append_(S.PURCHASE, [{ '編號': uid_(), '輸入時間': now_(), '日期': date, '店別': store,
      '分類': str_(p.cat), '金額': num_(p.amount), '備註': str_(p.note) }]);
  });
  return apiListPurchases(store, pin, date);
}

function apiDeletePurchase(store, pin, id, date) {
  auth_(store, pin, false);
  withLock_(function () {
    deleteWhere_(S.PURCHASE, function (x) { return str_(x['店別']) === store && str_(x['編號']) === str_(id); });
  });
  return apiListPurchases(store, pin, date);
}

/* ---------- 人事（管理） ---------- */

function apiPayrollMonth(store, pin, month) {
  auth_(store, pin, true);
  month = monthKey_(month);
  const rows = rows_(S.PAYROLL).filter(function (x) { return str_(x['店別']) === store && monthKey_(x['月份']) === month; });
  const by = {};
  rows.forEach(function (x) {
    const n = str_(x['姓名']);
    if (!by[n]) by[n] = { cost: 0, pay: 0 };
    const k = str_(x['類別']), v = num_(x['金額']);
    if (k !== '預支') by[n].cost += v;
    if (k !== '公司負擔') by[n].pay += v;
  });
  const names = employees_(store).map(function (e) { return e.name; });
  Object.keys(by).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
  return names.map(function (n) {
    return { name: n, done: !!by[n], cost: by[n] ? by[n].cost : 0, pay: by[n] ? by[n].pay : 0 };
  });
}

function apiGetPayroll(store, pin, month, name) {
  auth_(store, pin, true);
  month = monthKey_(month);
  const rows = rows_(S.PAYROLL).filter(function (x) {
    return str_(x['店別']) === store && monthKey_(x['月份']) === month && str_(x['姓名']) === name;
  });
  if (rows.length) {
    return { saved: true, items: rows.map(function (x) {
      return { name: str_(x['項目']), amount: num_(x['金額']), kind: str_(x['類別']) || '薪資',
        hours: x['時數'] === '' ? '' : num_(x['時數']), rate: x['時薪'] === '' ? '' : num_(x['時薪']) };
    }) };
  }
  const e = employees_(store).filter(function (x) { return x.name === name; })[0];
  return { saved: false, items: e ? payrollDefaults_(e) : [{ name: '薪資', amount: 0, kind: '薪資' }] };
}

function apiSavePayroll(store, pin, month, name, items) {
  auth_(store, pin, true);
  month = monthKey_(month);
  name = str_(name);
  if (!month || !name) throw new Error('請選月份和員工');
  const clean = (items || []).filter(function (it) { return str_(it.name); }).map(function (it) {
    const hasRate = it.rate !== '' && it.rate !== undefined && it.rate !== null;
    const amount = hasRate ? Math.round(num_(it.hours) * num_(it.rate)) : num_(it.amount);
    const kind = PAYROLL_KINDS.indexOf(it.kind) >= 0 ? it.kind : '薪資';
    return { '輸入時間': now_(), '月份': month, '店別': store, '姓名': name, '項目': str_(it.name),
      '金額': amount, '類別': kind, '時數': hasRate ? num_(it.hours) : '', '時薪': hasRate ? num_(it.rate) : '' };
  });
  withLock_(function () {
    deleteWhere_(S.PAYROLL, function (x) {
      return str_(x['店別']) === store && monthKey_(x['月份']) === month && str_(x['姓名']) === name;
    });
    append_(S.PAYROLL, clean);
  });
  buildReports();
  return apiPayrollMonth(store, pin, month);
}

/* ---------- 外送對帳（管理） ---------- */

function apiGetDelivery(store, pin, month) {
  auth_(store, pin, true);
  month = monthKey_(month);
  const gross = { Panda: 0, Uber: 0 }, net = { Panda: null, Uber: null };
  rows_(S.DAILY).forEach(function (x) {
    if (str_(x['店別']) === store && dateKey_(x['日期']).slice(0, 7) === month) {
      gross.Panda += num_(x['Panda']); gross.Uber += num_(x['Uber']);
    }
  });
  rows_(S.DELIVERY).forEach(function (x) {
    if (str_(x['店別']) === store && monthKey_(x['月份']) === month && PLATFORMS.indexOf(str_(x['平台'])) >= 0) {
      net[str_(x['平台'])] = (net[str_(x['平台'])] || 0) + num_(x['實際入帳']);
    }
  });
  return { gross: gross, net: net };
}

function apiSaveDelivery(store, pin, month, net) {
  auth_(store, pin, true);
  month = monthKey_(month);
  withLock_(function () {
    PLATFORMS.forEach(function (p) {
      if (net[p] === '' || net[p] === null || net[p] === undefined) return;
      deleteWhere_(S.DELIVERY, function (x) {
        return str_(x['店別']) === store && monthKey_(x['月份']) === month && str_(x['平台']) === p;
      });
      append_(S.DELIVERY, [{ '輸入時間': now_(), '月份': month, '店別': store, '平台': p, '實際入帳': num_(net[p]), '備註': '' }]);
    });
  });
  buildReports();
  return apiGetDelivery(store, pin, month);
}

/* ---------- 固定 / 其他支出（管理） ---------- */

function apiListExpenses(store, pin, month) {
  auth_(store, pin, true);
  month = monthKey_(month);
  return rows_(S.EXPENSE).filter(function (x) {
    return str_(x['店別']) === store && monthKey_(x['月份']) === month;
  }).map(function (x) {
    return { id: str_(x['編號']), type: str_(x['類型']), item: str_(x['項目']), amount: num_(x['金額']), note: str_(x['備註']) };
  });
}

function apiAddExpense(store, pin, e) {
  auth_(store, pin, true);
  const month = monthKey_(e.month);
  if (!month || !str_(e.item) || !num_(e.amount)) throw new Error('請填月份、項目、金額');
  withLock_(function () {
    append_(S.EXPENSE, [{ '編號': uid_(), '輸入時間': now_(), '月份': month, '店別': store,
      '類型': EXPENSE_TYPES.indexOf(e.type) >= 0 ? e.type : '其他', '項目': str_(e.item),
      '金額': num_(e.amount), '備註': str_(e.note) }]);
  });
  buildReports();
  return apiListExpenses(store, pin, month);
}

function apiDeleteExpense(store, pin, id, month) {
  auth_(store, pin, true);
  withLock_(function () {
    deleteWhere_(S.EXPENSE, function (x) { return str_(x['店別']) === store && str_(x['編號']) === str_(id); });
  });
  buildReports();
  return apiListExpenses(store, pin, month);
}

function apiCopyFixed(store, pin, month) {
  auth_(store, pin, true);
  month = monthKey_(month);
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + pad2_(m - 1);
  const already = apiListExpenses(store, pin, month).filter(function (x) { return x.type === '固定'; })
    .map(function (x) { return x.item; });
  const src = apiListExpenses(store, pin, prev).filter(function (x) { return x.type === '固定' && already.indexOf(x.item) < 0; });
  withLock_(function () {
    append_(S.EXPENSE, src.map(function (x) {
      return { '編號': uid_(), '輸入時間': now_(), '月份': month, '店別': store, '類型': '固定',
        '項目': x.item, '金額': x.amount, '備註': '複製自 ' + prev };
    }));
  });
  buildReports();
  return apiListExpenses(store, pin, month);
}

/* ---------- 分配前扣除：員工分紅、年終預留（管理） ---------- */

function apiListDeducts(store, pin, month) {
  auth_(store, pin, true);
  month = monthKey_(month);
  return rows_(S.DEDUCT).filter(function (x) {
    return str_(x['店別']) === store && monthKey_(x['月份']) === month;
  }).map(function (x) {
    return { id: str_(x['編號']), type: str_(x['類型']), amount: num_(x['金額']), note: str_(x['備註']) };
  });
}

function apiAddDeduct(store, pin, d) {
  auth_(store, pin, true);
  const month = monthKey_(d.month);
  if (!month || !num_(d.amount)) throw new Error('請填月份和金額');
  withLock_(function () {
    append_(S.DEDUCT, [{ '編號': uid_(), '輸入時間': now_(), '月份': month, '店別': store,
      '類型': DEDUCT_TYPES.indexOf(d.type) >= 0 ? d.type : '其他扣除', '金額': num_(d.amount), '備註': str_(d.note) }]);
  });
  buildReports();
  return apiListDeducts(store, pin, month);
}

function apiDeleteDeduct(store, pin, id, month) {
  auth_(store, pin, true);
  withLock_(function () {
    deleteWhere_(S.DEDUCT, function (x) { return str_(x['店別']) === store && str_(x['編號']) === str_(id); });
  });
  buildReports();
  return apiListDeducts(store, pin, month);
}

/* ---------- 月結總覽（管理） ---------- */

function apiSummary(store, pin, month) {
  auth_(store, pin, true);
  month = monthKey_(month);
  const R = computeAll_(loadData_(), today_());
  const m = R.months.filter(function (x) { return x.store === store && x.month === month; })[0] || null;
  return {
    month: m,
    shares: R.shares.filter(function (x) { return x.store === store && x.month === month; }),
    cats: R.cats.filter(function (x) { return x.store === store && x.month === month; }),
    warns: R.warns.filter(function (x) { return x.store === store && (x.month === month || x.month === ''); })
  };
}

/* ============================================================
 * 計算 & 報表
 * ============================================================ */

function loadData_() {
  const stores = stores_();
  const partners = rows_(S.PARTNER).filter(function (r) { return str_(r['店別']) && str_(r['股東']); })
    .map(function (r) { return { store: str_(r['店別']), name: str_(r['股東']), pct: num_(r['比例(%)']) }; });
  const daily = rows_(S.DAILY).map(function (r) {
    return { store: str_(r['店別']), date: dateKey_(r['日期']), closed: yes_(r['公休']),
      site: num_(r['現場']), panda: num_(r['Panda']), uber: num_(r['Uber']),
      allpay: num_(r['全支付']), line: num_(r['LINE Pay']), cashDiff: num_(r['現金差額']) };
  });
  const purchase = rows_(S.PURCHASE).map(function (r) {
    return { store: str_(r['店別']), date: dateKey_(r['日期']), cat: str_(r['分類']), amount: num_(r['金額']) };
  });
  const expense = rows_(S.EXPENSE).map(function (r) {
    return { store: str_(r['店別']), month: monthKey_(r['月份']), type: str_(r['類型']), amount: num_(r['金額']) };
  });
  const payroll = rows_(S.PAYROLL).map(function (r) {
    return { store: str_(r['店別']), month: monthKey_(r['月份']), name: str_(r['姓名']), kind: str_(r['類別']), amount: num_(r['金額']) };
  });
  const delivery = rows_(S.DELIVERY).map(function (r) {
    return { store: str_(r['店別']), month: monthKey_(r['月份']), platform: str_(r['平台']), amount: num_(r['實際入帳']) };
  });
  const deduct = rows_(S.DEDUCT).map(function (r) {
    return { store: str_(r['店別']), month: monthKey_(r['月份']), type: str_(r['類型']), amount: num_(r['金額']) };
  });
  const employees = {};
  stores.forEach(function (s) { employees[s.name] = employees_(s.name).map(function (e) { return e.name; }); });
  return { stores: stores, partners: partners, daily: daily, purchase: purchase, expense: expense,
    payroll: payroll, delivery: delivery, deduct: deduct, employees: employees };
}

/**
 * 純計算（不碰試算表），方便測試。
 * today：'yyyy-MM-dd'
 */
function computeAll_(D, today) {
  const curMonth = today.slice(0, 7);
  const lastMonth = prevMonth_(curMonth);
  const storeMap = {};
  D.stores.forEach(function (s) { storeMap[s.name] = s; });
  const M = {};
  function get(store, month) {
    const k = store + '|' + month;
    if (!M[k]) M[k] = { store: store, month: month, days: 0, dates: {}, site: 0, pandaG: 0, uberG: 0,
      allpay: 0, line: 0, cashDiff: 0, pandaN: null, uberN: null, purchase: 0, staff: 0, staffNames: {},
      fixed: 0, other: 0, bonus: 0, reserve: 0, deductOther: 0, cats: {}, warns: [] };
    return M[k];
  }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  D.daily.forEach(function (r) {
    if (!r.store || !r.date) return;
    const m = get(r.store, r.date.slice(0, 7));
    m.dates[r.date] = true;
    if (r.closed) return;
    m.days++; m.site += r.site; m.pandaG += r.panda; m.uberG += r.uber;
    m.allpay += r.allpay; m.line += r.line; m.cashDiff += r.cashDiff;
    const st = storeMap[r.store];
    if (st && Math.abs(r.cashDiff) > st.cashWarn) m.warns.push(['現金差額', r.date + ' 現金差 ' + fmt(r.cashDiff) + ' 元']);
  });
  D.purchase.forEach(function (r) {
    if (!r.store || !r.date) return;
    const m = get(r.store, r.date.slice(0, 7));
    m.purchase += r.amount;
    m.cats[r.cat] = (m.cats[r.cat] || 0) + r.amount;
  });
  D.expense.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.type === '固定') m.fixed += r.amount; else m.other += r.amount;
  });
  D.payroll.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.kind !== '預支') m.staff += r.amount;
    m.staffNames[r.name] = true;
  });
  D.delivery.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.platform === 'Panda') m.pandaN = (m.pandaN || 0) + r.amount;
    if (r.platform === 'Uber') m.uberN = (m.uberN || 0) + r.amount;
  });
  D.deduct.forEach(function (r) {
    if (!r.store || !r.month) return;
    const m = get(r.store, r.month);
    if (r.type === '員工分紅') m.bonus += r.amount;
    else if (r.type === '年終預留') m.reserve += r.amount;
    else m.deductOther += r.amount;
  });

  const months = [], shares = [], cats = [], warns = [];

  // 股東比例檢查
  D.stores.forEach(function (s) {
    const ps = D.partners.filter(function (p) { return p.store === s.name; });
    const sum = ps.reduce(function (a, p) { return a + p.pct; }, 0);
    if (!ps.length) warns.push({ store: s.name, month: '', type: '股東設定', text: '還沒設定股東比例' });
    else if (Math.abs(sum - 100) > 0.001) warns.push({ store: s.name, month: '', type: '股東設定', text: '股東比例加起來是 ' + sum + '%，不是 100%' });
  });

  Object.keys(M).sort().forEach(function (k) {
    const m = M[k];
    const st = storeMap[m.store] || { fee: 0, cashIn: false };
    const status = m.month === curMonth ? '進行中' : (m.month > curMonth ? '未來' : '已結束');

    if (status === '進行中') m.warns.push(['未結帳', '本月還沒結束，數字只供參考，先不要拿來分紅']);
    if (m.pandaG > 0 && m.pandaN === null) m.warns.push(['外送未對帳', 'Panda 營業額 ' + fmt(m.pandaG) + '，實際入帳還沒填，盈餘會被低估']);
    if (m.uberG > 0 && m.uberN === null) m.warns.push(['外送未對帳', 'Uber 營業額 ' + fmt(m.uberG) + '，實際入帳還沒填，盈餘會被低估']);

    // 缺少每日結帳
    if (Object.keys(m.dates).length && status !== '未來') {
      const lastDay = status === '進行中' ? Number(today.slice(8, 10)) - 1 : daysInMonth_(m.month);
      const miss = [];
      for (let d = 1; d <= lastDay; d++) {
        const key = m.month + '-' + pad2_(d);
        if (!m.dates[key]) miss.push(Number(m.month.slice(5, 7)) + '/' + d);
      }
      if (miss.length) m.warns.push(['缺少每日結帳', miss.length + ' 天沒有紀錄（公休也請按公休）：' + miss.slice(0, 10).join('、') + (miss.length > 10 ? '…' : '')]);
    }
    if (status === '已結束' && m.days > 0) {
      if (m.staff === 0) m.warns.push(['人事未填', '這個月還沒有填人事薪資']);
      if (m.fixed === 0) m.warns.push(['固定支出未填', '房租、電話等固定支出還沒填']);
    }
    if (m.month === lastMonth && m.staff !== 0) {
      const miss = (D.employees[m.store] || []).filter(function (n) { return !m.staffNames[n]; });
      if (miss.length) m.warns.push(['人事未填', '在職員工沒填薪資：' + miss.join('、') + '（沒上班可忽略）']);
    }

    const actual = m.site + (m.pandaN || 0) + (m.uberN || 0);
    const fee = Math.round((m.allpay + m.line) * st.fee / 100);
    const profit = actual - m.purchase - m.staff - m.fixed - m.other - fee + (st.cashIn ? m.cashDiff : 0);
    const dist = profit - m.bonus - m.reserve - m.deductOther;
    if (status === '已結束' && dist < 0) m.warns.push(['虧損', '可分配金額為負數 ' + fmt(dist) + '，股東分紅會是負的']);

    months.push({ store: m.store, month: m.month, status: status, days: m.days, site: m.site,
      pandaG: m.pandaG, pandaN: m.pandaN, uberG: m.uberG, uberN: m.uberN, actual: actual,
      avg: m.days ? Math.round(actual / m.days) : 0, purchase: m.purchase, staff: m.staff,
      fixed: m.fixed, other: m.other, fee: fee, cashDiff: m.cashDiff, profit: profit,
      bonus: m.bonus, reserve: m.reserve, deductOther: m.deductOther, dist: dist,
      purchasePct: actual ? m.purchase / actual : 0, staffPct: actual ? m.staff / actual : 0,
      warnCount: m.warns.length });

    D.partners.filter(function (p) { return p.store === m.store; }).forEach(function (p) {
      shares.push({ store: m.store, month: m.month, status: status, name: p.name, pct: p.pct, amount: Math.round(dist * p.pct / 100) });
    });
    Object.keys(m.cats).forEach(function (c) {
      cats.push({ store: m.store, month: m.month, cat: c, amount: m.cats[c], pct: actual ? m.cats[c] / actual : 0 });
    });
    m.warns.forEach(function (w) { warns.push({ store: m.store, month: m.month, type: w[0], text: w[1] }); });
  });

  return { months: months, shares: shares, cats: cats, warns: warns };
}

function prevMonth_(month) {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return m === 1 ? (y - 1) + '-12' : y + '-' + pad2_(m - 1);
}

function daysInMonth_(month) {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

function buildReports() {
  const R = computeAll_(loadData_(), today_());
  const money = '#,##0';
  writeTable_(S.R_MONTH, R.months.map(function (m) {
    return [m.store, m.month, m.status, m.days, m.site, m.pandaG, m.pandaN === null ? '未填' : m.pandaN,
      m.uberG, m.uberN === null ? '未填' : m.uberN, m.actual, m.avg, m.purchase, m.staff, m.fixed, m.other,
      m.fee, m.cashDiff, m.profit, m.bonus, m.reserve, m.deductOther, m.dist, m.purchasePct, m.staffPct, m.warnCount];
  }), { '現場營收': money, 'Panda營業額': money, 'Panda入帳': money, 'Uber營業額': money, 'Uber入帳': money,
    '實際營收': money, '日均營收': money, '進貨': money, '人事成本': money, '固定支出': money, '其他支出': money,
    '線上手續費': money, '現金差額': money, '盈餘': money, '員工分紅': money, '年終預留': money, '其他扣除': money,
    '可分配': money, '進貨佔比': '0.0%', '人事佔比': '0.0%' });
  writeTable_(S.R_SHARE, R.shares.map(function (s) {
    return [s.store, s.month, s.status, s.name, s.pct, s.amount];
  }), { '分紅金額': money });
  writeTable_(S.R_CAT, R.cats.map(function (c) {
    return [c.store, c.month, c.cat, c.amount, c.pct];
  }), { '金額': money, '佔實際營收': '0.0%' });
  writeTable_(S.R_WARN, R.warns.map(function (w) {
    return [w.store, w.month, w.type, w.text];
  }));
  return R.months.length;
}
