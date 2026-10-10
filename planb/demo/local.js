// „Serwer w przeglądarce” dla wersji demo (np. na GitHub Pages): ten sam kod co serwer Node
// (src/app.js + src/domain.js), ale dane w localStorage, a SMS-y tylko w symulowanej skrzynce.
import { createApp } from './app.js'
import { BrowserStore } from './store.js'

const KEY = 'planb-demo-v1'
const store = new BrowserStore(KEY)
const app = createApp({ store, demo: true, allowSignup: true, keySource: 'browser' })
app.seedIfEmpty()

const listeners = new Set()
const channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel('planb-demo') : null
store.onChange = () => { channel?.postMessage(1); for (const f of listeners) f() }
if (channel) channel.onmessage = () => { store.reload(); for (const f of listeners) f() }
addEventListener('storage', e => { if (e.key === KEY) { store.reload(); for (const f of listeners) f() } })

// Zegar planu chodzi tylko w jednej otwartej karcie naraz (żeby karty nie dublowały eskalacji).
const runClock = () => setInterval(() => { store.reload(); app.tickAll() }, 5000)
if (navigator.locks) navigator.locks.request('planb-demo-clock', () => new Promise(() => runClock()))
else runClock()

globalThis.planbLocal = {
  async api(method, path, token, body) {
    store.reload()
    const [pathname, query] = path.split('?')
    if (pathname === '/api/info') return { demo: true, signup: true, now: app.now(), keySource: 'browser', browser: true }
    const r = await app.dispatch(method, pathname, token, body || {}, 'local', query)
    return JSON.parse(JSON.stringify(r))
  },
  subscribe(fn) { listeners.add(fn) },
  reset() {
    try { localStorage.removeItem(KEY) } catch {}
    channel?.postMessage(1)
    location.href = 'index.html'
  },
}
