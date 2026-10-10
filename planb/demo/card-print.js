import { $, esc, api } from './common.js'
$('#back').href = 'owner.html' + location.hash
const v = await api('/api/owner/card')
const url = new URL(v.link, location.href).href
$('#url').textContent = url
$('#wallet').innerHTML = `<div class="qr" id="qr"></div><div>
  <h2>PLAN B – ${esc(v.firstName)}</h2>
  <b>Opiekuję się bliskimi, którzy mogą zostać bez opieki.</b><br>
  Jeśli jestem w szpitalu lub nie mogę się kontaktować – zeskanuj kod i powiadom moje zaufane osoby.<br><br>
  <small>W zagrożeniu życia: 112.</small></div>`
if (window.QRCode) new window.QRCode($('#qr'), { text: url, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel.M })
else $('#qr').textContent = 'QR niedostępny – użyj linku'
// W osadzonym widoku (np. strona na claude.ai) okno drukowania jest niedostępne.
if (window.top !== window) $('#print').hidden = true
else $('#print').addEventListener('click', () => window.print())
