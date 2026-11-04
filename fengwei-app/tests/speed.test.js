// 登入時不要一直讀「指令碼屬性」（Apps Script 每讀一次都很慢）：PIN 加密 500 圈只能讀一次
const assert = require('assert');
const { createGas } = require('./gas-mock.js');
const g = createGas(); g.ctx.setup();
g.sheets['設定_帳號'].cells[1][4] = 'Funway#2026';
const first = g.post({ action: 'login', account: '管理員', pin: 'Funway#2026', newPin: 'Admin#2026x' });
assert.ok(first.ok, '第一次登入（設新 PIN）');
const P = g.ctx.PropertiesService, orig = P.getScriptProperties;
let reads = 0;
P.getScriptProperties = () => { const p = orig(); return Object.assign({}, p, { getProperty: (k) => { reads++; return p.getProperty(k); }, getProperties: () => { reads++; return p.getProperties(); } }); };
const again = g.post({ action: 'login', account: '管理員', pin: 'Admin#2026x' });
assert.ok(again.ok, '舊的 PIN 照樣能登入（加密結果沒變）');
assert.ok(reads < 20, '一次登入只能讀幾次設定，實際讀了 ' + reads + ' 次');
const bad = g.post({ action: 'login', account: '管理員', pin: 'Wrong#2026x' });
assert.ok(!bad.ok, '錯的 PIN 不能登入');
console.log('登入速度 ✓（讀設定 ' + reads + ' 次）');
