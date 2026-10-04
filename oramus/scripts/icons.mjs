import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage();
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: 'public/' + name, omitBackground: false });
}
await b.close();

// iOS (Capacitor) assets: opaque 1024 app icon + dark splash
if (process.argv.includes('--ios')) {
  const b2 = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const q = await b2.newPage();
  await q.setViewportSize({ width: 1024, height: 1024 });
  await q.setContent(`<html><body style="margin:0;background:#000">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
  await q.screenshot({ path: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' });
  await q.setViewportSize({ width: 2732, height: 2732 });
  await q.setContent(`<html><body style="margin:0;background:#000;display:grid;place-items:center;height:2732px">${svg.replace('<svg ', '<svg width="360" height="360" style="border-radius:80px" ')}</body></html>`);
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await q.screenshot({ path: 'ios/App/App/Assets.xcassets/Splash.imageset/' + f });
  await b2.close();
}
