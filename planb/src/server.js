// Serwer HTTP Planu B – bez zależności zewnętrznych (tylko Node.js ≥ 20).
// Uruchom: node src/server.js [--demo]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './store.js'
import { initKey } from './crypto.js'
import { HttpError } from './domain.js'
import { createApp } from './app.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PUBLIC = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT) || 3000
const DEMO = process.env.PLANB_DEMO === '1' || process.argv.includes('--demo')
const DATA_DIR = process.env.PLANB_DATA_DIR || path.join(ROOT, 'data')
const ALLOW_SIGNUP = process.env.PLANB_ALLOW_SIGNUP !== '0'

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
const keySource = initKey(DATA_DIR)
const store = new Store(path.join(DATA_DIR, DEMO ? 'demo.json' : 'store.json'))
const app = createApp({ store, demo: DEMO, allowSignup: ALLOW_SIGNUP, keySource, log: console.log })
app.seedIfEmpty()

// ---------- czas rzeczywisty (SSE) ----------
const subscribers = new Map() // accountId -> Set<res>
store.onChange = accountId => {
  for (const res of subscribers.get(accountId) || []) res.write(`event: change\ndata: ${Date.now()}\n\n`)
  for (const res of subscribers.get('*') || []) res.write(`event: change\ndata: ${Date.now()}\n\n`)
}

setInterval(app.tickAll, 5000)
app.tickAll()
setInterval(app.clearLimits, 60 * 60 * 1000)

// ---------- obsługa żądań ----------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS })
  res.end(JSON.stringify(obj ?? { ok: true }))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', ch => { size += ch.length; if (size > 200_000) { reject(new HttpError(413, 'Za duże dane')); req.destroy() } else chunks.push(ch) })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new HttpError(400, 'Niepoprawny JSON')) }
    })
    req.on('error', reject)
  })
}

const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '')

async function handleApi(req, res, url, ip) {
  if (url.pathname === '/api/stream') return stream(req, res, url, ip)
  const body = req.method === 'GET' ? {} : await readBody(req)
  json(res, 200, await app.dispatch(req.method, url.pathname, bearer(req), body, ip))
}

// Strumień zmian na żywo. Token w nagłówku (fetch), a nie w URL – nie trafia do logów.
function stream(req, res, url, ip) {
  const key = app.streamKey(bearer(req), ip, url.searchParams.get('all') === '1')
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...SECURITY_HEADERS })
  res.write('event: hello\ndata: 1\n\n')
  if (!subscribers.has(key)) subscribers.set(key, new Set())
  subscribers.get(key).add(res)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => { clearInterval(ping); subscribers.get(key)?.delete(res) })
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname)
  if (p === '/') p = '/index.html'
  const file = path.normalize(path.join(PUBLIC, p))
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS })
    return res.end('Nie znaleziono')
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const ip = req.socket.remoteAddress || '?'
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url, ip)
    else serveStatic(req, res, url)
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e)
    if (!res.headersSent) json(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Błąd serwera' })
  }
})

server.listen(PORT, () => {
  console.log(`Plan B działa: http://localhost:${PORT}  ${DEMO ? '(TRYB DEMO – symulowany czas i SMS-y)' : ''}`)
  if (keySource === 'file') console.log('UWAGA: klucz szyfrujący w data/key.bin (tylko prototyp). W produkcji ustaw PLANB_KEY z menedżera sekretów.')
  if (DEMO) console.log(`Otwórz http://localhost:${PORT}/ – na stronie startowej są linki do wszystkich ról.`)
})
