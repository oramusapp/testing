// Trwały magazyn: jeden plik JSON zapisywany atomowo (tmp + rename) po każdej zmianie.
// Prosty i odporny na restart; w produkcji do zastąpienia bazą (patrz README).
import fs from 'node:fs'

export const emptyData = () => ({ version: 1, accounts: {}, tokens: {}, outbox: [], clockOffsetMs: 0, demo: null })

export class Store {
  constructor(file) {
    this.file = file
    this.onChange = () => {}
    this.data = emptyData()
    if (file && fs.existsSync(file)) this.data = { ...emptyData(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  }

  save() {
    if (!this.file) return
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 })
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak')
    fs.renameSync(tmp, this.file)
  }

  changed(accountId) {
    this.save()
    this.onChange(accountId)
  }
}
