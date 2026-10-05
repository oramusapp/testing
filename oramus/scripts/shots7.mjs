import { chromium, devices } from 'playwright-core';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: 'dark' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await p.waitForSelector('.tabbar');
await p.click('.tabbar button:nth-child(2)'); await p.waitForTimeout(1500);
await p.click('button:has-text("Makro")'); await p.waitForTimeout(500);
const inputs = p.locator('.sheet input[inputmode="decimal"]');
const vals = ['0,5', '-1.75', '1', '0.25'];
for (let i = 0; i < 4; i++) { await inputs.nth(i).fill(vals[i]); await inputs.nth(i).press('Enter'); }
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelector('.sheet').scrollTo(0, 650));
await p.waitForTimeout(300); await p.screenshot({ path: out + '/m1.png' });
console.log(errs);
await b.close();
