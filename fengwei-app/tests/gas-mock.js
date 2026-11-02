// 在 Node 裡模擬 Google Apps Script（試算表、權杖…），用來測 Code.gs + compute.gs
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeSheet(name) {
  const sh = { name, cells: [], maxRows: 1000, maxCols: 30 };
  const lastRow = () => { for (let r = sh.cells.length; r > 0; r--) if ((sh.cells[r - 1] || []).some(v => v !== '' && v !== undefined)) return r; return 0; };
  sh.getLastRow = lastRow;
  sh.getMaxRows = () => sh.maxRows;
  sh.getMaxColumns = () => sh.maxCols;
  sh.setFrozenRows = () => {};
  sh.deleteRow = (r) => { sh.cells.splice(r - 1, 1); };
  sh.getRange = (r, c, nr = 1, nc = 1) => {
    const rg = {
      setValues(vals) { vals.forEach((row, i) => { const rr = r - 1 + i; sh.cells[rr] = sh.cells[rr] || []; row.forEach((v, j) => { sh.cells[rr][c - 1 + j] = v; }); }); return rg; },
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (sh.cells[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; },
      clearContent() { for (let i = 0; i < nr; i++) { const row = sh.cells[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } return rg; },
      setNumberFormat() { return rg; }, setFontWeight() { return rg; }, setBackground() { return rg; }
    };
    return rg;
  };
  return sh;
}

function createGas() {
  const sheets = {};
  const props = {};
  const cache = {};
  const mails = [];
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => { delete sheets[s.name]; }
  };
  const fmt = (d, tz, f) => {
    const t = new Date(d.getTime() + 8 * 3600 * 1000); // Asia/Taipei
    const p = (x) => String(x).padStart(2, '0');
    return f.replace('yyyy', t.getUTCFullYear()).replace('MM', p(t.getUTCMonth() + 1)).replace('dd', p(t.getUTCDate()))
      .replace('HH', p(t.getUTCHours())).replace('mm', p(t.getUTCMinutes())).replace('ss', p(t.getUTCSeconds()));
  };
  const ctx = {
    console, Date, JSON, Math, Object, Array, String, Number, isFinite, Error,
    SpreadsheetApp: { getActive: () => ss, getUi: () => ({ alert() {}, createMenu() { const m = { addItem: () => m, addToUi: () => m }; return m; } }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => { const t = { timeBased: () => t, everyDays: () => t, atHour: () => t, create: () => t }; return t; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache[k] === undefined ? null : cache[k]), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    MailApp: { sendEmail: (o) => { mails.push(o); }, getRemainingDailyQuota: () => 100 },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: fmt,
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
      base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    }
  };
  vm.createContext(ctx);
  const root = path.join(__dirname, '..', '..');
  vm.runInContext(fs.readFileSync(path.join(root, 'docs', 'compute.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'fengwei-app', 'Code.gs'), 'utf8') + '\nthis.__S=S;this.__rows=rows_;', ctx);
  ctx.setup();
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).content);
  return { ctx, post, sheets, mails, rows: (n) => ctx.__rows(n) };
}

module.exports = { createGas };
