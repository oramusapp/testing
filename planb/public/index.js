import { $, esc, api, demoBar } from './common.js'
const info = await api('/api/info', { auth: '' })
let html = `<h1>Plan B</h1>
  <p><b>Plan zastępstwa na wypadek, gdy nagle znikasz z życia osób, które od Ciebie zależą</b> – szpital, wypadek, brak kontaktu.
  Plan sam rozdziela Twoje codzienne obowiązki (odbiór dziecka, leki mamy, spacer z psem) między zaufane osoby, eskaluje, gdy ktoś nie odpowiada, pokazuje stan na żywo i wydaje kody tylko na czas zadania.</p>`
if (info.demo) {
  const d = await api('/api/demo', { auth: '' })
  const L = d.links
  html += `<div class="card alert wait"><h2>Tryb demo – otwórz role w osobnych kartach</h2>
    <ul>
      <li><a href="${esc(L.owner)}" target="_blank"><b>Anna – właścicielka planu</b></a> (konfiguracja, próbny alarm, anulowanie)</li>
      ${L.contacts.map(c => `<li><a href="${esc(c.link)}" target="_blank">${esc(c.name)}</a></li>`).join('')}
      <li><a href="${esc(L.card)}" target="_blank">Karta QR – widok personelu SOR</a></li>
      <li><a href="/outbox.html" target="_blank">📨 Symulowane SMS-y</a></li>
    </ul>
    <h3>Scenariusz do przejścia</h3>
    <ol>
      <li>W widoku Anny przejrzyj „Gotowość planu” – Ewa nie potwierdziła roli, Piotr ma nieaktualne dane, brakuje upoważnienia w szkole.</li>
      <li>Zakładka „Próbny alarm” → rozpocznij. W kartach Marty/Piotra/Tomka przejmij lub odmów zadań; przewiń czas (+20 min), żeby zobaczyć eskalację. Odczytaj raport.</li>
      <li>W karcie Marty: „Zgłoś uruchomienie planu”. Anna widzi odliczanie i może anulować. Albo w karcie Piotra: „Potwierdzam – uruchom teraz”.</li>
      <li>Plan aktywny: w kartach osób przejmuj zadania, przewijaj czas, obserwuj przejście do kolejnej osoby i „BRAK OPIEKUNA”. Po przejęciu – „Pokaż kody” (działa tylko w oknie czasowym), potem „Zrobione” → dostęp wygasa.</li>
      <li>Karta QR: zgłoś jako personel SOR – plan uruchomi się po 30 min, jeśli nikt nie anuluje.</li>
    </ol>
    <p><small>Czas serwera przesuwasz paskiem na górze. Żeby zacząć od nowa: zatrzymaj serwer i usuń <code>data/demo.json</code>.</small></p></div>`
}
if (info.signup) html += `<form id="f" class="card"><h2>Załóż swój plan</h2>
  <div class="grid2"><label><span>Imię i nazwisko</span><input name="ownerName" required></label><label><span>Telefon</span><input name="ownerPhone" required></label></div>
  <button class="primary" type="submit">Utwórz plan</button></form>`
$('#app').innerHTML = html
$('#f')?.addEventListener('submit', async e => {
  e.preventDefault()
  try {
    const r = await api('/api/accounts', { method: 'POST', body: Object.fromEntries(new FormData(e.target)), auth: '' })
    const url = location.origin + r.ownerLink
    e.target.outerHTML = `<div class="card alert ok"><h2>Plan utworzony</h2><p><b>Zapisz ten link – to Twój jedyny klucz do planu</b> (prototyp nie ma logowania hasłem):</p><p class="secret">${esc(url)}</p><a class="btn primary" href="${esc(r.ownerLink)}">Przejdź do planu</a></div>`
  } catch (err) { alert(err.message) }
})
demoBar()
