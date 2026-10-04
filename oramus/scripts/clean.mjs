// Removes the previous build from the repository root (the PWA is served from there)
// without touching sources, git metadata or this project folder.
import { rmSync, readdirSync } from 'fs';
const root = new URL('../../', import.meta.url).pathname;
const keep = new Set(['.git', '.github', 'oramus', 'README.md', '.gitignore', 'docs']);
for (const f of readdirSync(root)) {
  if (keep.has(f)) continue;
  if (/^(index\.html|sw\.js|workbox-.*\.js|manifest\.webmanifest|registerSW\.js|assets|icon.*|apple-touch-icon\.png)$/.test(f)) rmSync(root + f, { recursive: true, force: true });
}
