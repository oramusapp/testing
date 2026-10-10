// WERSJA DEMO W PRZEGLĄDARCE: zamiennik src/crypto.js bez prawdziwego szyfrowania.
// Dane leżą wyłącznie w localStorage tej przeglądarki, a klucz i tak musiałby leżeć obok nich,
// więc szyfrowanie niczego by tu nie chroniło. Nie wpisuj prawdziwych danych.
const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)))
const rand = n => crypto.getRandomValues(new Uint8Array(n))

export const setKey = () => {}
export const initKey = () => 'browser'
export const enc = text => (text == null || text === '' ? '' : 'demo:' + b64(String(text)))
export const dec = blob => (blob ? unb64(blob.slice(5)) : '')
export const newToken = () => btoa(String.fromCharCode(...rand(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const hashToken = t => 't:' + String(t)
export const newId = () => [...rand(8)].map(b => b.toString(16).padStart(2, '0')).join('')
