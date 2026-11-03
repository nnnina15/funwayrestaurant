// 「⑤ 更新程式」：從 GitHub Pages 下載 → 你確認 → 存進指令碼屬性 → App／選單直接用新版（不需要 Apps Script API、不用重新部署）
const assert = require('assert'), fs = require('fs'), path = require('path');
const { createGas } = require('./gas-mock.js');
const D = path.join(__dirname, '..', '..', 'docs');
const CODE = fs.readFileSync(path.join(D, 'gas', 'Code.gs'), 'utf8');
const CUR = CODE.match(/const SERVER_VERSION = '([^']+)'/)[1];
function setup(opts) {
  const g = createGas(), calls = [], alerts = [];
  const newVer = opts.version || '9.9.9';
  const code = CODE.replace(/const SERVER_VERSION = '[^']+'/, "const SERVER_VERSION = '" + newVer + "'")
    .replace("function doPost(e) {", "function doPost(e) { if (JSON.parse(e.postData.contents).action === 'whoami') return ContentService.createTextOutput(JSON.stringify({ ok: true, v: SERVER_VERSION }));");
  const site = { 'gas/version.json': JSON.stringify({ version: newVer, notes: '測試更新' }), 'gas/Code.gs': opts.badCode ? opts.badCode : code,
    'compute.js': fs.readFileSync(path.join(D, 'compute.js'), 'utf8') };
  const base = opts.pagesAtRoot ? 'https://nnnina15.github.io/funwayrestaurant/' : 'https://nnnina15.github.io/funwayrestaurant/docs/';
  g.ctx.UrlFetchApp = { fetch(url, o) {
    const u = url.replace(/[?&]t=\d+$/, ''); calls.push(u);
    if (opts.noPerm) throw new Error('你沒有呼叫「UrlFetchApp.fetch」的權限。必要權限：https://www.googleapis.com/auth/script.external_request');
    const ok = u.startsWith(base) && site[u.slice(base.length)] !== undefined;
    return { getResponseCode: () => (ok ? 200 : 404), getContentText: () => (ok ? site[u.slice(base.length)] : 'nf') };
  } };
  g.ctx.SpreadsheetApp.getUi = () => ({ Button: { OK: 'OK', CANCEL: 'CANCEL' }, ButtonSet: { OK_CANCEL: 1, OK: 0 },
    alert(...a) { alerts.push(a.join('｜')); return opts.cancel ? 'CANCEL' : 'OK'; }, createMenu() { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; } });
  return { g, calls, alerts };
}

// 1. 正常更新：存進屬性；之後 App 的請求用的是新版
let t = setup({});
t.g.ctx.updateProgram();
assert.ok(/9\.9\.9/.test(t.alerts[0]) && /測試更新/.test(t.alerts[0]), '先顯示版本與說明讓你確認');
assert.ok(/更新完成/.test(t.alerts[1]), t.alerts[1]);
assert.strictEqual(t.g.props.FW_BUNDLE_VER, '9.9.9');
assert.ok(Object.keys(t.g.props).filter(k => /^FW_BUNDLE_\d+$/.test(k)).length === Number(t.g.props.FW_BUNDLE_N), '分段存好');
// 新的一次執行（模擬 App 連進來）：要用新版
const g2 = t.g; const fresh = createGas(); Object.assign(fresh.props, g2.props); fresh.ctx.resetBundleCache_();
const r = fresh.ctx.doPost({ postData: { contents: JSON.stringify({ action: 'whoami' }) } });
assert.deepStrictEqual(JSON.parse(r.content), { ok: true, v: '9.9.9' }, 'App 連進來直接用新版，不用重新部署');
// 一般功能也走新版（登入）
fresh.sheets['設定_帳號'] || fresh.ctx.setup();
const login = fresh.post({ action: 'login', account: '管理員', pin: 'x' });
assert.ok(login && login.ok === false, '新版也能正常回應');
// 2. 根目錄發布也抓得到
t = setup({ pagesAtRoot: true }); t.g.ctx.updateProgram(); assert.ok(/更新完成/.test(t.alerts[1]), '根目錄發布也抓得到');
// 3. 你按取消：什麼都不變
t = setup({ cancel: true }); t.g.ctx.updateProgram(); assert.ok(!t.g.props.FW_BUNDLE_VER, '按取消不會換');
// 4. 下載的程式壞掉／不完整：不換
t = setup({ badCode: "const SERVER_VERSION = '9.9.9'; function compileBundle_(){} function doPost( {" }); t.g.ctx.updateProgram();
assert.ok(/沒有更新/.test(t.alerts[1]) && !t.g.props.FW_BUNDLE_VER, '壞掉的程式不換：' + t.alerts[1]);
t = setup({ badCode: 'oops' }); t.g.ctx.updateProgram(); assert.ok(/不完整/.test(t.alerts[1]) && !t.g.props.FW_BUNDLE_VER);
// 5. 沒有新版：不動
t = setup({ version: '1.0.0' }); t.g.ctx.updateProgram(); assert.ok(/已經是最新版/.test(t.alerts[0]) && t.calls.length === 1 && !t.g.props.FW_BUNDLE_VER);
// 6. 還沒授權連外：說明怎麼授權
t = setup({ noPerm: true }); t.g.ctx.updateProgram(); assert.ok(/需要先授權/.test(t.alerts[0]) && !/連不到 GitHub/.test(t.alerts[0]), t.alerts[0]);
// 7. 存的版本比內建舊（例如之後手動貼了更新的 Code.gs）：用內建的
const g3 = createGas(); g3.props.FW_BUNDLE_VER = '1.0.0'; g3.props.FW_BUNDLE_N = '1'; g3.props.FW_BUNDLE_0 = 'throw new Error("不該載入")'; g3.ctx.resetBundleCache_();
g3.ctx.setup(); g3.sheets['設定_帳號'].cells[1][4] = 'Funway#2026';
assert.strictEqual(g3.post({ action: 'login', account: '管理員', pin: 'Funway#2026', newPin: 'Admin#2026x' }).config.serverVersion, CUR, '舊的存檔不用');
// 8. 存的新版壞掉：自動用內建版本，App 照常
const g4 = createGas(); g4.props.FW_BUNDLE_VER = '99.0.0'; g4.props.FW_BUNDLE_N = '1'; g4.props.FW_BUNDLE_0 = 'function ( {'; g4.ctx.resetBundleCache_();
g4.ctx.setup(); g4.sheets['設定_帳號'].cells[1][4] = 'Funway#2026';
assert.strictEqual(g4.post({ action: 'login', account: '管理員', pin: 'Funway#2026', newPin: 'Admin#2026x' }).config.serverVersion, CUR, '新版壞掉就用內建');
console.log('⑤ 更新程式 ✓');
