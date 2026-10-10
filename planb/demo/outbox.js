// Tylko tryb demo: podgląd wiadomości, które w produkcji poszłyby SMS-em / push.
import { $, esc, api, live, fmtDateTime, demoBar } from './common.js'
async function load() {
  try {
    const list = await api('/api/demo/outbox', { auth: '' })
    $('#app').innerHTML = `<h1>📨 Symulowane SMS-y / push</h1><p class="muted">W produkcji te wiadomości wysyła bramka SMS i powiadomienia push. Kliknij link, aby otworzyć widok odbiorcy.</p>
      <ul class="list">${list.map(m => `<li class="${m.drill ? '' : ''}"><div class="row"><b>→ ${esc(m.toName)}</b> <small class="muted">${esc(m.toPhone)} · ${fmtDateTime(m.at)}</small></div>
        <pre class="msg">${esc(m.text)}</pre>${m.link ? `<a href="${esc(m.link)}">otwórz link z wiadomości</a>` : ''}</li>`).join('') || '<li class="muted">Brak wiadomości.</li>'}</ul>`
  } catch (e) { $('#app').innerHTML = `<p>${esc(e.message)}</p>` }
}
demoBar()
load()
live(load, { all: true })
