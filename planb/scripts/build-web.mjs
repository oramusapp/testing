// Buduje statyczną wersję demo (bez serwera) do katalogu demo/ – np. pod GitHub Pages.
// Uruchom: npm run build:web
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(ROOT, 'demo')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT)

const copy = (from, to = path.basename(from)) => fs.copyFileSync(path.join(ROOT, from), path.join(OUT, to))
for (const f of fs.readdirSync(path.join(ROOT, 'public'))) copy(path.join('public', f))
for (const f of ['domain.js', 'plans.js', 'demo.js', 'app.js']) copy(path.join('src', f))
for (const f of ['crypto.js', 'store.js', 'local.js']) copy(path.join('web', f))

// Każda strona najpierw ładuje „serwer w przeglądarce”.
for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.html'))) {
  const file = path.join(OUT, f)
  const html = fs.readFileSync(file, 'utf8')
  if (!html.includes('<script type="module" src="./')) throw new Error('Brak skryptu modułu w ' + f)
  fs.writeFileSync(file, html.replace('<script type="module" src="./', '<script type="module" src="./local.js"></script>\n<script type="module" src="./'))
}
fs.writeFileSync(path.join(OUT, 'README.txt'), 'Plik wygenerowany przez `npm run build:web` z public/, src/ i web/. Nie edytuj ręcznie.\n')
console.log('Zbudowano wersję przeglądarkową w', OUT)
