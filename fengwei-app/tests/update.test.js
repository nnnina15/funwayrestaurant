// 「⑤ 更新程式」：從 GitHub Pages 下載 → 換掉 Code、compute、appsscript（其他檔案不動）→ 建新版本 → 更新網頁應用程式部署
const assert = require('assert'), fs = require('fs'), path = require('path');
const { createGas } = require('./gas-mock.js');
const D = path.join(__dirname, '..', '..', 'docs');
function run(opts) {
  const g = createGas(), calls = [], alerts = [];
  let newVer = opts.version || '9.9.9';
  const code = fs.readFileSync(path.join(D, 'gas', 'Code.gs'), 'utf8').replace(/const SERVER_VERSION = '[^']+'/, "const SERVER_VERSION = '" + newVer + "'");
  const site = { 'gas/version.json': JSON.stringify({ version: newVer, notes: '測試更新' }), 'gas/Code.gs': opts.badCode ? 'oops' : code,
    'compute.js': fs.readFileSync(path.join(D, 'compute.js'), 'utf8'), 'gas/appsscript.json': fs.readFileSync(path.join(D, 'gas', 'appsscript.json'), 'utf8') };
  const project = [{ name: 'Code', type: 'SERVER_JS', source: 'function doPost(e) {}' }, { name: 'compute', type: 'SERVER_JS', source: 'function computeAll_() {}' },
    { name: 'appsscript', type: 'JSON', source: '{}' }, { name: '我的筆記', type: 'SERVER_JS', source: '// keep' }];
  const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  g.ctx.UrlFetchApp = { fetch(url, o) {
    o = o || {}; calls.push([(o.method || 'get').toUpperCase(), url.replace(/\?t=\d+$/, '')]);
    const pages = opts.pagesAtRoot ? 'https://nnnina15.github.io/funwayrestaurant/' : 'https://nnnina15.github.io/funwayrestaurant/docs/';
    if (url.startsWith('https://nnnina15.github.io/')) { const p = url.replace(/\?t=\d+$/, ''); return p.startsWith(pages) && site[p.slice(pages.length)] !== undefined ? resp(200, site[p.slice(pages.length)]) : resp(404, 'nf'); }
    if (opts.apiOff) return resp(403, { error: { message: 'User has not enabled the Apps Script API.' } });
    const p = url.split('/projects/SID')[1];
    if (p === '/content' && o.method === 'get') return resp(200, { files: project });
    if (p === '/content' && o.method === 'put') { project.splice(0, project.length, ...JSON.parse(o.payload).files); return resp(200, {}); }
    if (p === '/versions') return resp(200, { versionNumber: 7 });
    if (p === '/deployments' && o.method === 'get') return resp(200, { deployments: [
      { deploymentId: 'HEADID', deploymentConfig: {}, entryPoints: [{ entryPointType: 'WEB_APP' }] },
      { deploymentId: 'WEB1', deploymentConfig: { versionNumber: 3 }, entryPoints: [{ entryPointType: 'WEB_APP' }] }] });
    if (p === '/deployments/WEB1' && o.method === 'put') { assert.strictEqual(JSON.parse(o.payload).deploymentConfig.versionNumber, 7); return resp(200, {}); }
    throw new Error('unexpected ' + url);
  } };
  g.ctx.ScriptApp.getScriptId = () => 'SID'; g.ctx.ScriptApp.getOAuthToken = () => 'TOKEN';
  const ui = { Button: { OK: 'OK', CANCEL: 'CANCEL' }, ButtonSet: { OK_CANCEL: 1, OK: 0 }, alert(...a) { alerts.push(a.join('｜')); return 'OK' } };
  g.ctx.SpreadsheetApp.getUi = () => ui;
  g.ctx.updateProgram();
  return { calls, alerts, project };
}
let r = run({});
assert.ok(r.alerts[0].includes('9.9.9') && r.alerts[0].includes('測試更新'), '先顯示版本與說明讓你確認');
assert.ok(/更新完成/.test(r.alerts[1]), r.alerts[1]);
assert.ok(r.project.find(f => f.name === 'Code').source.includes("SERVER_VERSION = '9.9.9'"));
assert.ok(r.project.find(f => f.name === 'compute').source.includes('function computeAll_'));
assert.ok(r.project.find(f => f.name === 'appsscript').source.includes('script.projects'));
assert.strictEqual(r.project.find(f => f.name === '我的筆記').source, '// keep', '其他檔案不動');
assert.ok(r.calls.some(c => c[0] === 'PUT' && c[1].endsWith('/deployments/WEB1')) && !r.calls.some(c => c[1].endsWith('/deployments/HEADID')), '只更新正式部署');
r = run({ pagesAtRoot: true }); assert.ok(/更新完成/.test(r.alerts[1]), '根目錄發布也抓得到');
r = run({ apiOff: true }); assert.ok(/usersettings/.test(r.alerts[1]) && r.project[0].source === 'function doPost(e) {}', 'API 沒開：提示怎麼開，程式不動');
r = run({ badCode: true }); assert.ok(/不完整/.test(r.alerts[1]) && r.project[0].source === 'function doPost(e) {}', '下載不完整：不換');
r = run({ version: '1.0.0' }); assert.ok(/已經是最新版/.test(r.alerts[0]) && r.calls.length === 1, '沒有新版就不動');
console.log('⑤ 更新程式 ✓');
