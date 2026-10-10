// Rdzeń aplikacji niezależny od transportu: trasy API, uwierzytelnianie tokenem, zegar.
// Używa go serwer Node (src/server.js) i wersja przeglądarkowa demo (web/local.js),
// więc obie wersje działają na tym samym kodzie.
import * as D from './domain.js'
import { seedDemo } from './demo.js'

export function createApp({ store, demo = false, allowSignup = true, keySource = '', log = () => {} }) {
  const DEMO = demo
  const ALLOW_SIGNUP = allowSignup
  const now = () => Date.now() + (DEMO ? store.data.clockOffsetMs || 0 : 0)

  // Miejsce podłączenia prawdziwej bramki SMS / push / połączeń głosowych (patrz README).
  function deliver(msg) {
    store.data.outbox.unshift(msg)
    if (store.data.outbox.length > 2000) store.data.outbox.length = 2000
    if (DEMO) log(`  [symulowany SMS → ${msg.toName}] ${msg.text}`)
  }
  const ctx = () => ({ data: store.data, now: now(), deliver })

  function seedIfEmpty() {
    if (DEMO && !Object.keys(store.data.accounts).length) {
      store.data.demo = seedDemo(ctx())
      store.save()
    }
  }

  // Zegar: eskalacje, okna anulowania, check-in, przypomnienia.
  function tickAll() {
    const c = ctx()
    for (const acc of Object.values(store.data.accounts)) {
      const before = JSON.stringify(acc)
      try { D.tick(c, acc) } catch (e) { console.error('Błąd zegara dla konta', acc.id, e) }
      if (JSON.stringify(acc) !== before) store.changed(acc.id)
    }
  }

  // Ograniczenie prób (zgadywanie tokenów, nadużycia karty QR).
  const hits = new Map()
  function limited(key, max, windowMs) {
    const t = Date.now()
    const arr = (hits.get(key) || []).filter(x => t - x < windowMs)
    arr.push(t)
    hits.set(key, arr)
    return arr.length > max
  }
  const clearLimits = () => hits.clear()

  // ---------- trasy ----------
  const routes = []
  const route = (method, pattern, auth, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, handler })

  const ownerName = 'właściciel'

  route('GET', '/api/info', null, () => ({ demo: DEMO, signup: ALLOW_SIGNUP, now: now(), keySource }))
  route('POST', '/api/accounts', null, ({ body, c }) => {
    if (!ALLOW_SIGNUP) throw new D.HttpError(403, 'Zakładanie planów jest wyłączone')
    const { acc, ownerToken } = D.createAccount(c, { ownerName: body.ownerName, ownerPhone: body.ownerPhone })
    return { accountId: acc.id, ownerLink: `owner.html#t=${ownerToken}`, _changed: acc.id }
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
    return DEMO ? { link: `contact.html#t=${token}` } : { sent: true }
  })
  route('POST', '/api/owner/tasks', 'owner', ({ acc, c, body }) => D.upsertTask(c, acc, null, body).id)
  route('PUT', '/api/owner/tasks/:id', 'owner', ({ acc, c, body, p }) => D.upsertTask(c, acc, p.id, body).id)
  route('DELETE', '/api/owner/tasks/:id', 'owner', ({ acc, c, p }) => D.deleteTask(c, acc, p.id))
  route('PUT', '/api/owner/checkin', 'owner', ({ acc, c, body }) => D.updateCheckin(c, acc, body))
  route('POST', '/api/owner/checkin/ok', 'owner', ({ acc, c }) => D.checkinOk(c, acc))
  route('POST', '/api/owner/cancel', 'owner', ({ acc, c }) => D.cancelPending(c, acc, ownerName))
  route('POST', '/api/owner/end', 'owner', ({ acc, c }) => D.endActivation(c, acc, D.openActivation(acc), ownerName, 'właściciel wrócił / zakończył plan'))
  route('POST', '/api/owner/drill', 'owner', ({ acc, c }) => D.startDrill(c, acc).id)
  route('GET', '/api/owner/card', 'owner', ({ acc }) => ({ link: `k.html#t=${D.cardToken(acc)}`, firstName: D.cardView(acc).firstName, phone: acc.owner.phone }))
  route('POST', '/api/owner/card/rotate', 'owner', ({ acc, c }) => ({ link: `k.html#t=${D.rotateCard(c, acc)}` }))

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

  function authenticate(token, kind, ip) {
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

  // Do kanału „na żywo”: konto, którego zmiany może obserwować posiadacz tokenu.
  function streamKey(token, ip, all) {
    if (DEMO && all) return '*'
    const entry = D.resolveToken(store.data, token)
    if (!entry || entry.kind === 'card') {
      if (limited('auth:' + ip, 30, 10 * 60 * 1000)) throw new D.HttpError(429, 'Zbyt wiele nieudanych prób')
      throw new D.HttpError(401, 'Brak dostępu')
    }
    return entry.accountId
  }

  // Jedno wywołanie API. Rzuca D.HttpError; zwraca obiekt do wysłania jako JSON.
  async function dispatch(method, pathname, token, body, ip) {
    for (const r of routes) {
      const m = pathname.match(r.re)
      if (!m || r.method !== method) continue
      const args = { p: m.groups || {}, ip, c: ctx(), body: body || {} }
      if (r.auth === 'demo') { if (!DEMO) throw new D.HttpError(404, 'Niedostępne poza trybem demo') }
      else if (r.auth) Object.assign(args, authenticate(token, r.auth, ip))
      const result = await r.handler(args)
      if (method !== 'GET') {
        const accId = args.acc?.id || result?._changed
        if (accId) {
          D.tick(ctx(), store.data.accounts[accId])
          store.changed(accId)
        } else store.save()
      }
      if (result && typeof result === 'object') delete result._changed
      return result === undefined ? { ok: true } : typeof result === 'object' ? result : { id: result }
    }
    throw new D.HttpError(404, 'Nie znaleziono')
  }

  return { ctx, now, seedIfEmpty, tickAll, dispatch, streamKey, clearLimits }
}
