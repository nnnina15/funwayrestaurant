// docs/gas 要和 fengwei-app 的 Code.gs、appsscript.json 一模一樣（不然「⑤ 更新程式」會裝到舊版）
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..'), G = path.join(R, '..', 'docs', 'gas');
assert.strictEqual(fs.readFileSync(path.join(G, 'Code.gs'), 'utf8'), fs.readFileSync(path.join(R, 'Code.gs'), 'utf8'), '請執行 node fengwei-app/publish-gas.js');
assert.strictEqual(fs.readFileSync(path.join(G, 'appsscript.json'), 'utf8'), fs.readFileSync(path.join(R, 'appsscript.json'), 'utf8'), '請執行 node fengwei-app/publish-gas.js');
const v = JSON.parse(fs.readFileSync(path.join(G, 'version.json'), 'utf8'));
assert.ok(fs.readFileSync(path.join(R, 'Code.gs'), 'utf8').includes("const SERVER_VERSION = '" + v.version + "'"), 'version.json 版本要和 Code.gs 一樣');
const app = fs.readFileSync(path.join(R, '..', 'docs', 'app.js'), 'utf8');
assert.strictEqual(app.match(/var NEED_SERVER = '([^']+)'/)[1], v.version, 'App 的 NEED_SERVER 要和 Code.gs 的 SERVER_VERSION 一樣');
const av = app.match(/var APP_VERSION = '([^']+)'/)[1];
assert.strictEqual(fs.readFileSync(path.join(R, '..', 'docs', 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1], av, 'sw.js 的 VERSION 要和 APP_VERSION 一樣');
assert.strictEqual(fs.readFileSync(path.join(R, '..', 'docs', 'index.html'), 'utf8').match(/name="app-version" content="([^"]+)"/)[1], av, 'index.html 的 app-version 要和 APP_VERSION 一樣');
console.log('docs/gas 同步 ✓', v.version);
