import { chromium, devices } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: 'dark' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForSelector('.hero', { timeout: 60000 });
await p.click('.tabbar button:nth-child(3)'); await p.waitForTimeout(2000);
await p.fill('.screen:visible .hero input', '10000'); await p.press('.screen:visible .hero input', 'Enter'); await p.waitForTimeout(500);
await p.click('text=utwórz oba portfele'); await p.waitForTimeout(800);
// seed synthetic history (test only) to render the performance chart and a monthly report
await p.evaluate(async () => {
  const open = indexedDB.open('oramus');
  const db = await new Promise((r) => (open.onsuccess = () => r(open.result)));
  const tx = db.transaction('kv', 'readwrite'); const st = tx.objectStore('kv');
  const snaps = []; let v = 10000, btc = 76000, t = Date.now() - 60 * 864e5;
  for (let i = 0; i < 60; i++) { const d = new Date(Date.UTC(2026, 3, 1) + i * 864e5).toISOString().slice(0, 10); v *= 1 + Math.sin(i / 6) * 0.01 + 0.002; btc *= 1 + Math.sin(i / 5) * 0.015; snaps.push({ date: d, time: t + i * 864e5, total: v, sdca: v * 0.6, rsps: v * 0.4, stable: v * 0.4, btcPrice: btc }); }
  st.put(snaps, 'portfolio.snapshots');
  await new Promise((r) => (tx.oncomplete = r));
});
await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('.tabbar'); await p.click('.tabbar button:nth-child(3)'); await p.waitForTimeout(2500);
await p.evaluate(() => { const el = [...document.querySelectorAll('.section-title')].find(e => e.textContent.includes('Wyniki')); const sc = el.closest('.screen'); sc.scrollTo(0, el.getBoundingClientRect().top + sc.scrollTop - 110); });
await p.waitForTimeout(500); await p.screenshot({ path: out + '/p1.png' });
await p.click('.list-item >> nth=1'); await p.waitForTimeout(500); await p.screenshot({ path: out + '/p2.png' });
console.log(errs);
await b.close();
