import { $, $$, esc, api, ask, live, board, toast, fmtDate, fmtDateTime, fmtTime, left, syncClock, demoBar, liveBadge } from './common.js'

let V = null            // ostatni widok z serwera
let tab = 'tasks'
let editing = null      // { type, id } otwarty formularz
let renderPending = false

const KIND = { child: 'dziecko', senior: 'osoba starsza', pet: 'zwierzę', other: 'inne' }
const STATUS = { draft: ['nie zaproszono', 'wait'], invited: ['czeka na potwierdzenie', 'wait'], accepted: ['przyjął(-ęła) rolę', 'ok'], declined: ['odmówił(a)', 'bad'] }
// Podpowiedzi „do załatwienia poza aplikacją” – formułowane jako rzeczy do sprawdzenia, nie obietnice.
const OFFLINE_HINTS = {
  child: ['Pisemne upoważnienie do odbioru dziecka dla osób z kolejki – złożone w szkole/przedszkolu (zapytaj placówkę o wymagany wzór)', 'Osoba odbierająca ma przy sobie dowód osobisty', 'Szkoła zna numer telefonu osób z kolejki'],
  senior: ['Upoważnienie / dostęp do e-recept i odbioru leków dla osoby z kolejki (sprawdź wymagania apteki i IKP)', 'Aktualna lista leków u lekarza rodzinnego', 'Zapasowy klucz lub kod do mieszkania'],
  pet: ['Zapasowy klucz dostępny dla osoby z kolejki', 'Książeczka zdrowia zwierzęcia – gdzie leży', 'Kontakt do weterynarza'],
  other: ['Zapasowy klucz / dostęp dla osoby z kolejki'],
}

async function load() {
  try {
    V = await api('/api/owner')
    syncClock(V.now)
    render()
  } catch (e) {
    $('#app').innerHTML = `<div class="card alert bad"><h2>Brak dostępu</h2><p>${esc(e.message)}</p></div>`
  }
}

function render() {
  if (editing && $('form[data-dirty]')) { renderPending = true; return }
  renderPending = false
  $('#app').innerHTML = `
    <div class="row"><div><h1>Plan B – ${esc(V.owner.name)}</h1><span class="chip done">${esc(V.features.label)}</span> ${liveBadge()}</div></div>
    ${activationBox()}
    ${checkinBox()}
    ${readinessBox()}
    <nav class="tabs">${[['tasks', 'Zadania i kolejki'], ['contacts', 'Zaufane osoby'], ['wards', 'Podopieczni'], ['drill', 'Próbny alarm'], ['card', 'Karta QR'], ['settings', 'Ustawienia i pakiet'], ['log', 'Dziennik']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <section class="card">${({ tasks, contacts, wards, drill, card, settings, log })[tab]()}</section>`
}

// ---------- uruchomienie / stan ----------
function activationBox() {
  const a = V.activations.find(x => x.status === 'pending' || x.status === 'active')
  if (!a) return ''
  if (a.status === 'pending') {
    const r = a.reports[0]
    return `<div class="card alert bad"><h2>⚠️ Zgłoszono uruchomienie Twojego planu</h2>
      <p>Źródło: <b>${esc(r.sourceLabel)}</b> – ${esc(r.actorName)}${r.detail ? `: ${esc(r.detail)}` : ''} (${fmtTime(r.at)})</p>
      ${a.reports.length > 1 ? `<p><small>Kolejne zgłoszenia: ${a.reports.slice(1).map(x => esc(x.actorName)).join(', ')}</small></p>` : ''}
      <p>Plan uruchomi się sam za <b data-countdown="${a.activateAt}">${left(a.activateAt)}</b> (o ${fmtTime(a.activateAt)}).</p>
      <button class="danger big" data-act="cancel">Wszystko w porządku – ANULUJ</button></div>`
  }
  const drill = a.kind === 'drill'
  return `<div class="card alert ${drill ? 'wait' : 'bad'}"><div class="row"><h2>${drill ? '🧪 Trwa próbny alarm' : '🚨 Plan B jest aktywny'}</h2>
      <button class="${drill ? '' : 'danger'}" data-act="end">${drill ? 'Zakończ ćwiczenie' : 'Wróciłem/am – zakończ plan'}</button></div>
    <p class="muted">Od ${fmtDateTime(a.activatedAt)} · źródło: ${esc(a.sourceLabel)}. Tak widzą to Twoje zaufane osoby:</p>
    ${board(a)}</div>`
}

function checkinBox() {
  const ci = V.checkin
  if (!V.features.checkin || !ci.enabled) return ''
  const today = new Date(V.now); today.setHours(0, 0, 0, 0)
  const ok = ci.lastOkAt && ci.lastOkAt >= today.getTime()
  return `<div class="card ${ok ? 'alert ok' : 'alert wait'}"><div class="row"><div><h2>Codzienny check-in</h2>
    <p>${ok ? `Dziś potwierdzone o ${fmtTime(ci.lastOkAt)}. ✔` : `Potwierdź do <b>${ci.time}</b>. Brak potwierdzenia ${ci.graceMin} min po tej godzinie = zgłoszenie uruchomienia planu (z oknem na anulowanie).`}</p></div>
    <button class="primary big" data-act="ok">Jestem OK</button></div></div>`
}

function readinessBox() {
  const r = V.readiness
  const items = r.items.filter(i => i.level !== 'info')
  const head = r.critical ? `<span class="chip bad">${r.critical} krytyczne</span>` : items.length ? `<span class="chip wait">${items.length} do poprawy</span>` : '<span class="chip ok">Plan gotowy</span>'
  return `<div class="card"><div class="row"><h2>Gotowość planu ${head}</h2><button data-act="review">Przejrzałem/am – dane aktualne</button></div>
    <p class="muted"><small>Ostatni przegląd: ${fmtDate(V.lastReviewedAt)} · ostatni próbny alarm: ${fmtDate(V.lastDrillAt)}</small></p>
    ${r.items.length ? `<ul>${r.items.map(i => `<li class="lvl-${i.level}">${esc(i.text)}</li>`).join('')}</ul>` : '<p>Wszystko wygląda dobrze.</p>'}</div>`
}

// ---------- zakładki ----------
const contactName = id => V.contacts.find(c => c.id === id)?.name || '?'
const wardName = id => V.wards.find(w => w.id === id)?.name || ''

function tasks() {
  const t = editing?.type === 'task' ? (V.tasks.find(x => x.id === editing.id) || { queue: [], secrets: [], offline: [] }) : null
  if (t) return taskForm(t)
  return `<div class="row"><h2>Zadania (${V.tasks.length}/${V.features.maxTasks})</h2><button class="primary" data-edit="task">+ Dodaj zadanie</button></div>
    <p class="muted"><small>Każde zadanie trafia najpierw do pierwszej osoby z kolejki. Jeśli nie potwierdzi w ${V.settings.ackTimeoutMin} min, przechodzi do kolejnej.</small></p>
    <ul class="list">${V.tasks.sort((a, b) => a.time.localeCompare(b.time)).map(x => `<li><div class="row"><div><b>${esc(x.time)}</b> ${x.timeLabel ? `<small class="muted">(${esc(x.timeLabel)})</small>` : ''} – <b>${esc(x.title)}</b> ${x.wardId ? `<small class="muted">· ${esc(wardName(x.wardId))}</small>` : ''}<br>
      <small>Kolejka: ${x.queue.length ? x.queue.map((id, i) => `${i + 1}. ${esc(contactName(id))} ${statusChip(V.contacts.find(c => c.id === id))}`).join(' → ') : '<span class="lvl-critical">brak osób!</span>'}</small><br>
      <small class="muted">${x.secrets.length ? `🔒 dostępy czasowe: ${x.secrets.map(s => esc(s.label)).join(', ')} · ` : ''}${x.offline.length ? `📋 poza aplikacją: ${x.offline.filter(o => o.done).length}/${x.offline.length} załatwione` : ''}</small></div>
      <div><button data-edit="task" data-id="${x.id}">Edytuj</button><button data-del="tasks" data-id="${x.id}">Usuń</button></div></div></li>`).join('') || '<li class="muted">Brak zadań. Dodaj np. „15:00 – odebrać dziecko ze szkoły”.</li>'}</ul>`
}

function statusChip(c) { if (!c) return ''; const [l, k] = STATUS[c.status]; return `<span class="chip ${k}">${l}</span>` }

function taskForm(t) {
  const opts = sel => `<option value="">—</option>` + V.contacts.map(c => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)} (${STATUS[c.status][0]})</option>`).join('')
  const kind = V.wards.find(w => w.id === t.wardId)?.kind || 'other'
  const secrets = [...t.secrets, {}, {}].slice(0, Math.max(2, t.secrets.length + 1))
  const offline = [...t.offline, {}, {}]
  return `<form data-form="task" data-id="${t.id || ''}">
    <h2>${t.id ? 'Edytuj zadanie' : 'Nowe zadanie'}</h2>
    <div class="grid3">
      <label><span>Godzina</span><input name="time" type="time" required value="${esc(t.time || '')}"></label>
      <label><span>Opis pory (np. „rano”, „po lekcjach”)</span><input name="timeLabel" value="${esc(t.timeLabel || '')}"></label>
      <label><span>Dotyczy</span><select name="wardId"><option value="">—</option>${V.wards.map(w => `<option value="${w.id}" ${t.wardId === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>
    </div>
    <label><span>Zadanie</span><input name="title" required maxlength="120" value="${esc(t.title || '')}" placeholder="np. Odebrać Kubę ze szkoły"></label>
    <label><span>Instrukcja dla osoby, która przejmie (szyfrowana; widzi ją tylko ta osoba, w trakcie zadania)</span><textarea name="instructions" rows="3">${esc(t.instructions || '')}</textarea></label>
    <h3>Kolejka zaufanych osób</h3>
    <div class="grid3">${[0, 1, 2].map(i => `<label><span>${i + 1}. osoba</span><select name="q${i}">${opts(t.queue[i])}</select></label>`).join('')}</div>
    <p class="muted"><small>Osoby, które nie przyjęły roli, są pomijane. Dodaj osoby w zakładce „Zaufane osoby”.</small></p>
    <h3>🔒 Dostępy czasowe ${V.features.timedAccess ? '' : '<span class="chip wait">pakiet rodzinny</span>'}</h3>
    ${V.features.timedAccess ? `<p class="muted"><small>Np. kod do skrytki z kluczem, dawkowanie leków. Wydawane osobie, która przejęła zadanie, od ${V.settings.accessLeadMin} min przed godziną zadania; wygasają po oznaczeniu „wykonane”, zakończeniu planu lub ${V.settings.accessGraceMin} min po czasie.</small></p>
    ${secrets.map((s, i) => `<div class="grid2"><label><span>Nazwa</span><input name="sl${i}" value="${esc(s.label || '')}" placeholder="np. Kod do skrytki"></label><label><span>Treść (szyfrowana)</span><input name="sv${i}" value="${esc(s.value || '')}"><input type="hidden" name="si${i}" value="${esc(s.id || '')}"></label></div>`).join('')}`
    : '<p class="muted"><small>W pakiecie bezpłatnym nie można przechowywać kodów ani dawkowania.</small></p>'}
    <h3>📋 Do załatwienia poza aplikacją</h3>
    <p class="note"><small>Aplikacja nie zastępuje dokumentów. Np. szkoła może nie wydać dziecka bez pisemnego upoważnienia, a apteka leków bez recepty lub upoważnienia – załatw to wcześniej i odhacz.</small></p>
    ${offline.map((o, i) => `<div class="row"><label style="flex:1"><input name="ot${i}" value="${esc(o.text || '')}" placeholder="np. upoważnienie w sekretariacie szkoły"></label><label><input type="checkbox" name="od${i}" ${o.done ? 'checked' : ''}> załatwione</label></div>`).join('')}
    <p><small>Podpowiedzi: ${OFFLINE_HINTS[kind].map(h => `<button type="button" data-hint="${esc(h)}">+ ${esc(h.slice(0, 50))}…</button>`).join('')}</small></p>
    <button class="primary" type="submit">Zapisz</button> <button type="button" data-act="cancelEdit">Anuluj</button>
  </form>`
}

function contacts() {
  const c = editing?.type === 'contact' ? (V.contacts.find(x => x.id === editing.id) || {}) : null
  if (c) return `<form data-form="contact" data-id="${c.id || ''}"><h2>${c.id ? 'Edytuj osobę' : 'Nowa zaufana osoba'}</h2>
    <div class="grid2"><label><span>Imię (jak ma się wyświetlać)</span><input name="name" required value="${esc(c.name || '')}"></label>
    <label><span>Telefon (na niego idą SMS-y)</span><input name="phone" required value="${esc(c.phone || '')}"></label></div>
    <label><span>Relacja</span><input name="relation" value="${esc(c.relation || '')}" placeholder="np. siostra, sąsiad"></label>
    <label><input type="checkbox" name="canTrigger" ${c.canTrigger ? 'checked' : ''}> Może uruchomić plan (np. gdy dowie się, że jestem w szpitalu) i potwierdzić/anulować zgłoszenie</label>
    <button class="primary" type="submit">Zapisz</button> <button type="button" data-act="cancelEdit">Anuluj</button></form>`
  return `<div class="row"><h2>Zaufane osoby (${V.contacts.length}/${V.features.maxContacts})</h2><button class="primary" data-edit="contact">+ Dodaj osobę</button></div>
    <p class="muted"><small>Każda osoba dostaje zaproszenie i musi świadomie przyjąć rolę. Dopiero wtedy plan może jej przydzielać zadania. Bez tego plan jest martwy.</small></p>
    <ul class="list">${V.contacts.map(x => `<li><div class="row"><div><b>${esc(x.name)}</b> ${statusChip(x)} ${x.canTrigger ? '<span class="chip done">może uruchomić</span>' : ''}<br>
      <small>${esc(x.phone)} ${x.relation ? '· ' + esc(x.relation) : ''} · dane potwierdzone: ${fmtDate(x.lastConfirmedAt)}</small><br>
      <small class="muted">W kolejkach: ${V.tasks.filter(t => t.queue.includes(x.id)).map(t => `${esc(t.title)} (#${t.queue.indexOf(x.id) + 1})`).join(', ') || '—'}</small></div>
      <div><button data-invite="${x.id}">${x.status === 'draft' ? 'Wyślij zaproszenie' : 'Wyślij link ponownie'}</button><button data-edit="contact" data-id="${x.id}">Edytuj</button><button data-del="contacts" data-id="${x.id}">Usuń</button></div></div></li>`).join('') || '<li class="muted">Brak osób.</li>'}</ul>`
}

function wards() {
  const w = editing?.type === 'ward' ? (V.wards.find(x => x.id === editing.id) || {}) : null
  if (w) return `<form data-form="ward" data-id="${w.id || ''}"><h2>${w.id ? 'Edytuj' : 'Nowy podopieczny'}</h2>
    <div class="grid2"><label><span>Imię</span><input name="name" required value="${esc(w.name || '')}"></label>
    <label><span>Rodzaj</span><select name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${w.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <label><span>Ważne informacje (zdrowie, alergie, szkoła…) – szyfrowane; widzi je tylko osoba, która przejęła zadanie dla tej osoby</span><textarea name="notes" rows="4">${esc(w.notes || '')}</textarea></label>
    <button class="primary" type="submit">Zapisz</button> <button type="button" data-act="cancelEdit">Anuluj</button></form>`
  return `<div class="row"><h2>Podopieczni (${V.wards.length}/${V.features.maxWards})</h2><button class="primary" data-edit="ward">+ Dodaj</button></div>
    <ul class="list">${V.wards.map(x => `<li><div class="row"><div><b>${esc(x.name)}</b> <small class="muted">${KIND[x.kind]}</small><br><small>${esc(x.notes).slice(0, 140)}</small></div>
      <div><button data-edit="ward" data-id="${x.id}">Edytuj</button><button data-del="wards" data-id="${x.id}">Usuń</button></div></div></li>`).join('') || '<li class="muted">Brak podopiecznych.</li>'}</ul>`
}

function drill() {
  const drills = V.activations.filter(a => a.kind === 'drill')
  const reals = V.activations.filter(a => a.kind === 'real')
  return `<h2>Próbny alarm</h2>
    <p>Plan uruchamia się rzadko, a dane szybko się starzeją. Ćwiczenie wysyła zaufanym osobom wiadomości oznaczone <b>[ĆWICZENIE]</b>, przechodzi przez kolejki tak jak prawdziwy alarm (z eskalacją) i sprawdza, kto reaguje. <b>Nie wydaje żadnych kodów ani danych medycznych.</b> Zalecane co pół roku.</p>
    <button class="primary big" data-act="drill">Rozpocznij próbny alarm</button>
    <h3>Wyniki ćwiczeń</h3>
    ${drills.map(a => `<div class="card"><b>${fmtDateTime(a.createdAt)}</b> – ${a.status === 'active' ? '<span class="chip wait">w toku</span>' : esc(a.endReason)}
      ${a.report ? `<p>Obsadzone zadania: <b>${a.report.covered}/${a.report.tasks.length}</b></p>
      <ul>${a.report.tasks.map(t => `<li>${esc(t.title)}: ${esc(t.outcome)} <small class="muted">(prób: ${t.attempts})</small></li>`).join('')}</ul>
      <p><b>Reakcje osób:</b></p><ul>${a.report.contacts.map(c => `<li>${esc(c.name)}: przejął(-ęła) ${c.accepted}, odmówił(a) ${c.declined}, bez odpowiedzi ${c.timeouts}${c.skipped ? `, <span class="lvl-critical">pominięta ${c.skipped}× (nie przyjęła roli)</span>` : ''}${c.avgResponseMin != null ? ` · średni czas reakcji ${c.avgResponseMin} min` : ''}</li>`).join('')}</ul>
      ${a.report.silent.length ? `<p class="lvl-critical">Nie zareagowali: ${a.report.silent.map(esc).join(', ')} – zadzwoń i sprawdź numer.</p>` : ''}
      ${a.report.issues.length ? `<p><b>Do aktualizacji:</b></p><ul>${a.report.issues.map(i => `<li class="lvl-${i.level}">${esc(i.text)}</li>`).join('')}</ul>` : ''}` : ''}</div>`).join('') || '<p class="muted">Jeszcze nie było ćwiczeń.</p>'}
    <h3>Prawdziwe uruchomienia</h3>
    ${reals.map(a => `<p>${fmtDateTime(a.createdAt)} – ${esc(a.sourceLabel)} – <b>${{ pending: 'oczekuje', active: 'aktywny', ended: 'zakończony', cancelled: 'anulowany' }[a.status]}</b> ${a.endReason ? `(${esc(a.endReason)})` : ''}</p>`).join('') || '<p class="muted">Brak.</p>'}`
}

function card() {
  return `<h2>Karta do portfela z kodem QR</h2>
    <p>Wydrukuj kartę i noś ją przy dokumentach. Osoba, która ją zeskanuje (np. personel SOR), zobaczy tylko Twoje imię i formularz „zgłoś, że ta osoba potrzebuje pomocy”. Zgłoszenie z karty uruchamia plan po <b>${V.settings.qrCancelWindowMin} min</b>, chyba że Ty je anulujesz albo zaufana osoba potwierdzi lub odrzuci wcześniej.</p>
    <button class="primary" data-act="printCard">Pokaż kartę do druku</button>
    <button data-act="rotateCard">Zgubiłem/am kartę – unieważnij i wygeneruj nową</button>`
}

function settings() {
  const S = V.settings
  const ci = V.checkin
  return `<form data-form="settings"><h2>Ustawienia planu</h2>
    <div class="grid3">
      <label><span>Czas na potwierdzenie zadania (min)</span><input name="ackTimeoutMin" type="number" min="5" max="240" value="${S.ackTimeoutMin}"></label>
      <label><span>Okno na anulowanie zgłoszenia (min)</span><input name="cancelWindowMin" type="number" min="0" max="120" value="${S.cancelWindowMin}"></label>
      <label><span>Okno na anulowanie – karta QR (min)</span><input name="qrCancelWindowMin" type="number" min="5" max="180" value="${S.qrCancelWindowMin}"></label>
      <label><span>Dostęp wydawany przed zadaniem (min)</span><input name="accessLeadMin" type="number" min="0" value="${S.accessLeadMin}"></label>
      <label><span>Dostęp wygasa po zadaniu (min)</span><input name="accessGraceMin" type="number" min="15" value="${S.accessGraceMin}"></label>
    </div>
    <label><span>Co robić, gdy nikt nie przejmie zadania (widzą to zaufane osoby, gdy plan jest aktywny; szyfrowane)</span><textarea name="emergencyNote" rows="3">${esc(S.emergencyNote)}</textarea></label>
    <label><input type="checkbox" name="cardRevealIce" ${S.cardRevealIce ? 'checked' : ''}> Po zgłoszeniu z karty QR pokaż zgłaszającemu imię i telefon pierwszej zaufanej osoby</label>
    <button class="primary" type="submit">Zapisz ustawienia</button></form>
    <hr>
    <form data-form="checkin"><h2>Codzienny check-in „jestem OK” ${V.features.checkin ? '' : '<span class="chip wait">pakiet rodzinny</span>'}</h2>
    <p class="muted"><small>Dla osób mieszkających samotnie. Jeśli nie potwierdzisz do wybranej godziny, dostaniesz przypomnienie; jeśli nadal nic – plan zostanie zgłoszony do uruchomienia (z oknem na anulowanie).</small></p>
    <label><input type="checkbox" name="enabled" ${ci.enabled ? 'checked' : ''} ${V.features.checkin ? '' : 'disabled'}> Włącz codzienny check-in</label>
    <div class="grid3"><label><span>Potwierdzam codziennie do</span><input type="time" name="time" value="${ci.time}"></label>
    <label><span>Czas po przypomnieniu (min)</span><input type="number" name="graceMin" min="15" value="${ci.graceMin}"></label>
    <label><span>Przerwa (urlop) do dnia</span><input type="date" name="pausedUntil" value="${ci.pausedUntil ? new Date(ci.pausedUntil).toISOString().slice(0, 10) : ''}"></label></div>
    <button class="primary" type="submit" ${V.features.checkin ? '' : 'disabled'}>Zapisz check-in</button></form>
    <hr>
    <form data-form="profile"><h2>Twoje dane</h2><div class="grid2">
    <label><span>Imię i nazwisko</span><input name="name" value="${esc(V.owner.name)}"></label><label><span>Telefon</span><input name="phone" value="${esc(V.owner.phone)}"></label></div>
    <button type="submit">Zapisz</button></form>
    <hr>
    <h2>Pakiet</h2>
    <p class="muted"><small>Prototyp: zmiana pakietu jest symulowana, bez płatności.</small></p>
    ${['free', 'family', 'b2b'].map(k => `<button data-tier="${k}" class="${V.tier === k ? 'primary' : ''}">${{ free: 'Podstawowy', family: 'Rodzinny', b2b: 'B2B' }[k]}</button>`).join('')}
    <p><small>Podstawowy: 1 podopieczny, 3 zadania, 3 osoby, próbne alarmy, karta QR. Rodzinny: więcej zadań i osób, dostępy czasowe, check-in. B2B: jak rodzinny + raporty dla organizacji (do zbudowania).</small></p>`
}

function log() {
  return `<h2>Dziennik zdarzeń</h2><p class="muted"><small>Każde zgłoszenie, przejęcie zadania i odczyt dostępu jest zapisywany.</small></p>
    <ul>${V.audit.map(a => `<li><small>${fmtDateTime(a.at)} · <b>${esc(a.actor)}</b>: ${esc(a.action)} ${a.detail ? `<span class="muted">– ${esc(a.detail)}</span>` : ''}</small></li>`).join('')}</ul>
    <h2>Wysłane powiadomienia</h2>
    <ul>${V.messages.map(m => `<li><small>${fmtDateTime(m.at)} → <b>${esc(m.toName)}</b>: ${esc(m.text)}</small></li>`).join('') || '<li class="muted">Brak.</li>'}</ul>`
}

// ---------- akcje ----------
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); await load(); return r } catch (e) { toast(e.message, true) }
}

function formData(form) {
  const o = {}
  for (const el of form.elements) if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value
  return o
}

document.addEventListener('input', e => { const f = e.target.closest('form'); if (f) f.dataset.dirty = '1' })

document.addEventListener('click', async e => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.tab) { tab = b.dataset.tab; editing = null; return render() }
  if (b.dataset.edit) { editing = { type: b.dataset.edit, id: b.dataset.id || null }; return render() }
  if (b.dataset.hint) {
    const empty = $$('input[name^="ot"]').find(i => !i.value)
    if (empty) { empty.value = b.dataset.hint; empty.closest('form').dataset.dirty = '1' } else toast('Zapisz i dodaj kolejne')
    return
  }
  if (b.dataset.del) {
    if (!(await ask('Na pewno usunąć?', { ok: 'Usuń', danger: true }))) return
    return act(() => api(`/api/owner/${b.dataset.del}/${b.dataset.id}`, { method: 'DELETE' }), 'Usunięto')
  }
  if (b.dataset.invite) {
    const r = await act(() => api(`/api/owner/contacts/${b.dataset.invite}/invite`, { method: 'POST' }), 'Zaproszenie wysłane (symulowany SMS)')
    if (r?.link) console.info('Link zaproszenia (tylko demo):', location.origin + r.link)
    return
  }
  if (b.dataset.tier) return act(() => api('/api/owner/tier', { method: 'PUT', body: { tier: b.dataset.tier } }), 'Zmieniono pakiet (symulacja)')
  switch (b.dataset.act) {
    case 'cancelEdit': editing = null; return render()
    case 'cancel': return act(() => api('/api/owner/cancel', { method: 'POST' }), 'Zgłoszenie anulowane. Zaufane osoby dostały informację.')
    case 'end': if (await ask('Zakończyć? Wszystkie dostępy wygasną.', { ok: 'Zakończ' })) return act(() => api('/api/owner/end', { method: 'POST' }), 'Zakończono')
      return
    case 'ok': return act(() => api('/api/owner/checkin/ok', { method: 'POST' }), 'Dzięki! Potwierdzono „jestem OK”.')
    case 'review': return act(() => api('/api/owner/review', { method: 'POST' }), 'Zapisano datę przeglądu')
    case 'drill': if (await ask('Rozpocząć próbny alarm? Zaufane osoby dostaną wiadomości oznaczone [ĆWICZENIE].', { ok: 'Rozpocznij' })) return act(() => api('/api/owner/drill', { method: 'POST' }), 'Próbny alarm rozpoczęty')
      return
    case 'printCard': location.href = 'card-print.html#t=' + encodeURIComponent((location.hash.match(/t=([\w-]+)/) || [])[1]); return
    case 'rotateCard': if (await ask('Stara karta przestanie działać. Kontynuować?', { ok: 'Wydaj nową kartę', danger: true })) return act(() => api('/api/owner/card/rotate', { method: 'POST' }), 'Wydano nową kartę – wydrukuj ją ponownie')
  }
})

document.addEventListener('submit', async e => {
  e.preventDefault()
  const f = e.target
  const d = formData(f)
  const id = f.dataset.id
  let req
  switch (f.dataset.form) {
    case 'task': {
      const body = { title: d.title, time: d.time, timeLabel: d.timeLabel, wardId: d.wardId, instructions: d.instructions, queue: [d.q0, d.q1, d.q2].filter(Boolean), offline: [] }
      for (let i = 0; `ot${i}` in d; i++) if (d[`ot${i}`].trim()) body.offline.push({ text: d[`ot${i}`], done: d[`od${i}`] })
      if (V.features.timedAccess) { body.secrets = []; for (let i = 0; `sl${i}` in d; i++) if (d[`sl${i}`] || d[`sv${i}`]) body.secrets.push({ id: d[`si${i}`] || undefined, label: d[`sl${i}`], value: d[`sv${i}`] }) }
      req = () => api(id ? `/api/owner/tasks/${id}` : '/api/owner/tasks', { method: id ? 'PUT' : 'POST', body })
      break
    }
    case 'contact': req = () => api(id ? `/api/owner/contacts/${id}` : '/api/owner/contacts', { method: id ? 'PUT' : 'POST', body: d }); break
    case 'ward': req = () => api(id ? `/api/owner/wards/${id}` : '/api/owner/wards', { method: id ? 'PUT' : 'POST', body: d }); break
    case 'settings': req = () => api('/api/owner/settings', { method: 'PUT', body: d }); break
    case 'checkin': req = () => api('/api/owner/checkin', { method: 'PUT', body: d }); break
    case 'profile': req = () => api('/api/owner/profile', { method: 'PUT', body: d }); break
  }
  try {
    await req()
    toast('Zapisano')
    editing = null
    delete f.dataset.dirty
    await load()
  } catch (err) { toast(err.message, true) }
})

window.addEventListener('hashchange', load)
demoBar()
await load()
live(() => load())
setInterval(() => { if (renderPending && !$('form[data-dirty]')) render() }, 2000)
