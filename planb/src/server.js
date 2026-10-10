// Serwer HTTP Planu B – bez zależności zewnętrznych (tylko Node.js ≥ 20).
// Uruchom: node src/server.js [--demo]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './store.js'
import { initKey } from './crypto.js'
import * as D from './domain.js'
import { seedDemo } from './demo.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PUBLIC = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT) || 3000
const DEMO = process.env.PLANB_DEMO === '1' || process.argv.includes('--demo')
const DATA_DIR = process.env.PLANB_DATA_DIR || path.join(ROOT, 'data')
const ALLOW_SIGNUP = process.env.PLANB_ALLOW_SIGNUP !== '0'

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
const keySource = initKey(DATA_DIR)
const store = new Store(path.join(DATA_DIR, DEMO ? 'demo.json' : 'store.json'))
const now = () => Date.now() + (DEMO ? store.data.clockOffsetMs || 0 : 0)

// Miejsce podłączenia prawdziwej bramki SMS / push / połączeń głosowych (patrz README).
function deliver(msg) {
  store.data.outbox.unshift(msg)
  if (store.data.outbox.length > 2000) store.data.outbox.length = 2000
  if (DEMO) console.log(`  [symulowany SMS → ${msg.toName}] ${msg.text}`)
}
const ctx = () => ({ data: store.data, now: now(), deliver })

if (DEMO && !Object.keys(store.data.accounts).length) {
  store.data.demo = seedDemo(ctx())
  store.save()
}

// ---------- czas rzeczywisty (SSE) ----------
const subscribers = new Map() // accountId -> Set<res>
store.onChange = accountId => {
  for (const res of subscribers.get(accountId) || []) res.write(`event: change\ndata: ${Date.now()}\n\n`)
  for (const res of subscribers.get('*') || []) res.write(`event: change\ndata: ${Date.now()}\n\n`)
}

// ---------- zegar: eskalacje, okna, check-in ----------
function tickAll() {
  const c = ctx()
  for (const acc of Object.values(store.data.accounts)) {
    const before = JSON.stringify(acc)
    try { D.tick(c, acc) } catch (e) { console.error('Błąd zegara dla konta', acc.id, e) }
    if (JSON.stringify(acc) !== before) store.changed(acc.id)
  }
}
setInterval(tickAll, 5000)
tickAll()

// ---------- ograniczenie prób (zgadywanie tokenów, nadużycia karty QR) ----------
const hits = new Map()
function limited(key, max, windowMs) {
  const t = Date.now()
  const arr = (hits.get(key) || []).filter(x => t - x < windowMs)
  arr.push(t)
  hits.set(key, arr)
  return arr.length > max
}
setInterval(() => hits.clear(), 60 * 60 * 1000)

// ---------- trasy ----------
const routes = []
const route = (method, pattern, auth, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, handler })

const ownerName = 'właściciel'

route('GET', '/api/info', null, () => ({ demo: DEMO, signup: ALLOW_SIGNUP, now: now(), keySource }))
route('POST', '/api/accounts', null, ({ body, c }) => {
  if (!ALLOW_SIGNUP) throw new D.HttpError(403, 'Zakładanie planów jest wyłączone')
  const { acc, ownerToken } = D.createAccount(c, { ownerName: body.ownerName, ownerPhone: body.ownerPhone })
  return { accountId: acc.id, ownerLink: `/owner.html#t=${ownerToken}`, _changed: acc.id }
})

// właściciel
route('GET', '/api/owner', 'owner', ({ acc, c }) => D.ownerView(acc, c.now))
route('PUT', '/api/owner/profile', 'owner', ({ acc, c, body }) => D.updateOwner(c, acc, body))
route('PUT', '/api/owner/settings', 'owner', ({ acc, c, body }) => D.updateSettings(c, acc, body))
route('PUT', '/api/owner/tier', 'owner', ({ acc, c, body }) => D.setTier(c, acc, body.tier))
route('POST', '/api/owner/review', 'owner', ({ acc, c }) => D.markReviewed(c, acc))
route('POST', '/api/owner/wards', 'owner', ({ acc, c, body }) => D.upsertWard(c, acc, null, body).id)
route('PUT', '/api/owner/wards/:id', 'owner', ({ acc, c, body, p }) => D.upsertWard(c, acc, p.id, body).id)
route('DELETE', '/api/owner/wards/:id', 'owner', ({ acc, c, p }) => D.deleteWard(c, acc, p.id))
route('POST', '/api/owner/contacts', 'owner', ({ acc, c, body }) => D.upsertContact(c, acc, null, body).id)
route('PUT', '/api/owner/contacts/:id', 'owner', ({ acc, c, body, p }) => D.upsertContact(c, acc, p.id, body).id)
route('DELETE', '/api/owner/contacts/:id', 'owner', ({ acc, c, p }) => D.deleteContact(c, acc, p.id))
route('POST', '/api/owner/contacts/:id/invite', 'owner', ({ acc, c, p }) => {
  const token = D.inviteContact(c, acc, p.id)
  // Link zwracamy właścicielowi tylko w demo (normalnie idzie wyłącznie SMS-em do tej osoby).
  return DEMO ? { link: `/contact.html#t=${token}` } : { sent: true }
})
route('POST', '/api/owner/tasks', 'owner', ({ acc, c, body }) => D.upsertTask(c, acc, null, body).id)
route('PUT', '/api/owner/tasks/:id', 'owner', ({ acc, c, body, p }) => D.upsertTask(c, acc, p.id, body).id)
route('DELETE', '/api/owner/tasks/:id', 'owner', ({ acc, c, p }) => D.deleteTask(c, acc, p.id))
route('PUT', '/api/owner/checkin', 'owner', ({ acc, c, body }) => D.updateCheckin(c, acc, body))
route('POST', '/api/owner/checkin/ok', 'owner', ({ acc, c }) => D.checkinOk(c, acc))
route('POST', '/api/owner/cancel', 'owner', ({ acc, c }) => D.cancelPending(c, acc, ownerName))
route('POST', '/api/owner/end', 'owner', ({ acc, c }) => D.endActivation(c, acc, D.openActivation(acc), ownerName, 'właściciel wrócił / zakończył plan'))
route('POST', '/api/owner/drill', 'owner', ({ acc, c }) => D.startDrill(c, acc).id)
route('GET', '/api/owner/card', 'owner', ({ acc }) => ({ link: `/k.html#t=${D.cardToken(acc)}`, firstName: D.cardView(acc).firstName, phone: acc.owner.phone }))
route('POST', '/api/owner/card/rotate', 'owner', ({ acc, c }) => ({ link: `/k.html#t=${D.rotateCard(c, acc)}` }))

// zaufana osoba
route('GET', '/api/contact', 'contact', ({ acc, me, c }) => D.contactView(acc, me, c.now))
route('POST', '/api/contact/role', 'contact', ({ acc, me, c, body }) => D.respondRole(c, acc, me, !!body.accept))
route('POST', '/api/contact/confirm-details', 'contact', ({ acc, me, c }) => D.confirmContactDetails(c, acc, me))
route('POST', '/api/contact/trigger', 'contact', ({ acc, me, c, body }) => {
  if (me.status !== 'accepted' || !me.canTrigger) throw new D.HttpError(403, 'Nie masz uprawnienia do uruchamiania planu')
  D.trigger(c, acc, { source: 'contact', actorId: me.id, actorName: me.name, detail: body.reason })
})
route('POST', '/api/contact/confirm', 'contact', ({ acc, me, c }) => D.confirmPending(c, acc, me))
route('POST', '/api/contact/cancel', 'contact', ({ acc, me, c }) => {
  if (me.status !== 'accepted' || !me.canTrigger) throw new D.HttpError(403, 'Nie masz uprawnienia')
  D.cancelPending(c, acc, me.name)
})
route('POST', '/api/contact/end', 'contact', ({ acc, me, c }) => {
  if (me.status !== 'accepted' || !me.canTrigger) throw new D.HttpError(403, 'Nie masz uprawnienia')
  const act = D.openActivation(acc)
  if (act?.kind === 'drill') throw new D.HttpError(403, 'Ćwiczenie kończy właściciel')
  D.endActivation(c, acc, act, me.name, `zakończone przez ${me.name}`)
})
route('POST', '/api/contact/instances/:id/reveal', 'contact', ({ acc, me, c, p }) => D.revealSecrets(c, acc, me, p.id))
route('POST', '/api/contact/instances/:id/:action', 'contact', ({ acc, me, c, p }) => D.instanceAction(c, acc, me, p.id, p.action))

// karta QR (osoba obca, np. personel SOR) – widzi tylko imię i może zgłosić
route('GET', '/api/card', 'card', ({ acc }) => D.cardView(acc))
route('POST', '/api/card/report', 'card', ({ acc, c, body, ip }) => {
  if (limited('qr:' + ip, 5, 60 * 60 * 1000)) throw new D.HttpError(429, 'Zbyt wiele zgłoszeń z tego urządzenia. Spróbuj później lub zadzwoń pod numer alarmowy.')
  return D.cardReport(c, acc, body)
})

// tylko demo: symulacja upływu czasu i skrzynka wysłanych wiadomości
route('GET', '/api/demo', 'demo', () => ({ links: store.data.demo, now: now(), offsetMin: Math.round((store.data.clockOffsetMs || 0) / D.MIN) }))
route('GET', '/api/demo/outbox', 'demo', () => store.data.outbox.slice(0, 200))
route('POST', '/api/demo/advance', 'demo', ({ body }) => {
  const minutes = Math.max(1, Math.min(24 * 60, Number(body.minutes) || 0))
  for (let i = 0; i < minutes; i++) { store.data.clockOffsetMs = (store.data.clockOffsetMs || 0) + D.MIN; tickAll() }
  store.changed('*')
  return { now: now() }
})

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
    req.on('data', ch => { size += ch.length; if (size > 200_000) { reject(new D.HttpError(413, 'Za duże dane')); req.destroy() } else chunks.push(ch) })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new D.HttpError(400, 'Niepoprawny JSON')) }
    })
    req.on('error', reject)
  })
}

function authenticate(req, kind, ip) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const entry = D.resolveToken(store.data, token)
  if (!entry || entry.kind !== kind) {
    if (limited('auth:' + ip, 30, 10 * 60 * 1000)) throw new D.HttpError(429, 'Zbyt wiele nieudanych prób')
    throw new D.HttpError(401, 'Link jest nieprawidłowy lub wygasł. Poproś o nowy.')
  }
  const acc = store.data.accounts[entry.accountId]
  if (!acc) throw new D.HttpError(401, 'Plan nie istnieje')
  const me = entry.contactId ? D.contactById(acc, entry.contactId) : null
  if (kind === 'contact' && !me) throw new D.HttpError(401, 'Ta osoba została usunięta z planu')
  return { acc, me }
}

async function handleApi(req, res, url, ip) {
  if (url.pathname === '/api/stream') return stream(req, res, url, ip)
  for (const r of routes) {
    const m = url.pathname.match(r.re)
    if (!m || r.method !== req.method) continue
    const args = { p: m.groups || {}, ip, c: ctx() }
    if (r.auth === 'demo') { if (!DEMO) throw new D.HttpError(404, 'Niedostępne poza trybem demo') }
    else if (r.auth) Object.assign(args, authenticate(req, r.auth, ip))
    if (req.method !== 'GET') args.body = await readBody(req)
    const result = await r.handler(args)
    if (req.method !== 'GET') {
      const accId = args.acc?.id || result?._changed
      if (accId) {
        const acc = store.data.accounts[accId]
        D.tick(ctx(), acc)
        store.changed(accId)
      } else store.save()
    }
    if (result && typeof result === 'object') delete result._changed
    return json(res, 200, result === undefined ? { ok: true } : typeof result === 'object' ? result : { id: result })
  }
  throw new D.HttpError(404, 'Nie znaleziono')
}

// Strumień zmian na żywo. Token w nagłówku (fetch), a nie w URL – nie trafia do logów.
function stream(req, res, url, ip) {
  let key
  if (DEMO && url.searchParams.get('all') === '1') key = '*'
  else {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const entry = D.resolveToken(store.data, token)
    if (!entry || entry.kind === 'card') {
      if (limited('auth:' + ip, 30, 10 * 60 * 1000)) throw new D.HttpError(429, 'Zbyt wiele nieudanych prób')
      throw new D.HttpError(401, 'Brak dostępu')
    }
    key = entry.accountId
  }
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
    if (!(e instanceof D.HttpError)) console.error(e)
    if (!res.headersSent) json(res, e.status || 500, { error: e instanceof D.HttpError ? e.message : 'Błąd serwera' })
  }
})

server.listen(PORT, () => {
  console.log(`Plan B działa: http://localhost:${PORT}  ${DEMO ? '(TRYB DEMO – symulowany czas i SMS-y)' : ''}`)
  if (keySource === 'file') console.log('UWAGA: klucz szyfrujący w data/key.bin (tylko prototyp). W produkcji ustaw PLANB_KEY z menedżera sekretów.')
  if (DEMO) console.log(`Otwórz http://localhost:${PORT}/ – na stronie startowej są linki do wszystkich ról.`)
})
