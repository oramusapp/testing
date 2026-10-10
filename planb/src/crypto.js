// Szyfrowanie pól wrażliwych (AES-256-GCM) i tokeny dostępu.
// Klucz: zmienna PLANB_KEY (32 bajty w base64) albo – tylko w prototypie – plik data/key.bin.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

let KEY = null

export function setKey(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== 32) throw new Error('Klucz musi mieć dokładnie 32 bajty')
  KEY = buf
}

export function initKey(dataDir) {
  if (process.env.PLANB_KEY) {
    setKey(Buffer.from(process.env.PLANB_KEY, 'base64'))
    return 'env'
  }
  const file = path.join(dataDir, 'key.bin')
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32), { mode: 0o600 })
  setKey(fs.readFileSync(file))
  return 'file'
}

export function enc(text) {
  if (text == null || text === '') return ''
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()])
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

export function dec(blob) {
  if (!blob) return ''
  const b = Buffer.from(blob.slice(3), 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}

// 256-bitowe tokeny w linkach; w bazie trzymamy tylko ich skrót SHA-256.
export const newToken = () => crypto.randomBytes(32).toString('base64url')
export const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex')
export const newId = () => crypto.randomBytes(8).toString('hex')
