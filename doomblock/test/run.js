// Test: podstawia fałszywe strony instagram.com / tiktok.com i wstrzykuje content.js.
// Uruchom: node test/run.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');

const page404 = (title, extra = '') => `<!doctype html><html><head><title>${title}</title></head><body>
<nav><a id="home" href="/">Home</a><a id="reels" href="/reels/">Reels</a><a id="fy" href="/foryou">For You</a></nav>
<video id="v" src="data:," autoplay muted></video>${extra}
<button id="spa" onclick="history.pushState({},'', '/')">spa-home</button>
<button id="spaReels" onclick="history.pushState({},'', '/reels/abc/')">spa-reels</button>
</body></html>`;

let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route(/instagram\.com|tiktok\.com/, r => r.fulfill({ contentType: 'text/html', body: page404(new URL(r.request().url()).pathname) }));
  await ctx.addInitScript(script);
  const p = await ctx.newPage();
  const vis = async sel => p.locator(sel).isVisible();
  const overlay = () => p.locator('#doomblock-overlay').count();

  // Instagram
  await p.goto('https://www.instagram.com/reels/xyz/'); await p.waitForTimeout(500);
  ok(new URL(p.url()).pathname === '/', 'IG /reels/xyz -> przekierowanie na /  (' + p.url() + ')');
  ok(!(await vis('#reels')), 'IG link do Rolek ukryty');
  ok(await vis('#home'), 'IG link Home widoczny');
  ok((await p.locator('#doomblock-badge').count()) === 1, 'Plakietka "DoomBlock aktywny" widoczna');
  await p.click('#spaReels'); await p.waitForTimeout(900);
  ok(new URL(p.url()).pathname === '/', 'IG nawigacja SPA do /reels -> przekierowanie (' + p.url() + ')');
  await p.evaluate(() => {
    const mk = (id, html) => { const a = document.createElement('article'); a.id = id; a.innerHTML = html; document.body.appendChild(a); };
    mk('photo', '<img src="data:,"><a href="/p/XYZ/">post</a>');
    mk('reelvid', '<video src="data:,"></video>');
    mk('reellink', '<a href="/reel/QWE/">reel</a>');
  });
  await p.waitForTimeout(900);
  ok(await vis('#photo'), 'IG feed: zwykły post widoczny');
  ok(!(await vis('#reelvid')) && !(await vis('#reellink')), 'IG feed: rolki ukryte');
  await p.goto('https://www.instagram.com/reel/ABC123/'); await p.waitForTimeout(500);
  ok(p.url().includes('/reel/ABC123'), 'IG pojedyncza rolka /reel/<id> dozwolona');
  await p.goto('https://www.instagram.com/direct/inbox/'); await p.waitForTimeout(500);
  ok(p.url().includes('/direct/inbox'), 'IG wiadomości dozwolone');

  // TikTok
  await p.goto('https://www.tiktok.com/'); await p.waitForTimeout(500);
  ok((await overlay()) === 1, 'TT strona główna zablokowana (overlay)');
  ok(await p.evaluate(() => document.getElementById('v').paused), 'TT wideo zatrzymane');
  ok(!(await vis('#fy')), 'TT link For You ukryty');
  await p.goto('https://www.tiktok.com/en/foryou'); await p.waitForTimeout(500);
  ok((await overlay()) === 1, 'TT /en/foryou zablokowane');
  await p.goto('https://www.tiktok.com/@someone/video/7234567890123'); await p.waitForTimeout(500);
  ok((await overlay()) === 0, 'TT pojedynczy film dozwolony');
  await p.goto('https://www.tiktok.com/@someone'); await p.waitForTimeout(500);
  ok((await overlay()) === 0, 'TT profil dozwolony');
  await p.click('#spa'); await p.waitForTimeout(900);
  ok((await overlay()) === 1, 'TT nawigacja SPA na / -> overlay');
  await p.evaluate(() => history.pushState({}, '', '/search?q=x')); await p.waitForTimeout(900);
  ok((await overlay()) === 0, 'TT po przejściu na /search overlay znika');

  // Inna strona – skrypt nic nie robi
  await ctx.route(/example\.org/, r => r.fulfill({ contentType: 'text/html', body: page404('x') }));
  await p.goto('https://example.org/reels/'); await p.waitForTimeout(400);
  ok(p.url().includes('/reels/') && await vis('#reels'), 'Inne domeny nietknięte');

  await browser.close();
  console.log(failed ? `\n${failed} FAIL` : '\nWszystkie testy OK');
  process.exit(failed ? 1 : 0);
})();
