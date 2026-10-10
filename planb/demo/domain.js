// Logika Planu B: konto, zadania i kolejki, uruchamianie, eskalacja, dostępy czasowe,
// codzienny check-in, próbny alarm i kontrola aktualności danych.
// Wszystkie funkcje dostają ctx = { data, now, deliver } – dzięki temu czas da się
// symulować (tryb demo, testy), a wysyłkę wiadomości podmienić na prawdziwą bramkę.
import { enc, dec, newToken, hashToken, newId } from './crypto.js'
import { features } from './plans.js'

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
const LATE_WINDOW = 4 * HOUR // zadanie z dzisiejszą godziną jest jeszcze robione „dziś”, jeśli minęło < 4 h
const QUEUE_SLOTS = 3

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const pad = n => String(n).padStart(2, '0')
export const dateKeyOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const localAt = (dateKey, hhmm) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [h, mi] = (hhmm || '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, h, mi).getTime()
}
export const addDays = (dateKey, n) => { const [y, m, d] = dateKey.split('-').map(Number); return dateKeyOf(new Date(y, m - 1, d + n, 12).getTime()) }
export const hhmm = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export const DEFAULT_SETTINGS = {
  ackTimeoutMin: 20,       // ile czeka się na potwierdzenie przejęcia zadania
  cancelWindowMin: 15,     // okno na anulowanie (zgłoszenie przez zaufaną osobę / brak check-inu)
  qrCancelWindowMin: 30,   // dłuższe okno dla zgłoszenia z karty QR (zgłasza osoba obca)
  accessLeadMin: 60,       // ile przed godziną zadania wydawany jest dostęp (kod, dawkowanie)
  accessGraceMin: 180,     // ile po godzinie zadania (lub przejęciu) dostęp jeszcze działa
  staleDays: 180,          // po ilu dniach dane uznajemy za nieaktualne
  drillIntervalDays: 182,  // co ile dni przypominać o próbnym alarmie
  emergencyNoteEnc: '',    // co robić, gdy nikt nie przejmie zadania (szyfrowane)
  cardRevealIce: true,     // czy po zgłoszeniu z karty QR pokazać telefon pierwszej zaufanej osoby
}

export const SOURCE_LABEL = { contact: 'zaufana osoba', qr: 'karta QR (np. personel SOR)', checkin: 'brak codziennego „jestem OK”', owner: 'właściciel planu' }
const STATE_DONE = new Set(['accepted', 'done', 'uncovered'])

// ---------- pomocnicze ----------

function str(v, max, field, required = false) {
  const s = (v ?? '').toString().trim()
  if (required && !s) throw new HttpError(400, `Pole „${field}” jest wymagane`)
  if (s.length > max) throw new HttpError(400, `Pole „${field}” jest za długie (max ${max})`)
  return s
}
function time(v) {
  const s = str(v, 5, 'godzina', true)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, 'Godzina w formacie GG:MM, np. 15:00')
  return s
}
const int = (v, lo, hi, field) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${field}: liczba od ${lo} do ${hi}`)
  return n
}

export const contactById = (acc, id) => acc.contacts.find(c => c.id === id)
const ward = (acc, id) => acc.wards.find(w => w.id === id)

function audit(ctx, acc, actor, action, detail = '') {
  acc.audit.unshift({ at: ctx.now, actor, action, detail })
  if (acc.audit.length > 1000) acc.audit.length = 1000
}

function hist(ctx, inst, contactId, event, note = '') {
  inst.history.push({ at: ctx.now, contactId, event, note })
}

// Wiadomość do właściciela lub zaufanej osoby. W prototypie trafia do symulowanej skrzynki
// (ctx.deliver); link zawiera osobisty token odbiorcy, więc nie trzeba logowania.
function send(ctx, acc, to, text, { drill = false } = {}) {
  const isOwner = to === 'owner'
  const tokenEnc = isOwner ? acc.owner.tokenEnc : to.tokenEnc
  const msg = {
    id: newId(), at: ctx.now, accountId: acc.id,
    to: isOwner ? 'owner' : to.id,
    toName: isOwner ? acc.owner.name : to.name,
    toPhone: isOwner ? acc.owner.phone : to.phone,
    channel: 'sms', drill,
    text: (drill ? '[ĆWICZENIE] ' : '') + text,
    link: tokenEnc ? `${isOwner ? 'owner' : 'contact'}.html#t=${dec(tokenEnc)}` : null,
  }
  ctx.deliver(msg)
  acc.messages.unshift({ at: ctx.now, toName: msg.toName, text: msg.text })
  if (acc.messages.length > 300) acc.messages.length = 300
}

function issueToken(ctx, entry) {
  const t = newToken()
  ctx.data.tokens[hashToken(t)] = entry
  return t
}
function revokeTokenEnc(ctx, tokenEnc) {
  if (tokenEnc) delete ctx.data.tokens[hashToken(dec(tokenEnc))]
}
export const resolveToken = (data, t) => (t ? data.tokens[hashToken(t)] || null : null)

// ---------- konto ----------

export function createAccount(ctx, { ownerName, ownerPhone, tier = 'free' }) {
  const acc = {
    id: newId(), createdAt: ctx.now, tier, orgId: null,
    owner: { name: str(ownerName, 80, 'imię i nazwisko', true), phone: str(ownerPhone, 30, 'telefon', true), tokenEnc: '' },
    settings: { ...DEFAULT_SETTINGS },
    wards: [], contacts: [], tasks: [], activations: [],
    checkin: { enabled: false, time: '09:00', graceMin: 120, lastOkAt: null, remindedFor: null, triggeredFor: null, pausedUntil: null },
    audit: [], messages: [], remind: {},
    lastReviewedAt: ctx.now, lastDrillAt: null, cardTokenEnc: '', cardReports: [],
  }
  const ownerToken = issueToken(ctx, { kind: 'owner', accountId: acc.id })
  acc.owner.tokenEnc = enc(ownerToken)
  acc.cardTokenEnc = enc(issueToken(ctx, { kind: 'card', accountId: acc.id }))
  ctx.data.accounts[acc.id] = acc
  audit(ctx, acc, 'właściciel', 'Utworzono plan')
  return { acc, ownerToken }
}

export function rotateCard(ctx, acc) {
  revokeTokenEnc(ctx, acc.cardTokenEnc)
  acc.cardTokenEnc = enc(issueToken(ctx, { kind: 'card', accountId: acc.id }))
  audit(ctx, acc, 'właściciel', 'Unieważniono starą kartę QR i wydano nową')
  return dec(acc.cardTokenEnc)
}
export const cardToken = acc => dec(acc.cardTokenEnc)

export function updateOwner(ctx, acc, body) {
  acc.owner.name = str(body.name, 80, 'imię i nazwisko', true)
  acc.owner.phone = str(body.phone, 30, 'telefon', true)
  audit(ctx, acc, 'właściciel', 'Zmieniono dane właściciela')
}

export function updateSettings(ctx, acc, b) {
  const S = acc.settings
  S.ackTimeoutMin = int(b.ackTimeoutMin, 5, 240, 'Czas na potwierdzenie')
  S.cancelWindowMin = int(b.cancelWindowMin, 0, 120, 'Okno anulowania')
  S.qrCancelWindowMin = int(b.qrCancelWindowMin, 5, 180, 'Okno anulowania (karta QR)')
  S.accessLeadMin = int(b.accessLeadMin, 0, 24 * 60, 'Dostęp przed zadaniem')
  S.accessGraceMin = int(b.accessGraceMin, 15, 24 * 60, 'Dostęp po zadaniu')
  S.emergencyNoteEnc = enc(str(b.emergencyNote, 2000, 'co robić, gdy nikt nie przejmie'))
  S.cardRevealIce = !!b.cardRevealIce
  audit(ctx, acc, 'właściciel', 'Zmieniono ustawienia')
}

export function setTier(ctx, acc, tier) {
  if (!['free', 'family', 'b2b'].includes(tier)) throw new HttpError(400, 'Nieznany pakiet')
  acc.tier = tier
  if (!features(acc).checkin) acc.checkin.enabled = false
  audit(ctx, acc, 'właściciel', 'Zmiana pakietu (symulacja)', tier)
}

export function markReviewed(ctx, acc) {
  acc.lastReviewedAt = ctx.now
  audit(ctx, acc, 'właściciel', 'Potwierdzono aktualność planu')
}

// ---------- podopieczni ----------

export function upsertWard(ctx, acc, id, b) {
  let w = id ? ward(acc, id) : null
  if (id && !w) throw new HttpError(404, 'Nie ma takiego podopiecznego')
  if (!w) {
    if (acc.wards.length >= features(acc).maxWards) throw new HttpError(402, `Pakiet „${features(acc).label}” obejmuje maksymalnie ${features(acc).maxWards} podopiecznych.`)
    w = { id: newId() }
    acc.wards.push(w)
  }
  w.name = str(b.name, 60, 'imię', true)
  w.kind = ['child', 'senior', 'pet', 'other'].includes(b.kind) ? b.kind : 'other'
  w.notesEnc = enc(str(b.notes, 4000, 'informacje'))
  audit(ctx, acc, 'właściciel', id ? 'Zmieniono podopiecznego' : 'Dodano podopiecznego', w.name)
  return w
}

export function deleteWard(ctx, acc, id) {
  if (acc.tasks.some(t => t.wardId === id)) throw new HttpError(409, 'Najpierw usuń lub przepnij zadania tego podopiecznego')
  acc.wards = acc.wards.filter(w => w.id !== id)
  audit(ctx, acc, 'właściciel', 'Usunięto podopiecznego')
}

// ---------- zaufane osoby i zaproszenia ----------

export function upsertContact(ctx, acc, id, b) {
  let c = id ? contactById(acc, id) : null
  if (id && !c) throw new HttpError(404, 'Nie ma takiej osoby')
  if (!c) {
    if (acc.contacts.length >= features(acc).maxContacts) throw new HttpError(402, `Pakiet „${features(acc).label}” obejmuje maksymalnie ${features(acc).maxContacts} zaufane osoby.`)
    c = { id: newId(), status: 'draft', tokenEnc: '', invitedAt: null, respondedAt: null, lastConfirmedAt: null, remindedAt: null }
    acc.contacts.push(c)
  }
  const phone = str(b.phone, 30, 'telefon', true)
  if (c.phone && c.phone !== phone && c.status === 'accepted') c.lastConfirmedAt = null // nowy numer = trzeba potwierdzić
  c.name = str(b.name, 80, 'imię', true)
  c.phone = phone
  c.relation = str(b.relation, 60, 'relacja')
  c.canTrigger = !!b.canTrigger
  audit(ctx, acc, 'właściciel', id ? 'Zmieniono zaufaną osobę' : 'Dodano zaufaną osobę', c.name)
  return c
}

export function deleteContact(ctx, acc, id) {
  const c = contactById(acc, id)
  if (!c) throw new HttpError(404, 'Nie ma takiej osoby')
  revokeTokenEnc(ctx, c.tokenEnc)
  acc.contacts = acc.contacts.filter(x => x.id !== id)
  for (const t of acc.tasks) t.queue = t.queue.filter(q => q !== id)
  audit(ctx, acc, 'właściciel', 'Usunięto zaufaną osobę (jej link przestał działać)', c.name)
}

// Zaproszenie: nowy osobisty link (stary przestaje działać). Osoba musi świadomie przyjąć rolę –
// bez tego nie dostaje zadań ani żadnych danych.
export function inviteContact(ctx, acc, id) {
  const c = contactById(acc, id)
  if (!c) throw new HttpError(404, 'Nie ma takiej osoby')
  revokeTokenEnc(ctx, c.tokenEnc)
  c.tokenEnc = enc(issueToken(ctx, { kind: 'contact', accountId: acc.id, contactId: c.id }))
  if (c.status !== 'accepted') c.status = 'invited'
  c.invitedAt = ctx.now
  const roles = acc.tasks.filter(t => t.queue.includes(c.id)).map(t => `${t.time} ${t.title}`)
  send(ctx, acc, c, `${acc.owner.name} prosi Cię o zgodę na bycie osobą zaufaną w swoim Planie B – na wypadek, gdyby nagle trafił(a) do szpitala lub zniknął(-ęła) bez kontaktu.` +
    (roles.length ? ` Chodzi o: ${roles.join('; ')}.` : '') + ' Zobacz szczegóły i potwierdź lub odmów:')
  audit(ctx, acc, 'właściciel', 'Wysłano zaproszenie', c.name)
  return dec(c.tokenEnc)
}

export function respondRole(ctx, acc, c, accept) {
  c.status = accept ? 'accepted' : 'declined'
  c.respondedAt = ctx.now
  if (accept) c.lastConfirmedAt = ctx.now
  audit(ctx, acc, c.name, accept ? 'Przyjęto rolę w planie' : 'Odmówiono udziału w planie')
  send(ctx, acc, 'owner', accept ? `${c.name} przyjął(-ęła) rolę w Twoim Planie B.` : `${c.name} odmówił(a) udziału w Twoim Planie B. Wyznacz inną osobę w kolejkach.`)
}

export function confirmContactDetails(ctx, acc, c) {
  if (c.status !== 'accepted') throw new HttpError(409, 'Najpierw przyjmij rolę')
  c.lastConfirmedAt = ctx.now
  audit(ctx, acc, c.name, 'Potwierdzono aktualność danych kontaktowych')
}

// ---------- zadania ----------

export function upsertTask(ctx, acc, id, b) {
  const F = features(acc)
  let t = id ? acc.tasks.find(x => x.id === id) : null
  if (id && !t) throw new HttpError(404, 'Nie ma takiego zadania')
  if (!t) {
    if (acc.tasks.length >= F.maxTasks) throw new HttpError(402, `Pakiet „${F.label}” obejmuje maksymalnie ${F.maxTasks} zadania. Pakiet rodzinny pozwala na więcej.`)
    t = { id: newId(), secrets: [], offline: [] }
    acc.tasks.push(t)
  }
  t.title = str(b.title, 120, 'zadanie', true)
  t.time = time(b.time)
  t.timeLabel = str(b.timeLabel, 40, 'opis pory')
  t.wardId = b.wardId && ward(acc, b.wardId) ? b.wardId : null
  t.instructionsEnc = enc(str(b.instructions, 4000, 'instrukcja'))
  const queue = []
  for (const q of b.queue || []) if (q && contactById(acc, q) && !queue.includes(q)) queue.push(q)
  t.queue = queue.slice(0, QUEUE_SLOTS)
  if (Array.isArray(b.secrets)) {
    const list = b.secrets.filter(s => s && (s.label || s.value))
    if (list.length && !F.timedAccess) throw new HttpError(402, 'Dostępy czasowe (kody, dawkowanie) są w pakiecie rodzinnym.')
    t.secrets = list.slice(0, 5).map(s => ({ id: s.id || newId(), label: str(s.label, 80, 'nazwa dostępu', true), valueEnc: enc(str(s.value, 2000, 'treść dostępu', true)) }))
  }
  if (Array.isArray(b.offline)) {
    t.offline = b.offline.filter(o => o && str(o.text, 300, 'sprawa do załatwienia')).slice(0, 10)
      .map(o => ({ text: str(o.text, 300, 'sprawa do załatwienia'), done: !!o.done }))
  }
  t.updatedAt = ctx.now
  audit(ctx, acc, 'właściciel', id ? 'Zmieniono zadanie' : 'Dodano zadanie', t.title)
  return t
}

export function deleteTask(ctx, acc, id) {
  acc.tasks = acc.tasks.filter(t => t.id !== id)
  audit(ctx, acc, 'właściciel', 'Usunięto zadanie')
}

// ---------- uruchomienie planu ----------

export const openActivation = acc => acc.activations.find(a => a.status === 'pending' || a.status === 'active') || null

export function trigger(ctx, acc, { source, actorId = null, actorName, detail = '' }) {
  const S = acc.settings
  const report = { at: ctx.now, source, actorId, actorName: str(actorName, 120, 'kto zgłasza') || SOURCE_LABEL[source], detail: str(detail, 500, 'opis') }
  let act = openActivation(acc)
  if (act && act.kind === 'drill') endActivation(ctx, acc, act, 'system', 'Przerwano ćwiczenie – zgłoszono prawdziwe uruchomienie')
  act = openActivation(acc)
  if (act) {
    act.reports.push(report)
    audit(ctx, acc, report.actorName, 'Kolejne zgłoszenie uruchomienia', report.detail)
    return act
  }
  const windowMin = source === 'qr' ? S.qrCancelWindowMin : S.cancelWindowMin
  act = { id: newId(), kind: 'real', source, status: 'pending', createdAt: ctx.now, activateAt: ctx.now + windowMin * MIN, activatedAt: null, endedAt: null, endedBy: null, endReason: '', reports: [report], instances: [] }
  acc.activations.unshift(act)
  audit(ctx, acc, report.actorName, `Zgłoszono uruchomienie planu (${SOURCE_LABEL[source]})`, report.detail)
  if (windowMin > 0) {
    send(ctx, acc, 'owner', `PLAN B: ${report.actorName} zgłasza uruchomienie Twojego planu (${SOURCE_LABEL[source]}${report.detail ? ': ' + report.detail : ''}). Jeśli wszystko w porządku – ANULUJ przed ${hhmm(act.activateAt)}:`)
    for (const c of acc.contacts) {
      if (c.status === 'accepted' && c.canTrigger && c.id !== actorId) {
        send(ctx, acc, c, `PLAN B (${acc.owner.name}): zgłoszono uruchomienie planu – ${SOURCE_LABEL[source]}${report.detail ? ': ' + report.detail : ''}. Uruchomi się sam o ${hhmm(act.activateAt)}. Jeśli wiesz, że to pomyłka – anuluj; jeśli potwierdzasz – uruchom od razu:`)
      }
    }
  }
  if (windowMin <= 0) activate(ctx, acc, act, 'od razu (okno anulowania = 0)')
  return act
}

export function confirmPending(ctx, acc, c) {
  const act = openActivation(acc)
  if (!act || act.status !== 'pending') throw new HttpError(409, 'Nie ma zgłoszenia czekającego na potwierdzenie')
  if (!c.canTrigger) throw new HttpError(403, 'Nie masz uprawnienia do uruchamiania planu')
  if (act.reports.some(r => r.actorId === c.id)) throw new HttpError(409, 'Zgłoszenie musi potwierdzić inna osoba niż zgłaszająca (albo zadziała po upływie okna).')
  activate(ctx, acc, act, `potwierdzone przez ${c.name}`)
}

export function cancelPending(ctx, acc, actorName) {
  const act = openActivation(acc)
  if (!act || act.status !== 'pending') throw new HttpError(409, 'Nie ma zgłoszenia do anulowania')
  act.status = 'cancelled'
  act.endedAt = ctx.now
  act.endedBy = actorName
  act.endReason = 'Anulowano w oknie bezpieczeństwa (fałszywy alarm)'
  audit(ctx, acc, actorName, 'Anulowano zgłoszenie uruchomienia planu')
  for (const c of acc.contacts) if (c.status === 'accepted' && c.canTrigger) send(ctx, acc, c, `PLAN B (${acc.owner.name}): zgłoszenie anulowane przez: ${actorName}. Plan NIE został uruchomiony.`)
  if (actorName !== 'właściciel') send(ctx, acc, 'owner', `Zgłoszenie uruchomienia Twojego Planu B anulował(a): ${actorName}.`)
}

function activate(ctx, acc, act, how) {
  act.status = 'active'
  act.activatedAt = ctx.now
  audit(ctx, acc, 'system', act.kind === 'drill' ? 'Rozpoczęto próbny alarm' : 'PLAN URUCHOMIONY', how)
  if (act.kind === 'real') {
    send(ctx, acc, 'owner', 'Twój Plan B został uruchomiony. Gdy wrócisz, zakończ plan – wszystkie dostępy wygasną:')
    for (const c of acc.contacts) {
      if (c.status === 'accepted' && c.canTrigger) send(ctx, acc, c, `PLAN B (${acc.owner.name}) jest AKTYWNY. Na żywo widzisz, kto co przejął:`)
    }
  }
  ensureInstances(ctx, acc, act)
}

export function endActivation(ctx, acc, act, actorName, reason) {
  if (!act || act.status !== 'active') throw new HttpError(409, 'Plan nie jest aktywny')
  act.status = 'ended'
  act.endedAt = ctx.now
  act.endedBy = actorName
  act.endReason = reason
  if (act.kind === 'drill') {
    acc.lastDrillAt = ctx.now
    act.report = drillReport(acc, act, ctx.now)
  }
  audit(ctx, acc, actorName, act.kind === 'drill' ? 'Zakończono próbny alarm' : 'Zakończono plan – wszystkie dostępy wygasły', reason)
  const involved = new Set(act.instances.flatMap(i => i.history.map(h => h.contactId)).filter(Boolean))
  for (const id of involved) {
    const c = contactById(acc, id)
    if (c) send(ctx, acc, c, act.kind === 'drill' ? `Dziękujemy – to był próbny alarm w Planie B (${acc.owner.name}). Twoja reakcja została zapisana.` : `PLAN B (${acc.owner.name}) zakończony (${reason}). Dostępy wygasły. Dziękujemy za pomoc.`, { drill: act.kind === 'drill' })
  }
  if (act.kind === 'drill') {
    const r = act.report
    send(ctx, acc, 'owner', `Próbny alarm zakończony: obsadzone ${r.covered}/${r.tasks.length} zadań, bez reakcji: ${r.silent.length ? r.silent.join(', ') : 'nikt'}. Szczegóły i lista nieaktualnych danych w aplikacji:`)
  }
}

// ---------- realizacja i eskalacja ----------

function ensureInstances(ctx, acc, act) {
  const today = dateKeyOf(ctx.now)
  for (const t of acc.tasks) {
    if (act.kind === 'drill') {
      if (!act.instances.some(i => i.taskId === t.id)) newInstance(ctx, acc, act, t, today)
      continue
    }
    let key = today
    if (localAt(today, t.time) < ctx.now - LATE_WINDOW) key = addDays(today, 1)
    if (!act.instances.some(i => i.taskId === t.id && i.dateKey === key)) newInstance(ctx, acc, act, t, key)
  }
}

function newInstance(ctx, acc, act, t, dateKey) {
  let queue = t.queue.slice()
  if (act.kind === 'real') {
    // ciągłość: kto zrobił to zadanie poprzednio, dostaje je jako pierwszy
    const prev = [...act.instances].reverse().find(i => i.taskId === t.id && i.acceptedBy)
    if (prev) queue = [prev.acceptedBy, ...queue.filter(x => x !== prev.acceptedBy)]
  }
  const inst = {
    id: newId(), taskId: t.id, title: t.title, wardId: t.wardId, time: t.time, timeLabel: t.timeLabel, dateKey,
    dueAt: act.kind === 'drill' ? null : localAt(dateKey, t.time),
    queue, idx: -1, state: 'offered', offeredTo: null, offeredAt: null, deadline: null,
    acceptedBy: null, acceptedAt: null, doneAt: null, declined: [], history: [], expiredNotified: false,
  }
  inst.late = !!inst.dueAt && inst.dueAt < ctx.now
  act.instances.push(inst)
  offerNext(ctx, acc, act, inst)
}

function whenText(ctx, inst) {
  if (!inst.dueAt) return inst.timeLabel || inst.time
  const today = dateKeyOf(ctx.now)
  const day = inst.dateKey === today ? 'dziś' : inst.dateKey === addDays(today, 1) ? 'jutro' : inst.dateKey
  return `${day} ${inst.time}${inst.timeLabel ? ' – ' + inst.timeLabel : ''}${inst.late ? ', JUŻ PO CZASIE' : ''}`
}

function ackWindow(acc, inst, now) {
  const base = acc.settings.ackTimeoutMin * MIN
  if (inst.dueAt && inst.dueAt > now && inst.dueAt - now < 2 * base) {
    // mało czasu do zadania: skracamy czekanie, żeby zdążyć zapytać kolejną osobę
    return Math.max(5 * MIN, Math.min(base, Math.floor((inst.dueAt - now) / 2)))
  }
  return base
}

function offerNext(ctx, acc, act, inst) {
  const drill = act.kind === 'drill'
  while (++inst.idx < inst.queue.length) {
    const c = contactById(acc, inst.queue[inst.idx])
    if (!c) { hist(ctx, inst, null, 'skipped', 'osoba usunięta z planu'); continue }
    if (c.status !== 'accepted') { hist(ctx, inst, c.id, 'skipped', 'nie przyjęła roli w planie'); continue }
    if (inst.declined.includes(c.id)) continue
    inst.state = 'offered'
    inst.offeredTo = c.id
    inst.offeredAt = ctx.now
    inst.deadline = ctx.now + ackWindow(acc, inst, ctx.now)
    hist(ctx, inst, c.id, 'offered')
    send(ctx, acc, c, `${drill ? '' : 'PILNE – '}Plan B (${acc.owner.name}): czy przejmiesz zadanie „${inst.title}” (${whenText(ctx, inst)})? Potwierdź do ${hhmm(inst.deadline)}, inaczej trafi do kolejnej osoby:`, { drill })
    return
  }
  inst.state = 'uncovered'
  inst.offeredTo = null
  inst.deadline = null
  hist(ctx, inst, null, 'uncovered', 'nikt z kolejki nie przejął zadania')
  audit(ctx, acc, 'system', 'Zadanie bez opiekuna – alarm do wszystkich zaufanych osób', inst.title)
  for (const c of acc.contacts) {
    if (c.status === 'accepted') send(ctx, acc, c, `${drill ? '' : 'ALARM – '}Plan B (${acc.owner.name}): nikt z kolejki nie przejął zadania „${inst.title}” (${whenText(ctx, inst)}). Jeśli możesz pomóc, przejmij je:`, { drill })
  }
  if (!drill) send(ctx, acc, 'owner', `Plan B: zadanie „${inst.title}” nie ma opiekuna – wysłano alarm do wszystkich zaufanych osób.`)
}

export function findInstance(acc, instId) {
  for (const act of acc.activations) {
    const inst = act.instances.find(i => i.id === instId)
    if (inst) return { act, inst }
  }
  throw new HttpError(404, 'Nie ma takiego zadania w planie')
}

export function instanceAction(ctx, acc, c, instId, action) {
  const { act, inst } = findInstance(acc, instId)
  if (act.status !== 'active') throw new HttpError(409, 'Plan nie jest już aktywny')
  if (c.status !== 'accepted') throw new HttpError(403, 'Najpierw przyjmij rolę w planie')
  const mineOffered = inst.state === 'offered' && inst.offeredTo === c.id
  const mineAccepted = inst.state === 'accepted' && inst.acceptedBy === c.id
  const drill = act.kind === 'drill'
  switch (action) {
    case 'accept':
      if (!mineOffered) throw new HttpError(409, 'To zadanie nie czeka już na Ciebie (mogło przejść do kolejnej osoby). Odśwież widok.')
      inst.state = 'accepted'; inst.acceptedBy = c.id; inst.acceptedAt = ctx.now; inst.deadline = null
      hist(ctx, inst, c.id, 'accepted')
      if (drill) c.lastConfirmedAt = ctx.now
      break
    case 'decline':
      if (!mineOffered) throw new HttpError(409, 'To zadanie nie czeka już na Ciebie. Odśwież widok.')
      inst.declined.push(c.id)
      hist(ctx, inst, c.id, 'declined')
      if (drill) c.lastConfirmedAt = ctx.now
      offerNext(ctx, acc, act, inst)
      break
    case 'claim':
      if (inst.state !== 'uncovered') throw new HttpError(409, 'To zadanie ma już opiekuna')
      inst.state = 'accepted'; inst.acceptedBy = c.id; inst.acceptedAt = ctx.now
      hist(ctx, inst, c.id, 'claimed')
      if (drill) c.lastConfirmedAt = ctx.now
      break
    case 'release':
      if (!mineAccepted) throw new HttpError(409, 'To nie jest Twoje zadanie')
      inst.declined.push(c.id); inst.acceptedBy = null; inst.acceptedAt = null
      hist(ctx, inst, c.id, 'released', 'oddał(a) zadanie – szukamy kolejnej osoby')
      offerNext(ctx, acc, act, inst)
      break
    case 'done':
      if (!mineAccepted) throw new HttpError(409, 'To nie jest Twoje zadanie')
      inst.state = 'done'; inst.doneAt = ctx.now
      hist(ctx, inst, c.id, 'done', 'dostęp wygasł')
      break
    default:
      throw new HttpError(400, 'Nieznana akcja')
  }
  audit(ctx, acc, c.name, { accept: 'Przejęto zadanie', decline: 'Odmówiono zadania', claim: 'Przejęto zadanie bez opiekuna', release: 'Oddano zadanie', done: 'Zadanie wykonane' }[action], inst.title + (drill ? ' (ćwiczenie)' : ''))
  if (drill) maybeFinishDrill(ctx, acc, act)
}

// Okno dostępu: od (godzina zadania − wyprzedzenie) do (później z: godzina zadania / przejęcie) + zapas.
// Po oznaczeniu „wykonane” lub zakończeniu planu dostęp jest niedostępny niezależnie od okna.
export function accessWindow(acc, inst) {
  if (!inst.dueAt) return null
  const S = acc.settings
  return { from: inst.dueAt - S.accessLeadMin * MIN, until: Math.max(inst.dueAt, inst.acceptedAt || 0) + S.accessGraceMin * MIN }
}

export function revealSecrets(ctx, acc, c, instId) {
  const { act, inst } = findInstance(acc, instId)
  if (act.kind === 'drill') throw new HttpError(403, 'Podczas ćwiczenia dostępy nie są wydawane.')
  if (act.status !== 'active') throw new HttpError(403, 'Plan zakończony – dostęp wygasł.')
  if (!features(acc).timedAccess) throw new HttpError(402, 'Dostępy czasowe są w pakiecie rodzinnym.')
  if (inst.state !== 'accepted' || inst.acceptedBy !== c.id) throw new HttpError(403, inst.state === 'done' ? 'Zadanie wykonane – dostęp wygasł.' : 'Dostęp ma tylko osoba, która przejęła zadanie.')
  const w = accessWindow(acc, inst)
  if (ctx.now < w.from) throw new HttpError(403, `Dostęp zostanie wydany od ${hhmm(w.from)}.`)
  if (ctx.now > w.until) throw new HttpError(403, 'Dostęp wygasł.')
  const task = acc.tasks.find(t => t.id === inst.taskId)
  if (!task) throw new HttpError(404, 'Zadanie usunięte z planu')
  audit(ctx, acc, c.name, 'Odczytano dostęp czasowy', task.title)
  return { until: w.until, secrets: task.secrets.map(s => ({ label: s.label, value: dec(s.valueEnc) })) }
}

// ---------- próbny alarm ----------

export function startDrill(ctx, acc) {
  if (openActivation(acc)) throw new HttpError(409, 'Trwa już alarm lub zgłoszenie – ćwiczenie niemożliwe.')
  if (!acc.tasks.length) throw new HttpError(400, 'Dodaj najpierw zadania')
  const act = { id: newId(), kind: 'drill', source: 'owner', status: 'pending', createdAt: ctx.now, activateAt: ctx.now, activatedAt: null, endedAt: null, endedBy: null, endReason: '', reports: [{ at: ctx.now, source: 'owner', actorId: null, actorName: 'właściciel', detail: 'próbny alarm' }], instances: [], readinessAtStart: readiness(acc, ctx.now).items }
  acc.activations.unshift(act)
  for (const c of acc.contacts) {
    if (c.status === 'invited' || c.status === 'draft') {
      if (c.tokenEnc) send(ctx, acc, c, `Plan B (${acc.owner.name}): trwa próbny alarm, a Ty wciąż nie potwierdziłeś(-aś) swojej roli. Bez tego plan Cię pominie:`, { drill: true })
    }
  }
  activate(ctx, acc, act, 'ćwiczenie uruchomione przez właściciela')
  maybeFinishDrill(ctx, acc, act)
  return act
}

function maybeFinishDrill(ctx, acc, act) {
  if (act.kind === 'drill' && act.status === 'active' && act.instances.every(i => STATE_DONE.has(i.state))) {
    endActivation(ctx, acc, act, 'system', 'wszystkie zadania obsadzone lub bez opiekuna')
  }
}

function drillReport(acc, act, now) {
  const people = {}
  const P = id => (people[id] ||= { name: contactById(acc, id)?.name || '(usunięta osoba)', offered: 0, accepted: 0, declined: 0, timeouts: 0, skipped: 0, responseMs: [] })
  for (const inst of act.instances) {
    let lastOffer = null
    for (const h of inst.history) {
      if (!h.contactId) continue
      const p = P(h.contactId)
      if (h.event === 'offered') { p.offered++; lastOffer = h.at }
      if (h.event === 'accepted' || h.event === 'claimed') { p.accepted++; if (lastOffer && h.event === 'accepted') p.responseMs.push(h.at - lastOffer) }
      if (h.event === 'declined') { p.declined++; if (lastOffer) p.responseMs.push(h.at - lastOffer) }
      if (h.event === 'timeout') p.timeouts++
      if (h.event === 'skipped') p.skipped++
    }
  }
  const contacts = Object.values(people).map(p => ({ ...p, avgResponseMin: p.responseMs.length ? Math.round(p.responseMs.reduce((a, b) => a + b, 0) / p.responseMs.length / MIN) : null, responseMs: undefined }))
  const tasks = act.instances.map(i => ({ title: i.title, outcome: i.state === 'uncovered' ? 'BRAK OPIEKUNA' : i.acceptedBy ? `przejął(-ęła): ${contactById(acc, i.acceptedBy)?.name || '?'}` : 'w toku (ćwiczenie przerwane)', attempts: i.history.filter(h => h.event === 'offered').length }))
  return {
    finishedAt: now,
    covered: act.instances.filter(i => i.acceptedBy).length,
    tasks, contacts,
    silent: contacts.filter(c => c.timeouts > 0 && c.accepted + c.declined === 0).map(c => c.name),
    skipped: contacts.filter(c => c.skipped > 0).map(c => c.name),
    issues: readiness(acc, now).items.filter(i => i.level !== 'info'),
  }
}

// ---------- codzienny check-in ----------

export function updateCheckin(ctx, acc, b) {
  if (b.enabled && !features(acc).checkin) throw new HttpError(402, 'Codzienny check-in jest w pakiecie rodzinnym.')
  const ci = acc.checkin
  const wasEnabled = ci.enabled
  ci.enabled = !!b.enabled
  ci.time = time(b.time)
  ci.graceMin = int(b.graceMin, 15, 12 * 60, 'Czas na reakcję po przypomnieniu')
  ci.pausedUntil = b.pausedUntil ? localAt(str(b.pausedUntil, 10, 'przerwa do'), '23:59') : null
  if (ci.enabled && !wasEnabled) ci.lastOkAt = ctx.now
  audit(ctx, acc, 'właściciel', 'Zmieniono ustawienia check-inu', ci.enabled ? `codziennie do ${ci.time}` : 'wyłączony')
}

export function checkinOk(ctx, acc) {
  acc.checkin.lastOkAt = ctx.now
  audit(ctx, acc, 'właściciel', '„Jestem OK”')
}

function tickCheckin(ctx, acc) {
  const ci = acc.checkin
  if (!ci.enabled || !features(acc).checkin) return
  if (ci.pausedUntil && ctx.now < ci.pausedUntil) return
  const today = dateKeyOf(ctx.now)
  const at = localAt(today, ci.time)
  const okToday = ci.lastOkAt && ci.lastOkAt >= localAt(today, '00:00')
  if (okToday || ctx.now < at) return
  if (ci.remindedFor !== today) {
    ci.remindedFor = today
    send(ctx, acc, 'owner', `Plan B: nie potwierdziłeś(-aś) dziś „jestem OK”. Jeśli nie zrobisz tego do ${hhmm(at + ci.graceMin * MIN)}, zaufane osoby dostaną zgłoszenie uruchomienia planu:`)
  }
  if (ctx.now >= at + ci.graceMin * MIN && ci.triggeredFor !== today) {
    ci.triggeredFor = today
    trigger(ctx, acc, { source: 'checkin', actorName: 'automat check-in', detail: `brak „jestem OK” do ${hhmm(at + ci.graceMin * MIN)}` })
  }
}

// ---------- aktualność danych ----------

export function readiness(acc, now) {
  const items = []
  const add = (level, text, area) => items.push({ level, text, area })
  const S = acc.settings
  const stale = S.staleDays * DAY
  const days = ms => Math.floor(ms / DAY)
  if (!acc.tasks.length) add('critical', 'Plan nie ma jeszcze żadnych zadań.', 'tasks')
  if (!acc.contacts.some(c => c.status === 'accepted' && c.canTrigger)) add('critical', 'Żadna zaufana osoba z prawem „może uruchomić plan” nie przyjęła roli – plan uruchomi tylko karta QR lub check-in.', 'contacts')
  for (const c of acc.contacts) {
    if (c.status === 'draft') add('warn', `${c.name}: zaproszenie nie zostało wysłane.`, 'contacts')
    if (c.status === 'invited') add(now - c.invitedAt > 3 * DAY ? 'critical' : 'warn', `${c.name}: nie potwierdził(a) roli (zaproszenie sprzed ${days(now - c.invitedAt)} dni). Plan pominie tę osobę.`, 'contacts')
    if (c.status === 'declined') add('warn', `${c.name}: odmówił(a) udziału – usuń z kolejek.`, 'contacts')
    if (c.status === 'accepted' && (!c.lastConfirmedAt || now - c.lastConfirmedAt > stale)) add('warn', `${c.name}: dane kontaktowe niepotwierdzone od ${c.lastConfirmedAt ? days(now - c.lastConfirmedAt) + ' dni' : 'zmiany numeru'}.`, 'contacts')
  }
  for (const t of acc.tasks) {
    const ok = t.queue.filter(id => contactById(acc, id)?.status === 'accepted').length
    if (ok === 0) add('critical', `„${t.title}”: w kolejce nie ma nikogo, kto przyjął rolę.`, 'tasks')
    else if (ok === 1) add('warn', `„${t.title}”: tylko jedna osoba w kolejce – brak zastępstwa.`, 'tasks')
    for (const o of t.offline) if (!o.done) add('warn', `„${t.title}” – do załatwienia poza aplikacją: ${o.text}`, 'offline')
    if (!t.instructionsEnc) add('info', `„${t.title}”: brak instrukcji dla osoby, która przejmie zadanie.`, 'tasks')
  }
  const drillDue = acc.lastDrillAt ? now - acc.lastDrillAt > S.drillIntervalDays * DAY : now - acc.createdAt > 14 * DAY
  if (drillDue) add('warn', acc.lastDrillAt ? `Ostatni próbny alarm ${days(now - acc.lastDrillAt)} dni temu – czas na kolejny.` : 'Nie przeprowadzono jeszcze próbnego alarmu.', 'drill')
  if (now - acc.lastReviewedAt > stale) add('warn', `Plan nie był przeglądany od ${days(now - acc.lastReviewedAt)} dni – sprawdź godziny, kody i instrukcje.`, 'review')
  if (features(acc).checkin && !acc.checkin.enabled) add('info', 'Codzienny check-in „jestem OK” jest wyłączony (przydatny, gdy mieszkasz sam/sama).', 'checkin')
  const critical = items.filter(i => i.level === 'critical').length
  const warn = items.filter(i => i.level === 'warn').length
  return { items, critical, warn, drillDue }
}

function tickReminders(ctx, acc) {
  const r = acc.remind
  const rd = readiness(acc, ctx.now)
  const week = 7 * DAY
  if (rd.drillDue && (!r.drill || ctx.now - r.drill > week)) {
    r.drill = ctx.now
    send(ctx, acc, 'owner', 'Plan B: czas na próbny alarm (zalecany co pół roku). Sprawdzi, czy kontakty są aktualne i czy ludzie reagują:')
  }
  if (ctx.now - acc.createdAt > DAY && rd.critical && (!r.critical || ctx.now - r.critical > week)) {
    r.critical = ctx.now
    send(ctx, acc, 'owner', `Plan B ma ${rd.critical} krytyczne braki, np.: ${rd.items.find(i => i.level === 'critical').text} Uzupełnij:`)
  }
  for (const c of acc.contacts) {
    if (c.status === 'invited' && c.tokenEnc && ctx.now - c.invitedAt > 3 * DAY && (!c.remindedAt || ctx.now - c.remindedAt > week)) {
      c.remindedAt = ctx.now
      send(ctx, acc, c, `Przypomnienie: ${acc.owner.name} czeka na Twoją odpowiedź w sprawie Planu B. Bez potwierdzenia plan Cię pominie:`)
    }
  }
}

// ---------- zegar ----------

// Jedno „uderzenie zegara” dla konta: okna anulowania, eskalacje, wygasanie dostępów,
// kolejne dni zadań, check-in i przypomnienia. Idempotentne – można wołać dowolnie często,
// a po restarcie serwera wszystko liczy się od zapisanych terminów.
export function tick(ctx, acc) {
  for (const act of [...acc.activations]) {
    if (act.status === 'pending' && ctx.now >= act.activateAt) {
      activate(ctx, acc, act, 'automatycznie – nikt nie anulował w oknie bezpieczeństwa')
    }
    if (act.status !== 'active') continue
    if (act.kind === 'real') ensureInstances(ctx, acc, act)
    for (const inst of act.instances) {
      if (inst.state === 'offered' && ctx.now >= inst.deadline) {
        const c = contactById(acc, inst.offeredTo)
        hist(ctx, inst, inst.offeredTo, 'timeout', 'brak potwierdzenia w czasie')
        if (c) send(ctx, acc, c, `Plan B (${acc.owner.name}): czas na potwierdzenie „${inst.title}” minął – zadanie przekazano kolejnej osobie. Jeśli jednak możesz pomóc, zajrzyj:`, { drill: act.kind === 'drill' })
        offerNext(ctx, acc, act, inst)
      }
      if (act.kind === 'real' && inst.state === 'accepted' && !inst.expiredNotified && ctx.now > accessWindow(acc, inst).until) {
        inst.expiredNotified = true
        hist(ctx, inst, inst.acceptedBy, 'access-expired', 'dostęp czasowy wygasł')
        const c = contactById(acc, inst.acceptedBy)
        if (c) send(ctx, acc, c, `Plan B: dostęp do „${inst.title}” wygasł. Jeśli zadanie jest zrobione, oznacz je jako wykonane:`)
      }
    }
    maybeFinishDrill(ctx, acc, act)
  }
  tickCheckin(ctx, acc)
  tickReminders(ctx, acc)
}

// ---------- widoki (co kto widzi – zasada minimalnych uprawnień) ----------

const pubContact = c => c && { id: c.id, name: c.name }

function instanceView(acc, inst, viewerContactId) {
  const name = id => contactById(acc, id)?.name || '?'
  return {
    id: inst.id, title: inst.title, time: inst.time, timeLabel: inst.timeLabel, dateKey: inst.dateKey, dueAt: inst.dueAt, late: inst.late,
    wardName: ward(acc, inst.wardId)?.name || '',
    state: inst.state, offeredTo: pubContact(contactById(acc, inst.offeredTo)), deadline: inst.deadline,
    acceptedBy: pubContact(contactById(acc, inst.acceptedBy)), acceptedAt: inst.acceptedAt, doneAt: inst.doneAt,
    queue: inst.queue.map(name),
    history: inst.history.map(h => ({ at: h.at, name: h.contactId ? name(h.contactId) : '', event: h.event, note: h.note })),
    mine: viewerContactId ? { offered: inst.state === 'offered' && inst.offeredTo === viewerContactId, accepted: inst.state === 'accepted' && inst.acceptedBy === viewerContactId } : null,
  }
}

function activationView(acc, act, viewerContactId = null) {
  return {
    id: act.id, kind: act.kind, source: act.source, sourceLabel: SOURCE_LABEL[act.source], status: act.status,
    createdAt: act.createdAt, activateAt: act.activateAt, activatedAt: act.activatedAt, endedAt: act.endedAt, endedBy: act.endedBy, endReason: act.endReason,
    reports: act.reports.map(r => ({ at: r.at, sourceLabel: SOURCE_LABEL[r.source], actorName: r.actorName, detail: r.detail, mine: !!viewerContactId && r.actorId === viewerContactId })),
    instances: act.instances.map(i => instanceView(acc, i, viewerContactId)),
    report: act.report || null,
  }
}

export function ownerView(acc, now) {
  const S = acc.settings
  return {
    now, tier: acc.tier, features: features(acc),
    owner: { name: acc.owner.name, phone: acc.owner.phone },
    settings: { ...S, emergencyNoteEnc: undefined, emergencyNote: dec(S.emergencyNoteEnc) },
    wards: acc.wards.map(w => ({ id: w.id, name: w.name, kind: w.kind, notes: dec(w.notesEnc) })),
    contacts: acc.contacts.map(c => ({ id: c.id, name: c.name, phone: c.phone, relation: c.relation, canTrigger: c.canTrigger, status: c.status, invitedAt: c.invitedAt, respondedAt: c.respondedAt, lastConfirmedAt: c.lastConfirmedAt })),
    tasks: acc.tasks.map(t => ({ id: t.id, title: t.title, time: t.time, timeLabel: t.timeLabel, wardId: t.wardId, instructions: dec(t.instructionsEnc), queue: t.queue, secrets: t.secrets.map(s => ({ id: s.id, label: s.label, value: dec(s.valueEnc) })), offline: t.offline })),
    checkin: acc.checkin,
    activations: acc.activations.slice(0, 15).map(a => activationView(acc, a)),
    readiness: readiness(acc, now),
    audit: acc.audit.slice(0, 60), messages: acc.messages.slice(0, 40),
    lastReviewedAt: acc.lastReviewedAt, lastDrillAt: acc.lastDrillAt,
  }
}

export function contactView(acc, c, now) {
  const roles = acc.tasks.filter(t => t.queue.includes(c.id)).map(t => ({
    title: t.title, time: t.time, timeLabel: t.timeLabel, wardName: ward(acc, t.wardId)?.name || '',
    position: t.queue.indexOf(c.id) + 1, queueLength: t.queue.length, offline: t.offline.map(o => o.text),
  }))
  const view = {
    now, ownerName: acc.owner.name,
    me: { name: c.name, phone: c.phone, status: c.status, canTrigger: c.canTrigger, lastConfirmedAt: c.lastConfirmedAt },
    roles, activation: null, myTasks: [], emergencyNote: '', recent: null,
  }
  if (c.status !== 'accepted') return view // przed przyjęciem roli: tylko informacja, o co prosimy
  const act = openActivation(acc)
  if (act) {
    view.activation = activationView(acc, act, c.id)
    if (act.status === 'active' && act.kind === 'real') {
      view.emergencyNote = dec(acc.settings.emergencyNoteEnc)
      for (const inst of act.instances) {
        if (inst.state !== 'accepted' || inst.acceptedBy !== c.id) continue
        const t = acc.tasks.find(x => x.id === inst.taskId)
        const w = accessWindow(acc, inst)
        view.myTasks.push({
          instanceId: inst.id, title: inst.title, time: inst.time, dateKey: inst.dateKey,
          instructions: t ? dec(t.instructionsEnc) : '', wardName: ward(acc, inst.wardId)?.name || '', wardNotes: dec(ward(acc, inst.wardId)?.notesEnc),
          offline: t ? t.offline.map(o => o.text) : [],
          access: t && t.secrets.length && features(acc).timedAccess ? { from: w.from, until: w.until, count: t.secrets.length } : null,
        })
      }
    }
  } else {
    const last = acc.activations.find(a => a.endedAt && now - a.endedAt < DAY)
    if (last) view.recent = { kind: last.kind, status: last.status, endedAt: last.endedAt, endReason: last.endReason }
  }
  return view
}

export function cardView(acc) {
  return { firstName: acc.owner.name.split(/\s+/)[0] }
}

export function cardReport(ctx, acc, b) {
  const name = str(b.name, 80, 'imię i nazwisko / funkcja', true)
  const act = trigger(ctx, acc, { source: 'qr', actorName: name, detail: [str(b.place, 120, 'miejsce'), str(b.phone, 30, 'telefon'), str(b.note, 300, 'opis')].filter(Boolean).join(' · ') })
  const ice = acc.settings.cardRevealIce ? acc.contacts.find(c => c.status === 'accepted' && c.canTrigger) : null
  return { ok: true, activateAt: act.activateAt, status: act.status, ice: ice ? { name: ice.name, phone: ice.phone } : null }
}
