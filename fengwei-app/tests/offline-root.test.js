// 瀏覽器測試：GitHub Pages 用根目錄發布時，網址離線也打得開（需要 Playwright）
// 模擬 GitHub Pages 用「根目錄」發布：/funwayrestaurant/ → 轉到 /funwayrestaurant/docs/；斷網後再打開同一個網址
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/funwayrestaurant/, ''); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(s); });
(async () => {
  await new Promise(r => srv.listen(8771, r)); const b = await chromium.launch(); const ctx = await b.newContext(); const pg = await ctx.newPage();
  await pg.goto('http://localhost:8771/funwayrestaurant/'); await pg.waitForURL(/\/docs\//); await pg.waitForSelector('#login-acc');   // 內建同步網址：直接到登入畫面
  await pg.waitForTimeout(1500);

  await ctx.setOffline(true);
  await pg.goto('http://localhost:8771/funwayrestaurant/'); await pg.waitForURL(/\/docs\//, { timeout: 8000 }); await pg.waitForSelector('#login-acc', { timeout: 8000 });
  console.log('根目錄網址離線也打得開 ✓', pg.url());
  await b.close(); srv.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
