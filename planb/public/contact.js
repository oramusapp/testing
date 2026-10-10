import { $, esc, api, ask, live, board, toast, fmtDate, fmtDateTime, fmtTime, left, syncClock, demoBar, liveBadge, serverNow } from './common.js'

let V = null
const revealed = {} // instanceId -> { secrets, until } (tylko w pamięci karty przeglądarki)

async function load() {
  try {
    V = await api('/api/contact')
    syncClock(V.now)
    render()
  } catch (e) {
    $('#app').innerHTML = `<div class="card alert bad"><h2>Link nie działa</h2><p>${esc(e.message)}</p></div>`
  }
}

const roleList = () => V.roles.length
  ? `<ul class="list">${V.roles.map(r => `<li><b>${esc(r.time)}</b> ${r.timeLabel ? `<small class="muted">(${esc(r.timeLabel)})</small>` : ''} – ${esc(r.title)} ${r.wardName ? `<small class="muted">· ${esc(r.wardName)}</small>` : ''}<br>
    <small>Jesteś <b>${r.position}.</b> w kolejce (z ${r.queueLength}).${r.position > 1 ? ' Dostaniesz to zadanie, jeśli wcześniejsze osoby nie odpowiedzą.' : ''}</small>
    ${r.offline.length ? `<div class="note"><small><b>Do załatwienia wcześniej, poza aplikacją:</b><br>${r.offline.map(esc).join('<br>')}</small></div>` : ''}</li>`).join('')}</ul>`
  : '<p class="muted">Nie masz jeszcze przypisanych zadań – możesz zostać poproszony(-a) o pomoc, gdy zadanie nie znajdzie opiekuna.</p>'

function render() {
  for (const k of Object.keys(revealed)) if (!V.myTasks.some(t => t.instanceId === k)) delete revealed[k] // wykonane / zakończone = znika
  const me = V.me
  let html = `<div class="row"><div><h1>Plan B – ${esc(V.ownerName)}</h1><small class="muted">Jesteś tu jako: ${esc(me.name)}</small> ${liveBadge()}</div></div>`

  if (me.status !== 'accepted') {
    html += `<div class="card ${me.status === 'declined' ? '' : 'alert wait'}">
      <h2>${me.status === 'declined' ? 'Odmówiłeś(-aś) udziału w planie' : `${esc(V.ownerName)} prosi Cię o pomoc`}</h2>
      <p><b>Plan B</b> uruchamia się tylko wtedy, gdy ${esc(V.ownerName)} nagle nie może zajmować się bliskimi – np. trafi do szpitala, ulegnie wypadkowi albo przestanie odpowiadać. Wtedy dostaniesz SMS z prośbą o przejęcie konkretnego zadania i będziesz mieć <b>kilkanaście–kilkadziesiąt minut</b> na potwierdzenie. Jeśli nie możesz, zadanie trafi do kolejnej osoby – odmowa jest w porządku.</p>
      <p>Raz na jakiś czas może przyjść <b>próbny alarm</b> oznaczony [ĆWICZENIE] – wystarczy odpowiedzieć.</p>
      <h3>Zadania, w których jesteś w kolejce</h3>${roleList()}
      <p>Twój numer w planie: <b>${esc(me.phone)}</b>. Jeśli jest nieaktualny, daj znać osobie, która Cię zaprosiła.</p>
      <button class="primary big" data-role="1">Przyjmuję rolę</button> ${me.status === 'declined' ? '' : '<button data-role="0">Nie mogę – odmawiam</button>'}
    </div>`
    $('#app').innerHTML = html
    return
  }

  const a = V.activation
  if (a && a.status === 'pending') {
    const mine = a.reports.some(r => r.mine)
    html += `<div class="card alert bad"><h2>⚠️ Zgłoszono uruchomienie planu</h2>
      ${a.reports.map(r => `<p>${fmtTime(r.at)} – <b>${esc(r.sourceLabel)}</b>: ${esc(r.actorName)}${r.detail ? ` – ${esc(r.detail)}` : ''}</p>`).join('')}
      <p>Plan uruchomi się sam za <b data-countdown="${a.activateAt}">${left(a.activateAt)}</b>, jeśli ${esc(V.ownerName)} nie anuluje.</p>
      ${me.canTrigger ? `${mine ? '<p class="muted">To Ty zgłosiłeś(-aś). Potwierdzić od razu może inna zaufana osoba.</p>' : '<button class="danger big" data-act="confirm">Potwierdzam – uruchom teraz</button>'}
        <button data-act="cancel">To fałszywy alarm – anuluj</button>` : ''}</div>`
  } else if (a && a.status === 'active') {
    const drill = a.kind === 'drill'
    html += `<div class="card alert ${drill ? 'wait' : 'bad'}"><div class="row"><h2>${drill ? '🧪 PRÓBNY ALARM – to tylko ćwiczenie' : `🚨 Plan B (${esc(V.ownerName)}) jest aktywny`}</h2>
      ${!drill && me.canTrigger ? '<button data-act="end">Osoba wróciła – zakończ plan</button>' : ''}</div>
      <p class="muted">${drill ? 'Odpowiedz tak, jak w prawdziwej sytuacji. Żadne kody ani dane nie są teraz wydawane.' : 'Na żywo: kto co przejął i co jeszcze czeka.'}</p>
      ${board(a, actions)}
      ${!drill && V.emergencyNote ? `<div class="note"><b>Gdy nikt nie może przejąć zadania:</b><br>${esc(V.emergencyNote)}</div>` : ''}</div>`
    for (const t of V.myTasks) html += myTask(t)
  } else {
    if (V.recent) html += `<div class="card"><p>${V.recent.kind === 'drill' ? 'Próbny alarm' : 'Plan'} zakończony ${fmtDateTime(V.recent.endedAt)} – ${esc(V.recent.endReason)}. Dostępy wygasły.</p></div>`
    html += `<div class="card alert ok"><h2>✔ Plan nie jest aktywny</h2><p>Nic nie musisz robić. Dostaniesz SMS, jeśli plan zostanie uruchomiony.</p></div>`
    if (me.canTrigger) html += `<div class="card"><h2>Uruchom plan</h2>
      <p>Użyj, gdy wiesz, że ${esc(V.ownerName)} jest w szpitalu, miał(a) wypadek albo od dłuższego czasu nie ma kontaktu. ${esc(V.ownerName)} dostanie wiadomość i będzie mieć kilkanaście minut na anulowanie.</p>
      <label><span>Co się stało?</span><input id="reason" maxlength="300" placeholder="np. zadzwonili ze szpitala, nie odbiera od wczoraj"></label>
      <button class="danger big" data-act="trigger">Zgłoś uruchomienie planu</button></div>`
  }
  html += `<div class="card"><h2>Twoja rola</h2>${roleList()}
    <p><small>Twoje dane w planie: ${esc(me.phone)} · potwierdzone: ${fmtDate(me.lastConfirmedAt)}</small> <button data-act="details">Mój numer jest aktualny</button></p></div>`
  $('#app').innerHTML = html
}

function actions(i) {
  if (!i.mine) return ''
  if (i.mine.offered) return `<div><button class="primary" data-inst="${i.id}" data-do="accept">Przejmuję</button><button data-inst="${i.id}" data-do="decline">Nie mogę</button></div>`
  if (i.mine.accepted) return `<div><button class="primary" data-inst="${i.id}" data-do="done">Zrobione</button><button data-inst="${i.id}" data-do="release">Nie dam rady – oddaj dalej</button></div>`
  if (i.state === 'uncovered') return `<div><button class="primary" data-inst="${i.id}" data-do="claim">Mogę to zrobić – przejmuję</button></div>`
  return ''
}

function myTask(t) {
  const r = revealed[t.instanceId]
  const now = serverNow()
  let access = ''
  if (t.access) {
    if (r && r.until > now) access = `<h3>🔒 Dostęp (wygasa o ${fmtTime(r.until)})</h3>${r.secrets.map(s => `<p><b>${esc(s.label)}:</b></p><div class="secret">${esc(s.value)}</div>`).join('')}`
    else access = `<h3>🔒 Dostęp czasowy (${t.access.count})</h3><p><small>Dostępny od ${fmtTime(t.access.from)} do ${fmtTime(t.access.until)}. Wygasa też po oznaczeniu zadania jako wykonane.</small></p>
      <button data-reveal="${t.instanceId}">Pokaż kody / instrukcję dawkowania</button>`
  }
  return `<div class="card"><h2>Twoje zadanie: ${esc(t.title)} <small class="muted">(${esc(t.time)})</small></h2>
    ${t.instructions ? `<h3>Instrukcja</h3><p>${esc(t.instructions).replace(/\n/g, '<br>')}</p>` : ''}
    ${t.wardNotes ? `<h3>Ważne: ${esc(t.wardName)}</h3><p>${esc(t.wardNotes).replace(/\n/g, '<br>')}</p>` : ''}
    ${t.offline.length ? `<div class="note"><b>Pamiętaj – poza aplikacją:</b><br>${t.offline.map(esc).join('<br>')}<br><small>Aplikacja nie zastępuje upoważnień ani dokumentów. Jeśli czegoś brakuje, skontaktuj się z placówką.</small></div>` : ''}
    ${access}</div>`
}

async function act(fn, ok) { try { await fn(); if (ok) toast(ok); await load() } catch (e) { toast(e.message, true); await load() } }

document.addEventListener('click', async e => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.role) return act(() => api('/api/contact/role', { method: 'POST', body: { accept: b.dataset.role === '1' } }), b.dataset.role === '1' ? 'Dziękujemy! Rola przyjęta.' : 'Zapisano odmowę.')
  if (b.dataset.inst) return act(() => api(`/api/contact/instances/${b.dataset.inst}/${b.dataset.do}`, { method: 'POST' }), { accept: 'Przejęte – dziękujemy!', decline: 'Przekazano kolejnej osobie', done: 'Dziękujemy! Dostęp wygasł.', claim: 'Przejęte – dziękujemy!', release: 'Przekazano dalej' }[b.dataset.do])
  if (b.dataset.reveal) {
    try { revealed[b.dataset.reveal] = await api(`/api/contact/instances/${b.dataset.reveal}/reveal`, { method: 'POST' }); render() } catch (err) { toast(err.message, true) }
    return
  }
  switch (b.dataset.act) {
    case 'confirm': if (await ask('Uruchomić plan teraz?', { ok: 'Uruchom plan', danger: true })) return act(() => api('/api/contact/confirm', { method: 'POST' }), 'Plan uruchomiony')
      return
    case 'cancel': if (await ask('Anulować zgłoszenie jako fałszywy alarm?', { ok: 'Anuluj zgłoszenie' })) return act(() => api('/api/contact/cancel', { method: 'POST' }), 'Anulowano')
      return
    case 'end': if (await ask('Zakończyć plan? Wszystkie dostępy wygasną.', { ok: 'Zakończ plan' })) return act(() => api('/api/contact/end', { method: 'POST' }), 'Plan zakończony')
      return
    case 'trigger': if (await ask('Zgłosić uruchomienie planu? Właściciel i inne zaufane osoby dostaną wiadomość.', { ok: 'Zgłoś', danger: true })) return act(() => api('/api/contact/trigger', { method: 'POST', body: { reason: $('#reason').value } }), 'Zgłoszono. Właściciel ma czas na anulowanie.')
      return
    case 'details': return act(() => api('/api/contact/confirm-details', { method: 'POST' }), 'Dziękujemy')
  }
})

// Odkryte kody znikają z ekranu po wygaśnięciu.
setInterval(() => { for (const [k, r] of Object.entries(revealed)) if (r.until < serverNow()) { delete revealed[k]; render() } }, 10000)
window.addEventListener('hashchange', load)
demoBar()
await load()
live(() => load())
