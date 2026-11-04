// 內建同步網址：新裝置直接到登入；存了舊網址的裝置自動換成內建；自己改過的保留；畫面上看不到內建網址
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const DOCS = path.join(__dirname, '..', '..', 'docs');
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(DOCS, p); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(s); });
(async () => {
  await new Promise(r => srv.listen(8790, r)); const b = await chromium.launch();
  const open = async (saved) => {
    const ctx = await b.newContext(); await ctx.route('https://script.google.com/**', r => r.abort());
    const pg = await ctx.newPage();
    if (saved) { await pg.goto('http://localhost:8790/index.html?x'); await pg.evaluate(c => localStorage.setItem('fw_cfg', JSON.stringify(c)), saved); }
    await pg.goto('http://localhost:8790/'); await pg.waitForSelector('#login-acc:visible');
    const cfg = await pg.evaluate(() => JSON.parse(localStorage.getItem('fw_cfg')));
    const def = await pg.evaluate(() => DEFAULT_URL);
    return { pg, ctx, cfg, def };
  };
  let r = await open(null);
  assert.ok(/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(r.def), '內建網址解得出來');
  assert.strictEqual(r.cfg.url, r.def, '新裝置直接用內建網址'); assert.ok(!r.cfg.custom);
  await r.pg.click('text=修改同步網址'); assert.strictEqual(await r.pg.inputValue('#cfg-url'), '', '畫面上不顯示內建網址');
  assert.ok(!(await r.pg.content()).includes(r.def), '頁面原始碼裡也找不到內建網址');
  await r.ctx.close();
  r = await open({ url: 'https://script.google.com/macros/s/OLD/exec', device: 'x' });
  assert.strictEqual(r.cfg.url, r.def, '存了舊網址的裝置自動換成內建'); await r.ctx.close();
  r = await open({ url: 'https://script.google.com/macros/s/MINE/exec', device: 'x', custom: true });
  assert.strictEqual(r.cfg.url, 'https://script.google.com/macros/s/MINE/exec', '自己改過的網址保留'); await r.ctx.close();
  const src = fs.readFileSync(path.join(DOCS, 'app.js'), 'utf8');
  assert.ok(!/macros\/s\/AK/.test(src), '程式碼裡沒有網址原文');
  console.log('內建同步網址 ✓');
  await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
