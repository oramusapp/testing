// Wspólne funkcje interfejsu Planu B.
export const $ = (s, el = document) => el.querySelector(s)
export const $$ = (s, el = document) => [...el.querySelectorAll(s)]
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Token w części #t=… adresu – nie jest wysyłany do serwera w URL ani w nagłówku Referer.
export const token = () => (location.hash.match(/t=([\w-]+)/) || [])[1] || ''

let skew = 0 // różnica zegara serwera (w demo czas jest „przewijany”)
export const serverNow = () => Date.now() + skew
export const syncClock = serverMs => { if (serverMs) skew = serverMs - Date.now() }

export async function api(path, { method = 'GET', body, auth = token() } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Błąd ' + res.status), { status: res.status })
  return data
}

// Zmiany na żywo przez SSE (fetch + strumień, żeby token szedł w nagłówku).
// Przy zerwaniu połączenia – ponowne łączenie; dodatkowo zapasowe odświeżanie co 30 s.
export function live(onChange, { all = false } = {}) {
  let delay = 1000
  async function connect() {
    try {
      const res = await fetch('/api/stream' + (all ? '?all=1' : ''), { headers: all ? {} : { Authorization: 'Bearer ' + token() } })
      if (!res.ok) throw new Error('stream ' + res.status)
      delay = 1000
      setLive(true)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (dec.decode(value).includes('event: change')) onChange()
      }
    } catch { /* ponowimy */ }
    setLive(false)
    setTimeout(connect, delay)
    delay = Math.min(delay * 2, 30000)
  }
  connect()
  setInterval(onChange, 30000)
}
let liveOn = false
export const liveBadge = () => `<span id="live" class="live${liveOn ? ' on' : ''}">${liveOn ? '● na żywo' : '○ łączenie…'}</span>`
function setLive(on) { liveOn = on; const el = $('#live'); if (el) el.outerHTML = liveBadge() }

export const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '–'
export const fmtDateTime = ms => ms ? new Date(ms).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'
export const fmtDate = ms => ms ? new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nigdy'
export function left(ms) {
  const s = Math.max(0, Math.round((ms - serverNow()) / 1000))
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m}:${String(s % 60).padStart(2, '0')}`
}

export function toast(msg, bad = false) {
  let el = $('#toast')
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el) }
  el.textContent = msg
  el.className = 'toast show' + (bad ? ' bad' : '')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.className = 'toast', 4000)
}

// Odliczanie w elementach [data-countdown]
setInterval(() => { for (const el of $$('[data-countdown]')) el.textContent = left(Number(el.dataset.countdown)) }, 1000)

const DAY_WORD = dk => {
  const d = new Date(serverNow())
  const p = n => String(n).padStart(2, '0')
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  const tomorrow = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
  return dk === today ? 'dziś' : dk === tomorrow ? 'jutro' : dk
}

const EVENT = { offered: 'zapytano', accepted: 'przejął(-ęła)', declined: 'odmówił(a)', timeout: 'brak odpowiedzi', skipped: 'pominięto', uncovered: 'nikt nie przejął', claimed: 'zgłosił(a) się sam(a)', released: 'oddał(a)', done: 'wykonane', 'access-expired': 'dostęp wygasł' }

// Tablica „na żywo”: kto co przejął, co czeka, co nie ma opiekuna.
export function board(act, actions = () => '') {
  if (!act.instances.length) return '<p class="muted">Brak zadań w planie.</p>'
  const order = { uncovered: 0, offered: 1, accepted: 2, done: 3 }
  const list = [...act.instances].sort((a, b) => (order[a.state] - order[b.state]) || ((a.dueAt || 0) - (b.dueAt || 0)))
  return `<ul class="board">${list.map(i => {
    let status
    if (i.state === 'offered') status = `<span class="chip wait">Czeka na: ${esc(i.offeredTo?.name)}</span> <small>jeszcze <b data-countdown="${i.deadline}">${left(i.deadline)}</b>, potem kolejna osoba</small>`
    else if (i.state === 'accepted') status = `<span class="chip ok">Przejęte: ${esc(i.acceptedBy?.name)}</span>`
    else if (i.state === 'done') status = `<span class="chip done">Wykonane (${esc(i.acceptedBy?.name)}, ${fmtTime(i.doneAt)})</span>`
    else status = '<span class="chip bad">BRAK OPIEKUNA – potrzebny ktoś!</span>'
    const when = i.dueAt ? `${DAY_WORD(i.dateKey)} ${esc(i.time)}` : esc(i.time)
    return `<li class="st-${i.state}">
      <div class="row"><div><b>${when}</b> ${i.timeLabel ? `<small class="muted">${esc(i.timeLabel)}</small>` : ''} ${i.late ? '<span class="chip bad">po czasie</span>' : ''}<br>
      <span class="title">${esc(i.title)}</span> ${i.wardName ? `<small class="muted">· ${esc(i.wardName)}</small>` : ''}</div></div>
      <div>${status}</div>
      <details><summary>Kolejka i historia</summary><small>Kolejka: ${i.queue.map(esc).join(' → ') || '—'}</small>
      <ol class="hist">${i.history.map(h => `<li><small>${fmtTime(h.at)} ${esc(h.name)} – ${EVENT[h.event] || esc(h.event)}${h.note ? ` (${esc(h.note)})` : ''}</small></li>`).join('')}</ol></details>
      ${actions(i)}
    </li>`
  }).join('')}</ul>`
}

// Pasek trybu demo: zegar serwera i przewijanie czasu (żeby zobaczyć eskalację bez czekania 20 min).
export async function demoBar() {
  let info
  try { info = await api('/api/info', { auth: '' }) } catch { return }
  if (!info.demo) return
  const bar = document.createElement('div')
  bar.className = 'demobar'
  bar.innerHTML = `<b>TRYB DEMO</b> · czas serwera: <span id="srvclock"></span> ·
    przewiń: <button data-adv="5">+5 min</button><button data-adv="20">+20 min</button><button data-adv="60">+1 h</button><button data-adv="1440">+1 dzień</button>
    · <a href="/outbox.html" target="_blank">📨 symulowane SMS-y</a> · <a href="/" target="_blank">linki ról</a>`
  document.body.prepend(bar)
  const clock = () => { $('#srvclock').textContent = new Date(serverNow()).toLocaleString('pl-PL', { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  syncClock(info.now); clock(); setInterval(clock, 1000)
  bar.addEventListener('click', async e => {
    const m = e.target.dataset.adv
    if (!m) return
    e.target.disabled = true
    try { const r = await api('/api/demo/advance', { method: 'POST', body: { minutes: Number(m) }, auth: '' }); syncClock(r.now); clock(); toast(`Przewinięto czas o ${m} min`) }
    catch (err) { toast(err.message, true) }
    e.target.disabled = false
  })
}
