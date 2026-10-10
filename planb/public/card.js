// Strona otwierana po zeskanowaniu karty QR z portfela. Osoba obca widzi tylko imię
// i formularz zgłoszenia – żadnych danych o bliskich, adresów ani kodów.
import { $, esc, api, fmtTime, toast } from './common.js'

async function main() {
  let v
  try { v = await api('/api/card') } catch (e) { $('#app').innerHTML = `<div class="card alert bad"><h2>Karta nieważna</h2><p>${esc(e.message)}</p><p>W nagłym wypadku dzwoń pod 112.</p></div>`; return }
  $('#app').innerHTML = `<div class="card alert wait"><h1>Karta Planu B: ${esc(v.firstName)}</h1>
    <p>${esc(v.firstName)} opiekuje się bliskimi (np. dzieckiem, starszym rodzicem lub zwierzęciem), którzy mogą zostać bez opieki.</p>
    <p><b>Jeśli ta osoba jest w szpitalu, miała wypadek lub nie może się kontaktować</b> – wypełnij poniższe pola. Powiadomimy jej zaufane osoby, które przejmą opiekę.</p>
    <p class="muted"><small>To nie jest numer alarmowy. W zagrożeniu życia dzwoń pod 112.</small></p></div>
    <form id="f" class="card">
      <label><span>Kim jesteś? (imię i nazwisko / funkcja)</span><input name="name" required maxlength="80" placeholder="np. pielęgniarka SOR, Jan Nowak"></label>
      <label><span>Gdzie jest ${esc(v.firstName)}?</span><input name="place" maxlength="120" placeholder="np. SOR Szpital Bielański, Warszawa"></label>
      <label><span>Telefon kontaktowy do Ciebie lub oddziału</span><input name="phone" maxlength="30"></label>
      <label><span>Krótki opis (opcjonalnie)</span><input name="note" maxlength="300"></label>
      <button class="danger big" type="submit">Powiadom zaufane osoby</button>
    </form>`
  $('#f').addEventListener('submit', async e => {
    e.preventDefault()
    const body = Object.fromEntries(new FormData(e.target))
    e.target.querySelector('button').disabled = true
    try {
      const r = await api('/api/card/report', { method: 'POST', body })
      $('#app').innerHTML = `<div class="card alert ok"><h1>Dziękujemy – zgłoszenie przyjęte</h1>
        <p>Zaufane osoby i sama właścicielka/właściciel karty zostali powiadomieni. ${r.status === 'pending' ? `Jeśli nikt nie anuluje zgłoszenia, plan opieki uruchomi się o ${fmtTime(r.activateAt)}.` : 'Plan opieki jest uruchomiony.'}</p>
        ${r.ice ? `<p>Osoba kontaktowa: <b>${esc(r.ice.name)}</b>, tel. <a href="tel:${esc(r.ice.phone)}">${esc(r.ice.phone)}</a></p>` : ''}</div>`
    } catch (err) {
      e.target.querySelector('button').disabled = false
      toast(err.message, true)
    }
  })
}
main()
