// 把 Code.gs、appsscript.json 複製到 docs/gas/（GitHub Pages 會發布），「⑤ 更新程式」從那裡下載
// 改完 Code.gs 後執行：node fengwei-app/publish-gas.js
const fs = require('fs'), path = require('path');
const src = __dirname, out = path.join(__dirname, '..', 'docs', 'gas');
fs.mkdirSync(out, { recursive: true });
const code = fs.readFileSync(path.join(src, 'Code.gs'), 'utf8');
const ver = code.match(/const SERVER_VERSION = '([^']+)'/)[1], notes = code.match(/const SERVER_NOTES = '([^']*)'/)[1];
fs.writeFileSync(path.join(out, 'Code.gs'), code);
fs.copyFileSync(path.join(src, 'appsscript.json'), path.join(out, 'appsscript.json'));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version: ver, notes: notes }, null, 2) + '\n');
if (require.main === module) console.log('docs/gas 已更新：' + ver);
module.exports = { ver };
