/* 風味記帳 App v2：離線優先，有網路自動同步到 Google 試算表 */
'use strict';
var APP_VERSION = '4.14.6';   // 和 sw.js 的 VERSION 一起改
// 畫面（index.html）和程式（app.js）版本不一樣（更新到一半、網路慢拿到舊的）：重新載入一次拿齊同一版，避免畫面缺東缺西
(function () {
  var m = document.querySelector('meta[name="app-version"]'), hv = m && m.getAttribute('content');
  if (!hv || hv === APP_VERSION) return;
  var key = 'fw_vfix_' + APP_VERSION;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { return; }
  if (navigator.onLine === false) return;
  location.replace(location.pathname + '?_r=' + Date.now());
})();
// 內建同步網址（編碼過，程式碼和畫面上看不到原文；真正保護資料的是帳號＋PIN）
var DEFAULT_URL = (function (s, k) {
  try {
    var b = atob(s), out = '';
    for (var i = 0; i < b.length; i++) out += String.fromCharCode(b.charCodeAt(i) ^ k.charCodeAt(i % k.length));
    return out.split('').reverse().join('');
  } catch (e) { return ''; }
})('BRJbI1oZLREOICcQAhtfQTYrVB4bAhosQFEYUTNifj8JRlMfCkNnCjxWFQ5NJR4QCzEFPSc9CCB8NgUsRDYLVgJxPhI4BRI0HhVAPxMlNk4KSQRMNBYPGk4UCRQNIxkJGA4eSANTLwcNBE5WXARTMgEG', 'fw#Funway');
function isBuiltinUrl(u) { return !!DEFAULT_URL && u === DEFAULT_URL; }

// [代號, 名稱, 只限管理]　手機下方列放前 4 個，其餘收進「更多」（同樣順序）
var TABS = [
  ['daily', '每日結帳', false], ['purchase', '進貨', false], ['expense', '固定/其他支出', true],
  ['overview', '總覽', true], ['payroll', '人事', true], ['delivery', '外送對帳', true],
  ['deduct', '分紅扣除', true], ['loan', '借還款', true], ['settings', '裝置', false]
];
var SHORT = { daily: '結帳', purchase: '進貨', expense: '支出', overview: '總覽', settings: '裝置' };
function svg(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
var ICONS = {
  daily: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  purchase: svg('<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
  overview: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  payroll: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16 14.6c2.6-.3 4.6 1.6 5 4.4"/>'),
  delivery: svg('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>'),
  expense: svg('<path d="M4 6h16v13H4z"/><path d="M4 10h16M8 15h3"/>'),
  deduct: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
  loan: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
};

/* ---------- 亮／暗切換（右下角） ---------- */
var THEMES = [['light', '亮色'], ['dark', '暗色']];
// 沒選過：照裝置目前的亮／暗決定一次，之後只在亮色、暗色之間切換
function curTheme() { var m = LS.get('fw_theme', ''); if (m === 'light' || m === 'dark') return m; return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function applyTheme() {
  var m = curTheme();
  document.documentElement.setAttribute('data-theme', m);
  var t = THEMES.filter(function (x) { return x[0] === m; })[0] || THEMES[0];
  $('themeBtn').innerHTML = ICONS[m === 'light' ? 'sun' : 'moon']; $('themeBtn').title = '顯示模式：' + t[1];
}
function cycleTheme() {
  var m = curTheme(), i = THEMES.map(function (x) { return x[0]; }).indexOf(m);
  var next = THEMES[(i + 1) % THEMES.length];
  LS.set('fw_theme', next[0]); applyTheme(); toast('顯示模式：' + next[1]);
}

/* ---------- 字體大小（每台裝置自己設） ---------- */
function applyFont() {
  var f = Number(LS.get('fw_font', 1)) || 1;
  document.documentElement.style.setProperty('--fz', f);   // 只放大內容，標題列和下方分頁不變
  // iPhone Safari 放大後內容會比螢幕寬：先測這台瀏覽器的行為，會變寬就把寬度縮回來
  if (ST.zoomWidens === undefined) {
    var box = document.createElement('div'), kid = document.createElement('div');
    box.style.cssText = 'position:absolute;visibility:hidden;width:200px;left:-9999px;top:0';
    kid.style.cssText = 'zoom:2'; kid.textContent = 'x'; box.appendChild(kid); document.body.appendChild(box);
    ST.zoomWidens = kid.getBoundingClientRect().width > 250; box.remove();
  }
  document.documentElement.classList.toggle('zoom-fix', ST.zoomWidens && f !== 1);
  Array.prototype.forEach.call(document.querySelectorAll('#font-seg button'), function (b) { b.classList.toggle('on', Number(b.getAttribute('data-v')) === f); });
  if (ST.sess) { try { updateStickyTop(); } catch (e) {} }
}
function setFont(f) { LS.set('fw_font', f); applyFont(); }

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

function k_(name, store) { return 'fw_' + name + '_' + (ST.sess ? ST.sess.account + '@' + (store || ST.sess.store) : ''); }
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
// 正數綠色、負數紅色、0 灰色
function sgn(v) { v = Math.round(Number(v)) || 0; return v > 0 ? ' pos' : (v < 0 ? ' neg' : ' zero'); }
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
// 角色：管理（全部）／店長（看全部，人事・外送對帳・分紅扣除只能看）／員工（每日結帳、進貨、固定／其他支出）
var ROLE_TABS = { manager: ['daily', 'purchase', 'expense', 'overview', 'payroll', 'delivery', 'deduct', 'loan', 'settings'], staff: ['daily', 'purchase', 'expense', 'settings'] };
var RO_TABS = { manager: ['payroll', 'delivery', 'deduct', 'loan'] };
var ROLE_NAMES = { admin: '管理', manager: '店長', staff: '員工' };
function myRole() { return (ST.sess && ST.sess.role) || 'manager'; }
function canSee(tab) { var t = ROLE_TABS[myRole()]; return !t || t.indexOf(tab) >= 0; }
function readOnly(tab) { return (RO_TABS[myRole()] || []).indexOf(tab) >= 0; }

/* ---------- 和 Google 溝通 ---------- */
// 手機有網路，但連不到試算表的同步服務（試算表程式剛更新需要授權、出錯，或同步網址換了）
var SYNC_DOWN_MSG = '連不到試算表的同步服務。手機有網路，是試算表那邊的問題：請管理者打開試算表，按「風味記帳 → ⑤ 更新程式」（第一次會要求授權，按允許），或確認同步網址沒有換。';
function api(action, body) {
  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 60000);   // 試算表有時比較慢，最多等 60 秒
  return fetch(ST.cfg.url, {
    method: 'POST', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, body || {}))
  }).then(function (r) {
    // 有回應但不是我們的資料（例如 Google 的錯誤頁）：是試算表程式的問題，不是網路
    return r.text().then(function (t) {
      try { return JSON.parse(t); } catch (x) { var e = new Error('bad'); e.down = true; e.detail = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); throw e; }
    });
  }).then(function (res) {
    clearTimeout(timer);
    if (!res.ok) { var e = new Error(res.error || '伺服器錯誤'); e.server = true; e.auth = !!res.auth; e.data = res; throw e; }
    return res;
  }, function (err) {
    clearTimeout(timer);
    var off = navigator.onLine === false;
    if (err && err.name === 'AbortError') { var t = new Error('試算表回應太慢（超過 60 秒），請稍後再試一次。資料都還在這台裝置。'); t.slow = true; throw t; }
    var e = new Error(off ? '連不上網路' : SYNC_DOWN_MSG);
    e.network = off; e.down = !off; e.cause = err; e.detail = err && err.detail; throw e;
  });
}

/* ---------- 畫面切換 ---------- */
function showView(name) {
  ['setup', 'login', 'app'].forEach(function (x) { $('v-' + x).classList.toggle('hide', x !== name); });
  $('tabs').classList.toggle('hide', name !== 'app');
  $('bottombar').classList.toggle('hide', name !== 'app');
  document.body.classList.toggle('has-bar', name === 'app');
  document.body.classList.toggle('app-on', name === 'app');
  $('sync').classList.toggle('hide', name !== 'app');
  $('menuBtn').classList.toggle('hide', name !== 'app');
  if (name === 'setup') {
    $('cfg-url').value = ST.cfg && !isBuiltinUrl(ST.cfg.url) ? ST.cfg.url : '';
    $('cfg-url').placeholder = DEFAULT_URL ? '空白＝用內建網址（建議）' : 'https://script.google.com/macros/s/…/exec';
    $('title').textContent = '裝置設定';
    $('setupBack').classList.toggle('hide', !ST.cfg && !DEFAULT_URL);
    $('setupBack').textContent = ST.sess ? '← 回 App（不改網址）' : '← 回登入畫面';
  }
  if (name === 'login') { $('title').textContent = '登入'; if (!$('login-acc').value) $('login-acc').value = LS.get('fw_lastAcc', ''); renderLeftover(); }
}

/* ---------- 日期／月份／年份左右的 ‹ › ---------- */
var STEP_IDS = ['d-date', 'p-date', 's-month', 'v-month', 'e-month', 'xs-month', 'm-month', 'y-year'];
function addSteppers() {
  STEP_IDS.forEach(function (id) {
    var el = $(id); if (!el || el.parentNode.classList.contains('stepper')) return;
    var w = document.createElement('div'); w.className = 'stepper';
    el.parentNode.insertBefore(w, el);
    w.innerHTML = '<button type="button" class="step" aria-label="上一個" onclick="stepField(\'' + id + '\',-1)">‹</button>';
    if (el.type === 'date' || el.type === 'month') {
      // 自己顯示「2026/11/3」：各家瀏覽器內建的格式不一樣（iPhone 會變成「2026年11月3日」還會換行）
      var box = document.createElement('span'); box.className = 'pk';
      var lab = document.createElement('span'); lab.className = 'pk-label';
      box.appendChild(lab); box.appendChild(el); w.appendChild(box);
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      var paint = function () { var v = desc.get.call(el), p = v.split('-'); lab.textContent = v ? (p[2] ? p[0] + '/' + Number(p[1]) + '/' + Number(p[2]) : p[0] + '/' + Number(p[1]) + '月') : '選擇'; };
      Object.defineProperty(el, 'value', { configurable: true, get: function () { return desc.get.call(el); }, set: function (v) { desc.set.call(el, v); paint(); } });
      el.addEventListener('input', paint); el.addEventListener('change', paint);
      el.addEventListener('click', function () { try { if (el.showPicker) el.showPicker(); } catch (e) {} });
      paint();
    } else w.appendChild(el);
    w.insertAdjacentHTML('beforeend', '<button type="button" class="step" aria-label="下一個" onclick="stepField(\'' + id + '\',1)">›</button>');
  });
}
function stepField(id, d) {
  var el = $(id), v = el.value;
  if (el.tagName === 'SELECT') {
    var i = el.selectedIndex + d;
    if (i < 0 || i >= el.options.length) return toast(d < 0 ? '已經是最早的了' : '已經是最新的了');
    el.selectedIndex = i;
  } else if (el.type === 'date') {
    var t = v ? new Date(v + 'T12:00:00') : new Date();
    t.setDate(t.getDate() + d);
    el.value = t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate());
  } else {
    var y = Number((v || todayStr()).slice(0, 4)), m = Number((v || todayStr()).slice(5, 7)) + d;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    el.value = y + '-' + p2(m);
  }
  el.dispatchEvent(new Event('change'));
}

// PIN 欄右邊的眼睛：按住就顯示 PIN，放開就藏起來
function addEyes() {
  Array.prototype.forEach.call(document.querySelectorAll('input[type=password]'), function (el) {
    if (el.parentNode.classList.contains('pw')) return;
    var w = document.createElement('span'); w.className = 'pw';
    el.parentNode.insertBefore(w, el); w.appendChild(el);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'eye'; b.tabIndex = -1;
    b.setAttribute('aria-label', '按住顯示 PIN'); b.title = '按住顯示 PIN';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    var show = function (e) { if (e) e.preventDefault(); el.type = 'text'; b.classList.add('on'); };
    var hide = function () { el.type = 'password'; b.classList.remove('on'); };
    b.addEventListener('pointerdown', show);
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function (ev) { b.addEventListener(ev, hide); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });   // 手機長按不要跳出選單
    w.appendChild(b);
  });
}
// 只能打數字：其他字（例如 / . - 空白、全形數字以外的字）打了會直接拿掉；全形數字自動換成半形
function digitsOnly(el) {
  var v = el.value, n = v.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[^0-9]/g, '');
  if (n !== v) { var p = el.selectionStart - (v.length - n.length); el.value = n; try { el.setSelectionRange(p, p); } catch (e) {} }
}
function boot() {
  addEyes();
  addSteppers();
  applyTheme();
  applyFont();
  $('ver').textContent = '風味記帳 版本 ' + APP_VERSION;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      ST.swReg = reg;
      reg.update().catch(function () {});
    }).catch(function () {});
    // 新版接手時自動重新整理一次（第一次安裝不用）
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || ST.reloading) return;
      if (ST.outbox) saveOutbox();
      ST.reloading = true; location.reload();
    });
    navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.version) { ST.swVersion = e.data.version; if (ST.tab === 'settings') renderSettingsTab(); } });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && ST.swReg) ST.swReg.update().catch(function () {}); });
  }
  // 同步網址：內建好了就不用輸入；也可以用「網址?api=…」的連結一次設定好
  var qApi = (location.search.match(/[?&]api=([^&]+)/) || [])[1];
  var preset = qApi ? decodeURIComponent(qApi) : DEFAULT_URL;
  // 沒有自己改過網址的裝置（包括以前存了舊網址的）一律用內建網址
  if (preset && /^https:\/\/script\.google(usercontent)?\.com\//.test(preset) && (!ST.cfg || qApi || (!ST.cfg.custom && !qApi && ST.cfg.url !== preset))) {
    ST.cfg = { url: preset, device: ST.cfg ? ST.cfg.device : '', custom: !!qApi && !isBuiltinUrl(preset) }; LS.set('fw_cfg', ST.cfg);
    if (qApi && history.replaceState) history.replaceState(null, '', location.pathname);
  }
  if (!ST.cfg) return showView('setup');
  if (!ST.sess || !ST.sess.account) { ST.sess = null; return showView('login'); }
  enterApp();
}

// 登入畫面：這台裝置上有哪些帳號還有沒上傳的資料（登出時保留下來的）
function leftover() {
  var by = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var m = /^fw_(outbox|failed)_(.+)@(.+)$/.exec(localStorage.key(i) || '');
      if (!m) continue;
      var n = (LS.get(m[0], []) || []).length;
      if (n) by[m[2]] = (by[m[2]] || 0) + n;
    }
  } catch (e) { /* ignore */ }
  return by;
}
function renderLeftover() {
  var by = leftover(), names = Object.keys(by), el = $('login-left');
  el.classList.toggle('hide', !names.length);
  el.innerHTML = names.length ? '⚠ 這台裝置還有沒上傳的資料：' + names.map(function (a) {
    return '<b>' + esc(a) + '</b> ' + by[a] + ' 筆';
  }).join('、') + '<br>用那個帳號登入就會自動上傳。' : '';
}

/* ---------- 第一次設定 ---------- */
function saveSetup() {
  var url = $('cfg-url').value.trim() || DEFAULT_URL;
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return toast('同步網址格式不對，應該是 https://script.google.com/… 開頭');
  var old = ST.cfg;
  ST.cfg = { url: url, device: old ? old.device : '', custom: !isBuiltinUrl(url) };   // 自己改的網址才記住，不然都跟著內建
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

// 不改網址，直接回去（還沒設定過就用內建網址）
function backFromSetup() {
  if (!ST.cfg) { if (!DEFAULT_URL) return; ST.cfg = { url: DEFAULT_URL, device: '', custom: false }; LS.set('fw_cfg', ST.cfg); }
  if (ST.sess && ST.sess.account) enterApp(); else showView('login');
}

/* ---------- 登入（帳號＋PIN） ---------- */
function pinRule(pin) {
  pin = String(pin || '');
  return [['8 個字元以上', pin.length >= 8], ['英文字母', /[A-Za-z]/.test(pin)], ['數字', /[0-9]/.test(pin)], ['符號', /[^A-Za-z0-9]/.test(pin)]];
}
function pinHint(id, hintId) {
  $(hintId).innerHTML = pinRule($(id).value).map(function (r) { return '<span class="' + (r[1] ? 'ok' : '') + '">' + (r[1] ? '✓ ' : '') + r[0] + '</span>'; }).join('');
}
function pinOk(pin) { return pinRule(pin).every(function (r) { return r[1]; }); }
function deviceKind() {
  var u = navigator.userAgent;
  return /iPad/.test(u) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Android 手機' : 'Android 平板') : '電腦';
}
function login() {
  var account = $('login-acc').value.trim(), pin = $('login-pin').value;
  if (!account || !pin) return toast('請輸入帳號和 PIN');
  var body = { account: account, pin: pin, device: deviceKind(), store: LS.get('fw_lastStore_' + account, '') };
  if (!$('newpin-box').classList.contains('hide')) {
    var n1 = $('login-new').value, n2 = $('login-new2').value;
    if (!pinOk(n1)) return toast('新 PIN 不符合規則：8 個字元以上，要有英文、數字、符號');
    if (n1 !== n2) return toast('兩次輸入的新 PIN 不一樣');
    body.newPin = n1;
  }
  busy(true);
  api('login', body).then(function (r) {
    busy(false);
    ['login-pin', 'login-new', 'login-new2'].forEach(function (id) { $(id).value = ''; });
    $('newpin-box').classList.add('hide');
    var same = ST.sess && ST.sess.account === r.account;
    var keepStore = same ? ST.sess.store : null;
    ST.sess = { account: r.account, token: r.token, role: r.role, stores: r.stores, store: r.store };
    ST.cfg.device = r.account; LS.set('fw_cfg', ST.cfg);
    LS.set('fw_sess', ST.sess); LS.set('fw_lastAcc', r.account); LS.set('fw_lastStore_' + r.account, r.store);
    if (!same || keepStore !== r.store) loadLocal();
    acceptPull(r);
    ST.authLost = false;
    enterApp();
    if (ST.outbox.length) trySync();
    toast('歡迎，' + r.account + (body.newPin ? '（新 PIN 已設定）' : ''));
  }, function (e) {
    busy(false);
    if (e.data && e.data.needNewPin) {
      $('newpin-box').classList.remove('hide'); pinHint('login-new', 'login-new-hint');
      if ($('login-new').value) toast('⚠ ' + e.message); else { toast(e.message); $('login-new').focus(); }
      return;
    }
    if (e.down) {
      var u = ST.cfg && isBuiltinUrl(ST.cfg.url) ? '（內建網址）' : ((ST.cfg && ST.cfg.url) || '');
      alert(SYNC_DOWN_MSG + (e.detail ? '\n\n（試算表回應：' + e.detail + '）' : '') +
        '\n\n這台裝置用的同步網址：\n' + u + '\n\n檢查方法：把這個網址貼到瀏覽器打開，看到「風味記帳同步服務」就是網址正確；看到錯誤頁或要登入，就是網址錯了，請按「修改同步網址」換成手機上在用的那個。');
      return;
    }
    toast(e.network ? '手機目前沒有網路，第一次登入（或重新登入）需要網路' : '⚠ ' + e.message);
  });
}
function changePin() {
  var o = $('cp-old').value, n1 = $('cp-new').value, n2 = $('cp-new2').value;
  if (!o) return toast('請輸入目前的 PIN');
  if (!pinOk(n1)) return toast('新 PIN 不符合規則：8 個字元以上，要有英文、數字、符號');
  if (n1 !== n2) return toast('兩次輸入的新 PIN 不一樣');
  busy(true);
  api('changePin', { account: ST.sess.account, token: ST.sess.token, oldPin: o, newPin: n1 }).then(function (r) {
    busy(false);
    ST.sess.token = r.token; LS.set('fw_sess', ST.sess);
    ['cp-old', 'cp-new', 'cp-new2'].forEach(function (id) { $(id).value = ''; }); pinHint('cp-new', 'cp-hint');
    toast('PIN 已更改 ✓');
  }, function (e) { busy(false); toast(e.network ? '更改 PIN 需要網路' : '⚠ ' + e.message); });
}
// 切換店別：管理可以切任何店；店長只能切有權限的店
function switchStore(name) {
  if (!ST.sess || name === ST.sess.store) return;
  if ((ST.sess.stores || []).indexOf(name) < 0) return toast('沒有這家店的權限');
  var prev = ST.sess.store;
  saveOutbox();
  ST.sess.store = name; LS.set('fw_sess', ST.sess); LS.set('fw_lastStore_' + ST.sess.account, name);
  loadLocal();
  if (ST.snap) { enterApp(); trySync(); return; }
  if (navigator.onLine === false) { ST.sess.store = prev; LS.set('fw_sess', ST.sess); loadLocal(); enterApp(); return toast('「' + name + '」還沒下載過，請先連上網路'); }
  busy(true);
  api('sync', { account: ST.sess.account, token: ST.sess.token, store: name, ops: [] }).then(function (r) {
    busy(false); acceptPull(r, name);
    if (ST.sess.store !== name) return;  // 又切去別家了
    enterApp(); toast('已切換到 ' + name);
  }, function (e) {
    busy(false);
    if (ST.sess.store !== name) return;
    ST.sess.store = prev; LS.set('fw_sess', ST.sess); loadLocal(); enterApp();
    toast('⚠ ' + (e.network ? '切換需要網路' : e.message));
  });
}
function logout() {
  var stores = (ST.sess && ST.sess.stores) || [], n = 0;
  stores.forEach(function (st) { n += (LS.get(k_('outbox', st), []) || []).length; });
  if (!confirm(n ? '還有 ' + n + ' 筆資料沒有上傳。\n登出後會留在這台裝置，下次用同一個帳號登入就會自動上傳。\n\n確定登出？' : '確定登出？（雲端資料不受影響）')) return;
  // 沒上傳的（outbox／failed）留著，等同一個帳號再登入時上傳；其他快取清掉
  stores.forEach(function (st) {
    ['snap', 'last'].forEach(function (x) { LS.del(k_(x, st)); });
    ['outbox', 'failed'].forEach(function (x) { if (!(LS.get(k_(x, st), []) || []).length) LS.del(k_(x, st)); });
  });
  LS.del('fw_sess');
  ST.sess = null; ST.snap = null; ST.outbox = []; ST.failed = [];
  showView('login');
}

function acceptPull(r, store) {
  var snap = { config: r.config, data: r.data, serverTime: r.serverTime };
  if (r.stores && ST.sess) {
    var changed = (ST.sess.stores || []).join('|') !== r.stores.join('|');
    ST.sess.stores = r.stores; if (r.role) ST.sess.role = r.role; LS.set('fw_sess', ST.sess);
    if (changed && !$('v-app').classList.contains('hide')) renderTitle();   // 試算表新增／移除店家：店別選單馬上更新
  }
  if (store && store !== ST.sess.store) { LS.set(k_('snap', store), snap); LS.set(k_('last', store), nowStr()); return; }
  ST.snap = snap;
  ST.lastSync = nowStr();
  LS.set(k_('snap'), ST.snap);
  LS.set(k_('last'), ST.lastSync);
}

/* ---------- 進入主畫面 ---------- */
// 左上角：店別選單（可用兩家以上才有）＋帳號
function renderTitle() {
  var sts = ST.sess.stores || [ST.sess.store];
  $('title').innerHTML = (sts.length > 1 ? '<select id="storeSel" onchange="switchStore(this.value)">' + sts.map(function (n) { return '<option' + (n === ST.sess.store ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' : esc(ST.sess.store)) +
    '<span class="acc">・' + esc(ST.sess.account) + '</span>';
}
function enterApp() {
  if (!ST.snap) loadLocal();
  if (!ST.snap) { showView('login'); return; }
  showView('app');
  safe('標題', renderTitle);
  var t = todayStr(), m = t.slice(0, 7);
  ['d-date', 'p-date'].forEach(function (id) { var el = $(id); if (el && !el.value) el.value = t; });
  ['s-month', 'v-month', 'e-month', 'x-month', 'm-month'].forEach(function (id) { var el = $(id); if (el && !el.value) el.value = m; });
  if ($('x-type')) $('x-type').innerHTML = (ST.snap.config.deductTypes || ['員工分紅', '年終預留', '其他扣除']).filter(function (x) { return ['股東分紅（已發）', '員工借款', '員工還款'].indexOf(x) < 0; }).map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('');
  var mine = TABS.filter(function (x) { return canSee(x[0]); });
  $('tabs').innerHTML = mine.map(function (x) {
    return '<button id="tb-' + x[0] + '" onclick="showTab(\'' + x[0] + '\')">' + ICONS[x[0]] + x[1] + '</button>';
  }).join('');
  var main = mine.length <= 5 ? mine : mine.slice(0, 4), rest = mine.length <= 5 ? [] : mine.slice(4);
  $('bottombar').innerHTML = main.map(function (x) {
    return '<button id="bb-' + x[0] + '" onclick="showTab(\'' + x[0] + '\')">' + ICONS[x[0]] + (SHORT[x[0]] || x[1]) + '</button>';
  }).join('') + (rest.length ? '<button id="bb-more" onclick="openMore()">' + ICONS.more + '更多</button>' : '');
  $('moregrid').innerHTML = rest.map(function (x) {
    return '<button onclick="closeMore();showTab(\'' + x[0] + '\')">' + ICONS[x[0]] + x[1] + '</button>';
  }).join('');
  ST.moreTabs = rest.map(function (x) { return x[0]; });
  if (!canSee(ST.tab)) ST.tab = 'daily';
  safe('分頁', function () { showTab(ST.tab); });
  safe('同步狀態', renderStatus);
}
// 某一塊畫面出錯時，不要整個 App 都空白：其他部分照常顯示，並把錯誤記下來
function safe(where, fn) {
  try { fn(); } catch (e) { reportErr(where, e); }
}
function reportErr(where, e) {
  var msg = (where ? where + '：' : '') + (e && e.message || e);
  try { console.error(e); } catch (x) { /* ignore */ }
  if (ST.lastErr === msg) return; ST.lastErr = msg;
  try { (ST.failed = ST.failed || []).push({ at: nowStr(), op: { type: '畫面錯誤' }, msg: msg }); saveOutbox(); } catch (x) { /* ignore */ }
  toast('⚠ 畫面出錯：' + msg + '（請截圖給管理者，重新整理通常就好）');
}
window.addEventListener('error', function (ev) { reportErr('', ev.error || ev.message); });
function openSettings() { showTab('settings'); }
function openMore() { $('moresheet').classList.remove('hide'); }
function closeMore() { $('moresheet').classList.add('hide'); }

/* ---------- 日期／月份置頂：切換分頁時，把那頁的日期／月份搬到上方固定列 ---------- */
var PIN_MAP = { daily: [['d-date', '日期']], purchase: [['p-date', '日期']], expense: [['e-month', '月份']],
  overview: [['ov-seg'], ['ov-month-pick'], ['ov-year-pick']], payroll: [['s-month', '月份']], delivery: [['v-month', '月份']], deduct: [['xs-month', '月份']] };
function pinPickers(name) {
  (ST.pinned || []).forEach(function (p) { p.ph.parentNode.insertBefore(p.node, p.ph); p.ph.remove(); if (p.cap) p.cap.remove(); });
  ST.pinned = [];
  var bar = $('pickbar'); bar.innerHTML = '';
  (PIN_MAP[name] || []).forEach(function (spec) {
    var el = $(spec[0]); if (!el) return;
    var node = el.closest('.stepper') || el;
    if (spec[1] === undefined) node = el;
    var ph = document.createComment('pin'); node.parentNode.insertBefore(ph, node);
    var wrap = node, cap = null;
    if (spec[1]) {                                        // 單一欄位：加上小標題「日期／月份」
      wrap = document.createElement('div'); wrap.className = 'pin';
      cap = document.createElement('div'); cap.className = 'pin-cap'; cap.textContent = spec[1];
      wrap.appendChild(cap); wrap.appendChild(node); cap = wrap;
      var lbl = ph.previousElementSibling; if (lbl && lbl.tagName === 'LABEL') { lbl.classList.add('hide'); ST.pinned.lbl = (ST.pinned.lbl || []).concat(lbl); }
    }
    bar.appendChild(wrap);
    ST.pinned.push({ node: node, ph: ph, cap: cap });
  });
  bar.classList.toggle('hide', !ST.pinned.length);
  bar.classList.toggle('multi', ST.pinned.length > 1);
  placePickbar();
}
// 手機：日期／月份放進標題列（省一整列）；平板、電腦放回內容上方
var PHONE = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
function placePickbar() {
  var bar = $('pickbar'), head = document.querySelector('header');
  if (!ST.pickHome) ST.pickHome = { parent: bar.parentNode, next: bar.nextSibling };
  if (PHONE.matches && bar.parentNode !== head) head.appendChild(bar);
  else if (!PHONE.matches && bar.parentNode === head) ST.pickHome.parent.insertBefore(bar, ST.pickHome.next);
  updateStickyTop();
}
if (PHONE.addEventListener) PHONE.addEventListener('change', placePickbar);
function updateStickyTop() {
  var h = document.querySelector('header').offsetHeight, t = $('tabs');
  var tabsOn = t && !t.classList.contains('hide') && getComputedStyle(t).display !== 'none' && t.parentNode !== document.querySelector('header');   // 分頁在標題列裡就不另外算高度
  if (t && tabsOn) t.style.top = h + 'px';                               // 分頁列緊貼標題列，不留縫
  document.documentElement.style.setProperty('--sticky-top', (h + (tabsOn ? t.offsetHeight : 0)) + 'px');
  // 月份／日期列在內容上方（平板、電腦）也是黏在上面：底下會黏住的東西（人事的員工名字、表格標題）要排在它下面，不然會疊在一起
  var bar = $('pickbar'), under = h + (tabsOn ? t.offsetHeight : 0);
  if (bar && bar.parentNode !== document.querySelector('header') && !bar.classList.contains('hide')) under += bar.offsetHeight;
  document.documentElement.style.setProperty('--sticky-under', under + 'px');
}
window.addEventListener('resize', function () { if (ST.sess) updateStickyTop(); });

function showTab(name) {
  try { showTab_(name); } catch (e) { reportErr('分頁「' + name + '」', e); }
}
function showTab_(name) {
  ST.tab = name;
  (ST.hiddenLbls || []).forEach(function (l) { l.classList.remove('hide'); });
  pinPickers(name);
  updateWarns();
  ST.hiddenLbls = ST.pinned.lbl || [];
  document.body.classList.toggle('page-wide', name === 'overview' && ST.ov !== 'month');
  TABS.forEach(function (x) { var sec = $('tab-' + x[0]); if (sec) sec.classList.toggle('ro', readOnly(x[0])); });   // 店長：只能看
  TABS.forEach(function (x) {
    $('tab-' + x[0]).classList.toggle('hide', x[0] !== name);
    var b = $('tb-' + x[0]); if (b) b.classList.toggle('on', x[0] === name);
    var bb = $('bb-' + x[0]); if (bb) bb.classList.toggle('on', x[0] === name);
  });
  var more = $('bb-more'); if (more) more.classList.toggle('on', (ST.moreTabs || []).indexOf(name) >= 0);
  window.scrollTo(0, 0);
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
    case 'loan': renderLoanTab(); break;
    case 'overview': renderOverview(); break;
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
  var batch = ST.outbox.slice(0, 40), store = ST.sess.store;
  api('sync', { account: ST.sess.account, store: store, token: ST.sess.token, ops: batch }).then(function (r) {
    // 同步途中切換了店：結果記回原本那家店，不能蓋到現在這家店
    if (!ST.sess || ST.sess.store !== store) {
      ST.syncing = false;
      if (ST.sess) { finishOther(store, batch, r); renderStatus(); setTimeout(trySync, 100); }
      return;
    }
    var done = {};
    (r.results || []).forEach(function (x) {
      done[x.id] = true;
      var op = batch.filter(function (o) { return o.id === x.id; })[0];
      if (x.status === 'error') ST.failed.push({ at: nowStr(), op: op, msg: x.error });
      if (x.status === 'stale') ST.failed.push({ at: nowStr(), op: op, msg: '別台裝置已經存了更新的版本，這筆沒有覆蓋' });
    });
    ST.syncDown = false;
    ST.outbox = ST.outbox.filter(function (o) { return !done[o.id]; });
    if (ST.failed.length > 50) ST.failed = ST.failed.slice(-50);
    saveOutbox();
    acceptPull(r);
    syncOtherStores();
    ST.syncing = false;
    renderStatus(); refreshTab(false);
    if (manual) toast('同步完成 ✓');
    if (ST.outbox.length) setTimeout(trySync, 300);
  }, function (e) {
    ST.syncing = false; ST.syncDown = !!e.down;
    if (e.auth) { ST.authLost = true; toast('登入已失效，請重新輸入 PIN（資料都還在）'); }
    else if (manual) toast(e.network ? '同步失敗：連不上網路，稍後會自動再試' : '⚠ ' + e.message);
    renderStatus(); renderBanner();
  });
}
// 其他店還沒上傳的資料（切換店之前記的），背景一起送出
function syncOtherStores() {
  (ST.sess.stores || []).forEach(function (st) {
    if (st === ST.sess.store) return;
    var ob = LS.get(k_('outbox', st), []);
    if (!ob.length) return;
    var batch = ob.slice(0, 40);
    api('sync', { account: ST.sess.account, store: st, token: ST.sess.token, ops: batch }).then(function (r) {
      if (ST.sess) finishOther(st, batch, r);
    }, function () { /* 下次再試 */ });
  });
}
// 某家店（不一定是現在這家）的同步結果：已上傳的從那家店的待上傳拿掉，資料存到那家店
function finishOther(st, batch, r) {
  var done = {}, fails = [];
  (r.results || []).forEach(function (x) {
    done[x.id] = true;
    var op = batch.filter(function (o) { return o.id === x.id; })[0];
    if (x.status === 'error') fails.push({ at: nowStr(), op: op, msg: st + '：' + x.error });
    if (x.status === 'stale') fails.push({ at: nowStr(), op: op, msg: st + '：別台裝置已經存了更新的版本，這筆沒有覆蓋' });
  });
  var keep = function (o) { return !done[o.id]; };
  if (st === ST.sess.store) {            // 又切回這家店了：畫面上用的也要一起更新
    ST.outbox = ST.outbox.filter(keep); ST.failed = ST.failed.concat(fails).slice(-50);
    saveOutbox();
  } else {
    LS.set(k_('outbox', st), LS.get(k_('outbox', st), []).filter(keep));
    LS.set(k_('failed', st), LS.get(k_('failed', st), []).concat(fails).slice(-50));
  }
  acceptPull(r, st);
  if (st === ST.sess.store) refreshTab(false);
}
function relogin() {
  $('login-acc').value = ST.sess.account;
  showView('login');
  toast('請重新輸入 PIN，沒上傳的資料會保留');
}
// 手機：平常只顯示 ✓；點一下展開「05:21 已同步 ✓」；展開時再點一下開始同步（轉圈），同步完更新時間
function onSyncClick() {
  if (ST.authLost) return relogin();
  var b = $('sync');
  if (!b.classList.contains('open')) { b.classList.add('open'); syncAutoClose(); return; }
  trySync(true);
}
function syncAutoClose() {
  clearTimeout(ST.syncCloseT);
  ST.syncCloseT = setTimeout(function () { if (!ST.syncing) $('sync').classList.remove('open'); else syncAutoClose(); }, 4000);
}

// 右下角「需要注意」：這個月和上個月的提醒（員工看不到）
function warnItems(month) {
  if (!ST.sess || !ST.snap || myRole() === 'staff') return [];
  var R; try { R = computeLocal().R; } catch (e) { return []; }
  var cur = todayStr().slice(0, 7), last = prevMonth_(cur);
  return R.warns.filter(function (w) { return month ? (w.month === month || w.month === '') : (w.month === cur || w.month === last || w.month === ''); });
}
function updateWarns() {
  clearTimeout(ST.warnT);
  ST.warnT = setTimeout(function () {
    var n = warnItems(warnMonth()).length, b = $('warnBtn');
    b.classList.toggle('hide', !n || !$('v-app') || $('v-app').classList.contains('hide'));
    $('warnN').textContent = n > 99 ? '99+' : n;
  }, 300);
}
// 在月總覽看某個月時，就顯示那個月的；其他頁顯示這個月和上個月的
function warnMonth() { return ST.tab === 'overview' && ST.ov === 'month' && $('m-month').value ? $('m-month').value : ''; }
function openWarns(month) {
  var list = warnItems(month || warnMonth()), by = {};
  list.forEach(function (w) { (by[w.month || ''] = by[w.month || ''] || []).push(w); });
  $('warnTitle').textContent = '⚠ 需要注意（' + list.length + '）';
  $('warnlist').innerHTML = list.length ? Object.keys(by).sort().reverse().map(function (m) {
    return '<h3><span>' + (m ? m.slice(0, 4) + '/' + Number(m.slice(5, 7)) + '月' : '一般') + '</span>' +
      (m ? '<button class="ghost go" onclick="closeWarns();showTab(\'overview\');$(\'m-month\').value=\'' + m + '\';setOverview(\'month\')">看這個月 ›</button>' : '') + '</h3><ul>' +
      by[m].map(function (w) { return '<li><b>' + esc(w.type) + '</b>：' + esc(w.text) + '</li>'; }).join('') + '</ul>';
  }).join('') : '<p class="ok">✓ 沒有需要注意的</p>';
  $('warnsheet').classList.remove('hide');
}
function closeWarns() { $('warnsheet').classList.add('hide'); }
function renderStatus() {
  updateWarns();
  renderBanner();
  var b = $('sync'), n = ST.outbox.length;
  b.classList.remove('pending', 'err');
  var set = function (txt, ic) { b.innerHTML = '<span class="sync-txt">' + txt + '</span><span class="sync-ic">' + ic + '</span>'; b.title = txt; };
  if (b.classList.contains('open')) syncAutoClose();
  if (ST.authLost) { set('需重新登入', '!'); b.classList.add('err'); return; }
  if (ST.syncing) { set('同步中', '<i class="spin"></i>'); return; }
  if (n) { set((navigator.onLine === false ? '離線｜' : '') + n + ' 筆待上傳', n > 99 ? '99+' : n); b.classList.add('pending'); return; }
  if (navigator.onLine === false) return set('離線｜已全部上傳', '✓');
  set((ST.lastSync ? ST.lastSync.slice(11, 16) + ' ' : '') + '已同步', '✓');
}
var NEED_SERVER = '4.6.0';   // 試算表 Code.gs 至少要這一版（和 Code.gs 的 SERVER_VERSION 對應）
function verNum(v) { return String(v || '0').split('.').reduce(function (a, x) { return a * 1000 + Number(x || 0); }, 0); }
function renderBanner() {
  var h = '';
  var sv = ST.snap && ST.snap.config && ST.snap.config.serverVersion;
  if (ST.snap && verNum(sv) < verNum(NEED_SERVER)) h += '<div class="banner err">試算表的程式還是舊版（' + esc(sv || '舊版') + '），請管理者到試算表按選單「風味記帳 → ⑤ 更新程式」。</div>';
  if (ST.syncDown && !ST.authLost) h += '<div class="banner err">' + esc(SYNC_DOWN_MSG) + '資料都存在這台裝置，恢復後會自動上傳。</div>';
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
// 過去用過的支出名稱 → 上次選的分類、付款方式（自動帶入）
function lineMemory() {
  var mem = {};
  view().daily.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (r) {
    (r.lines || []).forEach(function (l) { if (l.name) mem[l.name] = { cat: l.cat || '' }; });
  });
  return mem;
}
function loadDaily() {
  var date = $('d-date').value;
  var d = dailyRec(date);
  $('d-closed').checked = !!(d && d.closed);
  setNum('d-site', d && d.site); setNum('d-panda', d && d.panda); setNum('d-uber', d && d.uber);
  setNum('d-allpay', d && d.allpay); setNum('d-line', d && d.line);
  setNum('d-cash', d && d.cash); $('d-note').value = d ? (d.note || '') : '';
  if (d && d.lines && d.lines.length) ST.lines = JSON.parse(JSON.stringify(d.lines)).map(function (l) { if (!l.cat) l.cat = LINE_OLD; return l; });
  else if (d && d.spend) ST.lines = [{ name: '舊表的現場支出合計', amount: d.spend, cat: LINE_OLD }];
  else ST.lines = [{ name: '', amount: '', cat: LINE_OTHER }];
  ST.lineCats = categoriesFor(date.slice(0, 7));
  var mem = lineMemory();
  $('d-names').innerHTML = Object.keys(mem).concat(ST.lineCats).filter(function (x, i, a) { return a.indexOf(x) === i; })
    .map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  renderLines();
  renderDailyExist();
}
function renderDailyExist() {
  var d = dailyRec($('d-date').value);
  $('d-exist').classList.toggle('hide', !d);
  if (d) $('d-exist').innerHTML = '這天已經有紀錄（' + esc(d.editedAt || '') + (d.device ? '，' + esc(d.device) : '') + '）' +
    pendTag('daily', d.date) + '，修改後再儲存會覆蓋。';
}
var LINE_OTHER = '其他支出', LINE_WAGE = '薪資／預支';      // LINE_WAGE：舊資料用，不會自動記到人事
var LINE_PT = 'PT薪資', LINE_ADV = '預支';
var LINE_OLD = '舊表合計';                                     // 舊表匯入的日子只有支出合計：照算現金，但不另外記到進貨／支出／人事（舊表的進貨已經匯入過）                    // 新的：存檔時自動記到「人事」
function isWageCat(c) { return c === LINE_PT || c === LINE_ADV || c === LINE_WAGE || c === LINE_OLD; }   // 這些都不會自動記成進貨／其他支出
// 名稱看起來是 PT 或預支，就自動選對分類（舊的「薪資／預支」也換成新的）
function wageCatFor(name) { var n = String(name || ''); return /預支|借/.test(n) ? LINE_ADV : LINE_PT; }
// 記到人事時是誰：名稱裡有員工名字就用員工名字，不然就用名稱本身（例如 PT）
function slipPerson(name, cat) {
  var n = String(name || '').trim(), emps = ((ST.snap && ST.snap.config.employees) || []).map(function (e) { return e.name; })
    .sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < emps.length; i++) if (emps[i] && n.indexOf(emps[i]) >= 0) return emps[i];
  n = n.replace(/預支|借支|借款|薪資|日薪/g, '').trim();
  return n || (cat === LINE_ADV ? '（未指定）' : 'PT');
}

/* ---------- 常用項目：存在試算表「設定_常用項目」，在「裝置 → 常用項目設定」修改 ---------- */
var PRESET_DEFAULTS = {
  '每日結帳': [['米', '米'], ['菜', '菜'], ['蔥', '菜'], ['油條', '其他支出'], ['燉滷', '其他支出'], ['PT', '薪資／預支']],
  '固定支出': [['房租', '固定'], ['電費', '固定'], ['水費', '固定'], ['電話費', '固定'], ['網路費', '固定'], ['瓦斯費', '固定'],
    ['拜拜', '固定'], ['聚餐', '其他'], ['外送費用', '其他']],
  '人事': [['加班費', '薪資', '加'], ['多加班', '薪資', '加'], ['全勤獎金', '薪資', '加'], ['責任津貼', '薪資', '加'], ['職務加給', '薪資', '加'],
    ['銷假上班', '薪資', '加'], ['節日獎金', '薪資', '加'], ['早退', '薪資', '扣'], ['請假扣薪', '薪資', '扣'],
    ['扣健保(自付)', '薪資', '扣'], ['扣勞保(自付)', '薪資', '扣'], ['已預支', '預支', '扣'],
    ['勞退(公司)', '公司負擔', '加'], ['健保(公司)', '公司負擔', '加'], ['勞保(公司)', '公司負擔', '加']]
};
// 這家店自己設定過就用自己的；沒有就用「全部」；試算表還沒有這張表就用內建預設
function presetsFor(use) {
  var all = (view().presets || []).filter(function (r) { return r.use === use; });
  var mine = all.filter(function (r) { return r.store === ST.sess.store; });
  var list = mine.length ? mine : all.filter(function (r) { return r.store === '全部'; });
  if (!list.length && !(view().presets || []).some(function (r) { return r.use === use && r.store === ST.sess.store; }))
    list = (PRESET_DEFAULTS[use] || []).map(function (p) { return { name: p[0], cat: p[1], sign: p[2] || '' }; });
  return list.map(function (r) { return { name: r.name, cat: r.cat, sign: r.sign || '' }; });
}
/* 支出明細的常用項目：照設定的清單顯示，附上次金額 */
function linePresets() {
  var last = {};
  view().daily.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (r) {
    (r.lines || []).forEach(function (l) { var n = String(l.name || '').trim(); if (n) last[n] = l.amount; });
  });
  return presetsFor('每日結帳').map(function (p) {
    var c = p.cat;
    if (c === LINE_WAGE) c = wageCatFor(p.name);
    if (c !== LINE_OTHER && c !== LINE_PT && c !== LINE_ADV && ST.lineCats.indexOf(c) < 0) c = ST.lineCats.indexOf(p.name) >= 0 ? p.name : LINE_OTHER;
    return { name: p.name, cat: c, last: last[p.name] === undefined ? null : last[p.name] };
  });
}
function renderLineChips() {
  var have = {}; ST.lines.forEach(function (l) { have[String(l.name || '').trim()] = true; });
  ST.linePresets = linePresets();
  $('d-presets').innerHTML = ST.linePresets.map(function (p, i) {
    if (have[p.name]) return '';
    return '<button onclick="addLinePreset(' + i + ')">＋' + esc(p.name) + (p.last ? '<small>' + money(p.last) + '</small>' : '') + '</button>';
  }).join('');
}
function addLinePreset(i) {
  var p = ST.linePresets[i];
  var last = ST.lines[ST.lines.length - 1];
  if (last && !String(last.name || '').trim() && !String(last.amount || '').trim()) { last.name = p.name; last.cat = p.cat; }
  else ST.lines.push({ name: p.name, amount: '', cat: p.cat });
  renderLines();
  var rows = $('d-lines').querySelectorAll('.line');
  var idx = ST.lines.map(function (l) { return l.name; }).lastIndexOf(p.name);
  if (rows[idx]) rows[idx].querySelector('input.amt').focus();
}
function renderLines() {
  $('d-lines').innerHTML = ST.lines.map(function (l, i) {
    var opt = function (v, t) { return '<option value="' + esc(v) + '"' + (v === l.cat ? ' selected' : '') + '>' + esc(t || v) + '</option>'; };
    return '<div class="line">' +
      '<input list="d-names" value="' + esc(l.name) + '" placeholder="名稱（例：米、PT）" oninput="setLine(' + i + ',\'name\',this.value)" onchange="guessLine(' + i + ')">' +
      '<input class="amt" value="' + esc(l.amount) + '" inputmode="text" placeholder="金額" oninput="setLine(' + i + ',\'amount\',this.value)">' +
      '<select onchange="setLine(' + i + ',\'cat\',this.value)">' +
        '<optgroup label="進貨">' + ST.lineCats.map(function (c) { return opt(c); }).join('') + '</optgroup>' +
        '<optgroup label="其他">' + opt(LINE_OTHER, '其他支出') + (function () { var ph = window.matchMedia && window.matchMedia('(max-width: 560px)').matches; return opt(LINE_PT, ph ? 'PT薪資' : 'PT薪資（記到人事）') + opt(LINE_ADV, ph ? '預支' : '預支（記到人事）') + (l.cat === LINE_WAGE ? opt(LINE_WAGE, '薪資／預支（舊）') : '') + (l.cat === LINE_OLD ? opt(LINE_OLD, '舊表合計') : ''); })() + '</optgroup>' +
      '</select>' +
      '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="delLine(' + i + ')">✕</button></div>';
  }).join('');
  renderLineChips();
  dailyCalc();
}
function setLine(i, k, val) { ST.lines[i][k] = val; if (k === 'name') renderLineChips(); dailyCalc(); }
function guessLine(i) {
  var l = ST.lines[i], n = String(l.name || '').trim();
  if (!n) return;
  var m = lineMemory()[n];
  if (m && m.cat) l.cat = m.cat === LINE_WAGE ? wageCatFor(n) : m.cat;
  else if (ST.lineCats.indexOf(n) >= 0) l.cat = n;
  else if (/^PT|預支|借支/i.test(n)) l.cat = wageCatFor(n);
  else return;
  // 只改這一行的分類，不重畫整個清單（不然正在輸入的金額欄會不見）
  var sel = $('d-lines').querySelectorAll('.line')[i];
  if (sel) { sel = sel.querySelector('select'); if (sel) sel.value = l.cat; }
}
function delLine(i) { ST.lines.splice(i, 1); if (!ST.lines.length) ST.lines.push({ name: '', amount: '', cat: LINE_OTHER }); renderLines(); }
function addLine() {
  ST.lines.push({ name: '', amount: '', cat: LINE_OTHER }); renderLines();
  var rows = $('d-lines').querySelectorAll('.line'); rows[rows.length - 1].querySelector('input').focus();
}
function cashSpend() {
  return ST.lines.reduce(function (a, l) { var v = expr(l.amount); return a + (!isNaN(v) ? v : 0); }, 0);
}
function dailyCalc() {
  var closed = $('d-closed').checked;
  Array.prototype.forEach.call(document.querySelectorAll('#tab-daily .d-body'), function (x) { x.classList.toggle('hide', closed); });
  ['d-site', 'd-panda', 'd-uber', 'd-cash'].forEach(function (id) { $(id).disabled = closed; });
  var site = v('d-site'), panda = v('d-panda'), uber = v('d-uber');
  var spend = cashSpend();
  var expected = site - v('d-allpay') - v('d-line') - spend;
  $('d-total').textContent = money(site + panda + uber);
  $('d-spendv').textContent = spend ? '-' + money(spend) : '0';
  $('d-expected').textContent = money(expected);
  var typed = $('d-cash').value.trim() !== '';
  var diff = v('d-cash') - expected, lim = ST.snap.config.store.cashWarn || 500;
  var el = $('d-diff');
  el.className = 'big2' + (typed ? (Math.abs(diff) > lim ? ' bad' : (diff === 0 ? ' ok' : ' warn')) : '');
  el.textContent = typed ? (diff > 0 ? '+' : '') + money(diff) : '—';
  el.title = typed && Math.abs(diff) > lim ? '差太多，請再點一次現金' : '';
}
function saveDaily() {
  var ids = ['d-site', 'd-panda', 'd-uber', 'd-allpay', 'd-line', 'd-cash'];
  if (ids.some(function (id) { return isNaN(v(id)); })) return toast('有欄位格式不對');
  if (ST.lines.some(function (l) { return String(l.amount).trim() !== '' && isNaN(expr(l.amount)); })) return toast('支出明細有金額看不懂');
  var closed = $('d-closed').checked;
  if (!closed && !v('d-site') && !v('d-panda') && !v('d-uber')) return toast('請輸入營業額，或勾選公休');
  var date = $('d-date').value;
  if (!date) return toast('請選日期');
  var old = dailyRec(date);
  var lines = closed ? [] : ST.lines.filter(function (l) { return String(l.name || '').trim() || expr(l.amount); }).map(function (l) {
    return { name: String(l.name || '').trim() || '（未命名）', amount: expr(l.amount), cash: true, cat: l.cat || LINE_OTHER };
  });
  // 先刪掉這天上次自動產生的進貨／其他支出，再依新的明細重新產生
  ((old && old.lines) || []).forEach(function (l) {
    if (!l.pid) return;
    enqueue(l.pid.charAt(0) === 'E' ? 'expense.del' : 'purchase.del', { id: l.pid });
  });
  var tag = date.replace(/-/g, '');
  lines.forEach(function (l) {
    if (!l.amount || isWageCat(l.cat)) return;
    if (l.cat === LINE_OTHER) {
      l.pid = 'E' + tag + uid().slice(0, 6);
      enqueue('expense.add', { id: l.pid, month: date.slice(0, 7), type: '其他', item: l.name, amount: l.amount, note: '每日結帳 ' + date });
    } else {
      l.pid = 'D' + tag + uid().slice(0, 6);
      enqueue('purchase.add', { id: l.pid, date: date, cat: l.cat, amount: l.amount, note: '每日結帳：' + l.name });
    }
  });
  // PT 薪資／預支 → 記到人事（這天上次記的會先清掉再重記，所以改了、刪了都會跟著變）
  var slip = lines.filter(function (l) { return l.amount && (l.cat === LINE_PT || l.cat === LINE_ADV); }).map(function (l) {
    var who = slipPerson(l.name, l.cat), adv = l.cat === LINE_ADV;
    return { name: who, item: adv ? '預支' : (l.name && l.name !== who ? l.name : 'PT薪資'), amount: adv ? -Math.abs(l.amount) : l.amount, kind: adv ? '預支' : '薪資' };
  });
  var hadSlip = ((old && old.lines) || []).some(function (l) { return l.cat === LINE_PT || l.cat === LINE_ADV; });
  if (slip.length || hadSlip) enqueue('payroll.slip', { date: date, items: slip });
  var spend = lines.reduce(function (a, l) { return a + l.amount; }, 0);
  var expected = v('d-site') - v('d-allpay') - v('d-line') - spend;
  var diff = closed ? 0 : v('d-cash') - expected;
  enqueue('daily.upsert', { date: date, closed: closed, site: v('d-site'), panda: v('d-panda'), uber: v('d-uber'),
    allpay: v('d-allpay'), line: v('d-line'), spend: spend, cash: v('d-cash'), cashDiff: diff, note: $('d-note').value, lines: lines });
  ST.lines = JSON.parse(JSON.stringify(lines.length ? lines : [{ name: '', amount: '', cat: LINE_OTHER }]));
  renderLines(); renderDailyExist();
  var np = lines.filter(function (l) { return l.pid && l.pid.charAt(0) === 'D'; }).length;
  var ne = lines.filter(function (l) { return l.pid && l.pid.charAt(0) === 'E'; }).length;
  toast((Math.abs(diff) > (ST.snap.config.store.cashWarn || 500) ? '已儲存，但現金差額偏大，請確認' : '已儲存 ✓') +
    (np || ne || slip.length ? '（自動記 ' + [np ? '進貨 ' + np + ' 筆' : '', ne ? '其他支出 ' + ne + ' 筆' : '', slip.length ? '人事 ' + slip.length + ' 筆' : ''].filter(Boolean).join('、') + '）' : ''));
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
      '</td><td class="n">' + (/^D\d{8}/.test(x.id) ? '<span class="muted" style="font-size:13px">在每日結帳改</span>' : '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="delPurchase(\'' + jsq(x.id) + '\')">✕</button>') + '</td></tr>';
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
  // 只列出這個月有填的人（和正在編輯的人）；名單上還沒填的放在「＋ 其他人」後面，點了才加入
  var groups = { '正職': [], '計時': [] };
  var shown = Object.keys(by);
  if (ST.emp && ST.empMonth === month && shown.indexOf(ST.emp) < 0) shown.push(ST.emp);
  var rosterNames = (ST.snap.config.employees || []).map(function (e) { return e.name; });
  // 名單上的照名單順序，其他人照填的順序
  shown.sort(function (a, b) {
    var ia = rosterNames.indexOf(a), ib = rosterNames.indexOf(b);
    return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
  });
  shown.forEach(function (n) { groups[empGroup(n, by[n] && by[n].hourly)].push(n); });
  var notYet = rosterNames.filter(function (n) { return shown.indexOf(n) < 0; });
  var total = Object.keys(by).reduce(function (a, n) { return a + by[n].cost; }, 0);
  function btn(n) {
    return '<button class="' + (n === ST.emp ? 'on' : '') + '" onclick="openEmp(\'' + jsq(n) + '\')"><span>' + esc(n) + pendTag('payroll', month + '|' + n) + '</span><span>' +
      (by[n] ? '<span class="ok">✓</span> 成本 ' + money(by[n].cost) : '<span class="muted">未填</span>') + '</span></button>';
  }
  function sub(list) { return list.reduce(function (a, n) { return a + (by[n] ? by[n].cost : 0); }, 0); }
  var h = '';
  ST.empOrder = groups['正職'].concat(groups['計時']);   // 編輯區 ‹ › 切換用的順序
  [['正職', '正職'], ['計時', '計時（時薪）']].forEach(function (g) {
    var list = groups[g[0]];
    if (!list.length) return;
    h += '<div class="grp"><div class="grp-h"><b>' + g[1] + '</b><span class="muted">' + list.length + ' 人｜小計 ' + money(sub(list)) + '</span></div><div class="emp-grid">' + list.map(btn).join('') + '</div></div>';
  });
  $('s-emps').innerHTML = (h || '<p class="muted">這個月還沒有人填，點下面的名字加入</p>') +
    '<p class="muted">本月人事成本合計：<b>' + money(total) + '</b></p>';
  $('s-roster').innerHTML = notYet.map(function (n) { return '<button onclick="openEmp(\'' + jsq(n) + '\')">＋' + esc(n) + '</button>'; }).join('');
  $('s-roster-h').textContent = rosterNames.length ? (notYet.length ? '名單上這個月還沒填的人，點名字加入' : '') : '員工名單是空的，可以到試算表「設定_員工」新增';
  if (full) $('s-editor').classList.toggle('hide', !ST.emp);
}
// 這個人放哪一組：員工名單的類型 → 自己選過的（正職／計時） → 有時數×時薪就算計時 → 其他
function inRoster(n) { return (ST.snap.config.employees || []).some(function (e) { return e.name === n; }); }
function empGroup(n, hourly) {
  if (ST.emp === n && ST.empGroup) return ST.empGroup;
  var g = savedGroup(n);
  if (g) return g;
  var e = rosterEmp(n);
  if (e) return e.type === '計時' ? '計時' : '正職';
  return guessGroup(n);
}
// 名單外、也沒選過分組的人：這個月有月薪／扣健保／扣勞保就是正職，其他（PT、臨時工）當計時
function guessGroup(n) {
  var month = $('s-month').value;
  var ft = view().payroll.some(function (x) { return x.month === month && x.name === n && FIXED_PAY.some(function (f) { return f[0] === String(x.item || '').trim(); }); });
  return ft ? '正職' : '計時';
}
// 這個人最近一次選的分組（這個月沒有就看以前的月份）
function savedGroup(n) {
  var month = $('s-month').value, best = null;
  view().payroll.forEach(function (x) {
    if (x.name !== n || !x.group) return;
    var score = (x.month === month ? '9' : '0') + x.month;
    if (!best || score > best.s) best = { s: score, g: x.group };
  });
  return best ? best.g : '';
}
// 不在名單上的人：可以改名、選正職／計時
function renderTempBar() {
  var bar = $('s-temp');
  bar.classList.toggle('hide', !ST.emp);
  if (!ST.emp) return;
  var g = ST.empGroup || '', temp = !inRoster(ST.emp);
  var opts = [['正職', '正職'], ['計時', '計時']];
  bar.innerHTML = '<span class="seg">' + opts.map(function (o) {
      return '<button class="' + (g === o[0] ? 'on' : '') + '" onclick="setEmpGroup(\'' + o[0] + '\')">' + o[1] + '</button>';
    }).join('') + '</span>' +
    (temp ? '<button class="ghost rename" onclick="renameEmp()">✎ 改名</button>' : '') +
    '<button class="ghost del-emp" onclick="deleteEmp()">✕ 刪除這位</button>';
}
function setEmpGroup(g) {
  if (g === ST.empGroup) return;
  ST.empGroup = g; ST.itemsDirty = true; applyFixed();
  renderTempBar(); renderPayrollTab(false); empTitle(); renderItems();
}
// 刪除這個人這個月的人事資料（員工名單不會動；名單上的人會回到下面的「＋名字」）
function deleteEmp() {
  var month = $('s-month').value, name = ST.emp;
  if (!confirm('刪除 ' + name + ' ' + month.slice(0, 4) + '/' + Number(month.slice(5, 7)) + '月的人事資料？\n（每日結帳自動記的 PT／預支也會一起刪掉）')) return;
  var had = view().payroll.some(function (x) { return x.month === month && x.name === name; });
  if (had) enqueue('payroll.upsert', { month: month, name: name, items: [] });
  if (ST.renameFrom && ST.renameFrom !== name) enqueue('payroll.upsert', { month: month, name: ST.renameFrom, items: [] });
  toast(name + ' 已刪除');
  ST.emp = ''; ST.renameFrom = ''; ST.empGroup = undefined; ST.itemsDirty = false;
  $('s-editor').classList.add('hide');
  renderPayrollTab(false);
}
function renameEmp() {
  var n = prompt('改成什麼名字？', ST.emp);
  if (!n || !(n = n.trim()) || n === ST.emp) return;
  var month = $('s-month').value;
  if (view().payroll.some(function (x) { return x.month === month && x.name === n; }) && !confirm(n + ' 這個月已經有資料，儲存後會被這邊的內容蓋掉，確定？')) return;
  if (!ST.renameFrom) ST.renameFrom = ST.emp;
  ST.emp = n; ST.itemsDirty = true;
  renderPayrollTab(false); empTitle();
  renderTempBar();
}

// 換月份：同一位員工直接換成新月份的資料（沒選人就只更新名單）
function onPayMonth() {
  if (ST.emp) {
    if (ST.itemsDirty && !confirm(ST.emp + ' 改了還沒儲存，換月份會不見，確定？')) { $('s-month').value = ST.empMonth || $('s-month').value; return; }
    openEmp(ST.emp, true);
  } else renderPayrollTab(true);
}
function addTempEmployee() {
  var n = prompt('輸入名字（例：臨時工小王）');
  if (n && n.trim()) openEmp(n.trim());
}
// 編輯區上方的 ‹ ›：切換到上一位／下一位員工
function stepEmp(d) {
  var list = ST.empOrder || [], i = list.indexOf(ST.emp) + d;
  if (i < 0 || i >= list.length) return toast(d < 0 ? '已經是第一位' : '已經是最後一位');
  if (ST.itemsDirty && !confirm(ST.emp + ' 改了還沒儲存，確定要切換？（改的內容會不見）')) return;
  openEmp(list[i], true);
}
function openEmp(name, stay) {
  ST.emp = name; ST.itemsDirty = false; ST.renameFrom = '';
  var month = $('s-month').value; ST.empMonth = month;
  var rows = view().payroll.filter(function (x) { return x.month === month && x.name === name; });
  var asItem = function (x) { return { item: x.item, amount: x.amount, kind: x.kind, hours: x.hours, rate: x.rate, neg: Number(x.amount) < 0 }; };
  // 只有「每日結帳」自動記進來的（PT 薪資／預支）還不算填過：照樣帶入這個人的預設，再加上日結的項目
  var saved = rows.some(function (x) { return !/（日結 \d+\/\d+）$/.test(String(x.item || '')); });
  if (saved) {
    ST.items = rows.map(asItem);
  } else {
    var e = (ST.snap.config.employees || []).filter(function (x) { return x.name === name; })[0];
    ST.items = (e ? payrollDefaults(e) : (rows.length ? [] : [{ item: '薪資', amount: '', kind: '薪資', auto: true }])).concat(rows.map(asItem));
  }
  ST.empSaved = saved;
  // 分組：這個人選過的（正職／計時） → 員工名單的類型 → 其他
  var emp = rosterEmp(name);
  ST.empGroup = savedGroup(name) || (emp ? (emp.type === '計時' ? '計時' : '正職') : guessGroup(name));
  applyFixed();
  renderPayrollTab(false);
  empTitle();
  $('s-editor').classList.remove('hide');
  renderTempBar();
  renderItems();
  if (!stay) $('s-editor').scrollIntoView({ behavior: 'smooth' });
}
function empTitle() {
  var name = ST.emp, month = ST.empMonth, saved = ST.empSaved;
  var list = ST.empOrder || [], idx = list.indexOf(name);
  $('s-name').innerHTML = '<button class="step" onclick="stepEmp(-1)" aria-label="上一位"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
    '<span class="emp-t">' + esc(name) + '<small>' + month.slice(0, 4) + '/' + Number(month.slice(5, 7)) + '月' + (saved ? '・已儲存過' : '・帶入預設') + (idx >= 0 ? '・' + (idx + 1) + '/' + list.length : '') + '</small></span>' +
    '<button class="step" onclick="stepEmp(1)" aria-label="下一位"' + (idx < 0 || idx >= list.length - 1 ? ' disabled' : '') + '>›</button>';
}
var FIXED_PAY = [['月薪', 1], ['扣健保(自付)', -1], ['扣勞保(自付)', -1]];
var SLIP_RE = /（日結 \d+\/\d+）$/;
function rosterEmp(n) { return (ST.snap.config.employees || []).filter(function (x) { return x.name === n; })[0]; }
// 依分組把固定項目放到最上面：
//   正職：月薪、扣健保(自付)、扣勞保(自付)（舊資料叫「薪資／本薪」的當成月薪）
//   計時：一行「上班時數 × 時薪」，時薪照設定（存過就照存過的）
// 換分組時，之前自動補的空白固定項目拿掉，有填金額的留下變成一般項目
function applyFixed() {
  var g = ST.empGroup, emp = rosterEmp(ST.emp);
  ST.items = ST.items.filter(function (it) {
    var empty = hasRate(it) ? !expr(it.hours) : !itemAmount(it);
    var drop = it.auto && empty && !!g;   // 選了正職／計時，原本空白的預設項目就不用了
    if (!g && it.auto && !it.fixed) return true;
    delete it.fixed; delete it.auto; delete it.rateLock; delete it.hourly;
    return !drop;
  });
  var take = function (test) {
    for (var j = 0; j < ST.items.length; j++) if (test(ST.items[j])) return ST.items.splice(j, 1)[0];
    return null;
  };
  var fixed = [];
  if (g === '正職') {
    FIXED_PAY.forEach(function (f) {
      var it = take(function (x) { return String(x.item || '').trim() === f[0]; });
      if (!it && f[0] === '月薪') it = take(function (x) { return /^(薪資|本薪)$/.test(String(x.item || '').trim()) && !hasRate(x) && x.kind === '薪資'; });
      if (!it) it = { item: f[0], amount: '', kind: '薪資', auto: true };
      it.item = f[0]; it.kind = '薪資'; it.fixed = true; it.neg = f[1] < 0;
      fixed.push(it);
    });
  } else if (g === '計時') {
    var hr = take(function (x) { return hasRate(x) && !SLIP_RE.test(String(x.item || '')); });
    if (!hr) hr = { item: '時薪', hours: '', rate: emp && emp.hourly || '', kind: '薪資', auto: true };
    if (String(hr.rate === undefined || hr.rate === null ? '' : hr.rate) === '') hr.rate = emp && emp.hourly || '';
    hr.fixed = true; hr.hourly = true;   // 時薪先帶設定（或上次存的），可以再改
    fixed.push(hr);
  }
  ST.items = fixed.concat(ST.items);
}
function hasRate(it) { return !!it.hourly || (it.rate !== '' && it.rate !== undefined && it.rate !== null); }

/* 人事常用項目：[名稱, 類別, 1=加項 / -1=扣項]，照設定的清單 */
function payPresets() {
  return presetsFor('人事').map(function (p) { return [p.name, p.cat || '薪資', p.sign === '扣' ? -1 : 1]; });
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
  ST.itemsDirty = true;
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
      ? '<div class="hours"><input value="' + esc(it.hours) + '" placeholder="上班時數" inputmode="text" oninput="setItem(' + i + ',\'hours\',this.value)"> × <input value="' + esc(it.rate) + '" placeholder="時薪" inputmode="decimal"' + '' + ' oninput="setItem(' + i + ',\'rate\',this.value)"></div>'
      : '<input' + (it.neg ? ' class="neg-in"' : '') + ' value="' + esc(it.amount) + '" inputmode="text" placeholder="' + (it.neg ? (it.fixed ? '扣多少' : '扣多少（打正數就好）') : (it.fixed ? '金額' : '金額（扣款打負數）')) + '" oninput="setItem(' + i + ',\'amount\',this.value)">';
    var fx = it.fixed;
    if (fx) return '<div class="item-row fixed' + (hasRate(it) ? ' rate' : '') + '"><span class="fx-name">' + esc(it.item) + '</span>' + amt + '</div>';
    return '<div class="item-row' + (hasRate(it) ? ' rate' : '') + '"><input value="' + esc(it.item) + '" placeholder="項目名稱" oninput="setItem(' + i + ',\'item\',this.value)">' + amt +
      '<select onchange="setItem(' + i + ',\'kind\',this.value)">' + kinds.map(function (k) { return '<option value="' + esc(k) + '"' + (k === it.kind ? ' selected' : '') + '>' + esc(window.matchMedia && window.matchMedia('(max-width: 560px)').matches && k === '公司負擔' ? '公司付' : k) + '</option>'; }).join('') + '</select>' +
      (fx ? '<span class="del-x fixed-x" title="固定項目，不能刪除"></span>' : '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="delItem(' + i + ')">✕</button>') + '</div>';
  }).join('');
  renderPresetChips();
  payCalc();
}
function itemAmount(it) {
  if (hasRate(it)) return Math.round(expr(it.hours) * expr(it.rate));
  var a = expr(it.amount);
  return it.neg && a > 0 ? -a : a;     // 扣款項目打正數也會變成扣
}
function setItem(i, k, val) { ST.items[i][k] = val; ST.itemsDirty = true; payCalc(); }
function delItem(i) { if (ST.items[i] && ST.items[i].fixed) return;
  delItemAt(i); }
function delItemAt(i) { ST.items.splice(i, 1); ST.itemsDirty = true; renderItems(); }
function addItem(hourly) { ST.itemsDirty = true; ST.items.push(hourly ? { item: '時薪', hours: '', rate: '', kind: '薪資', hourly: true } : { item: '', amount: '', kind: '薪資' }); renderItems(); }
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
  // 固定項目沒填金額（0）就不存，免得試算表多一堆 0
  var items = ST.items.filter(function (it) { return String(it.item || '').trim() && !(it.fixed && !itemAmount(it)); }).map(function (it) {
    var r = hasRate(it);
    var o = { item: String(it.item).trim(), kind: it.kind || '薪資', hours: r ? expr(it.hours) : '', rate: r ? expr(it.rate) : '' };
    o.amount = itemAmount(it);
    if (isNaN(o.amount)) bad = true;
    return o;
  });
  if (bad) return toast('有金額格式看不懂');
  var month = $('s-month').value, op = { month: month, name: ST.emp, items: items };
  if (ST.empGroup) op.group = ST.empGroup;
  if (ST.renameFrom && ST.renameFrom !== ST.emp) enqueue('payroll.upsert', { month: month, name: ST.renameFrom, items: [] });   // 改名：舊名字這個月的資料移除
  enqueue('payroll.upsert', op);
  toast(ST.emp + ' 已儲存 ✓');
  ST.emp = ''; ST.renameFrom = ''; ST.empGroup = undefined;
  $('s-editor').classList.add('hide');
  renderPayrollTab(false);
}

/* ---------- 外送對帳 ---------- */
// 對帳單項目：[代號, 名稱, 是否為扣項]
var DV_ROWS = [['gross', '費用明細（訂單金額）', false], ['commission', '佣金', true], ['monthly', '月費', true], ['reject', '拒單費用', true], ['other', '其他調整', false]];
function dvPeriods(platform, month, split) {
  return split ? ['上半月', '下半月'] : ['整月'];
}
function renderDeliveryTab() {
  var month = $('v-month').value, V = view();
  var gross = { Panda: 0, Uber: 0 };
  V.daily.forEach(function (x) { if (x.date.slice(0, 7) === month && !x.closed) { gross.Panda += Number(x.panda || 0); gross.Uber += Number(x.uber || 0); } });
  ST.dv = {};
  $('v-body').innerHTML = ['Panda', 'Uber'].map(function (p) {
    var rec = V.delivery.filter(function (x) { return x.month === month && x.platform === p; })[0];
    var split = rec && rec.periods ? rec.periods.length > 1 : p === 'Panda';
    var labels = dvPeriods(p, month, split);
    ST.dv[p] = { split: split, periods: labels.map(function (l, i) {
      var o = { label: l }, src = rec && rec.periods && rec.periods[i];
      DV_ROWS.forEach(function (r) { o[r[0]] = src && src[r[0]] ? Math.abs(src[r[0]]) * (r[2] ? 1 : Math.sign(src[r[0]])) : ''; });
      return o;
    }), old: rec && !rec.periods ? rec.amount : null };
    return '<div class="dv" id="dv-' + p + '"></div>';
  }).join('');
  ['Panda', 'Uber'].forEach(function (p) { renderDv(p, gross[p]); });
  // 全支付／LINE Pay：填月底實際入帳，手續費＝收款－入帳
  var pay = { '全支付': 0, 'LINE Pay': 0 };
  V.daily.forEach(function (x) { if (x.date.slice(0, 7) === month && !x.closed) { pay['全支付'] += Number(x.allpay || 0); pay['LINE Pay'] += Number(x.line || 0); } });
  ST.op = pay;
  $('v-body').insertAdjacentHTML('beforeend', '<div class="dv"><div class="dv-h"><span>全支付／LINE Pay 月底入帳</span><span class="muted">手續費＝收款－實際入帳</span></div><table><thead><tr><th></th><th>本月收款</th><th>月底實際入帳</th><th>手續費</th></tr></thead><tbody>' +
    ['全支付', 'LINE Pay'].map(function (p, i) {
      var rec = V.delivery.filter(function (x) { return x.month === month && x.platform === p; })[0];
      return '<tr><th>' + p + pendTag('delivery', month + '|' + p) + '</th><td class="n">' + money(pay[p]) + '</td>' +
        '<td><input id="op-' + i + '" inputmode="text" value="' + (rec ? esc(rec.amount) : '') + '" placeholder="沒填＝先估計" oninput="opCalc()"></td><td class="n" id="op-fee-' + i + '"></td></tr>';
    }).join('') + '</tbody></table></div>');
  opCalc();
}
function opCalc() {
  ['全支付', 'LINE Pay'].forEach(function (p, i) {
    var raw = $('op-' + i).value.trim(), g = ST.op[p], el = $('op-fee-' + i);
    if (raw === '') { el.innerHTML = g ? '<span class="muted">估計 ' + money(g * (ST.snap.config.store.fee || 0) / 100) + '</span>' : '—'; return; }
    var net = expr(raw); if (isNaN(net)) { el.innerHTML = '<span class="bad">看不懂</span>'; return; }
    var fee = g - net;
    el.innerHTML = '<span class="' + (fee < 0 ? 'warn' : '') + '">' + money(fee) + '</span>' + (g ? '<br><small class="muted">' + pct(fee / g) + '</small>' : '');
  });
}
function dvNet(o) {
  return DV_ROWS.reduce(function (a, r) { var v = expr(o[r[0]]); if (isNaN(v)) return a; return a + (r[2] ? -Math.abs(v) : v); }, 0);
}
function renderDv(p, gross) {
  var st = ST.dv[p];
  if (gross === undefined) gross = st.gross; else st.gross = gross;
  // 左上角那格：分上半月／下半月兩期（勾選框）
  var head = '<tr><th class="split-th"><label class="split"><input type="checkbox" ' + (st.split ? 'checked' : '') + ' onchange="dvSplit(\'' + p + '\',this.checked)"> 分上半月／下半月兩期</label></th>' + st.periods.map(function (o) { return '<th>' + esc(o.label) + '</th>'; }).join('') + '</tr>';
  var rows = DV_ROWS.map(function (r) {
    return '<tr><th>' + r[1] + '</th>' + st.periods.map(function (o, i) {
      return '<td><input' + (r[2] ? ' class="neg-in"' : '') + ' inputmode="text" value="' + esc(o[r[0]]) + '" placeholder="' + (r[2] ? '扣' : '0') + '" oninput="dvSet(\'' + p + '\',' + i + ',\'' + r[0] + '\',this.value)"></td>';
    }).join('') + '</tr>';
  }).join('');
  var total = st.periods.reduce(function (a, o) { return a + dvNet(o); }, 0);
  var sub = '<tr class="sub"><th>' + p + ' 營收</th>' + st.periods.map(function (o, i) { return '<td class="n" id="dv-' + p + '-n' + i + '">' + money(dvNet(o)) + '</td>'; }).join('') + '</tr>';
  var tot = '<tr class="tot"><th>總收（實際入帳）</th><td class="n' + sgn(total) + '" colspan="' + st.periods.length + '" id="dv-' + p + '-tot">' + money(total) + '</td></tr>';
  $('dv-' + p).innerHTML = '<div class="dv-h"><span>' + p + ' 實際營收' + pendTag('delivery', $('v-month').value + '|' + p) + '</span><span class="muted" id="dv-' + p + '-ratio">' + dvRatio(total, gross) + '</span></div>' +
    '<table><thead>' + head + '</thead><tbody>' + rows + sub + tot + '</tbody></table>' +
    (st.old !== null ? '<p class="muted" style="padding:0 14px 10px">舊資料：實際入帳 ' + money(st.old) + '（沒有明細）。填了明細儲存後會取代。</p>' : '');
}
function dvRatio(total, gross) { return '每日結帳營業額 ' + money(gross) + (gross && total ? '｜入帳 ' + pct(total / gross) : (gross ? '｜<span class="warn">尚未對帳</span>' : '')); }
function dvSet(p, i, k, v) {
  var st = ST.dv[p]; st.periods[i][k] = v; st.dirty = true;
  var total = st.periods.reduce(function (a, o) { return a + dvNet(o); }, 0);
  $('dv-' + p + '-n' + i).textContent = money(dvNet(st.periods[i]));
  var t = $('dv-' + p + '-tot'); t.textContent = money(total); t.className = 'n' + sgn(total);
  $('dv-' + p + '-ratio').innerHTML = dvRatio(total, st.gross);
}
function dvSplit(p, on) {
  var st = ST.dv[p], labels = dvPeriods(p, $('v-month').value, on);
  var merged = {}; DV_ROWS.forEach(function (r) { merged[r[0]] = st.periods.reduce(function (a, o) { var v = expr(o[r[0]]); return a + (isNaN(v) ? 0 : v); }, 0) || ''; });
  st.split = on; st.dirty = true;
  st.periods = on ? labels.map(function (l, i) { var o = { label: l }; DV_ROWS.forEach(function (r) { o[r[0]] = i === 0 ? merged[r[0]] : ''; }); return o; })
    : [Object.assign({ label: labels[0] }, merged)];
  renderDv(p);
}
function saveDelivery() {
  var month = $('v-month').value, changed = 0, bad = false;
  ['Panda', 'Uber'].forEach(function (p) {
    var st = ST.dv[p];
    var filled = st.periods.some(function (o) { return DV_ROWS.some(function (r) { return String(o[r[0]]).trim() !== ''; }); });
    st.periods.forEach(function (o) { DV_ROWS.forEach(function (r) { if (String(o[r[0]]).trim() !== '' && isNaN(expr(o[r[0]]))) bad = true; }); });
    if (bad || (!filled && !st.dirty)) return;
    var periods = st.periods.map(function (o) {
      var q = { label: o.label };
      DV_ROWS.forEach(function (r) { var v = expr(o[r[0]]); if (v) q[r[0]] = r[2] ? -Math.abs(v) : v; });
      return q;
    });
    var amount = filled ? periods.reduce(function (a, o) { return a + dvNet(o); }, 0) : '';
    enqueue('delivery.upsert', { month: month, platform: p, amount: amount, periods: filled ? periods : null });
    changed++;
  });
  ['全支付', 'LINE Pay'].forEach(function (p, i) {
    var raw = $('op-' + i).value.trim(), amt = raw === '' ? '' : expr(raw);
    if (amt !== '' && isNaN(amt)) { bad = true; return; }
    var cur = view().delivery.filter(function (x) { return x.month === month && x.platform === p; })[0];
    if ((cur ? cur.amount : '') === amt) return;
    enqueue('delivery.upsert', { month: month, platform: p, amount: amt });
    changed++;
  });
  if (bad) return toast('有金額格式看不懂');
  toast(changed ? '對帳已儲存 ✓' : '沒有變更');
  renderDeliveryTab();
}

/* ---------- 固定/其他支出 ---------- */
/* 固定／其他支出的常用項目：照設定的清單，附上次金額 */
function expensePresets() {
  var last = {};
  view().expense.slice().sort(function (a, b) { return a.month < b.month ? -1 : 1; }).forEach(function (x) {
    var n = String(x.item || '').trim(); if (n) last[n] = { amount: x.amount, month: x.month };
  });
  return presetsFor('固定支出').map(function (p) {
    var l = last[p.name];
    return { name: p.name, type: p.cat === '其他' ? '其他' : '固定', last: l ? l.amount : null, lastMonth: l ? l.month : '' };
  });
}
function pickExpense(i) {
  var p = ST.expPresets[i];
  $('e-item').value = p.name; $('e-type').value = p.type === '其他' ? '其他' : '固定';
  expenseHint();
  $('e-amount').focus();
}
function expenseHint() {
  var n = $('e-item').value.trim();
  var p = (ST.expPresets || []).filter(function (x) { return x.name === n; })[0];
  $('e-amount').placeholder = p && p.last ? '上次 ' + money(p.last) + '（' + p.lastMonth + '）' : '';
  if (p && document.activeElement === $('e-item')) $('e-type').value = p.type === '其他' ? '其他' : '固定';
}
function renderExpenseTab() {
  var month0 = $('e-month').value;
  ST.expPresets = expensePresets();
  var haveFixed = {};
  view().expense.forEach(function (x) { if (x.month === month0 && x.type === '固定') haveFixed[x.item] = true; });
  $('e-presets').innerHTML = ST.expPresets.map(function (p, i) {
    if (p.type === '固定' && haveFixed[p.name]) return '';      // 這個月已經記過的固定支出就不顯示
    return '<button onclick="pickExpense(' + i + ')">' + esc(p.name) + (p.last ? '<small>' + money(p.last) + '</small>' : '') + '</button>';
  }).join('') || '<span class="muted">這個月的固定支出都記好了</span>';
  $('e-names').innerHTML = ST.expPresets.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('');
  var month = $('e-month').value;
  var list = view().expense.filter(function (x) { return x.month === month; });
  var total = list.reduce(function (a, x) { return a + Number(x.amount || 0); }, 0);
  $('e-list').innerHTML = list.map(function (x) {
    return '<tr><td class="nowrap">' + esc(x.type) + '</td><td>' + esc(x.item) + pendTag('expense', x.id) + ' <span class="muted">' + esc(x.note) + '</span></td><td class="n">' + money(x.amount) +
      '</td><td class="n">' + (/^E\d{8}/.test(x.id) ? '<span class="muted" style="font-size:13px">在每日結帳改</span>' : '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="delExpense(\'' + jsq(x.id) + '\')">✕</button>') + '</td></tr>';
  }).join('') + (list.length ? '<tr><td></td><td><b>合計</b></td><td class="n"><b>' + money(total) + '</b></td><td></td></tr>' : '<tr><td class="muted">還沒有支出</td></tr>');
}
function addExpense() {
  var amt = v('e-amount');
  if (!$('e-item').value.trim() || isNaN(amt) || !amt) return toast('請填項目和金額');
  enqueue('expense.add', { id: uid(), month: $('e-month').value, type: $('e-type').value, item: $('e-item').value.trim(), amount: amt, note: $('e-note').value });
  $('e-item').value = ''; $('e-amount').value = ''; $('e-amount').placeholder = ''; $('e-note').value = ''; $('e-amount-hint').textContent = '';
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
// 分紅扣除：每年看一次；上方選年份，新增時各自選月份
function deductYears() {
  var ys = {}; ys[todayStr().slice(0, 4)] = true;
  var V = view();
  ['deduct', 'daily', 'expense'].forEach(function (k) { (V[k] || []).forEach(function (x) { var mo = x.month || (x.date || '').slice(0, 7); if (mo) ys[mo.slice(0, 4)] = true; }); });
  return Object.keys(ys).sort();
}
function onDeductYear() {
  var y = $('x-year').value, m = todayStr().slice(0, 4) === y ? todayStr().slice(0, 7) : y + '-12';
  ['x-month', 'xp-month'].forEach(function (id) { if (($(id).value || '').slice(0, 4) !== y) $(id).value = m; });
  renderDeductTab();
}
function payoutNames() {
  var names = ((ST.snap.config.partners || []).map(function (p) { return p.name; }));
  view().deduct.forEach(function (d) {
    var n = d.type === '股東分紅（已發）' ? String(d.note || '').replace(/（.*?）/g, '').trim() : (d.type === '其他扣除' && /分紅/.test(d.note || '') ? String(d.note).replace(/（.*?）/g, '').replace(/分紅.*$/, '').trim() : '');
    if (n && names.indexOf(n) < 0) names.push(n);
  });
  return names;
}
function renderDeductTab() {
  xTab(ST.xTab || 'pay');
  // 上面一個月份（‹ › 切換）：記錄分紅、分配前扣除都用這個月份；下面列表看這一年
  if (!$('xs-month').value) $('xs-month').value = todayStr().slice(0, 7);
  var month = $('xs-month').value, y = month.slice(0, 4);
  $('xp-month').value = month; $('x-month').value = month;
  $('x-year').innerHTML = '<option selected>' + y + '</option>';
  var names = payoutNames();
  // 每個人一張卡（可以一次勾很多人）：比例／上次、這次應分；這個月已發的顯示綠色 ✓
  var L = computeLocal();
  var key = ST.sess.store + '|' + month;
  if (!ST.xp || ST.xp.key !== key) ST.xp = { key: key, sel: null, amt: {}, extra: [], from: '', keep: LS.get('fw_keep_' + ST.sess.store, '') };
  ST.xp.extra.forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
  // 這次分哪幾個月的盈餘：預設從上次發股東分紅的下個月，到上面選的月份；可以改
  if (!ST.xp.from) {
    var lastPay = L.V.deduct.filter(function (d) { return d.type === '股東分紅（已發）' && d.month < month; }).map(function (d) { return d.month; }).sort().pop();
    var firstM = (L.R.months[0] || {}).month || month;
    ST.xp.from = lastPay ? nextMonth(lastPay) : firstM;
    if (ST.xp.from > month) ST.xp.from = month;
  }
  var pool = L.R.months.filter(function (m) { return m.month >= ST.xp.from && m.month <= month && m.status !== '未來'; });
  ST.xp.pool = pool.reduce(function (a, m) { return a + m.dist; }, 0);
  ST.xp.profit = pool.reduce(function (a, m) { return a + m.profit; }, 0);
  var keep = expr(ST.xp.keep) || 0;
  ST.xp.year = yearSurplus(L, ST.xp.from);
  var befM = prevMonth(ST.xp.from);
  ST.xp.tenth = ST.xp.year > 0 ? Math.round(ST.xp.year / 10) : 0;
  $('xp-range').innerHTML = '<div class="xp-range-row"><label>分這幾個月的盈餘</label><div class="xp-mrange"><input type="month" value="' + esc(ST.xp.from) + '" max="' + month + '" onchange="xpFrom(this.value)"><span>到</span><b>' + month.replace('-', '/') + '</b></div></div>' +
    '<div class="xp-range-row"><label>店裡留作備用基金</label><div class="xp-amt"><span>$</span><input inputmode="numeric" value="' + esc(ST.xp.keep) + '" placeholder="0" oninput="digitsOnly(this);xpKeep(this.value)" onchange="renderDeductTab()"></div></div>' +
    '<p class="xp-pool">月盈餘 ' + money(ST.xp.profit) + '　扣員工分紅、存年終後可分配 ' + money(ST.xp.pool) + '　－ 備用基金 ' + money(keep) + '　＋ 到 ' + befM.replace('-', '/') + ' 累積的當年盈餘 ' + money(ST.xp.year) + ' 的 1/10 ' + money(ST.xp.tenth) + '　＝ <b>這次可以分 ' + money(ST.xp.pool - keep + ST.xp.tenth) + '</b></p>';
  var calc = {}; names.forEach(function (n) { calc[n] = xpCalc(n, month, L); });
  var partners = (L.C.partners || []).map(function (p) { return p.name; });
  if (!ST.xp.sel) {   // 預設勾：股東＋上次跟股東一起發的人（例：店長分紅）
    ST.xp.sel = {};
    var lastBatch = names.filter(function (n) { return partners.indexOf(n) >= 0; }).map(function (n) { return calc[n].last; }).sort().pop() || '';
    names.forEach(function (n) {
      var c = calc[n]; if (c.done || c.amt === null || c.amt <= 0) return;
      if (partners.indexOf(n) >= 0 || (lastBatch && c.last === lastBatch)) ST.xp.sel[n] = true;
    });
  }
  var doneList = [], selN = 0, selSum = 0, cards = '';
  // 上排：名字小按鈕（點了選／取消，選了變橘；這個月已發的變綠 ✓）
  // 下面：選了的人用卡片（名字、比例／上次、金額可以改）
  $('xp-chips').innerHTML = names.map(function (n) {
    var c = calc[n], on = !!ST.xp.sel[n];
    if (c.done) { doneList.push(n + ' ' + money(c.done)); return '<button type="button" class="who done" onclick="toast(\'' + jsq(n) + ' 這個月已經記過了；要改請到下面列表刪掉再記\')">✓ ' + esc(n) + '</button>'; }
    if (on) {
      var a = ST.xp.amt[n] !== undefined ? ST.xp.amt[n] : (c.amt !== null ? String(Math.max(c.amt, 0)) : '');
      selN++; selSum += expr(a) || 0;
      cards += '<div class="wc on" data-name="' + esc(n) + '"><b>' + esc(n) + '</b><small>' + esc(c.tag) + '</small>' +
        '<input class="card-amt" inputmode="numeric" value="' + esc(a) + '" placeholder="金額" oninput="digitsOnly(this);ST.xp.amt[\'' + jsq(n) + '\']=this.value;xpSum()"></div>';
    }
    return '<button type="button" class="who' + (on ? ' on' : '') + '" onclick="xpToggle(\'' + jsq(n) + '\')">' + esc(n) + '</button>';
  }).join('') + '<button type="button" class="who add" onclick="xpOther()">＋ 其他</button>';
  $('xp-rows').innerHTML = cards;
  $('xp-done').textContent = doneList.length ? '✓ ' + Number(month.slice(5)) + ' 月已發：' + doneList.join('、') : '';
  $('xp-btn').disabled = !selN;
  $('xp-btn').textContent = selN ? '記錄 ' + selN + ' 筆分紅｜合計 ' + money(selSum) : '點上面的名字選要發的人';
  // 分配前扣除：類型用卡片點選
  var types = Array.prototype.map.call($('x-type').options, function (o) { return o.value; });
  $('x-type-seg').innerHTML = types.map(function (t) { return '<button type="button" class="' + ($('x-type').value === t ? 'on' : '') + '" onclick="$(\'x-type\').value=\'' + jsq(t) + '\';renderDeductTab()">' + esc(t) + '</button>'; }).join('');
  var list = view().deduct.filter(function (x) { return String(x.month || '').slice(0, 4) === y && x.type !== '員工借款' && x.type !== '員工還款'; }).sort(function (a, b) { return a.month < b.month ? -1 : a.month > b.month ? 1 : 0; });
  $('x-list-h').textContent = y + ' 年的分紅和扣除';
  var h = '', last = '', tot = 0;
  list.forEach(function (x) {
    if (x.month !== last) { last = x.month; h += '<tr class="mh"><th colspan="4">' + Number(x.month.slice(5, 7)) + ' 月</th></tr>'; }
    tot += Number(x.amount || 0);
    var t = x.type === '股東分紅（已發）' ? '股東分紅' : x.type === '員工借款' ? '借出' : x.type === '員工還款' ? '還款' : x.type;
    h += '<tr><td class="nowrap">' + esc(t) + pendTag('deduct', x.id) + '</td><td class="muted">' + esc(x.note) + '</td><td class="n">' + money(x.amount) +
      '</td><td class="n"><button class="danger del-x" aria-label="刪除" title="刪除" onclick="delDeduct(\'' + jsq(x.id) + '\')">✕</button></td></tr>';
  });
  $('x-list').innerHTML = h ? h + '<tr class="yt"><th>全年合計</th><td></td><td class="n">' + money(tot) + '</td><td></td></tr>' : '<tr><td class="muted">這一年還沒有分紅或扣除</td></tr>';
}
// 記錄實際發出的股東分紅：設定裡的股東（浩勤、豐吉…）記「股東分紅（已發）」；其他人（佳茹、Nina…）記「其他扣除・某某分紅」
function nextMonth(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { y++; mo = 1; } return y + '-' + (mo < 10 ? '0' : '') + mo; }
function xpFrom(v) { if (!v) return; ST.xp.from = v; ST.xp.amt = {}; renderDeductTab(); }
function xpKeep(v) { ST.xp.keep = v; ST.xp.amt = {}; LS.set('fw_keep_' + ST.sess.store, v); clearTimeout(ST.xpKeepT); ST.xpKeepT = setTimeout(function () { var a = document.activeElement; renderDeductTab(); var i = $('xp-range').querySelector('.xp-amt input'); if (i && a && a.closest && a.closest('#xp-range')) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 400); }
// 記錄分紅／分配前扣除：同一張卡片用上面的分頁切換
function xTab(t) {
  ST.xTab = t;
  Array.prototype.forEach.call($('x-tabs').children, function (b) { b.classList.toggle('on', b.dataset.v === t); });
  $('xpane-pay').classList.toggle('hide', t !== 'pay'); $('xpane-ded').classList.toggle('hide', t !== 'ded');
}
function xpToggle(n) { ST.xp.sel[n] = !ST.xp.sel[n]; renderDeductTab(); }
function xpOther() { var n = prompt('要記誰的分紅？（例：建燁、佳茹）'); if (!n || !(n = n.trim())) return; if (ST.xp.extra.indexOf(n) < 0) ST.xp.extra.push(n); ST.xp.sel[n] = true; renderDeductTab(); }
function xpSum() {
  var n = 0, t = 0; Object.keys(ST.xp.sel).forEach(function (k) { if (ST.xp.sel[k]) { n++; } });
  $('xp-rows').querySelectorAll('.card-amt').forEach(function (i) { t += expr(i.value) || 0; });
  $('xp-btn').textContent = n ? '記錄 ' + n + ' 筆分紅｜合計 ' + money(t) : '點上面的名字選要發的人';
}
// 選股東 → 照比例自動算金額：上次發分紅之後（到選的月份）每個月「應分」加起來
// 不是股東的人（佳茹、Nina…固定分紅）→ 帶上次發的金額
// 店裡累積的盈餘（和「年」總覽的當年盈餘同一個算法，含上一年留下的）：到 before 之前每個月 可分配−已發分紅−借出＋還款 累加
// 只算這次要分的月份「之前」的，避免同一個月的盈餘被算兩次
function prevMonth(m) { var y = +m.slice(0, 4), n = +m.slice(5, 7) - 1; if (!n) { y--; n = 12; } return y + '-' + (n < 10 ? '0' : '') + n; }
function yearSurplus(L, before) {
  return L.R.months.filter(function (m) { return m.month < before && m.status !== '未來'; })
    .reduce(function (a, m) { return a + m.dist - (m.paid || 0) - (m.loan || 0) + (m.repay || 0); }, 0);
}
function xpCalc(who, month, L) {
  var out = { amt: null, tag: '', info: '' };
  if (!who || !month) return out;
  var p = (L.C.partners || []).filter(function (x) { return x.name === who; })[0];
  var nm = function (d) { return String(d.note || '').replace(/（.*?）|\(.*?\)/g, '').replace(/分紅.*$/, '').trim(); };
  var paid = L.V.deduct.filter(function (d) { return (d.type === '股東分紅（已發）' || (d.type === '其他扣除' && /分紅/.test(d.note || ''))) && nm(d) === who && d.month <= month; })
    .sort(function (a, b) { return a.month < b.month ? 1 : -1; });
  var already = paid.filter(function (d) { return d.month === month; }).reduce(function (a, d) { return a + Number(d.amount || 0); }, 0);
  var warn = already ? '｜⚠ 這個月已經記過 ' + money(already) : '';
  out.done = already; out.last = (paid.filter(function (d) { return d.month < month; })[0] || {}).month || '';
  if (!p) {
    if (paid.length) { out.amt = Math.round(paid[0].amount); out.tag = '上次 ' + paid[0].month.slice(5).replace(/^0/, '') + ' 月'; out.info = '固定分紅，帶上次（' + paid[0].month.replace('-', '/') + '）發的金額，可以改' + warn; }
    else { out.tag = '自己填金額'; out.info = '請填金額' + warn; }
    return out;
  }
  // 股東：（選的月份範圍可分配 − 店裡備用基金）× 比例
  var from = ST.xp && ST.xp.from || month, keep = ST.xp ? (expr(ST.xp.keep) || 0) : 0;
  var poolAmt = L.R.months.filter(function (m) { return m.month >= from && m.month <= month && m.status !== '未來'; }).reduce(function (a, m) { return a + m.dist; }, 0);
  var tenth = ST.xp && ST.xp.tenth || 0;   // 補當年盈餘的 1/10
  var amt = (poolAmt - keep + tenth) * Number(p.pct || 0) / 100;
  out.amt = Math.round(amt);
  var range = from === month ? month.replace('-', '/') : from.replace('-', '/') + '～' + month.replace('-', '/');
  out.tag = p.pct + '%' + (already ? '｜已記過' : '');
  out.info = p.pct + '%｜' + range + (keep ? '（留備用 ' + money(keep) + '）' : '') + (tenth ? '＋當年盈餘 1/10 ' + money(tenth) : '') + ' 應分 ' + money(amt) + (amt < 0 ? '｜虧損，金額先填 0' : '') + warn;
  return out;
}
// 一次記錄勾選的人：股東記「股東分紅（已發）」，其他人（佳茹、店長…）記「其他扣除・某某分紅」
function addPayouts() {
  var month = $('xs-month').value, partners = (ST.snap.config.partners || []).map(function (p) { return p.name; });
  var rows = [], bad = '';
  $('xp-rows').querySelectorAll('.wc').forEach(function (row) {
    var n = row.dataset.name, a = expr(row.querySelector('.card-amt').value);
    if (isNaN(a) || !a) bad = n; else rows.push([n, a]);
  });
  if (bad) return toast(bad + ' 的金額沒填或看不懂');
  if (!rows.length) return toast('請勾選要發的人');
  if (!confirm(Number(month.slice(5)) + ' 月分紅：\n' + rows.map(function (r) { return r[0] + '　' + money(r[1]); }).join('\n') + '\n\n合計 ' + money(rows.reduce(function (a, r) { return a + r[1]; }, 0)) + '，確定記錄？')) return;
  rows.forEach(function (r) {
    var isPartner = partners.indexOf(r[0]) >= 0;
    enqueue('deduct.add', { id: uid(), month: month, type: isPartner ? '股東分紅（已發）' : '其他扣除', amount: r[1], note: isPartner ? r[0] : r[0] + '分紅' });
  });
  ST.xp = null;
  renderDeductTab();
  toast('已記錄 ' + rows.length + ' 筆分紅 ✓');
}
// ---- 員工借還款：記在「分配前扣除」表，類型「員工借款／員工還款」，備註＝借款人（摘要） ----
function loanWho(note) { return String(note || '').replace(/（.*?）|\(.*?\)/g, '').trim() || '（沒寫名字）'; }
function setLoanKind(k) {
  ST.loanKind = k;
  Array.prototype.forEach.call($('xl-kind').children, function (b) { b.classList.toggle('on', b.dataset.v === k); });
  $('xl-btn').textContent = k === '還' ? '記錄還款' : '記錄借出';
}
// 每個人：借了多少、還了多少、還欠多少（全部年份，到今天）
function loanSummary() {
  var by = {};
  view().deduct.forEach(function (d) {
    if (d.type !== '員工借款' && d.type !== '員工還款') return;
    var w = loanWho(d.note), o = by[w] || (by[w] = { name: w, lent: 0, back: 0, last: '' });
    if (d.type === '員工借款') o.lent += Number(d.amount || 0); else o.back += Number(d.amount || 0);
    if (d.month > o.last) o.last = d.month;
  });
  return Object.keys(by).map(function (k) { var o = by[k]; o.owe = o.lent - o.back; return o; })
    .sort(function (a, b) { return (b.owe > 0) - (a.owe > 0) || (b.last > a.last ? 1 : -1); });
}
function renderLoans() {
  if (!ST.loanKind) setLoanKind('借');
  var list = loanSummary();
  var names = list.map(function (o) { return o.name; });
  (ST.snap.config.employees || []).forEach(function (e) { if (names.indexOf(e.name) < 0) names.push(e.name); });
  $('xl-names').innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  // 還款時：先列還有欠錢的人
  var chips = ST.loanKind === '還' ? list.filter(function (o) { return o.owe > 0; }).map(function (o) { return o.name; }) : names;
  $('xl-chips').innerHTML = chips.map(function (n) {
    var o = list.filter(function (x) { return x.name === n; })[0];
    return '<button type="button" class="who' + ($('xl-who').value === n ? ' on' : '') + '" onclick="$(\'xl-who\').value=\'' + jsq(n) + '\';renderLoans()">' + esc(n) + (o && o.owe > 0 ? '<small> 欠' + money(o.owe) + '</small>' : '') + '</button>';
  }).join('');
  var owe = list.reduce(function (a, o) { return a + Math.max(o.owe, 0); }, 0);
  $('xl-sum').innerHTML = list.length ? '<table class="xlist"><tbody><tr class="mh"><th>借款人</th><th class="n">借出</th><th class="n">已還</th><th class="n">還欠</th></tr>' +
    list.map(function (o) {
      return '<tr' + (o.owe > 0 ? '' : ' class="muted"') + '><td>' + esc(o.name) + '</td><td class="n">' + money(o.lent) + '</td><td class="n">' + money(o.back) + '</td><td class="n' + (o.owe > 0 ? ' neg' : '') + '">' + (o.owe ? money(o.owe) : '已還清') + '</td></tr>';
    }).join('') + '<tr class="yt"><th>還沒收回</th><td></td><td></td><td class="n neg">' + money(owe) + '</td></tr></tbody></table>' +
    ''
    : '<p class="muted">還沒有借還款紀錄</p>';
}
// 借還款分頁：記錄、欠款總表、每一筆紀錄（新的在上面）
// 每年：借出、還款、年底還沒收回（累計借出 − 累計還款），不分人
function renderLoanYears() {
  var recs = view().deduct.filter(function (d) { return d.type === '員工借款' || d.type === '員工還款'; });
  if (!recs.length) { $('xl-years').innerHTML = '<p class="muted">還沒有借還款紀錄</p>'; return; }
  var years = [];
  recs.forEach(function (d) { var y = String(d.month).slice(0, 4); if (years.indexOf(y) < 0) years.push(y); });
  years.sort();
  var yr = function (y, type) { return recs.reduce(function (a, d) { return a + (d.type === type && String(d.month).slice(0, 4) === y ? Number(d.amount || 0) : 0); }, 0); };
  var owe = function (y) { return recs.reduce(function (a, d) { return String(d.month).slice(0, 4) > y ? a : a + (d.type === '員工借款' ? 1 : -1) * Number(d.amount || 0); }, 0); };
  var cell = function (v, cls) { return '<td class="n' + (cls ? ' ' + cls : '') + '">' + (v ? money(v) : '<span class="muted">—</span>') + '</td>'; };
  $('xl-years').innerHTML = '<div class="xscroll"><table class="ytable eq" style="min-width:' + (110 + years.length * 100) + 'px"><thead><tr><th></th>' +
    years.map(function (y) { return '<th class="n">' + y + (y === todayStr().slice(0, 4) ? '<span class="tag">至今</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
    '<tr><th>借出</th>' + years.map(function (y) { return cell(yr(y, '員工借款')); }).join('') + '</tr>' +
    '<tr><th>還款</th>' + years.map(function (y) { return cell(yr(y, '員工還款')); }).join('') + '</tr>' +
    '<tr class="yrow"><th>年底還沒收回</th>' + years.map(function (y) { return cell(owe(y), owe(y) > 0 ? 'neg' : ''); }).join('') + '</tr></tbody></table></div>';
}
function renderLoanTab() {
  if (!$('xl-month').value) $('xl-month').value = todayStr().slice(0, 7);
  renderLoans();
  renderLoanYears();
  var list = view().deduct.filter(function (d) { return d.type === '員工借款' || d.type === '員工還款'; })
    .sort(function (a, b) { return a.month < b.month ? 1 : a.month > b.month ? -1 : 0; });
  var h = '', last = '';
  list.forEach(function (x) {
    if (x.month !== last) { last = x.month; h += '<tr class="mh"><th colspan="4">' + x.month.slice(0, 4) + '/' + Number(x.month.slice(5, 7)) + ' 月</th></tr>'; }
    var out = x.type === '員工借款';
    h += '<tr><td class="nowrap">' + (out ? '借出' : '還款') + pendTag('deduct', x.id) + '</td><td>' + esc(x.note) + '</td><td class="n' + (out ? ' neg' : ' pos') + '">' + (out ? '-' : '+') + money(x.amount) +
      '</td><td class="n"><button class="danger del-x" aria-label="刪除" title="刪除" onclick="delLoan(\'' + jsq(x.id) + '\')">✕</button></td></tr>';
  });
  $('xl-list').innerHTML = h || '<tr><td class="muted">還沒有借還款紀錄</td></tr>';
}
function delLoan(id) { if (confirm('確定刪除這筆借還款？')) { enqueue('deduct.del', { id: id }); renderLoanTab(); } }
function addLoan() {
  var who = $('xl-who').value.trim(), amt = v('xl-amount'), month = $('xl-month').value, memo = $('xl-note').value.trim();
  if (!who) return toast('請選借款人');
  if (isNaN(amt) || !amt) return toast('請填金額');
  if (!month) return toast('請選月份');
  var back = ST.loanKind === '還';
  enqueue('deduct.add', { id: uid(), month: month, type: back ? '員工還款' : '員工借款', amount: amt, note: who + (memo ? '（' + memo + '）' : '') });
  $('xl-amount').value = ''; $('xl-note').value = '';
  renderLoanTab();
  toast((back ? '已記錄 ' + who + ' 還款 ' : '已記錄借給 ' + who + ' ') + money(amt) + ' ✓');
}
function addDeduct() {
  var amt = v('x-amount');
  if (isNaN(amt) || !amt) return toast('請填金額');
  if (!$('x-month').value) return toast('請選月份');
  enqueue('deduct.add', { id: uid(), month: $('x-month').value, type: $('x-type').value, amount: amt, note: $('x-note').value });
  $('x-amount').value = ''; $('x-note').value = '';
  renderDeductTab();
  toast('已新增 ✓');
}
function delDeduct(id) { if (confirm('確定刪除？')) { enqueue('deduct.del', { id: id }); renderDeductTab(); } }

/* ---------- 月結總覽（在裝置上計算，離線也能看） ---------- */
function kpi(label, v, sub, main) {
  return '<div class="kpi' + (main ? ' main' : '') + '"><div class="k">' + label + '</div><div class="v' + (typeof v === 'number' ? sgn(v) : '') + '">' +
    (typeof v === 'number' ? money(v) : v) + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
}
function computeLocal() {
  var store = ST.sess.store, V = view(), C = ST.snap.config;
  var emps = {}; emps[store] = (C.employees || []).map(function (e) { return e.name; });
  return { V: V, C: C, R: computeAll_({ stores: [C.store], partners: C.partners || [], employees: emps,
    daily: V.daily, purchase: V.purchase, expense: V.expense, payroll: V.payroll, delivery: V.delivery, deduct: V.deduct }, todayStr()) };
}

/* ---------- 年度總覽：像舊表「總計」頁 ---------- */
/* ---------- 總覽：日／月／年 ---------- */
ST.ov = LS.get('fw_ov', 'month');
ST.ymode = LS.get('fw_ymode', 'day');
function setYMode(v) { ST.ymode = v; LS.set('fw_ymode', v); renderOverview(); }
function setOverview(v) { ST.ov = v; LS.set('fw_ov', v); document.body.classList.toggle('page-wide', v !== 'month'); renderOverview(); }
function renderOverview() {
  Array.prototype.forEach.call(document.querySelectorAll('#ov-seg button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === ST.ov); });
  $('ov-month-pick').classList.toggle('hide', ST.ov === 'year' || ST.ov === 'all');
  $('ov-year-pick').classList.toggle('hide', ST.ov !== 'year');
  ['dd-body', 'm-body', 'y-body'].forEach(function (id) { $(id).classList.toggle('hide', id !== { day: 'dd-body', month: 'm-body', year: 'y-body', all: 'y-body' }[ST.ov]); });
  if (ST.ov === 'day') renderDayView(); else if (ST.ov === 'month') renderSummaryTab(); else if (ST.ov === 'all') renderAllYears(); else renderYearTab();
}
var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
// 表格標題列的高度：讓「總計」列固定在標題下面
function fixTheads(root) {
  Array.prototype.forEach.call(root.querySelectorAll('.xscroll'), function (sc) {
    var t = sc.querySelector('table.ytable'); if (!t || !t.tHead) return;
    // 每個表格包一層：黏在上面的表頭只在自己的表格範圍內黏住，捲過這個表格就跟著離開（不會蓋到下一段）
    if (!sc.parentNode.classList.contains('tblwrap')) { var w = document.createElement('div'); w.className = 'tblwrap'; sc.parentNode.insertBefore(w, sc); w.appendChild(sc); }
    if (!sc.offsetWidth) return;   // 還沒顯示出來（量不到寬度），等顯示時再排
    var old = sc.previousElementSibling; if (old && old.classList.contains('xhead')) old.remove();
    sc.style.marginTop = '';
    // 先拿掉上次固定的欄寬，讓表格照內容排一次再量
    var oldCg = t.querySelector('colgroup.fixw'); if (oldCg) oldCg.remove();
    t.style.tableLayout = ''; t.style.width = '';
    var top = t.tBodies[0] && t.tBodies[0].rows[0], lift = top && top.classList.contains('trow');
    var widths = Array.prototype.map.call(t.tHead.rows[0].cells, function (c) { return Math.ceil(c.offsetWidth) + 1; });
    var total = widths.reduce(function (s, w) { return s + w; }, 0);
    // 原本的表格和表頭複本用「同一組」欄寬，兩邊一定對齊
    function colgroup() {
      var cg = document.createElement('colgroup'); cg.className = 'fixw';
      widths.forEach(function (w) { var c = document.createElement('col'); c.style.width = w + 'px'; cg.appendChild(c); });
      return cg;
    }
    t.insertBefore(colgroup(), t.firstChild); t.style.tableLayout = 'fixed'; t.style.width = total + 'px';
    var head = document.createElement('div'); head.className = 'xhead';
    var ct = document.createElement('table'); ct.className = 'ytable'; ct.style.tableLayout = 'fixed'; ct.style.width = total + 'px';
    ct.appendChild(colgroup());
    ct.appendChild(t.tHead.cloneNode(true));
    if (lift) { var cb = document.createElement('tbody'); cb.appendChild(top.cloneNode(true)); ct.appendChild(cb); }
    head.appendChild(ct); sc.parentNode.insertBefore(head, sc);
    // 兩邊的列高也對齊，複本剛好蓋住原本的標題列＋總計列
    var hr = t.tHead.rows[0], cr = ct.tHead.rows[0], hh = Math.max(hr.offsetHeight, cr.offsetHeight);
    hr.style.height = cr.style.height = hh + 'px';
    if (lift) { var cr2 = ct.tBodies[0].rows[0], th2 = Math.max(top.offsetHeight, cr2.offsetHeight); top.style.height = cr2.style.height = th2 + 'px'; }
    sc.style.marginTop = -head.offsetHeight + 'px';
    // 字型晚一點載入、表頭高度變了：跟著重新對齊，不會兩個表頭錯開
    if (window.ResizeObserver) new ResizeObserver(function () { if (head.offsetHeight) sc.style.marginTop = -head.offsetHeight + 'px'; }).observe(head);
    // 左右滑：只有表格本身能滑，表頭單向跟著（表頭不接手指，滑表頭的位置其實是在滑下面的表格）
    var raf = 0;
    sc.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; head.scrollLeft = sc.scrollLeft; });
    }, { passive: true });
    head.scrollLeft = sc.scrollLeft;
  });
}
window.addEventListener('resize', function () { ['dd-body', 'y-body'].forEach(function (id) { var el = $(id); if (el && !el.classList.contains('hide')) fixTheads(el); }); });
function renderDayView() {
  var month = $('m-month').value, V = view();
  var y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7)), last = new Date(y, mo, 0).getDate();
  var days = [];
  for (var d = 1; d <= last; d++) {
    var key = month + '-' + p2(d), dt = new Date(y, mo - 1, d);
    days.push({ key: key, label: mo + '/' + d, wd: WEEK[dt.getDay()], weekend: dt.getDay() === 0 || dt.getDay() === 6 });
  }
  var daily = {}; V.daily.forEach(function (r) { if (r.date.slice(0, 7) === month) daily[r.date] = r; });
  var buy = {}, catTot = {};
  V.purchase.forEach(function (r) {
    if (r.date.slice(0, 7) !== month) return;
    buy[r.date] = buy[r.date] || {}; buy[r.date][r.cat] = (buy[r.date][r.cat] || 0) + Number(r.amount || 0);
    catTot[r.cat] = (catTot[r.cat] || 0) + Number(r.amount || 0);
  });
  var cats = categoriesFor(month);
  Object.keys(catTot).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); });
  function cell(v, cls) { v = Math.round(v || 0); return '<td class="n' + (cls ? ' ' + cls : '') + (v ? sgn(v) : '') + '">' + (v ? money(v) : '') + '</td>'; }
  function dayHead(dd, extra) { return '<th>' + dd.label + '<small>週' + dd.wd + '</small>' + (extra || '') + '</th>'; }

  // 實際營收
  var T = { site: 0, panda: 0, uber: 0, allpay: 0, line: 0, spend: 0, exp: 0, cash: 0, diff: 0, total: 0, days: 0 };
  var revRows = days.map(function (dd) {
    var r = daily[dd.key], cls = (dd.weekend ? 'we' : '');
    if (!r) return '<tr class="off ' + cls + '">' + dayHead(dd) + '<td colspan="10" class="muted">' + (dd.key > todayStr() ? '' : '沒有紀錄') + '</td></tr>';
    if (r.closed) return '<tr class="off ' + cls + '">' + dayHead(dd) + '<td colspan="10">公休</td></tr>';
    var exp = r.site - r.allpay - r.line - (r.spend || 0), total = r.site + r.panda + r.uber;
    T.site += r.site; T.panda += r.panda; T.uber += r.uber; T.allpay += r.allpay; T.line += r.line; T.spend += (r.spend || 0);
    T.exp += exp; T.cash += r.cash; T.diff += r.cashDiff || 0; T.total += total; T.days++;
    return '<tr class="' + cls + '">' + dayHead(dd, pendTag('daily', dd.key)) + cell(r.site) + cell(r.panda) + cell(r.uber) + cell(r.allpay) + cell(r.line) +
      cell(-(r.spend || 0)) + cell(exp) + cell(r.cash) + cell(r.cashDiff, 'em') + cell(total, 'gold') + '</tr>';
  }).join('');
  var revHead = '<tr><th>' + month.replace('-', '/') + '</th>' + ['現場', 'panda', 'uber', '全支付', 'LINE', '現場支出', '現金盈餘', '現場現金', '現金差額', '總營收']
    .map(function (h) { return '<th class="n">' + h + '</th>'; }).join('') + '</tr>';
  var revTot = '<tr class="trow"><th>總計</th>' + cell(T.site) + cell(T.panda) + cell(T.uber) + cell(T.allpay) + cell(T.line) + cell(-T.spend) +
    cell(T.exp) + cell(T.cash) + cell(T.diff) + cell(T.total, 'gold') + '</tr>';

  // 支出計算（進貨）
  var PT = 0;
  var buyRows = days.map(function (dd) {
    var b = buy[dd.key] || {}, r = daily[dd.key], sum = 0;
    var tds = cats.map(function (c) { sum += b[c] || 0; return cell(-(b[c] || 0)); }).join('');
    PT += sum;
    var off = (!r || r.closed) && !sum;
    return '<tr class="' + (off ? 'off ' : '') + (dd.weekend ? 'we' : '') + '">' + dayHead(dd) + tds + cell(-sum, 'sum') + '</tr>';
  }).join('');
  var buyHead = '<tr><th>' + month.replace('-', '/') + '</th>' + cats.map(function (c) { return '<th class="n">' + esc(c) + '</th>'; }).join('') + '<th class="n">總支出</th></tr>';
  var buyTot = '<tr class="trow"><th>總計</th>' + cats.map(function (c) { return cell(-(catTot[c] || 0)); }).join('') + cell(-PT, 'sum') + '</tr>';

  var h = '<div class="kpis">' + kpi('總營收', T.total, '現場＋panda＋uber', true) + kpi('日均營收', T.days ? Math.round(T.total / T.days) : 0, '營業 ' + T.days + ' 天') +
    kpi('進貨總支出', -PT, T.total ? '佔總營收 ' + pct(PT / T.total) : '') + kpi('現金差額累計', T.diff) + '</div>';
  h += '<h2>實際營收</h2><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable"><thead>' + revHead + '</thead><tbody>' + revTot + revRows + '</tbody></table></div>';
  h += '<h2 style="margin-top:22px">支出計算（進貨）</h2><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable"><thead>' + buyHead + '</thead><tbody>' + buyTot + buyRows + '</tbody></table></div>';
  h += '<p class="muted">總營收＝現場＋panda＋uber（外送是營業額，不是實際入帳）。月結請看「月」。</p>';
  $('dd-body').innerHTML = h; fixTheads($('dd-body'));
}

// 歷年：一年一列（月盈餘、分紅、員工分紅、存年終、其他扣除、借出−還款、當年盈餘＝含上一年留下的）
// 成本比例圓餅圖：實際營收拆成 食材成本／人事成本／其他支出（固定、其他、手續費、現金差額）／盈餘
function costBox(title, pur, staff, profit, actual) {
  var other = actual - pur - staff - profit;
  var parts = [['食材成本', pur, 'var(--pie1)'], ['人事成本', staff, 'var(--pie2)'], ['其他支出', other, 'var(--pie3)'], ['盈餘', profit, 'var(--pie4)']];
  var shown = parts.filter(function (p) { return p[1] > 0; });
  var base = shown.reduce(function (a, p) { return a + p[1]; }, 0) || 1, acc = 0;
  var grad = shown.map(function (p) { var a0 = acc; acc += p[1] / base * 100; return p[2] + ' ' + a0.toFixed(2) + '% ' + acc.toFixed(2) + '%'; }).join(', ');
  var pc = function (v) { return actual ? Math.round(v / actual * 100) : 0; };
  return '<div class="costpie"><div class="pie" style="background: conic-gradient(' + (grad || 'var(--line) 0 100%') + ')"><div class="hole"><small>實際營收</small><b>' + money(actual) + '</b></div></div>' +
    '<div class="legend"><div class="lg-h">' + esc(title) + ' 成本比例</div>' + parts.map(function (p) {
      return '<div class="lg"><i style="background:' + p[2] + '"></i><span>' + p[0] + '</span><b class="' + (p[0] === '盈餘' ? (p[1] < 0 ? 'neg' : 'pos') : '') + '">' + money(p[0] === '盈餘' ? p[1] : -p[1]) + '</b><em class="' + (p[1] < 0 && p[0] === '盈餘' ? 'neg' : '') + '">' + pc(p[1]) + '%</em></div>';
    }).join('') + (profit < 0 ? '<p class="muted" style="margin:4px 0 0">這段期間虧損，圓餅只畫出成本的比例</p>' : '') + '</div></div>';
}
function renderAllYears() {
  var L = computeLocal(), R = L.R, V = L.V;
  var months = R.months.filter(function (m) { return m.status !== '未來'; });
  if (!months.length) { $('y-body').innerHTML = '<p class="muted">還沒有任何資料</p>'; return; }
  var who = function (note) { return String(note || '').replace(/（.*?）|\(.*?\)/g, '').replace(/分紅.*$/, '').trim(); };
  var partners = (L.C.partners || []).map(function (p) { return p.name; }), people = partners.slice(), payBy = {}, otherBy = {};
  (V.deduct || []).forEach(function (d) {
    var y = String(d.month || '').slice(0, 4), amt = Number(d.amount || 0), p = '';
    if (d.type === '股東分紅（已發）') p = who(d.note) || '股東（未寫名字）';
    else if (d.type === '其他扣除' && /分紅|秘笈/.test(String(d.note || ''))) p = who(d.note);
    if (p) { payBy[y + '|' + p] = (payBy[y + '|' + p] || 0) + amt; if (people.indexOf(p) < 0) people.push(p); }
    else if (d.type === '其他扣除') otherBy[y] = (otherBy[y] || 0) + amt;
  });
  var years = []; months.forEach(function (m) { var y = m.month.slice(0, 4); if (years.indexOf(y) < 0) years.push(y); });
  years.sort();
  var f = function (y, k) { return months.filter(function (m) { return m.month.slice(0, 4) === y; }).reduce(function (a, m) { return a + (typeof k === 'function' ? k(m) : (m[k] || 0)); }, 0); };
  var rows = years.map(function (y) {
    var o = { y: y, days: f(y, 'days'), actual: f(y, 'actual'), profit: f(y, 'profit'), bonus: f(y, 'bonus'), reserve: f(y, 'reserve'), other: otherBy[y] || 0,
      loan: f(y, function (m) { return (m.loan || 0) - (m.repay || 0); }), pay: {} };
    o.paid = people.reduce(function (a, p) { o.pay[p] = payBy[y + '|' + p] || 0; return a + o.pay[p]; }, 0);
    o.left = o.profit - o.paid - o.bonus - o.reserve - o.other - o.loan;   // 這一年留下來的
    return o;
  });
  var run = 0; rows.forEach(function (o) { run += o.left; o.cum = run; });
  people = people.filter(function (p) { return rows.some(function (o) { return o.pay[p]; }); });
  var td = function (v, cls) { return '<td class="n' + (cls ? ' ' + cls : '') + sgn(v) + '">' + money(v) + '</td>'; };
  var tot = { days: 0, actual: 0, profit: 0, paid: 0, bonus: 0, reserve: 0, other: 0, loan: 0, left: 0, pay: {}, cum: run };
  rows.forEach(function (o) { ['days', 'actual', 'profit', 'paid', 'bonus', 'reserve', 'other', 'loan', 'left'].forEach(function (k) { tot[k] += o[k]; }); people.forEach(function (p) { tot.pay[p] = (tot.pay[p] || 0) + o.pay[p]; }); });
  var all = rows.concat([Object.assign(tot, { y: '全部' })]);
  // 年份放欄、項目放列（扣的項目顯示負數）
  var items = [['工作天', function (o) { return o.days; }, 'plain'], ['實際營收', function (o) { return o.actual; }], ['月盈餘', function (o) { return o.profit; }, 'em'],
    ['分紅合計', function (o) { return -(o.paid + o.bonus); }, 'em']]
    .concat(people.map(function (p) { return ['　' + p, function (o) { return -(o.pay[p] || 0); }]; }))
    .concat([['員工分紅', function (o) { return -o.bonus; }], ['存年終', function (o) { return -o.reserve; }], ['其他扣除', function (o) { return -o.other; }],
      ['借出−還款', function (o) { return -o.loan; }], ['當年結餘', function (o) { return o.left; }, 'em'], ['當年盈餘', function (o) { return o.cum; }, 'em bal']]);
  var sumAll = function (k) { return months.reduce(function (a, m) { return a + (m[k] || 0); }, 0); };
  var actAll = sumAll('actual'), staffAll = sumAll('staff'), purAll = sumAll('purchase'), daysAll = sumAll('days');
  var cards = '<div class="kpis">' + kpi('累積盈餘', run, years[0] + '～' + years[years.length - 1] + ' 留下來的錢', true) +
    kpi('已發分紅', tot.paid + tot.bonus, '股東＋固定分紅＋員工分紅') +
    kpi('實際營收', actAll, '工作 ' + daysAll + ' 天｜日均 ' + money(daysAll ? Math.round(actAll / daysAll) : 0)) +
    kpi('人事', staffAll, '佔實際營收 ' + pct(actAll ? staffAll / actAll : 0)) +
    kpi('貨款', purAll, '佔實際營收 ' + pct(actAll ? purAll / actAll : 0)) + '</div>';
  var h = cards + '<h2>歷年</h2><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable eq" style="min-width:' + (120 + all.length * 110) + 'px"><thead><tr><th>項目</th>' +
    all.map(function (o) { return '<th class="n">' + esc(o.y) + (o.y === todayStr().slice(0, 4) ? '<span class="tag">進行中</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
    items.map(function (it) {
      return '<tr class="' + (it[2] === 'em bal' ? 'yrow' : '') + '"><th>' + esc(it[0]) + '</th>' + all.map(function (o, i) {
        var v = it[1](o);
        if (it[2] === 'plain') return '<td class="n">' + v + '</td>';
        if (!v && it[2] !== 'em' && it[2] !== 'em bal') return '<td class="n"></td>';
        return td(v, (it[2] || '') + (i === all.length - 1 ? ' tot' : ''));
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>' +
    '<p class="muted">當年結餘＝月盈餘−分紅合計（含員工分紅）−存年終−其他扣除−借出＋還款，是這一年自己留下的錢；當年盈餘＝當年結餘＋上一年盈餘，跟「年」總覽上面的卡片一樣；「全部」那欄的當年盈餘就是到今天累積留下的錢。點「年」可以看每一年的每個月。</p>';
  $('y-body').innerHTML = h; fixTheads($('y-body'));
}
function renderYearTab() {
  var L = computeLocal(), R = L.R, V = L.V;
  var years = {}; R.months.forEach(function (m) { years[m.month.slice(0, 4)] = true; });
  var ys = Object.keys(years).sort();
  var sel = $('y-year');
  var cur = sel.value || (ys.indexOf(todayStr().slice(0, 4)) >= 0 ? todayStr().slice(0, 4) : ys[ys.length - 1]);
  sel.innerHTML = ys.map(function (y) { return '<option' + (y === cur ? ' selected' : '') + '>' + y + '</option>'; }).join('');
  if (!ys.length) { $('y-body').innerHTML = '<p class="muted">還沒有任何資料</p>'; return; }
  var perDay = ST.ymode !== 'total';
  var months = R.months.filter(function (m) { return m.month.slice(0, 4) === cur && m.status !== '未來'; });
  var partners = (L.C.partners || []).map(function (p) { return p.name; });
  var share = {}; R.shares.forEach(function (s) { share[s.month + '|' + s.name] = s.amount; });
  function sum(list, f) { return list.reduce(function (a, m) { return a + f(m); }, 0); }
  function td(v, cls) { return '<td class="n' + (cls ? ' ' + cls : '') + sgn(v) + '">' + money(v) + '</td>'; }
  function label(m) { return Number(m.month.slice(5, 7)) + '月' + (m.status === '進行中' ? '<span class="tag">進行中</span>' : ''); }

  // 表一：盈餘與分紅（像舊表：只有實際發錢的月份才有分紅；一個人一欄）
  // 每個人實際領到的：分紅扣除裡「股東分紅（已發）」（備註寫名字）＋「其他扣除」備註是「某某分紅」的
  var who = function (note) { return String(note || '').replace(/（.*?）|\(.*?\)/g, '').replace(/分紅.*$/, '').trim(); };
  var payBy = {}, otherBy = {}, people = partners.slice();
  (V.deduct || []).forEach(function (d) {
    var amt = Number(d.amount || 0), p = '';
    if (d.type === '股東分紅（已發）') p = who(d.note) || '股東（未寫名字）';
    else if (d.type === '其他扣除' && /分紅|秘笈/.test(String(d.note || ''))) p = who(d.note);   // 買秘笈也算分紅，自己一欄
    if (p) { payBy[d.month + '|' + p] = (payBy[d.month + '|' + p] || 0) + amt; if (people.indexOf(p) < 0 && d.month.slice(0, 4) === cur) people.push(p); }
    else if (d.type === '其他扣除') otherBy[d.month] = (otherBy[d.month] || 0) + amt;
  });
  people = people.filter(function (p) { return months.some(function (m) { return payBy[m.month + '|' + p]; }) || partners.indexOf(p) >= 0; });
  var paidOf = function (m) { return people.reduce(function (a, p) { return a + (payBy[m.month + '|' + p] || 0); }, 0); };
  // 結餘：上一年留下來的錢 ＋ 盈餘 − 員工分紅 − 存年終 − 其他扣除 − 發出去的分紅（＝還沒分掉的錢）
  var net = function (m) { return m.dist - (m.paid || 0) - (m.loan || 0) + (m.repay || 0); };   // 借給員工的錢先扣掉，還了再加回（明細在「借還款」分頁）
  var carry = R.months.filter(function (m) { return m.month.slice(0, 4) < cur; }).reduce(function (a, m) { return a + net(m); }, 0);
  var bal = {}, run = carry;
  months.forEach(function (m) { run += net(m); bal[m.month] = run; });
  var hasLoan = false;
  var cols = ['月盈餘', '分紅合計'].concat(people, ['員工分紅', '存年終', '其他扣除'], hasLoan ? ['借還款'] : [], ['結餘']);
  var neg = function (v) { return v ? td(-v) : '<td class="n"></td>'; };
  var rowOf = function (list, name, cls) {
    var tot = sum(list, function (m) { return paidOf(m) + m.bonus; });   // 分紅合計：股東＋店長／固定分紅＋員工分紅（不含存年終）
    return '<tr class="' + cls + '"><th>' + name + '</th>' + td(sum(list, function (m) { return m.profit; })) +
      (tot ? td(-tot, 'em') : '<td class="n"></td>') +
      people.map(function (p) { return neg(sum(list, function (m) { return payBy[m.month + '|' + p] || 0; })); }).join('') +
      neg(sum(list, function (m) { return m.bonus; })) + neg(sum(list, function (m) { return m.reserve; })) + neg(sum(list, function (m) { return otherBy[m.month] || 0; })) +
      (hasLoan ? neg(sum(list, function (m) { return (m.loan || 0) - (m.repay || 0); })) : '') +
      td(sum(list, function (m) { return m.profit - m.reserve - (otherBy[m.month] || 0); }) - tot, 'em bal') + '</tr>';   // 結餘＝這個月（這一年）盈餘−分紅合計−其他扣除
  };
  var carryRow = '<tr class="carry"><th>上一年結餘</th>' + cols.map(function (c, i) { return i === cols.length - 1 ? td(carry, 'em bal') : '<td></td>'; }).join('') + '</tr>';
  var yDays = sum(months, function (m) { return m.days; }), yAct = sum(months, function (m) { return m.actual; });
  // 今年盈餘：扣掉分紅（股東＋店長／固定分紅＋員工分紅＋存年終）和其他扣除之後，今年留下來的錢
  var yProfit = sum(months, function (m) { return m.profit; }), yPaid = sum(months, function (m) { return paidOf(m) + m.bonus; });
  var yRes = sum(months, function (m) { return m.reserve; });
  var yDed = sum(months, function (m) { return otherBy[m.month] || 0; });
  // 當年盈餘＝月盈餘合計−當年分紅合計（含員工分紅）−存年終−其他扣除＋上一年盈餘
  var yLoan = sum(months, function (m) { return (m.loan || 0) - (m.repay || 0); });   // 今年借出 − 還款
  var h = '<div class="ovgrid">' + costBox(cur + ' 全年', sum(months, function (m) { return m.purchase; }), sum(months, function (m) { return m.staff; }), yProfit, yAct) + '<div class="kpis two">' + kpi(cur + ' 當年盈餘', yProfit - yPaid - yRes - yDed - yLoan + carry, '月盈餘 ' + money(yProfit) + '－分紅 ' + money(yPaid) + '－存年終 ' + money(yRes) + (yDed ? '－其他扣除 ' + money(yDed) : '') + (yLoan ? (yLoan > 0 ? '－借出 ' + money(yLoan) : '＋還款 ' + money(-yLoan)) : '') + '＋上一年盈餘 ' + money(carry), true) +
    kpi(cur + ' 當年結餘', yProfit - yPaid - yRes - yDed - yLoan, '今年留下的錢（不含上一年）') +
    kpi('實際營收', yAct, '工作 ' + yDays + ' 天｜日均 ' + money(yDays ? Math.round(yAct / yDays) : 0)) +
    kpi('人事', sum(months, function (m) { return m.staff; }), '佔實際營收 ' + pct(yAct ? sum(months, function (m) { return m.staff; }) / yAct : 0)) +
    kpi('貨款', sum(months, function (m) { return m.purchase; }), '佔實際營收 ' + pct(yAct ? sum(months, function (m) { return m.purchase; }) / yAct : 0)) + '</div></div><h2>盈餘與分紅</h2><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable eq" style="min-width:' + (128 + cols.length * 96) + 'px"><thead><tr><th>' + cur + '</th>' +
    cols.map(function (c) { return '<th class="n">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
  [1, 2, 3, 4].forEach(function (q) {
    var qm = months.filter(function (m) { return Math.ceil(Number(m.month.slice(5, 7)) / 3) === q; });
    if (!qm.length) return;
    qm.forEach(function (m) { h += rowOf([m], label(m), ''); });   // 盈餘與分紅：像舊表一樣不放季合計
  });
  h += rowOf(months, cur + ' 全年', 'yrow') + '</tbody></table></div>';
  h += '<p class="muted">分紅＝實際發出去的錢：在「分紅扣除」記「股東分紅（已發）」（備註寫名字，例如 浩勤），佳茹／Nina 這類固定分紅記「其他扣除」、備註寫「佳茹分紅」。結餘＝當月盈餘−分紅合計−存年終−其他扣除，也就是那個月分完還留下的錢；全年那列是今年加總。上面「盈餘」卡片才有加上一年留下來的（借給員工的錢另外看「借還款」）。每月「應該分多少」請看「月」總覽。</p>';

  // 表二：平均細項
  var catSet = {}; R.cats.forEach(function (c) { if (c.month.slice(0, 4) === cur) catSet[c.cat] = (catSet[c.cat] || 0) + c.amount; });
  // 欄位順序：照「設定_進貨分類」的順序（和進貨頁一樣）；設定裡沒有的（以前的分類）放最後、照金額大到小
  var setOrder = []; (ST.snap.config.categories || []).forEach(function (c) { if (setOrder.indexOf(c.cat) < 0) setOrder.push(c.cat); });
  var cats = setOrder.filter(function (c) { return catSet[c] !== undefined; })
    .concat(Object.keys(catSet).filter(function (c) { return setOrder.indexOf(c) < 0; }).sort(function (a, b) { return catSet[b] - catSet[a]; }));
  var catAmt = {}; R.cats.forEach(function (c) { catAmt[c.month + '|' + c.cat] = c.amount; });
  var util = {};
  V.expense.forEach(function (x) {
    ['電費', '水費'].forEach(function (k) { if (String(x.item).indexOf(k) >= 0) util[x.month + '|' + k] = (util[x.month + '|' + k] || 0) + Number(x.amount || 0); });
  });
  var dcols = [['實際營收', function (m) { return m.actual; }], ['人事', function (m) { return m.staff; }],
    ['電費', function (m) { return util[m.month + '|電費'] || 0; }], ['水費', function (m) { return util[m.month + '|水費'] || 0; }],
    ['固定支出', function (m) { return m.fixed; }], ['其他支出', function (m) { return m.other; }],
    ['現金差額', function (m) { return -m.cashDiff; }],   // 正數＝多收（顯示時會再乘 −1 變回正的）
    ['貨款', function (m) { return m.purchase; }]].concat(cats.map(function (c) { return [c, function (m) { return catAmt[m.month + '|' + c] || 0; }]; }));
  var dv = function (list, f) { var days = sum(list, function (m) { return m.days; }); var t = sum(list, f); return perDay ? (days ? t / days : 0) : t; };
  var drow = function (list, name, cls) {
    return '<tr class="' + cls + '"><th>' + name + '</th><td class="n">' + sum(list, function (m) { return m.days; }) + '</td>' +
      dcols.map(function (c, i) { var v = dv(list, c[1]) * (i === 0 ? 1 : -1); return '<td class="n' + (i === 0 ? ' em' : '') + sgn(v) + '">' + money(v) + '</td>'; }).join('') + '</tr>';
  };
  h += '<div class="h2row"><h2>平均細項</h2><div class="seg ymode"><button class="' + (perDay ? 'on' : '') + '" onclick="setYMode(\'day\')">平均</button><button class="' + (perDay ? '' : 'on') + '" onclick="setYMode(\'total\')">合計</button></div></div><p class="muted swipe">← 表格可以左右滑動 →</p><div class="xscroll"><table class="ytable eq" style="min-width:' + (128 + (dcols.length + 1) * 84) + 'px"><thead><tr><th>' + cur + '</th><th class="n">工作天</th>' +
    dcols.map(function (c, i) { return '<th class="n' + (i >= 8 ? ' cat' : '') + '">' + esc(c[0]) + '</th>'; }).join('') + '</tr></thead><tbody>';
  [1, 2, 3, 4].forEach(function (q) {
    var qm = months.filter(function (m) { return Math.ceil(Number(m.month.slice(5, 7)) / 3) === q; });
    if (!qm.length) return;
    qm.forEach(function (m) { h += drow([m], label(m), ''); });
  });
  h += drow(months, cur + (perDay ? ' 全年平均' : ' 全年'), 'yrow') + '</tbody></table></div>';
  h += '<p class="muted">電費、水費是從「固定／其他支出」裡項目名稱有「電費」「水費」的金額抓的（也包含在固定／其他支出裡）。現金差額正數＝多收、負數＝短少。季、全年的每天平均＝合計 ÷ 總工作天。</p>';
  $('y-body').innerHTML = h; fixTheads($('y-body'));
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
    ['現場營收', m.site], ['Panda', m.pandaN === null ? '未對帳' : m.pandaN, false, '', m.pandaG], ['Uber', m.uberN === null ? '未對帳' : m.uberN, false, '', m.uberG],
    ['＝ 實際營收', m.actual, true], ['進貨', -m.purchase, false, pct(m.purchasePct)], ['人事成本', -m.staff, false, pct(m.staffPct)],
    ['固定支出', -m.fixed], ['其他支出', -m.other], [m.feeEst ? '線上支付手續費（估計）' : '線上支付手續費', -m.fee],
    ['現金差額', m.cashDiff], ['＝ 月盈餘', m.profit, true],
    ['員工分紅', -m.bonus], ['年終預留', -m.reserve], ['其他扣除', -m.deductOther], ['＝ 可分配給股東', m.dist, true]
  ];
  var shares = R.shares.filter(function (x) { return x.month === month; });
  var warns = R.warns.filter(function (x) { return x.month === month || x.month === ''; });
  var cats = R.cats.filter(function (x) { return x.month === month; }).sort(function (a, b) { return b.amount - a.amount; });
  var h = '<div class="ovgrid">' + costBox(Number(month.slice(5, 7)) + '月', m.purchase, m.staff, m.profit, m.actual) + '<div class="kpis two">' +
    kpi('月盈餘', m.profit, '扣完所有成本＋現金差額', true) + kpi('可分配給股東', m.dist, '扣員工分紅、年終後') +
    kpi('實際營收', m.actual, '工作 ' + m.days + ' 天') + kpi('日均營收', m.avg, '每個工作天') + '</div></div>' + note + '<p>' + (m.status === '進行中' ? '<span class="warn">● 本月進行中</span>' : '<span class="ok">● 已結束</span>') +
    '　工作天 ' + m.days + '　日均營收 ' + money(m.avg) + '　現金差額累計 ' + money(m.cashDiff) + '</p>';
  h += '<table class="msum">' + rows.map(function (x) {
    if (x[4] !== undefined) {                       // 外送：日結 − 實際收到 ＝ 付給平台
      var got = typeof x[1] === 'number', pay = got ? x[4] - x[1] : null;
      return '<tr class="dlv"><td><span>' + x[0] + '</span><span class="dlv-g"><small>日結</small>' + money(x[4]) + '<i>−</i></span></td><td class="n">' +
        (got ? '<small>實際收到</small><span class="' + sgn(x[1]) + '">' + money(x[1]) + '</span>' : '<span class="warn">未對帳</span>') + '</td><td class="n dlv-p">' +
        (got ? '<i>＝</i><small>付給平台</small><span class="bad">' + money(pay) + '</span>' + (x[4] ? '<em>' + Math.round(pay / x[4] * 100) + '%</em>' : '') : '<span class="muted">—</span>') + '</td></tr>';
    }
    return '<tr' + (x[2] ? ' style="font-weight:700"' : '') + '><td>' + x[0] + '</td><td class="n">' +
      (typeof x[1] === 'number' ? '<span class="' + sgn(x[1]) + '">' + money(x[1]) + '</span>' : '<span class="warn">' + x[1] + '</span>') + '</td><td class="n muted">' + (x[3] || '') + '</td></tr>';
  }).join('') + '</table>';
  h += '<h2 style="margin-top:18px">股東分紅</h2><table>' + shares.map(function (s) {
    return '<tr><td>' + esc(s.name) + '</td><td class="n muted">' + s.pct + '%</td><td class="n big">' + money(s.amount) + '</td></tr>';
  }).join('') + '</table>';
  updateWarns();   // 需要注意：在右下角顯示模式上面的 ⚠ 圓鈕
  if (cats.length) h += '<h2 style="margin-top:18px">進貨分類</h2><table>' + cats.map(function (c) {
    return '<tr><td>' + esc(c.cat) + '</td><td class="n">' + money(c.amount) + '</td><td class="n muted">' + pct(c.pct) + '</td></tr>';
  }).join('') + '</table>';
  $('m-body').innerHTML = h;
}

/* ---------- 裝置設定 ---------- */
var OP_NAMES = { 'presets.set': '常用項目設定', 'daily.upsert': '每日結帳', 'purchase.add': '新增進貨', 'purchase.del': '刪除進貨', 'expense.add': '新增支出',
  'expense.del': '刪除支出', 'deduct.add': '新增扣除', 'deduct.del': '刪除扣除', 'payroll.upsert': '人事', 'payroll.slip': '日結→人事', 'delivery.upsert': '外送對帳' };
function opLabel(op) {
  if (!op) return '';
  var d = op.data || {};
  return (OP_NAMES[op.type] || op.type) + ' ' + (d.date || d.month || '') + ' ' + (d.cat || d.item || d.name || d.platform || d.type || '') +
    (d.amount !== undefined && d.amount !== '' ? ' ' + money(d.amount) : '');
}
function checkUpdate() {
  if (!ST.swReg) { location.reload(); return; }
  toast('檢查更新中…');
  ST.swReg.update().then(function () {
    setTimeout(function () { if (!ST.reloading) { saveOutbox(); location.reload(); } }, 1500);
  }, function () { toast('沒有網路，無法檢查更新'); });
}
/* ---------- 常用項目設定（管理） ---------- */
var PE_USES = [['每日結帳', '每日結帳・支出明細'], ['固定支出', '固定／其他支出'], ['人事', '人事']];

function peCatOptions(use) {
  if (use === '每日結帳') return [['進貨', categoriesFor(todayStr().slice(0, 7))], ['其他', [LINE_OTHER, LINE_PT, LINE_ADV]]];
  if (use === '固定支出') return [['', ['固定', '其他']]];
  return [['', ['薪資', '公司負擔', '預支']]];
}
function renderPresetEditor() {
  if (!isAdmin()) { $('set-presets-card').classList.add('hide'); return; }
  $('set-presets-card').classList.remove('hide');
  // 換店別：清單要換成那家店的（不然會看到、甚至存成上一家店的常用項目）
  if (!ST.pe || ST.pe.store !== ST.sess.store) ST.pe = { store: ST.sess.store, use: ST.pe ? ST.pe.use : '每日結帳', items: null, dirty: false };
  if (!ST.pe.items) ST.pe.items = presetsFor(ST.pe.use);
  $('pe-uses').innerHTML = PE_USES.map(function (u) {
    return '<button class="' + (u[0] === ST.pe.use ? 'on' : '') + '" onclick="peUse(\'' + u[0] + '\')">' + u[1] + '</button>';
  }).join('');
  var groups = peCatOptions(ST.pe.use), isPay = ST.pe.use === '人事';
  $('pe-list').innerHTML = ST.pe.items.map(function (it, i) {
    // 分類不在這家店的清單裡（例：舊的「菜」、別家店的分類）：照原本的顯示，不要偷偷變成第一個選項
    var known = groups.some(function (g) { return g[1].indexOf(it.cat) >= 0; });
    var sel = '<select onchange="peSet(' + i + ',\'cat\',this.value)">' + (known || !it.cat ? '' : '<option selected>' + esc(it.cat) + '</option>') + groups.map(function (g) {
      var opts = g[1].map(function (c) { return '<option' + (c === it.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      return g[0] ? '<optgroup label="' + g[0] + '">' + opts + '</optgroup>' : opts;
    }).join('') + '</select>';
    var sign = isPay ? '<select class="pe-sign" onchange="peSet(' + i + ',\'sign\',this.value)"><option' + (it.sign !== '扣' ? ' selected' : '') + '>加</option><option' + (it.sign === '扣' ? ' selected' : '') + '>扣</option></select>' : '';
    return '<div class="pe-row' + (isPay ? ' pay' : '') + '"><input value="' + esc(it.name) + '" placeholder="名稱" oninput="peSet(' + i + ',\'name\',this.value)">' + sel + sign +
      '<button class="pe-mv" onclick="peMove(' + i + ',-1)" aria-label="上移">↑</button><button class="pe-mv" onclick="peMove(' + i + ',1)" aria-label="下移">↓</button>' +
      '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="peDel(' + i + ')">✕</button></div>';
  }).join('') || '<p class="muted">清單是空的，按下面「＋新增項目」</p>';
  $('pe-save').disabled = !ST.pe.dirty;
  $('pe-save').textContent = ST.pe.dirty ? '儲存「' + PE_USES.filter(function (u) { return u[0] === ST.pe.use; })[0][1] + '」常用項目' : '沒有變更';
}
// 「預設」卡片：員工名單／進貨分類（這家店的，管理才看得到）
var DEF_TABS = [['店家', '店家'], ['員工', '員工名單'], ['股東', '股東'], ['分類', '進貨分類']];
function renderDefaults() {
  if (!isAdmin()) { $('set-def-card').classList.add('hide'); return; }
  $('set-def-card').classList.remove('hide');
  var tab = ST.defTab || '員工';
  $('def-tabs').innerHTML = DEF_TABS.map(function (u) {
    return '<button class="' + (u[0] === tab ? 'on' : '') + '" onclick="defGo(\'' + u[0] + '\')">' + u[1] + '</button>';
  }).join('');
  $('def-note').textContent = tab === '員工'
    ? ST.sess.store + '的員工。人事頁的「＋名字」、月薪／時薪和勞健保照這裡帶入。點名字展開修改；不做了的取消勾選「在職」就好，以前的薪資紀錄會留著。'
    : tab === '店家' ? ST.sess.store + '的設定。現金差額一律算進月盈餘（多收加、短少扣），超過門檻會在「需要注意」提醒。'
    : tab === '股東' ? ST.sess.store + '的股東和分紅比例，總覽的「應分多少」照這裡算，比例加起來要 100%。改了比例，以前月份的應分金額也會照新比例重算。'
    : ST.sess.store + '的進貨分類，進貨頁的分類按鈕照這裡的順序顯示。點「一直用」可以選從哪個月開始停用。';
  $('ee-pane').classList.toggle('hide', tab !== '員工');
  $('sp-pane').classList.toggle('hide', tab !== '店家');
  $('pp-pane').classList.toggle('hide', tab !== '股東');
  $('ce-pane').classList.toggle('hide', tab !== '分類');
  if (tab === '店家') renderStoreEditor(); else if (tab === '員工') renderEmpEditor(); else if (tab === '股東') renderPartnerEditor(); else renderCatEditor();
}
// 店家設定：現金差額算不算進盈餘、警示門檻、手續費率（存回「設定_店家」）
function renderStoreEditor() {
  var st = ST.snap.config.store || {};
  $('sp-warn').value = st.cashWarn || ''; $('sp-fee').value = st.fee === undefined ? '' : st.fee;
}
function spSave() {
  var fee = expr($('sp-fee').value), warn = expr($('sp-warn').value);
  if (isNaN(fee) || isNaN(warn)) return toast('數字看不懂');
  var d = { cashWarn: warn || 500, fee: fee };
  enqueue('store.set', d);
  ST.snap.config.store = Object.assign({}, ST.snap.config.store, d);
  LS.set(k_('snap'), ST.snap);
  toast('店家設定已儲存 ✓');
}
function defGo(t) {
  var cur = ST.defTab || '員工';
  if (t === cur) return;
  var dirty = cur === '員工' ? ST.ee && ST.ee.dirty : cur === '股東' ? ST.pp && ST.pp.dirty : cur === '分類' ? ST.ce && ST.ce.dirty : false;
  if (dirty && !confirm('這一頁還沒儲存，確定要切換？（改的內容會不見）')) return;
  if (cur === '員工') ST.ee = null; else if (cur === '股東') ST.pp = null; else if (cur === '分類') ST.ce = null;
  ST.defTab = t; renderDefaults();
}
function peUse(u) {
  if (ST.pe.dirty && !confirm('這一類還沒儲存，確定要切換？（改的內容會不見）')) return;
  ST.pe = { store: ST.sess.store, use: u, items: null, dirty: false }; renderPresetEditor();
}
function peSet(i, k, v) { ST.pe.items[i][k] = v; ST.pe.dirty = true; $('pe-save').disabled = false; $('pe-save').textContent = '儲存變更'; }
function peMove(i, d) { var j = i + d; if (j < 0 || j >= ST.pe.items.length) return; var t = ST.pe.items[i]; ST.pe.items[i] = ST.pe.items[j]; ST.pe.items[j] = t; ST.pe.dirty = true; renderPresetEditor(); }
function peDel(i) { ST.pe.items.splice(i, 1); ST.pe.dirty = true; renderPresetEditor(); }
function peAdd() {
  var g = peCatOptions(ST.pe.use);
  ST.pe.items.push({ name: '', cat: ST.pe.use === '每日結帳' ? LINE_OTHER : g[0][1][0], sign: ST.pe.use === '人事' ? '加' : '' });
  ST.pe.dirty = true; renderPresetEditor();
  var rows = $('pe-list').querySelectorAll('.pe-row'); rows[rows.length - 1].querySelector('input').focus();
}
function peReset() {
  if (!confirm('恢復成原本的預設項目？')) return;
  ST.pe.items = (PRESET_DEFAULTS[ST.pe.use] || []).map(function (p) { return { name: p[0], cat: p[1], sign: p[2] || '' }; });
  ST.pe.dirty = true; renderPresetEditor();
}
function peSave() {
  var items = ST.pe.items.map(function (it) { return { name: String(it.name || '').trim(), cat: it.cat, sign: it.sign || '' }; }).filter(function (it) { return it.name; });
  var names = items.map(function (it) { return it.name; });
  if (names.some(function (n, i) { return names.indexOf(n) !== i; })) return toast('有重複的名稱，請改掉');
  enqueue('presets.set', { use: ST.pe.use, items: items });
  ST.pe = { store: ST.sess.store, use: ST.pe.use, items: null, dirty: false };
  renderPresetEditor();
  toast('常用項目已儲存 ✓（所有裝置同步後都會更新）');
}

/* ---------- 員工名單、進貨分類（管理在「裝置」直接改，存到試算表「設定_員工」「設定_進貨分類」） ---------- */
var EE_NUMS = [['salary', '月薪'], ['hourly', '時薪'], ['selfHealth', '員工自付健保'], ['selfLabor', '員工自付勞保'], ['pension', '公司勞退'], ['health', '公司健保'], ['labor', '公司勞保']];
function renderEmpEditor() {
  if (!isAdmin()) return;
  if (!ST.ee || ST.ee.store !== ST.sess.store) {
    var src = ST.snap.config.employeesAll || ST.snap.config.employees || [];
    ST.ee = { store: ST.sess.store, open: -1, dirty: false, items: src.map(function (e) { return Object.assign({ active: true }, e); }) };
  }
  $('ee-list').innerHTML = ST.ee.items.map(function (e, i) {
    var pay = e.type === '計時' ? '時薪 ' + money(e.hourly || 0) : '月薪 ' + money(e.salary || 0);
    var head = '<button class="ee-head' + (i === ST.ee.open ? ' on' : '') + (e.active === false ? ' off' : '') + '" onclick="eeOpen(' + i + ')"><b>' + esc(e.name || '（未命名）') + '</b>' +
      '<span class="muted">' + esc(e.type === '計時' ? '計時' : '正職') + '｜' + pay + (e.active === false ? '｜已離職' : '') + '</span><span class="ee-arrow">' + (i === ST.ee.open ? '▴' : '▾') + '</span></button>';
    if (i !== ST.ee.open) return '<div class="ee-item">' + head + '</div>';
    var nums = EE_NUMS.filter(function (n) { return e.type === '計時' ? n[0] !== 'salary' : n[0] !== 'hourly'; }).map(function (n) {
      return '<label>' + n[1] + '<input value="' + esc(e[n[0]] || '') + '" inputmode="numeric" oninput="eeSet(' + i + ',\'' + n[0] + '\',this.value)"></label>';
    }).join('');
    return '<div class="ee-item open">' + head + '<div class="ee-body">' +
      '<label>姓名<input value="' + esc(e.name || '') + '" oninput="eeSet(' + i + ',\'name\',this.value)"></label>' +
      '<div class="seg">' + ['正職', '計時'].map(function (t) { return '<button class="' + ((e.type || '正職') === t ? 'on' : '') + '" onclick="eeSet(' + i + ',\'type\',\'' + t + '\',true)">' + t + '</button>'; }).join('') + '</div>' +
      '<div class="ee-nums">' + nums + '</div>' +
      '<div class="ee-foot"><label class="chk"><input type="checkbox"' + (e.active !== false ? ' checked' : '') + ' onchange="eeSet(' + i + ',\'active\',this.checked,true)"> 在職</label>' +
      '<button class="ghost ee-del" onclick="eeDel(' + i + ')">✕ 刪除</button></div></div></div>';
  }).join('') || '<p class="muted">還沒有員工，按下面「＋ 新增員工」</p>';
  $('ee-save').disabled = !ST.ee.dirty;
  $('ee-save').textContent = ST.ee.dirty ? '儲存員工名單' : '沒有變更';
}
function eeOpen(i) { ST.ee.open = ST.ee.open === i ? -1 : i; renderEmpEditor(); }
function eeSet(i, k, v, redraw) {
  ST.ee.items[i][k] = v; ST.ee.dirty = true;
  if (redraw) renderEmpEditor(); else { $('ee-save').disabled = false; $('ee-save').textContent = '儲存員工名單'; }
}
function eeDel(i) {
  if (!confirm('從名單刪除 ' + (ST.ee.items[i].name || '這位') + '？\n（以前的薪資紀錄會留著；只是暫時不做，建議取消勾選「在職」就好）')) return;
  ST.ee.items.splice(i, 1); ST.ee.open = -1; ST.ee.dirty = true; renderEmpEditor();
}
function eeAdd() {
  ST.ee.items.push({ name: '', type: '正職', active: true }); ST.ee.open = ST.ee.items.length - 1; ST.ee.dirty = true;
  renderEmpEditor();
  var b = $('ee-list').querySelector('.ee-item.open input'); if (b) b.focus();
}
function eeSave() {
  var bad = '', items = ST.ee.items.map(function (e) {
    var o = { name: String(e.name || '').trim(), type: e.type === '計時' ? '計時' : '正職', active: e.active !== false };
    EE_NUMS.forEach(function (n) { var v = expr(e[n[0]]); if (isNaN(v)) bad = (o.name || '員工') + ' 的' + n[1]; o[n[0]] = v || ''; });
    return o;
  }).filter(function (o) { return o.name; });
  if (bad) return toast(bad + '看不懂，請打數字');
  var names = items.map(function (o) { return o.name; });
  var dup = names.filter(function (n, i) { return names.indexOf(n) !== i; })[0];
  if (dup) return toast('名字重複：' + dup);
  enqueue('employees.set', { items: items });
  // 先改這台裝置的設定，同步後試算表也會更新
  ST.snap.config.employeesAll = items.map(function (o) { return Object.assign({}, o, { salary: Number(o.salary) || 0, hourly: Number(o.hourly) || 0 }); });
  ST.snap.config.employees = ST.snap.config.employeesAll.filter(function (o) { return o.active; });
  LS.set(k_('snap'), ST.snap);
  ST.ee = null; renderDefaults();
  toast('員工名單已儲存 ✓');
}

// ---- 股東和比例（設定_股東） ----
function renderPartnerEditor() {
  if (!isAdmin()) return;
  if (!ST.pp || ST.pp.store !== ST.sess.store) {
    ST.pp = { store: ST.sess.store, dirty: false, items: (ST.snap.config.partners || []).map(function (p) { return { name: p.name, pct: p.pct }; }) };
  }
  var sum = ST.pp.items.reduce(function (a, p) { return a + (Number(p.pct) || 0); }, 0);
  $('pp-list').innerHTML = ST.pp.items.map(function (p, i) {
    return '<div class="pp-row"><input value="' + esc(p.name) + '" placeholder="股東名字" oninput="ppSet(' + i + ',\'name\',this.value)">' +
      '<div class="pp-pct"><input value="' + esc(p.pct) + '" inputmode="decimal" placeholder="比例" oninput="ppSet(' + i + ',\'pct\',this.value)"><span>%</span></div>' +
      '<button class="pe-mv" onclick="ppMove(' + i + ',-1)" aria-label="上移">↑</button><button class="pe-mv" onclick="ppMove(' + i + ',1)" aria-label="下移">↓</button>' +
      '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="ppDel(' + i + ')">✕</button></div>';
  }).join('') + (ST.pp.items.length ? '<p class="pp-sum' + (Math.abs(sum - 100) > 0.001 ? ' bad' : '') + '" id="pp-sum">合計 ' + Math.round(sum * 100) / 100 + '%' + (Math.abs(sum - 100) > 0.001 ? '（要等於 100%）' : ' ✓') + '</p>' : '<p class="muted">還沒有股東，按下面「＋ 新增股東」</p>');
  $('pp-save').disabled = !ST.pp.dirty;
  $('pp-save').textContent = ST.pp.dirty ? '儲存股東' : '沒有變更';
}
function ppSet(i, k, v) {
  ST.pp.items[i][k] = v; ST.pp.dirty = true; $('pp-save').disabled = false; $('pp-save').textContent = '儲存股東';
  if (k === 'pct') { var sum = ST.pp.items.reduce(function (a, p) { return a + (Number(p.pct) || 0); }, 0), el = $('pp-sum'), bad = Math.abs(sum - 100) > 0.001;
    if (el) { el.className = 'pp-sum' + (bad ? ' bad' : ''); el.textContent = '合計 ' + Math.round(sum * 100) / 100 + '%' + (bad ? '（要等於 100%）' : ' ✓'); } }
}
function ppMove(i, d) { var j = i + d; if (j < 0 || j >= ST.pp.items.length) return; var t = ST.pp.items[i]; ST.pp.items[i] = ST.pp.items[j]; ST.pp.items[j] = t; ST.pp.dirty = true; renderPartnerEditor(); }
function ppDel(i) { if (!confirm('刪除股東「' + (ST.pp.items[i].name || '') + '」？\n（以前記的分紅還在）')) return; ST.pp.items.splice(i, 1); ST.pp.dirty = true; renderPartnerEditor(); }
function ppAdd() {
  ST.pp.items.push({ name: '', pct: '' }); ST.pp.dirty = true; renderPartnerEditor();
  var rows = $('pp-list').querySelectorAll('.pp-row'); rows[rows.length - 1].querySelector('input').focus();
}
function ppSave() {
  var bad = '', items = ST.pp.items.map(function (p) { var pct = Number(String(p.pct).replace('%', '')); if (isNaN(pct)) bad = p.name; return { name: String(p.name || '').trim(), pct: pct || 0 }; }).filter(function (p) { return p.name; });
  if (bad) return toast(bad + ' 的比例看不懂，請打數字');
  var names = items.map(function (p) { return p.name; });
  var dup = names.filter(function (n, i) { return names.indexOf(n) !== i; })[0];
  if (dup) return toast('名字重複：' + dup);
  var sum = items.reduce(function (a, p) { return a + p.pct; }, 0);
  if (items.length && Math.abs(sum - 100) > 0.001 && !confirm('比例加起來是 ' + sum + '%，不是 100%，還是要儲存嗎？')) return;
  enqueue('partners.set', { items: items });
  ST.snap.config.partners = items.map(function (p) { return { store: ST.sess.store, name: p.name, pct: p.pct }; });
  LS.set(k_('snap'), ST.snap);
  ST.pp = null; renderDefaults();
  toast('股東已儲存 ✓');
}

function renderCatEditor() {
  if (!isAdmin()) return;
  if (!ST.ce || ST.ce.store !== ST.sess.store) {
    ST.ce = { store: ST.sess.store, dirty: false, items: (ST.snap.config.categories || []).map(function (c) { return { cat: c.cat, from: c.from || '', to: c.to || '' }; }) };
  }
  $('ce-list').innerHTML = ST.ce.items.map(function (c, i) {
    return '<div class="ce-row' + (c.to && c.to <= todayStr().slice(0, 7) ? ' off' : '') + '"><input value="' + esc(c.cat) + '" placeholder="分類名稱" oninput="ceSet(' + i + ',\'cat\',this.value)">' +
      (c.to || c.editTo ? '<input type="month" value="' + esc(c.to) + '" title="從這個月開始不用（清空＝一直用）" onchange="ceSet(' + i + ',\'to\',this.value,true)">'
        : '<button class="ghost ce-stop" onclick="ceStop(' + i + ')">一直用</button>') +
      '<button class="pe-mv" onclick="ceMove(' + i + ',-1)" aria-label="上移">↑</button><button class="pe-mv" onclick="ceMove(' + i + ',1)" aria-label="下移">↓</button>' +
      '<button class="danger del-x" aria-label="刪除" title="刪除" onclick="ceDel(' + i + ')">✕</button></div>';
  }).join('') || '<p class="muted">還沒有分類，按下面「＋ 新增分類」</p>';
  $('ce-save').disabled = !ST.ce.dirty;
  $('ce-save').textContent = ST.ce.dirty ? '儲存進貨分類' : '沒有變更';
}
function ceSet(i, k, v, redraw) { ST.ce.items[i][k] = v; ST.ce.dirty = true; if (redraw) renderCatEditor(); else { $('ce-save').disabled = false; $('ce-save').textContent = '儲存進貨分類'; } }
function ceStop(i) {
  ST.ce.items[i].editTo = true; renderCatEditor();
  var inp = $('ce-list').querySelectorAll('.ce-row')[i].querySelector('input[type=month]');
  if (inp) { inp.focus(); try { inp.showPicker(); } catch (e) { /* 舊瀏覽器沒有 showPicker */ } }
}
function ceMove(i, d) { var j = i + d; if (j < 0 || j >= ST.ce.items.length) return; var t = ST.ce.items[i]; ST.ce.items[i] = ST.ce.items[j]; ST.ce.items[j] = t; ST.ce.dirty = true; renderCatEditor(); }
function ceDel(i) {
  if (!confirm('刪除分類「' + (ST.ce.items[i].cat || '') + '」？\n（以前的進貨紀錄還在；只是不再用的話，建議填「停用月份」就好）')) return;
  ST.ce.items.splice(i, 1); ST.ce.dirty = true; renderCatEditor();
}
function ceAdd() {
  ST.ce.items.push({ cat: '', from: '', to: '' }); ST.ce.dirty = true; renderCatEditor();
  var rows = $('ce-list').querySelectorAll('.ce-row'); rows[rows.length - 1].querySelector('input').focus();
}
function ceSave() {
  var items = ST.ce.items.map(function (c) { return { cat: String(c.cat || '').trim(), from: c.from || '', to: c.to || '' }; }).filter(function (c) { return c.cat; });
  var names = items.map(function (c) { return c.cat; });
  var dup = names.filter(function (n, i) { return names.indexOf(n) !== i; })[0];
  if (dup) return toast('分類重複：' + dup);
  enqueue('categories.set', { items: items });
  ST.snap.config.categories = items.map(function (c) { return { store: ST.sess.store, cat: c.cat, from: c.from, to: c.to }; });
  LS.set(k_('snap'), ST.snap);
  ST.ce = null; renderDefaults();
  toast('進貨分類已儲存 ✓');
}

function renderSettingsTab() {
  renderPresetEditor();
  renderDefaults();
  applyFont();
  if (!ST.swVersion && navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('version');
  $('set-info').innerHTML =
    '帳號：<b>' + esc(ST.sess.account) + '</b>（' + (ROLE_NAMES[myRole()] || '店長') + '）<br>' +
    '可用的店：' + esc((ST.sess.stores || [ST.sess.store]).join('、')) + '｜目前：<b>' + esc(ST.sess.store) + '</b><br>' +
    'App 版本：' + APP_VERSION + (ST.swVersion && ST.swVersion !== APP_VERSION ? '（離線快取 ' + esc(ST.swVersion) + '）' : '') + '<br>' +
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
