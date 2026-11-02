/* 風味記帳 App v2：離線優先，有網路自動同步到 Google 試算表 */
'use strict';

var TABS = [
  ['daily', '每日結帳', false], ['purchase', '進貨', false], ['summary', '月結總覽', true], ['year', '年度總覽', true],
  ['payroll', '人事', true], ['delivery', '外送對帳', true], ['expense', '固定/其他支出', true],
  ['deduct', '分紅扣除', true], ['settings', '⚙ 裝置', false]
];

/* ---------- 本機儲存 ---------- */
var LS = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('⚠ 這台裝置的儲存空間不足，請先同步'); return false; }
  },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};

var ST = {
  cfg: LS.get('fw_cfg', null),        // { url, device }
  sess: LS.get('fw_sess', null),      // { store, role, token }
  snap: null, outbox: [], failed: [], lastSync: '',
  syncing: false, authLost: false, tab: 'daily',
  pickStore: '', selCat: '', emp: '', items: []
};

function k_(name) { return 'fw_' + name + '_' + (ST.sess ? ST.sess.store : ''); }
function loadLocal() {
  ST.snap = LS.get(k_('snap'), null);
  ST.outbox = LS.get(k_('outbox'), []);
  ST.failed = LS.get(k_('failed'), []);
  ST.lastSync = LS.get(k_('last'), '');
}
function saveOutbox() { LS.set(k_('outbox'), ST.outbox); LS.set(k_('failed'), ST.failed); }

/* ---------- 小工具 ---------- */
function $(id) { return document.getElementById(id); }
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function busy(on) { $('busy').style.display = on ? 'flex' : 'none'; }
function money(n) { if (n === null || n === undefined || n === '') return '—'; return (Math.round(Number(n)) || 0).toLocaleString('en-US'); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function jsq(s) { return esc(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function p2(x) { return ('0' + x).slice(-2); }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function nowStr() { var d = new Date(); return todayStr() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(-12);
}
// 支援 3200+575-140 這種寫法
function expr(s) {
  s = String(s === undefined || s === null ? '' : s).replace(/[,\s]/g, '');
  if (s === '') return 0;
  if (!/^[-+]?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(s)) return NaN;
  return s.match(/[+-]?\d+(\.\d+)?/g).reduce(function (a, b) { return a + Number(b); }, 0);
}
function v(id) { return expr($(id).value); }
function showExpr(id, hint) { var s = $(id).value; var n = expr(s); $(hint).textContent = /[+-]./.test(s.slice(1)) ? (isNaN(n) ? '格式看不懂' : '＝ ' + money(n)) : ''; }
function setNum(id, n) { $(id).value = n ? n : ''; }
function isAdmin() { return ST.sess && ST.sess.role === 'admin'; }

/* ---------- 和 Google 溝通 ---------- */
function api(action, body) {
  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
  return fetch(ST.cfg.url, {
    method: 'POST', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, body || {}))
  }).then(function (r) { return r.json(); }).then(function (res) {
    clearTimeout(timer);
    if (!res.ok) { var e = new Error(res.error || '伺服器錯誤'); e.server = true; e.auth = !!res.auth; throw e; }
    return res;
  }, function (err) {
    clearTimeout(timer);
    var e = new Error('連不上網路'); e.network = true; e.cause = err; throw e;
  });
}

/* ---------- 畫面切換 ---------- */
function showView(name) {
  ['setup', 'login', 'app'].forEach(function (x) { $('v-' + x).classList.toggle('hide', x !== name); });
  $('tabs').classList.toggle('hide', name !== 'app');
  $('sync').classList.toggle('hide', name !== 'app');
  $('menuBtn').classList.toggle('hide', name !== 'app');
  if (name === 'setup') {
    $('cfg-url').value = ST.cfg ? ST.cfg.url : '';
    $('cfg-device').value = ST.cfg ? ST.cfg.device : '';
    $('title').textContent = '風味記帳｜裝置設定';
  }
  if (name === 'login') { $('title').textContent = '風味記帳'; loadStores(); }
}

function boot() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  if (!ST.cfg) return showView('setup');
  if (!ST.sess) return showView('login');
  enterApp();
}

/* ---------- 第一次設定 ---------- */
function saveSetup() {
  var url = $('cfg-url').value.trim(), device = $('cfg-device').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return toast('同步網址格式不對，應該是 https://script.google.com/… 開頭');
  if (!device) return toast('請幫這台裝置取個名字');
  var old = ST.cfg;
  ST.cfg = { url: url, device: device };
  busy(true);
  api('ping').then(function () {
    busy(false);
    LS.set('fw_cfg', ST.cfg);
    toast('連線成功 ✓');
    if (ST.sess) enterApp(); else showView('login');
  }, function (e) {
    busy(false);
    ST.cfg = old;
    toast(e.network ? '連不上這個網址，請確認有網路、網址正確、部署權限是「所有人」' : '⚠ ' + e.message);
  });
}

/* ---------- 登入 ---------- */
function loadStores() {
  var cached = LS.get('fw_stores', []);
  renderStoreChips(cached);
  if (!ST.cfg) return;
  api('stores').then(function (r) { LS.set('fw_stores', r.stores); renderStoreChips(r.stores); }, function (e) {
    if (!cached.length) $('storeChips').innerHTML = '<span class="bad">' + esc(e.network ? '第一次登入需要網路' : e.message) + '</span>';
  });
}
function renderStoreChips(list) {
  if (!list.length) return;
  var last = ST.pickStore || LS.get('fw_lastStore', '');
  if (list.indexOf(last) >= 0) ST.pickStore = last;
  $('storeChips').innerHTML = list.map(function (s) {
    return '<button class="' + (s === ST.pickStore ? 'on' : '') + '" onclick="pickStore(\'' + jsq(s) + '\')">' + esc(s) + '</button>';
  }).join('');
}
function pickStore(s) { ST.pickStore = s; renderStoreChips(LS.get('fw_stores', [s])); }
function login() {
  if (!ST.pickStore) return toast('請先選店別');
  var pin = $('pin').value;
  busy(true);
  api('login', { store: ST.pickStore, pin: pin, device: ST.cfg.device }).then(function (r) {
    busy(false);
    $('pin').value = '';
    var sameStore = ST.sess && ST.sess.store === ST.pickStore;
    ST.sess = { store: ST.pickStore, role: r.role, token: r.token };
    LS.set('fw_sess', ST.sess);
    LS.set('fw_lastStore', ST.pickStore);
    if (!sameStore) loadLocal();           // 換店就讀那家店的本機資料
    acceptPull(r);
    ST.authLost = false;
    enterApp();
    if (ST.outbox.length) trySync();
  }, function (e) {
    busy(false);
    toast(e.network ? '第一次登入（或重新登入）需要網路' : '⚠ ' + e.message);
  });
}
function logout() {
  var n = ST.outbox.length;
  if (n && !confirm('還有 ' + n + ' 筆資料沒有上傳！\n登出會把它們刪掉，確定嗎？\n\n（建議先連上網路按「立即同步」）')) return;
  if (!n && !confirm('確定登出並清除這台裝置上的資料？（雲端資料不受影響）')) return;
  ['snap', 'outbox', 'failed', 'last'].forEach(function (x) { LS.del(k_(x)); });
  LS.del('fw_sess');
  ST.sess = null; ST.snap = null; ST.outbox = []; ST.failed = [];
  showView('login');
}

function acceptPull(r) {
  ST.snap = { config: r.config, data: r.data, serverTime: r.serverTime };
  ST.lastSync = nowStr();
  LS.set(k_('snap'), ST.snap);
  LS.set(k_('last'), ST.lastSync);
}

/* ---------- 進入主畫面 ---------- */
function enterApp() {
  if (!ST.snap) loadLocal();
  if (!ST.snap) { showView('login'); return; }
  showView('app');
  $('title').textContent = ST.sess.store + (isAdmin() ? '｜管理' : '｜店長');
  var t = todayStr(), m = t.slice(0, 7);
  ['d-date', 'p-date'].forEach(function (id) { if (!$(id).value) $(id).value = t; });
  ['s-month', 'v-month', 'e-month', 'x-month', 'm-month'].forEach(function (id) { if (!$(id).value) $(id).value = m; });
  $('x-type').innerHTML = (ST.snap.config.deductTypes || ['員工分紅', '年終預留', '其他扣除']).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
  $('tabs').innerHTML = TABS.filter(function (x) { return !x[2] || isAdmin(); }).map(function (x) {
    return '<button id="tb-' + x[0] + '" onclick="showTab(\'' + x[0] + '\')">' + x[1] + '</button>';
  }).join('');
  if (TABS.some(function (x) { return x[0] === ST.tab && x[2]; }) && !isAdmin()) ST.tab = 'daily';
  showTab(ST.tab);
  renderStatus();
}
function openSettings() { showTab('settings'); }

function showTab(name) {
  ST.tab = name;
  document.body.classList.toggle('wide', name === 'year');
  TABS.forEach(function (x) {
    $('tab-' + x[0]).classList.toggle('hide', x[0] !== name);
    var b = $('tb-' + x[0]); if (b) b.classList.toggle('on', x[0] === name);
  });
  if (name === 'daily') loadDaily();
  refreshTab(true);
}
// full=false：同步完成後只更新清單，不動到使用者正在輸入的欄位
function refreshTab(full) {
  switch (ST.tab) {
    case 'purchase': renderPurchaseTab(); break;
    case 'payroll': renderPayrollTab(full); break;
    case 'delivery': if (full) renderDeliveryTab(); break;
    case 'expense': renderExpenseTab(); break;
    case 'deduct': renderDeductTab(); break;
    case 'summary': renderSummaryTab(); break;
    case 'year': renderYearTab(); break;
    case 'settings': renderSettingsTab(); break;
    case 'daily': if (!full) renderDailyExist(); break;
  }
  renderBanner();
}

/* ---------- 資料：雲端快照 + 還沒上傳的操作 ---------- */
function view() {
  var st = JSON.parse(JSON.stringify(ST.snap.data));
  ST.outbox.forEach(function (op) { applyOp_(st, op, ST.sess.store); });
  return st;
}
function pendingIds() {
  var ids = {};
  ST.outbox.forEach(function (op) { var d = op.data || {}; ids[op.type.split('.')[0] + '|' + (d.id || d.date || (d.month + '|' + (d.name || d.platform || '')))] = true; });
  return ids;
}
function isPending(kind, key) { return !!pendingIds()[kind + '|' + key]; }
function pendTag(kind, key) { return isPending(kind, key) ? '<span class="tag">待上傳</span>' : ''; }

function enqueue(type, data) {
  data.editedAt = nowStr();
  data.device = ST.cfg.device;
  ST.outbox.push({ id: uid(), type: type, data: data });
  saveOutbox();
  renderStatus();
  trySync();
}

/* ---------- 同步 ---------- */
function trySync(manual) {
  if (!ST.sess || !ST.cfg) return;
  if (ST.syncing) return;
  if (ST.authLost) { if (manual) relogin(); return; }
  if (navigator.onLine === false) { renderStatus(); if (manual) toast('目前沒有網路，資料已存在這台裝置'); return; }
  ST.syncing = true; renderStatus();
  var batch = ST.outbox.slice(0, 40);
  api('sync', { store: ST.sess.store, token: ST.sess.token, ops: batch }).then(function (r) {
    var done = {};
    (r.results || []).forEach(function (x) {
      done[x.id] = true;
      var op = batch.filter(function (o) { return o.id === x.id; })[0];
      if (x.status === 'error') ST.failed.push({ at: nowStr(), op: op, msg: x.error });
      if (x.status === 'stale') ST.failed.push({ at: nowStr(), op: op, msg: '別台裝置已經存了更新的版本，這筆沒有覆蓋' });
    });
    ST.outbox = ST.outbox.filter(function (o) { return !done[o.id]; });
    if (ST.failed.length > 50) ST.failed = ST.failed.slice(-50);
    saveOutbox();
    if (r.role && r.role !== ST.sess.role) { ST.sess.role = r.role; LS.set('fw_sess', ST.sess); }
    acceptPull(r);
    ST.syncing = false;
    renderStatus(); refreshTab(false);
    if (manual) toast('同步完成 ✓');
    if (ST.outbox.length) setTimeout(trySync, 300);
  }, function (e) {
    ST.syncing = false;
    if (e.auth) { ST.authLost = true; toast('登入已失效，請重新輸入 PIN（資料都還在）'); }
    else if (manual) toast(e.network ? '同步失敗：連不上網路，稍後會自動再試' : '⚠ ' + e.message);
    renderStatus(); renderBanner();
  });
}
function relogin() {
  ST.pickStore = ST.sess.store;
  showView('login');
  toast('請重新輸入 PIN，沒上傳的資料會保留');
}
function onSyncClick() { if (ST.authLost) relogin(); else trySync(true); }

function renderStatus() {
  renderBanner();
  var b = $('sync'), n = ST.outbox.length;
  b.classList.remove('pending', 'err');
  if (ST.authLost) { b.textContent = '⚠ 需重新登入'; b.classList.add('err'); return; }
  if (ST.syncing) { b.textContent = '同步中…'; return; }
  if (n) { b.textContent = (navigator.onLine === false ? '離線｜' : '') + n + ' 筆待上傳'; b.classList.add('pending'); return; }
  b.textContent = navigator.onLine === false ? '離線｜已全部上傳' : '✓ 已同步 ' + (ST.lastSync ? ST.lastSync.slice(11, 16) : '');
}
function renderBanner() {
  var h = '';
  if (ST.authLost) h += '<div class="banner err">登入已失效（PIN 可能改過）。<a href="#" onclick="relogin();return false">按這裡重新登入</a>，還沒上傳的 ' + ST.outbox.length + ' 筆都會保留。</div>';
  else if (ST.outbox.length && navigator.onLine === false) h += '<div class="banner">目前離線：有 ' + ST.outbox.length + ' 筆存在這台裝置，連上網路會自動上傳。</div>';
  var recent = ST.failed.filter(function (f) { return !f.seen; });
  if (recent.length) h += '<div class="banner err">有 ' + recent.length + ' 筆同步問題，<a href="#" onclick="showTab(\'settings\');return false">按這裡查看</a>。</div>';
  $('banner').innerHTML = h;
}

window.addEventListener('online', function () { renderStatus(); renderBanner(); trySync(); });
window.addEventListener('offline', function () { renderStatus(); renderBanner(); });
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') trySync(); });
setInterval(function () { if (ST.outbox.length) trySync(); }, 30000);       // 有待上傳：每 30 秒試一次
setInterval(function () { trySync(); }, 5 * 60000);                          // 平常：每 5 分鐘拉一次新資料

/* ---------- 每日結帳 ---------- */
function dailyRec(date) { return view().daily.filter(function (r) { return r.date === date; })[0] || null; }
function loadDaily() {
  var d = dailyRec($('d-date').value);
  $('d-closed').checked = !!(d && d.closed);
  setNum('d-site', d && d.site); setNum('d-panda', d && d.panda); setNum('d-uber', d && d.uber);
  setNum('d-allpay', d && d.allpay); setNum('d-line', d && d.line); setNum('d-spend', d && d.spend);
  setNum('d-cash', d && d.cash); $('d-note').value = d ? (d.note || '') : '';
  renderDailyExist();
  dailyCalc();
}
function renderDailyExist() {
  var d = dailyRec($('d-date').value);
  $('d-exist').classList.toggle('hide', !d);
  if (d) $('d-exist').innerHTML = '這天已經有紀錄（' + esc(d.editedAt || '') + (d.device ? '，' + esc(d.device) : '') + '）' +
    pendTag('daily', d.date) + '，修改後再儲存會覆蓋。';
}
function dailyCalc() {
  var closed = $('d-closed').checked;
  $('d-fields').classList.toggle('hide', closed);
  if (closed) { $('d-calc').innerHTML = ''; return; }
  var site = v('d-site'), panda = v('d-panda'), uber = v('d-uber');
  var expected = site - v('d-allpay') - v('d-line') - v('d-spend');
  var typed = $('d-cash').value.trim() !== '';
  var diff = v('d-cash') - expected;
  var lim = ST.snap.config.store.cashWarn || 500;
  var cls = 'ok', msg = '✓ 對上了';
  if (Math.abs(diff) > lim) { cls = 'bad'; msg = '差太多，請再點一次現金'; }
  else if (diff !== 0) { cls = 'warn'; msg = '有小差額'; }
  $('d-calc').innerHTML =
    '今日總營業額：<b>' + money(site + panda + uber) + '</b><br>' +
    '應有現金＝現場 − 全支付 − LINE − 現場支出＝<b>' + money(expected) + '</b><br>' +
    (typed ? '現金差額：<b class="' + cls + '">' + (diff > 0 ? '+' : '') + money(diff) + '</b>　<span class="' + cls + '">' + msg + '</span>'
      : '<span class="muted">填完點收現金就會顯示差額</span>');
}
function saveDaily() {
  var ids = ['d-site', 'd-panda', 'd-uber', 'd-allpay', 'd-line', 'd-spend', 'd-cash'];
  if (ids.some(function (id) { return isNaN(v(id)); })) return toast('有欄位格式不對');
  var closed = $('d-closed').checked;
  if (!closed && !v('d-site') && !v('d-panda') && !v('d-uber')) return toast('請輸入營業額，或勾選公休');
  var date = $('d-date').value;
  if (!date) return toast('請選日期');
  var expected = v('d-site') - v('d-allpay') - v('d-line') - v('d-spend');
  var diff = closed ? 0 : v('d-cash') - expected;
  enqueue('daily.upsert', { date: date, closed: closed, site: v('d-site'), panda: v('d-panda'), uber: v('d-uber'),
    allpay: v('d-allpay'), line: v('d-line'), spend: v('d-spend'), cash: v('d-cash'), cashDiff: diff, note: $('d-note').value });
  renderDailyExist();
  toast(Math.abs(diff) > (ST.snap.config.store.cashWarn || 500) ? '已儲存，但現金差額偏大，請確認' : '已儲存 ✓');
}

/* ---------- 進貨 ---------- */
function categoriesFor(month) {
  return (ST.snap.config.categories || []).filter(function (c) {
    return (!c.from || month >= c.from) && (!c.to || month < c.to);
  }).map(function (c) { return c.cat; });
}
function renderPurchaseTab() {
  var date = $('p-date').value;
  var cats = categoriesFor(date.slice(0, 7));
  if (cats.indexOf(ST.selCat) < 0) ST.selCat = '';
  $('p-cats').innerHTML = cats.map(function (c) {
    return '<button class="' + (c === ST.selCat ? 'on' : '') + '" onclick="selCat(\'' + jsq(c) + '\')">' + esc(c) + '</button>';
  }).join('');
  var list = view().purchase.filter(function (x) { return x.date === date; });
  var total = list.reduce(function (a, x) { return a + Number(x.amount || 0); }, 0);
  $('p-list-title').textContent = date + ' 進貨（合計 ' + money(total) + '）';
  $('p-list').innerHTML = list.map(function (x) {
    return '<tr><td>' + esc(x.cat) + pendTag('purchase', x.id) + '</td><td class="muted">' + esc(x.note) + '</td><td class="n">' + money(x.amount) +
      '</td><td class="n"><button class="danger" onclick="delPurchase(\'' + jsq(x.id) + '\')">刪除</button></td></tr>';
  }).join('') || '<tr><td class="muted">還沒有進貨紀錄</td></tr>';
}
function selCat(c) { ST.selCat = c; renderPurchaseTab(); $('p-amount').focus(); }
function addPurchase() {
  if (!ST.selCat) return toast('請先點選分類');
  var amt = v('p-amount');
  if (isNaN(amt) || !amt) return toast('請輸入金額');
  enqueue('purchase.add', { id: uid(), date: $('p-date').value, cat: ST.selCat, amount: amt, note: $('p-note').value });
  $('p-amount').value = ''; $('p-note').value = ''; $('p-amount-hint').textContent = '';
  renderPurchaseTab();
  toast('已新增 ' + ST.selCat + ' ' + money(amt));
}
function delPurchase(id) {
  if (!confirm('確定刪除這筆進貨？')) return;
  enqueue('purchase.del', { id: id });
  renderPurchaseTab();
}

/* ---------- 人事 ---------- */
function payrollDefaults(e) {
  var items = [];
  if (e.type === '計時') items.push({ item: '時薪', hours: '', rate: e.hourly, kind: '薪資' });
  else if (e.salary) items.push({ item: '月薪', amount: e.salary, kind: '薪資' });
  if (e.selfHealth) items.push({ item: '扣健保(自付)', amount: -e.selfHealth, kind: '薪資' });
  if (e.selfLabor) items.push({ item: '扣勞保(自付)', amount: -e.selfLabor, kind: '薪資' });
  if (e.pension) items.push({ item: '勞退(公司)', amount: e.pension, kind: '公司負擔' });
  if (e.health) items.push({ item: '健保(公司)', amount: e.health, kind: '公司負擔' });
  if (e.labor) items.push({ item: '勞保(公司)', amount: e.labor, kind: '公司負擔' });
  return items;
}
function renderPayrollTab(full) {
  var month = $('s-month').value;
  var rows = view().payroll.filter(function (x) { return x.month === month; });
  var by = {};
  rows.forEach(function (x) {
    if (!by[x.name]) by[x.name] = { cost: 0, hourly: false };
    if (x.kind !== '預支') by[x.name].cost += Number(x.amount || 0);
    if (x.rate !== '' && x.rate !== undefined && x.rate !== null) by[x.name].hourly = true;
  });
  // 分組：依員工設定的類型；不在名單上的人，看薪資有沒有「時數×時薪」判斷
  var groups = { '正職': [], '計時': [], '其他': [] };
  var seen = {};
  (ST.snap.config.employees || []).forEach(function (e) {
    (groups[e.type === '計時' ? '計時' : '正職']).push(e.name); seen[e.name] = true;
  });
  Object.keys(by).forEach(function (n) { if (!seen[n]) (by[n].hourly ? groups['計時'] : groups['其他']).push(n); });
  var total = Object.keys(by).reduce(function (a, n) { return a + by[n].cost; }, 0);
  function btn(n) {
    return '<button class="' + (n === ST.emp ? 'on' : '') + '" onclick="openEmp(\'' + jsq(n) + '\')"><span>' + esc(n) + pendTag('payroll', month + '|' + n) + '</span><span>' +
      (by[n] ? '<span class="ok">✓</span> 成本 ' + money(by[n].cost) : '<span class="muted">未填</span>') + '</span></button>';
  }
  function sub(list) { return list.reduce(function (a, n) { return a + (by[n] ? by[n].cost : 0); }, 0); }
  var h = '';
  [['正職', '正職'], ['計時', '計時（時薪）'], ['其他', '其他（不在員工名單）']].forEach(function (g) {
    var list = groups[g[0]];
    if (!list.length) return;
    h += '<div class="grp"><div class="grp-h"><b>' + g[1] + '</b><span class="muted">' + list.length + ' 人｜小計 ' + money(sub(list)) + '</span></div>' + list.map(btn).join('') + '</div>';
  });
  $('s-emps').innerHTML = (h || '<p class="muted">員工名單是空的，請到試算表「設定_員工」新增</p>') +
    '<p class="muted">本月人事成本合計：<b>' + money(total) + '</b></p>';
  if (full) $('s-editor').classList.toggle('hide', !ST.emp);
}
function addTempEmployee() {
  var n = prompt('輸入名字（例：臨時工小王）');
  if (n && n.trim()) openEmp(n.trim());
}
function openEmp(name) {
  ST.emp = name;
  var month = $('s-month').value;
  var rows = view().payroll.filter(function (x) { return x.month === month && x.name === name; });
  var saved = rows.length > 0;
  if (saved) {
    ST.items = rows.map(function (x) { return { item: x.item, amount: x.amount, kind: x.kind, hours: x.hours, rate: x.rate, neg: Number(x.amount) < 0 }; });
  } else {
    var e = (ST.snap.config.employees || []).filter(function (x) { return x.name === name; })[0];
    ST.items = e ? payrollDefaults(e) : [{ item: '薪資', amount: '', kind: '薪資' }];
  }
  $('s-name').textContent = name + '｜' + month + (saved ? '（已儲存過）' : '（帶入預設）');
  $('s-editor').classList.remove('hide');
  renderItems();
  renderPayrollTab(false);
  $('s-editor').scrollIntoView({ behavior: 'smooth' });
}
function hasRate(it) { return it.rate !== '' && it.rate !== undefined && it.rate !== null; }

/* 常用項目：[名稱, 類別, 1=加項 / -1=扣項] */
var PAY_PRESETS = [
  ['加班費', '薪資', 1], ['多加班', '薪資', 1], ['全勤獎金', '薪資', 1], ['責任津貼', '薪資', 1], ['職務加給', '薪資', 1],
  ['銷假上班', '薪資', 1], ['節日獎金', '薪資', 1], ['早退', '薪資', -1], ['請假扣薪', '薪資', -1],
  ['扣健保(自付)', '薪資', -1], ['扣勞保(自付)', '薪資', -1], ['已預支', '預支', -1],
  ['勞退(公司)', '公司負擔', 1], ['健保(公司)', '公司負擔', 1], ['勞保(公司)', '公司負擔', 1]
];
// 從過去的人事紀錄學習：用越多次的排越前面，類別和正負也照過去的習慣
function payPresets() {
  var stat = {};
  view().payroll.forEach(function (x) {
    var n = String(x.item || '').trim();
    if (!n || n === '月薪' || n === '時薪' || n === '薪資' || hasRate(x)) return;
    if (!stat[n]) stat[n] = { n: 0, kind: x.kind || '薪資', neg: 0 };
    stat[n].n++; stat[n].kind = x.kind || stat[n].kind;
    if (Number(x.amount) < 0) stat[n].neg++;
  });
  var learned = Object.keys(stat).sort(function (a, b) { return stat[b].n - stat[a].n; }).slice(0, 12).map(function (n) {
    return [n, stat[n].kind, stat[n].neg * 2 > stat[n].n ? -1 : 1];
  });
  var seen = {}, out = [];
  learned.concat(PAY_PRESETS).forEach(function (p) { if (!seen[p[0]]) { seen[p[0]] = true; out.push(p); } });
  return out;
}
function renderPresetChips() {
  var have = {}; ST.items.forEach(function (it) { have[String(it.item || '').trim()] = true; });
  ST.presets = payPresets();
  $('s-presets').innerHTML = ST.presets.map(function (p, i) {
    if (have[p[0]]) return '';
    return '<button class="' + (p[2] < 0 ? 'neg' : '') + '" onclick="addPreset(' + i + ')">＋' + esc(p[0]) + (p[2] < 0 ? '（扣）' : '') + '</button>';
  }).join('');
}
function addPreset(i) {
  var p = ST.presets[i];
  ST.items.push({ item: p[0], amount: '', kind: p[1], neg: p[2] < 0 });
  renderItems();
  var inputs = $('s-items').querySelectorAll('.item-row');
  var last = inputs[inputs.length - 1];
  if (last) { var a = last.querySelectorAll('input')[1]; if (a) a.focus(); }
}
function renderItems() {
  var kinds = ST.snap.config.kinds || ['薪資', '公司負擔', '預支'];
  $('s-items').innerHTML = ST.items.map(function (it, i) {
    var amt = hasRate(it)
      ? '<div class="hours"><input value="' + esc(it.hours) + '" placeholder="時數" inputmode="text" oninput="setItem(' + i + ',\'hours\',this.value)"> × <input value="' + esc(it.rate) + '" placeholder="時薪" inputmode="decimal" oninput="setItem(' + i + ',\'rate\',this.value)"></div>'
      : '<input' + (it.neg ? ' class="neg-in"' : '') + ' value="' + esc(it.amount) + '" inputmode="text" placeholder="' + (it.neg ? '扣多少（打正數就好）' : '金額（扣款打負數）') + '" oninput="setItem(' + i + ',\'amount\',this.value)">';
    return '<div class="item-row"><input value="' + esc(it.item) + '" placeholder="項目名稱" oninput="setItem(' + i + ',\'item\',this.value)">' + amt +
      '<select onchange="setItem(' + i + ',\'kind\',this.value)">' + kinds.map(function (k) { return '<option' + (k === it.kind ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' +
      '<button class="danger" onclick="delItem(' + i + ')">✕</button></div>';
  }).join('');
  renderPresetChips();
  payCalc();
}
function itemAmount(it) {
  if (hasRate(it)) return Math.round(expr(it.hours) * expr(it.rate));
  var a = expr(it.amount);
  return it.neg && a > 0 ? -a : a;     // 扣款項目打正數也會變成扣
}
function setItem(i, k, val) { ST.items[i][k] = val; payCalc(); }
function delItem(i) { ST.items.splice(i, 1); renderItems(); }
function addItem(hourly) { ST.items.push(hourly ? { item: '時薪', hours: '', rate: '', kind: '薪資' } : { item: '', amount: '', kind: '薪資' }); renderItems(); }
function payCalc() {
  var pay = 0, cost = 0, bad = false;
  ST.items.forEach(function (it) {
    var a = itemAmount(it); if (isNaN(a)) { bad = true; return; }
    if (it.kind !== '預支') cost += a;
    if (it.kind !== '公司負擔') pay += a;
  });
  $('s-calc').innerHTML = bad ? '<span class="bad">有金額格式看不懂</span>' :
    '實發給員工：<b>' + money(pay) + '</b><br>公司人事成本：<b>' + money(cost) + '</b>';
}
function savePayroll() {
  var bad = false;
  var items = ST.items.filter(function (it) { return String(it.item || '').trim(); }).map(function (it) {
    var r = hasRate(it);
    var o = { item: String(it.item).trim(), kind: it.kind || '薪資', hours: r ? expr(it.hours) : '', rate: r ? expr(it.rate) : '' };
    o.amount = itemAmount(it);
    if (isNaN(o.amount)) bad = true;
    return o;
  });
  if (bad) return toast('有金額格式看不懂');
  enqueue('payroll.upsert', { month: $('s-month').value, name: ST.emp, items: items });
  toast(ST.emp + ' 已儲存 ✓');
  ST.emp = '';
  $('s-editor').classList.add('hide');
  renderPayrollTab(false);
}

/* ---------- 外送對帳 ---------- */
function renderDeliveryTab() {
  var month = $('v-month').value, V = view();
  var gross = { Panda: 0, Uber: 0 }, net = { Panda: null, Uber: null };
  V.daily.forEach(function (x) { if (x.date.slice(0, 7) === month && !x.closed) { gross.Panda += Number(x.panda || 0); gross.Uber += Number(x.uber || 0); } });
  V.delivery.forEach(function (x) { if (x.month === month && net.hasOwnProperty(x.platform)) net[x.platform] = (net[x.platform] || 0) + Number(x.amount || 0); });
  [['Panda', 'v-panda'], ['Uber', 'v-uber']].forEach(function (p) {
    $(p[1]).value = net[p[0]] === null ? '' : net[p[0]];
    var g = gross[p[0]];
    $(p[1] + '-hint').innerHTML = '本月每日結帳的營業額合計：' + money(g) +
      (net[p[0]] !== null && g ? '，入帳比例 ' + pct(net[p[0]] / g) : (g ? '，<span class="warn">尚未對帳</span>' : '')) +
      pendTag('delivery', month + '|' + p[0]);
  });
}
function saveDelivery() {
  var month = $('v-month').value;
  var changed = 0;
  [['Panda', 'v-panda'], ['Uber', 'v-uber']].forEach(function (p) {
    var s = $(p[1]).value.trim();
    var amt = s === '' ? '' : expr(s);
    if (amt !== '' && isNaN(amt)) return;
    var cur = view().delivery.filter(function (x) { return x.month === month && x.platform === p[0]; })[0];
    if ((cur ? cur.amount : '') === amt) return;
    enqueue('delivery.upsert', { month: month, platform: p[0], amount: amt });
    changed++;
  });
  toast(changed ? '對帳已儲存 ✓' : '沒有變更');
  renderDeliveryTab();
}

/* ---------- 固定/其他支出 ---------- */
function renderExpenseTab() {
  var month = $('e-month').value;
  var list = view().expense.filter(function (x) { return x.month === month; });
  var total = list.reduce(function (a, x) { return a + Number(x.amount || 0); }, 0);
  $('e-list').innerHTML = list.map(function (x) {
    return '<tr><td>' + esc(x.type) + '</td><td>' + esc(x.item) + pendTag('expense', x.id) + ' <span class="muted">' + esc(x.note) + '</span></td><td class="n">' + money(x.amount) +
      '</td><td class="n"><button class="danger" onclick="delExpense(\'' + jsq(x.id) + '\')">刪除</button></td></tr>';
  }).join('') + (list.length ? '<tr><td></td><td><b>合計</b></td><td class="n"><b>' + money(total) + '</b></td><td></td></tr>' : '<tr><td class="muted">還沒有支出</td></tr>');
}
function addExpense() {
  var amt = v('e-amount');
  if (!$('e-item').value.trim() || isNaN(amt) || !amt) return toast('請填項目和金額');
  enqueue('expense.add', { id: uid(), month: $('e-month').value, type: $('e-type').value, item: $('e-item').value.trim(), amount: amt, note: $('e-note').value });
  $('e-item').value = ''; $('e-amount').value = ''; $('e-note').value = ''; $('e-amount-hint').textContent = '';
  renderExpenseTab();
  toast('已新增 ✓');
}
function delExpense(id) { if (confirm('確定刪除？')) { enqueue('expense.del', { id: id }); renderExpenseTab(); } }
function copyFixed() {
  var month = $('e-month').value, prev = prevMonth_(month), V = view();
  var have = V.expense.filter(function (x) { return x.month === month && x.type === '固定'; }).map(function (x) { return x.item; });
  var src = V.expense.filter(function (x) { return x.month === prev && x.type === '固定' && have.indexOf(x.item) < 0; });
  if (!src.length) return toast('上個月沒有可以複製的固定支出（或已經複製過）');
  src.forEach(function (x) { enqueue('expense.add', { id: uid(), month: month, type: '固定', item: x.item, amount: x.amount, note: '複製自 ' + prev }); });
  renderExpenseTab();
  toast('已複製 ' + src.length + ' 筆');
}

/* ---------- 分紅扣除 ---------- */
function renderDeductTab() {
  var month = $('x-month').value;
  var list = view().deduct.filter(function (x) { return x.month === month; });
  $('x-list').innerHTML = list.map(function (x) {
    return '<tr><td>' + esc(x.type) + pendTag('deduct', x.id) + '</td><td class="muted">' + esc(x.note) + '</td><td class="n">' + money(x.amount) +
      '</td><td class="n"><button class="danger" onclick="delDeduct(\'' + jsq(x.id) + '\')">刪除</button></td></tr>';
  }).join('') || '<tr><td class="muted">這個月沒有扣除項目</td></tr>';
}
function addDeduct() {
  var amt = v('x-amount');
  if (isNaN(amt) || !amt) return toast('請填金額');
  enqueue('deduct.add', { id: uid(), month: $('x-month').value, type: $('x-type').value, amount: amt, note: $('x-note').value });
  $('x-amount').value = ''; $('x-note').value = '';
  renderDeductTab();
  toast('已新增 ✓');
}
function delDeduct(id) { if (confirm('確定刪除？')) { enqueue('deduct.del', { id: id }); renderDeductTab(); } }

/* ---------- 月結總覽（在裝置上計算，離線也能看） ---------- */
function computeLocal() {
  var store = ST.sess.store, V = view(), C = ST.snap.config;
  var emps = {}; emps[store] = (C.employees || []).map(function (e) { return e.name; });
  return { V: V, C: C, R: computeAll_({ stores: [C.store], partners: C.partners || [], employees: emps,
    daily: V.daily, purchase: V.purchase, expense: V.expense, payroll: V.payroll, delivery: V.delivery, deduct: V.deduct }, todayStr()) };
}

/* ---------- 年度總覽：像舊表「總計」頁 ---------- */
function renderYearTab() {
  var L = computeLocal(), R = L.R, V = L.V;
  var years = {}; R.months.forEach(function (m) { years[m.month.slice(0, 4)] = true; });
  var ys = Object.keys(years).sort();
  var sel = $('y-year');
  var cur = sel.value || (ys.indexOf(todayStr().slice(0, 4)) >= 0 ? todayStr().slice(0, 4) : ys[ys.length - 1]);
  sel.innerHTML = ys.map(function (y) { return '<option' + (y === cur ? ' selected' : '') + '>' + y + '</option>'; }).join('');
  if (!ys.length) { $('y-body').innerHTML = '<p class="muted">還沒有任何資料</p>'; return; }
  var perDay = $('y-mode').value !== 'total';
  var months = R.months.filter(function (m) { return m.month.slice(0, 4) === cur && m.status !== '未來'; });
  var partners = (L.C.partners || []).map(function (p) { return p.name; });
  var share = {}; R.shares.forEach(function (s) { share[s.month + '|' + s.name] = s.amount; });
  function sum(list, f) { return list.reduce(function (a, m) { return a + f(m); }, 0); }
  function td(v, cls) { return '<td class="n' + (cls ? ' ' + cls : '') + (v < 0 ? ' bad' : '') + '">' + money(v) + '</td>'; }
  function label(m) { return Number(m.month.slice(5, 7)) + '月' + (m.status === '進行中' ? '<span class="tag">進行中</span>' : ''); }

  // 表一：盈餘與分紅
  var cols = ['盈餘', '員工分紅', '年終預留', '可分配'].concat(partners.map(function (p) {
    var pp = (L.C.partners || []).filter(function (x) { return x.name === p; })[0]; return p + ' ' + pp.pct + '%';
  }));
  var rowOf = function (list, name, cls) {
    return '<tr class="' + cls + '"><th>' + name + '</th>' + td(sum(list, function (m) { return m.profit; })) +
      td(sum(list, function (m) { return m.bonus; })) + td(sum(list, function (m) { return m.reserve; })) +
      td(sum(list, function (m) { return m.dist; }), 'em') +
      partners.map(function (p) { return td(sum(list, function (m) { return share[m.month + '|' + p] || 0; }), 'em'); }).join('') + '</tr>';
  };
  var h = '<h2>盈餘與分紅</h2><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable"><thead><tr><th>' + cur + '</th>' +
    cols.map(function (c) { return '<th class="n">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
  [1, 2, 3, 4].forEach(function (q) {
    var qm = months.filter(function (m) { return Math.ceil(Number(m.month.slice(5, 7)) / 3) === q; });
    if (!qm.length) return;
    qm.forEach(function (m) { h += rowOf([m], label(m), ''); });
    h += rowOf(qm, 'Q' + q + ' 合計', 'qrow');
  });
  h += rowOf(months, cur + ' 全年', 'yrow') + '</tbody></table></div>';
  h += '<p class="muted">每月的分紅＝可分配 × 股東比例。進行中的月份數字會變動，先不要拿來分紅。</p>';

  // 表二：平均細項
  var catSet = {}; R.cats.forEach(function (c) { if (c.month.slice(0, 4) === cur) catSet[c.cat] = (catSet[c.cat] || 0) + c.amount; });
  var cats = Object.keys(catSet).sort(function (a, b) { return catSet[b] - catSet[a]; });
  var catAmt = {}; R.cats.forEach(function (c) { catAmt[c.month + '|' + c.cat] = c.amount; });
  var util = {};
  V.expense.forEach(function (x) {
    ['電費', '水費'].forEach(function (k) { if (String(x.item).indexOf(k) >= 0) util[x.month + '|' + k] = (util[x.month + '|' + k] || 0) + Number(x.amount || 0); });
  });
  var dcols = [['實際營收', function (m) { return m.actual; }], ['人事', function (m) { return m.staff; }],
    ['電費', function (m) { return util[m.month + '|電費'] || 0; }], ['水費', function (m) { return util[m.month + '|水費'] || 0; }],
    ['貨款', function (m) { return m.purchase; }]].concat(cats.map(function (c) { return [c, function (m) { return catAmt[m.month + '|' + c] || 0; }]; }));
  var dv = function (list, f) { var days = sum(list, function (m) { return m.days; }); var t = sum(list, f); return perDay ? (days ? t / days : 0) : t; };
  var drow = function (list, name, cls) {
    return '<tr class="' + cls + '"><th>' + name + '</th><td class="n">' + sum(list, function (m) { return m.days; }) + '</td>' +
      dcols.map(function (c, i) { return '<td class="n' + (i === 0 ? ' em' : '') + '">' + money(dv(list, c[1])) + '</td>'; }).join('') + '</tr>';
  };
  h += '<h2 style="margin-top:22px">平均細項（' + (perDay ? '每個工作天平均' : '每月合計') + '）</h2><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable"><thead><tr><th>' + cur + '</th><th class="n">工作天</th>' +
    dcols.map(function (c, i) { return '<th class="n' + (i >= 5 ? ' cat' : '') + '">' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>';
  [1, 2, 3, 4].forEach(function (q) {
    var qm = months.filter(function (m) { return Math.ceil(Number(m.month.slice(5, 7)) / 3) === q; });
    if (!qm.length) return;
    qm.forEach(function (m) { h += drow([m], label(m), ''); });
    h += drow(qm, 'Q' + q + (perDay ? ' 平均' : ' 合計'), 'qrow');
  });
  h += drow(months, cur + (perDay ? ' 全年平均' : ' 全年'), 'yrow') + '</tbody></table></div>';
  h += '<p class="muted">電費、水費是從「固定／其他支出」裡項目名稱有「電費」「水費」的金額抓的。季、全年的每天平均＝合計 ÷ 總工作天。</p>';
  $('y-body').innerHTML = h;
}

function renderSummaryTab() {
  var month = $('m-month').value, store = ST.sess.store, V = view(), C = ST.snap.config;
  var emps = {}; emps[store] = (C.employees || []).map(function (e) { return e.name; });
  var R = computeAll_({ stores: [C.store], partners: C.partners || [], employees: emps,
    daily: V.daily, purchase: V.purchase, expense: V.expense, payroll: V.payroll, delivery: V.delivery, deduct: V.deduct }, todayStr());
  var m = R.months.filter(function (x) { return x.month === month; })[0];
  var note = '<p class="muted">依這台裝置的資料計算｜最後同步 ' + esc(ST.lastSync || '—') +
    (ST.outbox.length ? '｜<span class="warn">' + ST.outbox.length + ' 筆待上傳（已算進來）</span>' : '') + '</p>';
  if (!m) { $('m-body').innerHTML = note + '<p class="muted">這個月還沒有任何資料</p>'; return; }
  var rows = [
    ['現場營收', m.site], ['Panda 入帳', m.pandaN === null ? '未對帳' : m.pandaN], ['Uber 入帳', m.uberN === null ? '未對帳' : m.uberN],
    ['＝ 實際營收', m.actual, true], ['進貨', -m.purchase, false, pct(m.purchasePct)], ['人事成本', -m.staff, false, pct(m.staffPct)],
    ['固定支出', -m.fixed], ['其他支出', -m.other], ['線上支付手續費', -m.fee], ['＝ 盈餘', m.profit, true],
    ['員工分紅', -m.bonus], ['年終預留', -m.reserve], ['其他扣除', -m.deductOther], ['＝ 可分配給股東', m.dist, true]
  ];
  var shares = R.shares.filter(function (x) { return x.month === month; });
  var warns = R.warns.filter(function (x) { return x.month === month || x.month === ''; });
  var cats = R.cats.filter(function (x) { return x.month === month; }).sort(function (a, b) { return b.amount - a.amount; });
  var h = note + '<p>' + (m.status === '進行中' ? '<span class="warn">● 本月進行中</span>' : '<span class="ok">● 已結束</span>') +
    '　工作天 ' + m.days + '　日均營收 ' + money(m.avg) + '　現金差額累計 ' + money(m.cashDiff) + '</p>';
  h += '<table>' + rows.map(function (x) {
    return '<tr' + (x[2] ? ' style="font-weight:700"' : '') + '><td>' + x[0] + '</td><td class="n">' +
      (typeof x[1] === 'number' ? money(x[1]) : '<span class="warn">' + x[1] + '</span>') + '</td><td class="n muted">' + (x[3] || '') + '</td></tr>';
  }).join('') + '</table>';
  h += '<h2 style="margin-top:18px">股東分紅</h2><table>' + shares.map(function (s) {
    return '<tr><td>' + esc(s.name) + '</td><td class="n muted">' + s.pct + '%</td><td class="n big">' + money(s.amount) + '</td></tr>';
  }).join('') + '</table>';
  h += warns.length ? '<h2 style="margin-top:18px" class="warn">⚠ 需要注意（' + warns.length + '）</h2><ul>' +
    warns.map(function (w) { return '<li><b>' + esc(w.type) + '</b>：' + esc(w.text) + '</li>'; }).join('') + '</ul>' : '<p class="ok">✓ 沒有警示</p>';
  if (cats.length) h += '<h2 style="margin-top:18px">進貨分類</h2><table>' + cats.map(function (c) {
    return '<tr><td>' + esc(c.cat) + '</td><td class="n">' + money(c.amount) + '</td><td class="n muted">' + pct(c.pct) + '</td></tr>';
  }).join('') + '</table>';
  $('m-body').innerHTML = h;
}

/* ---------- 裝置設定 ---------- */
var OP_NAMES = { 'daily.upsert': '每日結帳', 'purchase.add': '新增進貨', 'purchase.del': '刪除進貨', 'expense.add': '新增支出',
  'expense.del': '刪除支出', 'deduct.add': '新增扣除', 'deduct.del': '刪除扣除', 'payroll.upsert': '人事', 'delivery.upsert': '外送對帳' };
function opLabel(op) {
  if (!op) return '';
  var d = op.data || {};
  return (OP_NAMES[op.type] || op.type) + ' ' + (d.date || d.month || '') + ' ' + (d.cat || d.item || d.name || d.platform || d.type || '') +
    (d.amount !== undefined && d.amount !== '' ? ' ' + money(d.amount) : '');
}
function renderSettingsTab() {
  $('set-info').innerHTML =
    '店別：<b>' + esc(ST.sess.store) + '</b>（' + (isAdmin() ? '管理' : '店長') + '）<br>' +
    '裝置名字：' + esc(ST.cfg.device) + '<br>' +
    '網路：' + (navigator.onLine === false ? '<span class="warn">離線</span>' : '<span class="ok">連線中</span>') + '<br>' +
    '最後同步：' + esc(ST.lastSync || '—') + '<br>' +
    '待上傳：<b>' + ST.outbox.length + '</b> 筆' +
    (ST.outbox.length ? '<br><span class="muted">' + ST.outbox.slice(0, 10).map(opLabel).map(esc).join('<br>') + (ST.outbox.length > 10 ? '<br>…' : '') + '</span>' : '');
  $('set-failed').innerHTML = ST.failed.length ? ST.failed.slice().reverse().map(function (f) {
    return '<p><b>' + esc(f.msg) + '</b><br><span class="muted">' + esc(f.at) + '｜' + esc(opLabel(f.op)) + '</span></p>';
  }).join('') + '<button class="ghost wide" onclick="clearFailed()">清除紀錄</button>' : '<p class="muted">沒有問題 ✓</p>';
  ST.failed.forEach(function (f) { f.seen = true; });
  saveOutbox();
}
function clearFailed() { ST.failed = []; saveOutbox(); renderSettingsTab(); renderBanner(); }

boot();
