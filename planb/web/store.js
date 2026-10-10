// Magazyn wersji przeglądarkowej: localStorage + synchronizacja między kartami.
export const emptyData = () => ({ version: 1, accounts: {}, tokens: {}, outbox: [], clockOffsetMs: 0, demo: null })

export class BrowserStore {
  constructor(key) {
    this.key = key
    this.onChange = () => {}
    this.dirty = false
    this.reload()
  }

  reload() {
    if (this.dirty) return
    let raw = null
    try { raw = localStorage.getItem(this.key) } catch {}
    this.data = raw ? { ...emptyData(), ...JSON.parse(raw) } : (this.data || emptyData())
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)) } catch (e) { console.error('Nie udało się zapisać danych demo', e) }
  }

  // Wiele zmian w jednej operacji (np. przewinięcie czasu o dobę) = jeden zapis.
  changed() {
    if (this.dirty) return
    this.dirty = true
    queueMicrotask(() => { this.dirty = false; this.save(); this.onChange() })
  }
}
