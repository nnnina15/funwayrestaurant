/**
 * 風味記帳系統 v2（離線版的同步服務）
 * ------------------------------------------------------------
 * App 放在 GitHub Pages，可以離線使用；有網路時把「操作」送到這裡寫進試算表。
 * 這個專案要有兩個檔案：Code.gs（本檔）＋ compute.gs（= docs/compute.js 原封不動貼上）
 *
 *   設定_*   ：只有管理者改（店家、股東比例、進貨分類、員工）
 *   資料分頁 ：由 App 同步寫入（每日營收、進貨、人事明細…）
 *   報表_*   ：程式自動產生，不要手動改
 */

const TZ = 'Asia/Taipei';

const S = {
  STORE: '設定_店家', PARTNER: '設定_股東', CAT: '設定_進貨分類', EMP: '設定_員工', PRESET: '設定_常用項目', ACCOUNT: '設定_帳號',
  DAILY: '每日營收', PURCHASE: '進貨', EXPENSE: '其他支出', PAYROLL: '人事明細',
  DELIVERY: '外送對帳', DEDUCT: '分配前扣除',
  R_MONTH: '報表_月結', R_SHARE: '報表_分紅', R_CAT: '報表_進貨分類', R_WARN: '警示'
};

const HEAD = {};
HEAD[S.STORE] = ['店別', '手續費率(%)', '現金差額計入盈餘(是/否)', '現金差額警示門檻'];   // 手續費率：全支付／LINE Pay 還沒對帳時的估計值
HEAD[S.PARTNER] = ['店別', '股東', '比例(%)'];
HEAD[S.CAT] = ['店別(全部/店名)', '分類', '啟用月份(yyyy-MM)', '停用月份(yyyy-MM)'];
HEAD[S.EMP] = ['店別', '姓名', '類型(正職/計時)', '月薪', '時薪', '員工自付健保', '員工自付勞保', '公司勞退', '公司健保', '公司勞保', '在職(是/否)'];
HEAD[S.ACCOUNT] = ['帳號', '角色(管理/店長)', '店別(全部 或 店名,店名)', '啟用(是/否)', '臨時PIN', 'PIN(加密，勿改)', '最後登入'];
HEAD[S.PRESET] = ['店別', '用途', '名稱', '分類', '加扣'];   // 用途：每日結帳／固定支出／人事
HEAD[S.DAILY] = ['輸入時間', '日期', '店別', '公休', '現場', 'Panda', 'Uber', '全支付', 'LINE Pay', '現場支出', '點收現金', '應有現金', '現金差額', '備註', '裝置', '支出明細'];
HEAD[S.PURCHASE] = ['編號', '輸入時間', '日期', '店別', '分類', '金額', '備註', '裝置'];
HEAD[S.EXPENSE] = ['編號', '輸入時間', '月份', '店別', '類型', '項目', '金額', '備註', '裝置'];
HEAD[S.PAYROLL] = ['輸入時間', '月份', '店別', '姓名', '項目', '金額', '類別', '時數', '時薪', '裝置'];
HEAD[S.DELIVERY] = ['輸入時間', '月份', '店別', '平台', '期間', '費用明細(訂單金額)', '佣金', '月費', '拒單費用', '其他調整', '實際入帳', '備註', '裝置'];   // 一列＝一期；同平台同月份的實際入帳加總＝當月入帳
HEAD[S.DEDUCT] = ['編號', '輸入時間', '月份', '店別', '類型', '金額', '備註', '裝置'];
HEAD[S.R_MONTH] = ['店別', '月份', '狀態', '工作天', '現場營收', 'Panda營業額', 'Panda入帳', 'Uber營業額', 'Uber入帳',
  '實際營收', '日均營收', '進貨', '人事成本', '固定支出', '其他支出', '全支付收款', '全支付入帳', 'LINE Pay收款', 'LINE Pay入帳',
  '線上手續費', '手續費是估計', '現金差額', '盈餘',
  '員工分紅', '年終預留', '其他扣除', '可分配', '進貨佔比', '人事佔比', '警示數'];
HEAD[S.R_SHARE] = ['店別', '月份', '狀態', '股東', '比例(%)', '分紅金額'];
HEAD[S.R_CAT] = ['店別', '月份', '分類', '金額', '佔實際營收'];
HEAD[S.R_WARN] = ['店別', '月份', '類型', '說明'];

const TEXT_COLS = ['日期', '月份', '期間', '編號', '輸入時間', '帳號', '臨時PIN', 'PIN(加密，勿改)', '最後登入', '啟用月份(yyyy-MM)', '停用月份(yyyy-MM)'];
const PAYROLL_KINDS = ['薪資', '公司負擔', '預支'];
const EXPENSE_TYPES = ['固定', '其他'];
const DEDUCT_TYPES = ['員工分紅', '年終預留', '其他扣除'];
const PLATFORMS = ['Panda', 'Uber', '全支付', 'LINE Pay'];   // 後兩個是線上支付：記月底實際入帳
// 常用項目的預設值（App 裡「裝置 → 常用項目設定」可以改）
const DEFAULT_PRESETS = [
  ['每日結帳', '米', '米', ''], ['每日結帳', '菜', '菜', ''], ['每日結帳', '蔥', '菜', ''], ['每日結帳', '油條', '其他支出', ''],
  ['每日結帳', '燉滷', '其他支出', ''], ['每日結帳', 'PT', '薪資／預支', ''],
  ['固定支出', '房租', '固定', ''], ['固定支出', '電費', '固定', ''], ['固定支出', '水費', '固定', ''], ['固定支出', '電話費', '固定', ''],
  ['固定支出', '網路費', '固定', ''], ['固定支出', '瓦斯費', '固定', ''], ['固定支出', '拜拜', '固定', ''], ['固定支出', '聚餐', '其他', ''],
  ['固定支出', '外送費用', '其他', ''],
  ['人事', '加班費', '薪資', '加'], ['人事', '多加班', '薪資', '加'], ['人事', '全勤獎金', '薪資', '加'], ['人事', '責任津貼', '薪資', '加'],
  ['人事', '職務加給', '薪資', '加'], ['人事', '銷假上班', '薪資', '加'], ['人事', '節日獎金', '薪資', '加'], ['人事', '早退', '薪資', '扣'],
  ['人事', '請假扣薪', '薪資', '扣'], ['人事', '扣健保(自付)', '薪資', '扣'], ['人事', '扣勞保(自付)', '薪資', '扣'], ['人事', '已預支', '預支', '扣'],
  ['人事', '勞退(公司)', '公司負擔', '加'], ['人事', '健保(公司)', '公司負擔', '加'], ['人事', '勞保(公司)', '公司負擔', '加']
];
const PRESET_USES = ['每日結帳', '固定支出', '人事'];
const MANAGER_OPS = ['daily.upsert', 'purchase.add', 'purchase.del'];

/* ============================================================
 * 試算表選單 & 初始化
 * ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('風味記帳')
    .addItem('① 初始化（第一次使用）', 'setup')
    .addItem('② 需要時產生報表（平常不用）', 'buildReportsMenu')
    .addItem('③ 匯入舊資料', 'importOldData')
    .addItem('④ 清除舊表匯入的資料（重新匯入前用）', 'clearImported')
    .addToUi();
}

// 報表分頁平常不產生（大家看 App 的「總覽」）；需要時用選單「② 需要時產生報表」
const REPORT_SHEETS = [S.R_MONTH, S.R_SHARE, S.R_CAT, S.R_WARN];

function setup() {
  const ss = SpreadsheetApp.getActive();
  // 拿掉報表分頁和每天自動重算的排程
  REPORT_SHEETS.forEach(function (n) { const sh = ss.getSheetByName(n); if (sh && ss.getSheets().length > 1) ss.deleteSheet(sh); });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'buildReports') ScriptApp.deleteTrigger(t); });
  Object.keys(HEAD).filter(function (n) { return REPORT_SHEETS.indexOf(n) < 0; }).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const h = HEAD[name];
    if (name === S.DELIVERY) migrateDelivery_(sh);   // 舊版「明細」文字欄 → 每期一列、每項一欄
    realign_(sh, h);                        // 欄位有增減時，舊資料照欄名搬到新位置，不會錯位
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#f3efe6');
    sh.setFrozenRows(1);
    h.forEach(function (k, i) {
      if (TEXT_COLS.indexOf(k) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  });

  seed_(S.STORE, [['大埔店', 2, '否', 500], ['中正店', 2, '否', 500]]);
  seed_(S.PARTNER, [['大埔店', '豐吉', 60], ['大埔店', '浩勤', 20], ['大埔店', '呀肥', 20],
    ['中正店', '浩勤', 65], ['中正店', '豐吉', 35]]);
  const cats = ['麵', '雞蛋', '菜', '洋蔥/火腿丁', '瓦斯', '萬昌肉品', '豬肉攤', '牛亨', '雞肉', '海鮮/蒜', '蝦仁',
    '米', '免洗', '銘利行', '乾貨/配菜', '鹽水/醬油', '五金/文具', '大禹商行', '員工飲/食'];
  seed_(S.CAT, cats.map(function (c) { return ['全部', c, '', c === '牛亨' ? '2026-10' : '']; }));
  seed_(S.EMP, [
    ['大埔店', '範例正職(請改名)', '正職', 45000, '', 485, 738, 1770, 1428, 2368, '是'],
    ['大埔店', '範例計時(請改名)', '計時', '', 250, '', '', '', '', '', '是']
  ]);

  seed_(S.ACCOUNT, [['管理員', '管理', '全部', '是', 'Funway#2026', '', '']]);
  seed_(S.PRESET, DEFAULT_PRESETS.map(function (p) { return ['全部'].concat(p); }));
  secret_();   // 建立登入用的密鑰
  MailApp.getRemainingDailyQuota();   // 先要求寄信權限，之後鎖定通知才寄得出去

  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  SpreadsheetApp.getUi().alert('初始化完成！\n\n1. 到「設定_帳號」把「管理員」改成你的名字；第一次登入用臨時 PIN「Funway#2026」，登入後會要求設定自己的 PIN\n2. 到「設定_員工」填入真實員工\n3. 部署成網頁應用程式，把網址貼到 App');
}

// 依欄名重新排列整張表（程式改版、欄位增減時用）；不認得的舊欄位會刪掉
function realign_(sh, h) {
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return;
  const vals = sh.getRange(1, 1, lr, lc).getValues();
  const old = vals[0].map(str_);
  if (old.join('|') === h.join('|')) return;
  if (!old.some(function (k) { return h.indexOf(k) >= 0; })) return;      // 完全不認得的表頭：不動
  const rows = vals.slice(1).filter(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); })
    .map(function (r) { return h.map(function (k) { const i = old.indexOf(k); return i >= 0 ? r[i] : ''; }); });
  sh.clearContents();
  if (sh.getMaxColumns() > h.length) sh.deleteColumns(h.length + 1, sh.getMaxColumns() - h.length);
  h.forEach(function (k, i) { if (TEXT_COLS.indexOf(k) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  sh.getRange(1, 1, 1, h.length).setValues([h]);
  if (rows.length) sh.getRange(2, 1, rows.length, h.length).setValues(rows);
}

function migrateDelivery_(sh) {
  const lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 1 || lc < 1) return;
  const vals = sh.getRange(1, 1, lr, lc).getValues(), old = vals[0].map(str_), mi = old.indexOf('明細');
  if (mi < 0) return;
  const KEY = { '明細': 'gross', '佣金': 'commission', '月費': 'monthly', '拒單': 'reject', '其他': 'other' };
  const h = HEAD[S.DELIVERY], out = [];
  vals.slice(1).forEach(function (r) {
    const get = function (k) { const i = old.indexOf(k); return i >= 0 ? r[i] : ''; };
    if (!str_(get('平台'))) return;
    const base = h.map(function (k) { return get(k); });
    const text = str_(r[mi]);
    if (!text) { out.push(base); return; }
    text.split('｜').forEach(function (part) {
      const i = part.indexOf('：'), row = base.slice(), q = {};
      row[h.indexOf('期間')] = i >= 0 ? part.slice(0, i) : '';
      (i >= 0 ? part.slice(i + 1) : part).split('、').forEach(function (kv) {
        const m = kv.match(/^(\S+)\s+(-?[\d.]+)$/); if (m && KEY[m[1]]) q[KEY[m[1]]] = Number(m[2]);
      });
      DV_COLS.forEach(function (c) { row[h.indexOf(c[1])] = q[c[0]] || ''; });
      row[h.indexOf('實際入帳')] = DV_COLS.reduce(function (a, c) { return a + (q[c[0]] || 0); }, 0);
      out.push(row);
    });
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, h.length).setValues([h]);
  if (out.length) sh.getRange(2, 1, out.length, h.length).setValues(out);
}

// ④ 清除舊表匯入的資料：只刪「裝置＝舊表匯入」的列，App 輸入的資料不動（重新匯入前用）
function clearImported() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('清除舊表匯入的資料', '會刪掉每日營收、進貨、其他支出、人事明細、外送對帳、分配前扣除裡「裝置＝舊表匯入」的資料。\n用 App 輸入的資料不會動。確定嗎？', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const msg = withLock_(function () { return clearImported_(); });
  ui.alert('已清除：\n' + msg + '\n\n接著用「③ 匯入舊資料」匯入新的檔案。');
}
function clearImported_() {
  return [S.DAILY, S.PURCHASE, S.EXPENSE, S.PAYROLL, S.DELIVERY, S.DEDUCT].map(function (name) {
    const n = deleteWhere_(name, function (x) { return str_(x['裝置']) === '舊表匯入'; });
    return name + '：' + n + ' 筆';
  }).join('\n');
}

function seed_(name, rows) {
  const sh = sheet_(name);
  if (sh.getLastRow() > 1) return;
  const h = HEAD[name];
  append_(name, rows.map(function (r) {
    const o = {}; h.forEach(function (k, i) { o[k] = r[i] === undefined ? '' : r[i]; }); return o;
  }));
}

/* ============================================================
 * 匯入舊資料：從另一份同格式的試算表把資料加進來
 * 已經存在的資料（同一天、同一個編號、同一人同一月）會略過，不會重複或覆蓋
 * ============================================================ */

function importOldData() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('匯入舊資料', '貼上「風味記帳_舊資料匯入」試算表的網址：', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const m = resp.getResponseText().match(/[-\w]{25,}/);
  if (!m) { ui.alert('看不懂這個網址，請貼上完整的試算表網址'); return; }
  const msg = withLock_(function () { return importFrom_(SpreadsheetApp.openById(m[0])); });
  ui.alert('匯入完成！\n\n' + msg + '\n\n打開 App 的「總覽」就能看到。');
}

function importFrom_(src) {
  const KEYS = {};
  KEYS[S.EMP] = ['店別', '姓名'];
  KEYS[S.DAILY] = ['店別', '日期'];
  KEYS[S.PURCHASE] = ['店別', '編號'];
  KEYS[S.EXPENSE] = ['店別', '編號'];
  KEYS[S.PAYROLL] = ['店別', '月份', '姓名'];
  KEYS[S.DELIVERY] = ['店別', '月份', '平台'];
  KEYS[S.DEDUCT] = ['店別', '編號'];
  KEYS[S.CAT] = ['店別(全部/店名)', '分類'];
  const lines = [];
  // 進貨分類：匯入檔若是「每家店各自一套」，就把原本共用（全部）的那套換掉
  const srcCat = src.getSheetByName(S.CAT);
  if (srcCat && srcCat.getLastRow() > 1) {
    const sv = srcCat.getRange(1, 1, srcCat.getLastRow(), srcCat.getLastColumn()).getValues();
    const si = sv[0].map(str_).indexOf('店別(全部/店名)');
    const perStore = si >= 0 && sv.slice(1).every(function (r) { return str_(r[si]) && str_(r[si]) !== '全部'; });
    if (perStore) {
      const n = deleteWhere_(S.CAT, function (r) { return str_(r['店別(全部/店名)']) === '全部'; });
      if (n) lines.push(S.CAT + '：改成每家店各自的分類（移除共用 ' + n + ' 筆）');
    }
  }
  Object.keys(KEYS).forEach(function (name) {
    const sh = src.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    const h = vals[0].map(str_);
    const objs = vals.slice(1).map(function (r) {
      const o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o;
    }).filter(function (o) { return str_(o[KEYS[name][0]]); });
    const keyOf = function (o) { return KEYS[name].map(function (k) { return normCell_(k, o[k]); }).join('|'); };
    if (name === S.EMP) deleteWhere_(S.EMP, function (r) { return str_(r['姓名']).indexOf('範例') >= 0; });
    const have = {};
    rows_(name).forEach(function (r) { have[keyOf(r)] = true; });
    const add = [];
    let skip = 0;
    objs.forEach(function (o) {
      if (have[keyOf(o)]) { skip++; return; }
      const row = {};
      HEAD[name].forEach(function (k) { row[k] = normCell_(k, o[k]); });
      add.push(row);
    });
    append_(name, add);
    lines.push(name + '：新增 ' + add.length + ' 筆' + (skip ? '（已存在略過 ' + skip + ' 筆）' : ''));
  });
  return lines.join('\n');
}

function normCell_(k, v) {
  if (k === '日期') return dateKey_(v);
  if (k === '月份' || k === '啟用月份(yyyy-MM)' || k === '停用月份(yyyy-MM)') return monthKey_(v);
  if (k === '輸入時間') return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : str_(v);
  if (k === '編號' || k === '店別' || k === '姓名') return str_(v);
  return v === undefined || v === null ? '' : v;
}

/* ============================================================
 * 對外介面：App 用 POST 呼叫
 * ============================================================ */

function doGet() {
  return json_({ ok: true, app: '風味記帳同步服務', time: now_() });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    switch (req.action) {
      case 'ping': return json_({ ok: true, app: '風味記帳同步服務', time: now_() });
      case 'login': return json_(login_(req));
      case 'changePin': return json_(changePin_(req));
      case 'sync': return json_(sync_(req));
      default: return json_({ ok: false, error: '未知的動作' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err), auth: !!(err && err.auth) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// 猜錯 5 次就鎖 15 分鐘（每個帳號分開算），並寄信通知
const MAX_FAIL = 5, LOCK_SECONDS = 15 * 60;

/* ---------- 帳號：在試算表「設定_帳號」管理 ---------- */

function accounts_() {
  return rows_(S.ACCOUNT).filter(function (r) { return str_(r['帳號']); }).map(function (r) {
    return { name: str_(r['帳號']), role: str_(r['角色(管理/店長)']) === '管理' ? 'admin' : 'manager',
      stores: str_(r['店別(全部 或 店名,店名)']) || '全部', active: str_(r['啟用(是/否)']) !== '否',
      temp: str_(r['臨時PIN']), hash: str_(r['PIN(加密，勿改)']), _row: r._row };
  });
}
function account_(name) {
  return accounts_().filter(function (a) { return a.name === str_(name); })[0] || null;
}
// 這個帳號可以用哪些店（管理＝全部；店長＝設定裡列的店）
function storesOf_(acc) {
  const all = stores_().map(function (s) { return s.name; });
  if (acc.role === 'admin' || acc.stores === '全部') return all;
  const mine = acc.stores.split(/[,，、\s]+/).map(str_).filter(Boolean);
  return all.filter(function (n) { return mine.indexOf(n) >= 0; });
}
function setAccountCells_(acc, obj) {
  const sh = sheet_(S.ACCOUNT), h = HEAD[S.ACCOUNT];
  Object.keys(obj).forEach(function (k) {
    const c = sh.getRange(acc._row, h.indexOf(k) + 1); c.setNumberFormat('@'); c.setValue(obj[k]);
  });
}

// PIN 規則：至少 8 個字元，要有英文字母＋數字＋符號
function pinRule_(pin) {
  pin = String(pin || '');
  if (pin.length < 8) return 'PIN 至少要 8 個字元';
  if (!/[A-Za-z]/.test(pin)) return 'PIN 要包含英文字母';
  if (!/[0-9]/.test(pin)) return 'PIN 要包含數字';
  if (!/[^A-Za-z0-9]/.test(pin)) return 'PIN 要包含符號（例如 # ! @ $）';
  return '';
}
function hashPin_(pin, salt) {
  salt = salt || Utilities.getUuid().slice(0, 12);
  let d = salt + '|' + pin;
  for (let i = 0; i < 500; i++) {
    d = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d + '|' + secret_()));
  }
  return salt + '$' + d;
}
function checkPin_(acc, pin) {
  if (!acc.hash || acc.hash.indexOf('$') < 0) return false;
  return hashPin_(pin, acc.hash.split('$')[0]) === acc.hash;
}

function fail_(acc, name, device) {
  const cache = CacheService.getScriptCache(), key = 'fail_' + name;
  const fails = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(fails), LOCK_SECONDS);
  if (fails === MAX_FAIL) alertLock_(name, device, !!acc);
  return '帳號或 PIN 錯誤' + (fails < MAX_FAIL ? '（再錯 ' + (MAX_FAIL - fails) + ' 次會鎖定 15 分鐘）' : '');
}

function login_(req) {
  const name = str_(req.account), pin = String(req.pin || '');
  const cache = CacheService.getScriptCache(), key = 'fail_' + name;
  if (Number(cache.get(key) || 0) >= MAX_FAIL) throw new Error('錯太多次，這個帳號已鎖定 15 分鐘，請稍後再試');
  const acc = account_(name);
  if (!acc || !acc.active) throw new Error(fail_(acc, name, req.device));
  // 第一次登入（或管理者重設）：用臨時 PIN，並且一定要設定新的 PIN
  if (acc.temp && pin === acc.temp) {
    if (!req.newPin) return { ok: false, needNewPin: true, error: '第一次登入，請設定你自己的 PIN' };
    const bad = pinRule_(req.newPin);
    if (bad) return { ok: false, needNewPin: true, error: bad };
    if (req.newPin === acc.temp) return { ok: false, needNewPin: true, error: '新 PIN 不能和臨時 PIN 一樣' };
    acc.hash = hashPin_(req.newPin);
    setAccountCells_(acc, { '臨時PIN': '', 'PIN(加密，勿改)': acc.hash });
  } else if (!checkPin_(acc, pin)) {
    throw new Error(fail_(acc, name, req.device));
  }
  cache.remove(key);
  const list = storesOf_(acc);
  if (!list.length) throw new Error('這個帳號還沒有可以用的店，請管理者到「設定_帳號」設定店別');
  const store = list.indexOf(str_(req.store)) >= 0 ? str_(req.store) : list[0];
  setAccountCells_(acc, { '最後登入': now_() + (req.device ? '（' + str_(req.device) + '）' : '') });
  return Object.assign({ ok: true, account: acc.name, role: acc.role, stores: list, store: store, token: token_(acc) },
    pull_(storeByName_(store), acc.role));
}

function changePin_(req) {
  const acc = verify_(str_(req.account), str_(req.token));
  if (!checkPin_(acc, String(req.oldPin || ''))) throw new Error('舊 PIN 不對');
  const bad = pinRule_(req.newPin);
  if (bad) throw new Error(bad);
  acc.hash = hashPin_(req.newPin);
  setAccountCells_(acc, { 'PIN(加密，勿改)': acc.hash, '臨時PIN': '' });
  return { ok: true, token: token_(acc) };
}

// 被鎖定時寄 Gmail 給試算表擁有者（同一次鎖定只寄一封）
function alertLock_(name, device, exists) {
  try {
    const to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: '⚠ 風味記帳：帳號「' + name + '」PIN 連續錯 ' + MAX_FAIL + ' 次，已鎖定 15 分鐘',
      body: [
        '風味記帳偵測到有人連續輸入錯誤的帳號或 PIN。',
        '',
        '帳號：' + name + (exists ? '' : '（這個帳號不存在，可能是有人在亂試）'),
        '時間：' + now_(),
        '裝置：' + (device || '（沒有提供，可能不是用 App 登入）'),
        '',
        '如果是員工自己打錯：不用處理，15 分鐘後就能再試；忘記 PIN 的話，到「設定_帳號」幫他填一個臨時PIN。',
        '如果不是你們的人：可能有人拿到了同步網址，必要時到 Apps Script 重新部署新網址，並更新每台裝置。',
        '',
        '（這封信由風味記帳系統自動寄出）'
      ].join('\n')
    });
  } catch (err) {
    console.error('寄送鎖定通知失敗：' + err);
  }
}

function sync_(req) {
  const acc = verify_(str_(req.account), str_(req.token));
  const list = storesOf_(acc);
  if (list.indexOf(str_(req.store)) < 0) { const e = new Error('這個帳號沒有「' + str_(req.store) + '」的權限'); e.auth = true; throw e; }
  const s = storeByName_(str_(req.store)), role = acc.role;
  const ops = Array.isArray(req.ops) ? req.ops : [];
  const results = [];
  let changed = 0;
  if (ops.length) {
    withLock_(function () {
      ops.forEach(function (op) {
        try {
          const fromSlip = /^expense\.(add|del)$/.test(op.type) && /^E\d{8}/.test(str_((op.data || {}).id));   // 每日結帳自動產生的其他支出
          if (role !== 'admin' && MANAGER_OPS.indexOf(op.type) < 0 && !fromSlip) throw new Error('店長沒有權限：' + op.type);
          const st = applyServerOp_(s.name, op);
          if (st === 'ok') changed++;
          results.push({ id: op.id, status: st });
        } catch (err) {
          results.push({ id: op.id, status: 'error', error: String(err && err.message || err) });
        }
      });
    });
  }
  return Object.assign({ ok: true, account: acc.name, role: role, stores: list, results: results }, pull_(s, role));
}

/* ---------- 登入權杖：改 PIN、停用帳號，舊權杖就自動失效 ---------- */

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let k = p.getProperty('SECRET');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', k); }
  return k;
}

function token_(acc) {
  const sig = Utilities.computeHmacSha256Signature(acc.name + '|' + acc.hash, secret_());
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

function verify_(name, token) {
  const acc = account_(name);
  if (acc && acc.active && acc.hash && token && token === token_(acc)) return acc;
  const e = new Error('登入已失效（PIN 改過或帳號停用），請重新登入');
  e.auth = true;
  throw e;
}

/* ---------- 套用一筆操作 ---------- */

function applyServerOp_(store, op) {
  const d = op.data || {};
  const at = str_(d.editedAt) || now_();
  const dev = str_(d.device);
  switch (op.type) {
    case 'daily.upsert': {
      const date = dateKey_(d.date);
      if (!date) throw new Error('日期錯誤');
      const same = function (x) { return str_(x['店別']) === store && dateKey_(x['日期']) === date; };
      if (newer_(S.DAILY, same, at)) return 'stale';
      const site = num_(d.site), allpay = num_(d.allpay), line = num_(d.line), spend = num_(d.spend), cash = num_(d.cash);
      const expected = site - allpay - line - spend;
      deleteWhere_(S.DAILY, same);
      append_(S.DAILY, [{ '輸入時間': at, '日期': date, '店別': store, '公休': d.closed ? '是' : '',
        '現場': site, 'Panda': num_(d.panda), 'Uber': num_(d.uber), '全支付': allpay, 'LINE Pay': line,
        '現場支出': spend, '點收現金': cash, '應有現金': expected, '現金差額': d.closed ? 0 : cash - expected,
        '備註': str_(d.note), '裝置': dev, '支出明細': linesText_(d.lines) }]);
      return 'ok';
    }
    case 'purchase.add': {
      if (exists_(S.PURCHASE, store, d.id)) return 'dup';
      if (!dateKey_(d.date) || !str_(d.cat)) throw new Error('進貨缺日期或分類');
      append_(S.PURCHASE, [{ '編號': str_(d.id), '輸入時間': at, '日期': dateKey_(d.date), '店別': store,
        '分類': str_(d.cat), '金額': num_(d.amount), '備註': str_(d.note), '裝置': dev }]);
      return 'ok';
    }
    case 'expense.add': {
      if (exists_(S.EXPENSE, store, d.id)) return 'dup';
      if (!monthKey_(d.month) || !str_(d.item)) throw new Error('支出缺月份或項目');
      append_(S.EXPENSE, [{ '編號': str_(d.id), '輸入時間': at, '月份': monthKey_(d.month), '店別': store,
        '類型': EXPENSE_TYPES.indexOf(d.type) >= 0 ? d.type : '其他', '項目': str_(d.item),
        '金額': num_(d.amount), '備註': str_(d.note), '裝置': dev }]);
      return 'ok';
    }
    case 'deduct.add': {
      if (exists_(S.DEDUCT, store, d.id)) return 'dup';
      if (!monthKey_(d.month)) throw new Error('扣除缺月份');
      append_(S.DEDUCT, [{ '編號': str_(d.id), '輸入時間': at, '月份': monthKey_(d.month), '店別': store,
        '類型': DEDUCT_TYPES.indexOf(d.type) >= 0 ? d.type : '其他扣除', '金額': num_(d.amount),
        '備註': str_(d.note), '裝置': dev }]);
      return 'ok';
    }
    case 'purchase.del': deleteWhere_(S.PURCHASE, byId_(store, d.id)); return 'ok';
    case 'expense.del': deleteWhere_(S.EXPENSE, byId_(store, d.id)); return 'ok';
    case 'deduct.del': deleteWhere_(S.DEDUCT, byId_(store, d.id)); return 'ok';
    case 'presets.set': {
      const use = str_(d.use);
      if (PRESET_USES.indexOf(use) < 0) throw new Error('常用項目用途錯誤');
      deleteWhere_(S.PRESET, function (x) { return str_(x['店別']) === store && str_(x['用途']) === use; });
      append_(S.PRESET, (d.items || []).filter(function (it) { return str_(it.name); }).map(function (it) {
        return { '店別': store, '用途': use, '名稱': str_(it.name), '分類': str_(it.cat), '加扣': str_(it.sign) === '扣' ? '扣' : (use === '人事' ? '加' : '') };
      }));
      return 'ok';
    }
    case 'payroll.upsert': {
      const month = monthKey_(d.month), name = str_(d.name);
      if (!month || !name) throw new Error('人事缺月份或姓名');
      const same = function (x) { return str_(x['店別']) === store && monthKey_(x['月份']) === month && str_(x['姓名']) === name; };
      if (newer_(S.PAYROLL, same, at)) return 'stale';
      deleteWhere_(S.PAYROLL, same);
      append_(S.PAYROLL, (d.items || []).filter(function (it) { return str_(it.item); }).map(function (it) {
        const hasRate = it.rate !== '' && it.rate !== null && it.rate !== undefined;
        return { '輸入時間': at, '月份': month, '店別': store, '姓名': name, '項目': str_(it.item),
          '金額': hasRate ? Math.round(num_(it.hours) * num_(it.rate)) : num_(it.amount),
          '類別': PAYROLL_KINDS.indexOf(it.kind) >= 0 ? it.kind : '薪資',
          '時數': hasRate ? num_(it.hours) : '', '時薪': hasRate ? num_(it.rate) : '', '裝置': dev };
      }));
      return 'ok';
    }
    case 'delivery.upsert': {
      const month = monthKey_(d.month), p = str_(d.platform);
      if (!month || PLATFORMS.indexOf(p) < 0) throw new Error('外送對帳資料錯誤');
      const same = function (x) { return str_(x['店別']) === store && monthKey_(x['月份']) === month && str_(x['平台']) === p; };
      if (newer_(S.DELIVERY, same, at)) return 'stale';
      deleteWhere_(S.DELIVERY, same);
      if (d.amount !== '' && d.amount !== null && d.amount !== undefined) {
        const base = { '輸入時間': at, '月份': month, '店別': store, '平台': p, '備註': '', '裝置': dev };
        const ps = (d.periods || []).filter(Boolean);
        append_(S.DELIVERY, ps.length ? ps.map(function (q) {
          const row = Object.assign({}, base, { '期間': str_(q.label) });
          DV_COLS.forEach(function (k) { row[k[1]] = num_(q[k[0]]) || ''; });
          row['實際入帳'] = DV_COLS.reduce(function (a, k) { return a + num_(q[k[0]]); }, 0);
          return row;
        }) : [Object.assign(base, { '實際入帳': num_(d.amount) })]);
      }
      return 'ok';
    }
  }
  throw new Error('未知的操作：' + op.type);
}

// 外送對帳：試算表每個項目一欄、每一期一列
const DV_COLS = [['gross', '費用明細(訂單金額)'], ['commission', '佣金'], ['monthly', '月費'], ['reject', '拒單費用'], ['other', '其他調整']];
// 同店、同月、同平台的幾列合成一筆給 App／報表用
function deliveryGroups_(rows) {
  const by = {}, out = [];
  rows.forEach(function (r) {
    const store = str_(r['店別']), month = monthKey_(r['月份']), platform = str_(r['平台']);
    if (!store || !month || !platform) return;
    const k = store + '|' + month + '|' + platform;
    if (!by[k]) { by[k] = { store: store, month: month, platform: platform, amount: 0, periods: [], editedAt: tsKey_(r['輸入時間']) }; out.push(by[k]); }
    const g = by[k];
    g.amount += num_(r['實際入帳']);
    if (tsKey_(r['輸入時間']) > g.editedAt) g.editedAt = tsKey_(r['輸入時間']);
    const hasDetail = str_(r['期間']) || DV_COLS.some(function (c) { return num_(r[c[1]]); });
    if (hasDetail) {
      const q = { label: str_(r['期間']) };
      DV_COLS.forEach(function (c) { if (num_(r[c[1]])) q[c[0]] = num_(r[c[1]]); });
      g.periods.push(q);
    }
  });
  out.forEach(function (g) { if (!g.periods.length) g.periods = null; g.amount = Math.round(g.amount * 100) / 100; });
  return out;
}

// 支出明細：存成好讀的文字，例如「燉滷 500｜米 3516（記帳→米）」，App 讀回來可以再編輯
function linesText_(lines) {
  return (lines || []).filter(function (l) { return str_(l.name) || num_(l.amount); }).map(function (l) {
    const tag = [];
    if (l.cash === false) tag.push('記帳');
    if (str_(l.cat)) tag.push('→' + str_(l.cat) + (str_(l.pid) ? '#' + str_(l.pid) : ''));
    return str_(l.name).replace(/[｜（）]/g, ' ') + ' ' + num_(l.amount) + (tag.length ? '（' + tag.join('') + '）' : '');
  }).join('｜');
}
function parseLines_(text) {
  text = str_(text);
  if (!text) return [];
  return text.split('｜').map(function (part) {
    const m = part.match(/^(.*?)\s+(-?[\d.]+)(?:（(記帳)?(?:→([^#）]+)(?:#([^）]+))?)?）)?$/);
    if (!m) return { name: part, amount: 0, cash: true, cat: '' };
    const o = { name: m[1], amount: Number(m[2]), cash: !m[3], cat: m[4] || '' };
    if (m[5]) o.pid = m[5];
    return o;
  });
}

// 別台裝置已經存了「更新」的版本 → 這筆舊的不要蓋掉
function newer_(name, pred, at) {
  return rows_(name).some(function (x) { return pred(x) && tsKey_(x['輸入時間']) > at; });
}

// 輸入時間統一成 yyyy-MM-dd HH:mm:ss（試算表若自動轉成日期也能正確比較）
function tsKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return str_(v);
}
function exists_(name, store, id) { return rows_(name).some(byId_(store, id)); }
function byId_(store, id) { return function (x) { return str_(x['店別']) === store && str_(x['編號']) === str_(id); }; }

/* ---------- 回傳給 App 的資料 ---------- */

function pull_(s, role) {
  const all = role === 'admin';
  const since = prevMonth_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM'));   // 店長只拿上個月起
  const mine = function (r) { return r.store === s.name; };
  const recent = function (r) { return all || r.date.slice(0, 7) >= since; };
  const data = {
    daily: rows_(S.DAILY).map(rec_.daily).filter(mine).filter(recent),
    purchase: rows_(S.PURCHASE).map(rec_.purchase).filter(mine).filter(recent),
    expense: all ? rows_(S.EXPENSE).map(rec_.expense).filter(mine) : [],
    payroll: all ? rows_(S.PAYROLL).map(rec_.payroll).filter(mine) : [],
    delivery: all ? deliveryGroups_(rows_(S.DELIVERY)).filter(mine) : [],
    deduct: all ? rows_(S.DEDUCT).map(rec_.deduct).filter(mine) : [],
    presets: rows_(S.PRESET).map(rec_.preset).filter(function (r) { return r.name && (r.store === s.name || r.store === '全部'); })
  };
  const config = {
    store: { name: s.name, fee: s.fee, cashIn: s.cashIn, cashWarn: s.cashWarn },
    categories: rows_(S.CAT).filter(function (r) { return str_(r['分類']); }).map(function (r) {
      return { store: str_(r['店別(全部/店名)']) || '全部', cat: str_(r['分類']),
        from: monthKey_(r['啟用月份(yyyy-MM)']), to: monthKey_(r['停用月份(yyyy-MM)']) };
    }).filter(function (c) { return c.store === '全部' || c.store === s.name; }),
    employees: all ? employees_(s.name) : [],
    partners: all ? partners_().filter(mine) : [],
    kinds: PAYROLL_KINDS, expenseTypes: EXPENSE_TYPES, deductTypes: DEDUCT_TYPES
  };
  return { config: config, data: data, serverTime: now_() };
}

const rec_ = {
  preset: function (r) {
    return { store: str_(r['店別']) || '全部', use: str_(r['用途']), name: str_(r['名稱']), cat: str_(r['分類']), sign: str_(r['加扣']) };
  },
  daily: function (r) {
    return { store: str_(r['店別']), date: dateKey_(r['日期']), closed: yes_(r['公休']), site: num_(r['現場']),
      panda: num_(r['Panda']), uber: num_(r['Uber']), allpay: num_(r['全支付']), line: num_(r['LINE Pay']),
      spend: num_(r['現場支出']), cash: num_(r['點收現金']), cashDiff: num_(r['現金差額']),
      note: str_(r['備註']), editedAt: tsKey_(r['輸入時間']), device: str_(r['裝置']), lines: parseLines_(r['支出明細']) };
  },
  purchase: function (r) {
    return { store: str_(r['店別']), id: str_(r['編號']), date: dateKey_(r['日期']), cat: str_(r['分類']),
      amount: num_(r['金額']), note: str_(r['備註']), editedAt: tsKey_(r['輸入時間']), device: str_(r['裝置']) };
  },
  expense: function (r) {
    return { store: str_(r['店別']), id: str_(r['編號']), month: monthKey_(r['月份']), type: str_(r['類型']),
      item: str_(r['項目']), amount: num_(r['金額']), note: str_(r['備註']), editedAt: tsKey_(r['輸入時間']) };
  },
  payroll: function (r) {
    return { store: str_(r['店別']), month: monthKey_(r['月份']), name: str_(r['姓名']), item: str_(r['項目']),
      amount: num_(r['金額']), kind: str_(r['類別']) || '薪資',
      hours: r['時數'] === '' ? '' : num_(r['時數']), rate: r['時薪'] === '' ? '' : num_(r['時薪']),
      editedAt: tsKey_(r['輸入時間']) };
  },
  deduct: function (r) {
    return { store: str_(r['店別']), id: str_(r['編號']), month: monthKey_(r['月份']), type: str_(r['類型']),
      amount: num_(r['金額']), note: str_(r['備註']), editedAt: tsKey_(r['輸入時間']) };
  }
};

/* ============================================================
 * 設定
 * ============================================================ */

function stores_() {
  return rows_(S.STORE).filter(function (r) { return str_(r['店別']); }).map(function (r) {
    return { name: str_(r['店別']),
      fee: num_(r['手續費率(%)']), cashIn: yes_(r['現金差額計入盈餘(是/否)']),
      cashWarn: num_(r['現金差額警示門檻']) || 500 };
  });
}

function storeByName_(name) {
  const s = stores_().filter(function (x) { return x.name === name; })[0];
  if (!s) throw new Error('找不到店別：' + name);
  return s;
}

function partners_() {
  return rows_(S.PARTNER).filter(function (r) { return str_(r['店別']) && str_(r['股東']); })
    .map(function (r) { return { store: str_(r['店別']), name: str_(r['股東']), pct: num_(r['比例(%)']) }; });
}

function employees_(store) {
  return rows_(S.EMP).filter(function (r) {
    return str_(r['店別']) === store && str_(r['姓名']) && str_(r['在職(是/否)']) !== '否';
  }).map(function (r) {
    return { name: str_(r['姓名']), type: str_(r['類型(正職/計時)']) || '正職',
      salary: num_(r['月薪']), hourly: num_(r['時薪']),
      selfHealth: num_(r['員工自付健保']), selfLabor: num_(r['員工自付勞保']),
      pension: num_(r['公司勞退']), health: num_(r['公司健保']), labor: num_(r['公司勞保']) };
  });
}

/* ============================================================
 * 報表（計算邏輯在 compute.gs 的 computeAll_）
 * ============================================================ */

function loadData_() {
  const stores = stores_();
  const employees = {};
  stores.forEach(function (s) { employees[s.name] = employees_(s.name).map(function (e) { return e.name; }); });
  return {
    stores: stores, partners: partners_(), employees: employees,
    daily: rows_(S.DAILY).map(rec_.daily), purchase: rows_(S.PURCHASE).map(rec_.purchase),
    expense: rows_(S.EXPENSE).map(rec_.expense), payroll: rows_(S.PAYROLL).map(rec_.payroll),
    delivery: deliveryGroups_(rows_(S.DELIVERY)), deduct: rows_(S.DEDUCT).map(rec_.deduct)
  };
}

function buildReportsMenu() {
  const n = buildReports();
  SpreadsheetApp.getUi().alert('已產生報表（' + n + ' 個月）：報表_月結、報表_分紅、報表_進貨分類、警示。\n\n這些分頁不會自動更新，下次按「① 初始化」會刪掉。');
}

function buildReports() {
  const ss = SpreadsheetApp.getActive();
  REPORT_SHEETS.forEach(function (n) {
    let sh = ss.getSheetByName(n); if (!sh) sh = ss.insertSheet(n);
    sh.getRange(1, 1, 1, HEAD[n].length).setValues([HEAD[n]]).setFontWeight('bold').setBackground('#f3efe6'); sh.setFrozenRows(1);
  });
  const R = computeAll_(loadData_(), today_());
  const money = '#,##0';
  writeTable_(S.R_MONTH, R.months.map(function (m) {
    return [m.store, m.month, m.status, m.days, m.site, m.pandaG, m.pandaN === null ? '未填' : m.pandaN,
      m.uberG, m.uberN === null ? '未填' : m.uberN, m.actual, m.avg, m.purchase, m.staff, m.fixed, m.other,
      m.allpay, m.allpayN === null ? '未填' : m.allpayN, m.line, m.lineN === null ? '未填' : m.lineN,
      m.fee, m.feeEst ? '是' : '', m.cashDiff, m.profit, m.bonus, m.reserve, m.deductOther, m.dist, m.purchasePct, m.staffPct, m.warnCount];
  }), { '現場營收': money, 'Panda營業額': money, 'Panda入帳': money, 'Uber營業額': money, 'Uber入帳': money,
    '實際營收': money, '日均營收': money, '進貨': money, '人事成本': money, '固定支出': money, '其他支出': money,
    '全支付收款': money, '全支付入帳': money, 'LINE Pay收款': money, 'LINE Pay入帳': money, '線上手續費': money, '現金差額': money, '盈餘': money, '員工分紅': money, '年終預留': money, '其他扣除': money,
    '可分配': money, '進貨佔比': '0.0%', '人事佔比': '0.0%' });
  writeTable_(S.R_SHARE, R.shares.map(function (s) { return [s.store, s.month, s.status, s.name, s.pct, s.amount]; }), { '分紅金額': money });
  writeTable_(S.R_CAT, R.cats.map(function (c) { return [c.store, c.month, c.cat, c.amount, c.pct]; }), { '金額': money, '佔實際營收': '0.0%' });
  writeTable_(S.R_WARN, R.warns.map(function (w) { return [w.store, w.month, w.type, w.text]; }));
  return R.months.length;
}

/* ============================================================
 * 試算表小工具
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
  const all = rows_(name);
  const rs = all.filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  if (rs.length <= 20) { rs.forEach(function (r) { sh.deleteRow(r); }); return rs.length; }
  // 大量刪除：一次重寫，比一列一列刪快很多
  const h = HEAD[name], keep = all.filter(function (r) { return !pred(r); }).map(function (r) { return h.map(function (k) { return r[k]; }); });
  sh.getRange(2, 1, all.length, h.length).clearContent();
  h.forEach(function (k, i) { if (TEXT_COLS.indexOf(k) >= 0 && keep.length) sh.getRange(2, i + 1, keep.length, 1).setNumberFormat('@'); });
  if (keep.length) sh.getRange(2, 1, keep.length, h.length).setValues(keep);
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

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function yes_(v) { return v === true || /^(是|y|yes|true|1|v|✓)$/i.test(String(v).trim()); }

function num_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v === undefined || v === null ? '' : v).replace(/[,\s$]/g, ''));
  return isFinite(n) ? n : 0;
}

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
