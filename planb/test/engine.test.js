// Testy pełnego scenariusza na logice domenowej z symulowanym zegarem.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { setKey } from '../src/crypto.js'
import { emptyData } from '../src/store.js'
import * as D from '../src/domain.js'

setKey(crypto.randomBytes(32))
const { MIN, DAY } = D

function setup({ tier = 'family', start = new Date(2026, 9, 12, 9, 0).getTime() } = {}) {
  const data = emptyData()
  const outbox = []
  const ctx = { data, now: start, deliver: m => outbox.push(m) }
  const { acc } = D.createAccount(ctx, { ownerName: 'Anna Test', ownerPhone: '+48 1', tier })
  const w = D.upsertWard(ctx, acc, null, { name: 'Kuba', kind: 'child', notes: 'alergia' })
  const c = ['Marta', 'Ewa', 'Piotr'].map((n, i) => D.upsertContact(ctx, acc, null, { name: n, phone: '+48 ' + i, canTrigger: n !== 'Ewa' }))
  for (const x of c) D.inviteContact(ctx, acc, x.id)
  D.respondRole(ctx, acc, c[0], true)
  D.respondRole(ctx, acc, c[2], true) // Ewa nie przyjmuje roli
  const task = D.upsertTask(ctx, acc, null, {
    title: 'Odebrać Kubę', time: '15:00', wardId: w.id, queue: c.map(x => x.id), instructions: 'świetlica',
    secrets: tier === 'free' ? undefined : [{ label: 'hasło', value: 'rower' }], offline: [{ text: 'upoważnienie', done: false }],
  })
  const advance = min => { for (let i = 0; i < min; i++) { ctx.now += MIN; D.tick(ctx, acc) } }
  return { ctx, acc, c, task, outbox, advance }
}

test('wrażliwe pola są zaszyfrowane w magazynie', () => {
  const { acc, task } = setup()
  const raw = JSON.stringify(acc)
  assert.ok(!raw.includes('rower'))
  assert.ok(!raw.includes('świetlica'))
  assert.ok(!raw.includes('alergia'))
  assert.match(task.instructionsEnc, /^v1:/)
})

test('zgłoszenie przez zaufaną osobę: okno anulowania, potem automatyczne uruchomienie', () => {
  const { ctx, acc, c, advance } = setup()
  const act = D.trigger(ctx, acc, { source: 'contact', actorId: c[0].id, actorName: 'Marta', detail: 'szpital' })
  assert.equal(act.status, 'pending')
  advance(14)
  assert.equal(act.status, 'pending')
  advance(1)
  assert.equal(act.status, 'active')
  assert.equal(act.instances.length, 1)
})

test('właściciel anuluje fałszywy alarm; zgłaszający nie może sam potwierdzić', () => {
  const { ctx, acc, c, advance } = setup()
  D.trigger(ctx, acc, { source: 'contact', actorId: c[0].id, actorName: 'Marta' })
  assert.throws(() => D.confirmPending(ctx, acc, c[0]), /inna osoba/)
  D.cancelPending(ctx, acc, 'właściciel')
  advance(30)
  assert.equal(acc.activations[0].status, 'cancelled')
  assert.equal(D.openActivation(acc), null)
})

test('inna zaufana osoba może potwierdzić zgłoszenie z karty QR od razu', () => {
  const { ctx, acc, c } = setup()
  const r = D.cardReport(ctx, acc, { name: 'Pielęgniarka SOR', place: 'Szpital X' })
  assert.equal(r.status, 'pending')
  assert.equal(acc.activations[0].activateAt - ctx.now, 30 * MIN)
  D.confirmPending(ctx, acc, c[2])
  assert.equal(acc.activations[0].status, 'active')
})

test('eskalacja: brak odpowiedzi → kolejna osoba, pominięcie niepotwierdzonej, brak opiekuna, zgłoszenie się', () => {
  const { ctx, acc, c, advance, outbox } = setup()
  ctx.now = new Date(2026, 9, 12, 9, 0).getTime()
  acc.settings.cancelWindowMin = 0
  const act = D.trigger(ctx, acc, { source: 'contact', actorId: c[0].id, actorName: 'Marta' })
  const inst = act.instances[0]
  assert.equal(inst.offeredTo, c[0].id)
  advance(20)
  // Ewa (bez przyjętej roli) pominięta → Piotr
  assert.equal(inst.offeredTo, c[2].id)
  assert.ok(inst.history.some(h => h.event === 'skipped' && h.contactId === c[1].id))
  D.instanceAction(ctx, acc, c[2], inst.id, 'decline')
  assert.equal(inst.state, 'uncovered')
  assert.ok(outbox.some(m => m.to === c[0].id && /nikt z kolejki/.test(m.text)))
  D.instanceAction(ctx, acc, c[0], inst.id, 'claim')
  assert.equal(inst.state, 'accepted')
  assert.equal(inst.acceptedBy, c[0].id)
})

test('dostęp czasowy: tylko w oknie, tylko dla przejmującego, wygasa po wykonaniu', () => {
  const { ctx, acc, c, advance } = setup()
  acc.settings.cancelWindowMin = 0
  const act = D.trigger(ctx, acc, { source: 'contact', actorId: c[0].id, actorName: 'Marta' })
  const inst = act.instances[0]
  D.instanceAction(ctx, acc, c[0], inst.id, 'accept')
  assert.throws(() => D.revealSecrets(ctx, acc, c[2], inst.id), /tylko osoba/)
  assert.throws(() => D.revealSecrets(ctx, acc, c[0], inst.id), /od 14:00/) // 9:00, okno od 14:00
  advance(5 * 60)
  assert.equal(D.revealSecrets(ctx, acc, c[0], inst.id).secrets[0].value, 'rower')
  D.instanceAction(ctx, acc, c[0], inst.id, 'done')
  assert.throws(() => D.revealSecrets(ctx, acc, c[0], inst.id), /wygasł/)
})

test('dostęp wygasa po zakończeniu planu', () => {
  const { ctx, acc, c, advance } = setup()
  acc.settings.cancelWindowMin = 0
  const act = D.trigger(ctx, acc, { source: 'contact', actorId: c[0].id, actorName: 'Marta' })
  D.instanceAction(ctx, acc, c[0], act.instances[0].id, 'accept')
  advance(5 * 60)
  D.endActivation(ctx, acc, act, 'właściciel', 'wróciła')
  assert.throws(() => D.revealSecrets(ctx, acc, c[0], act.instances[0].id), /zakończony/)
})

test('zadania powtarzają się następnego dnia, pierwszeństwo ma osoba z poprzedniego dnia', () => {
  const { ctx, acc, c, advance } = setup()
  acc.settings.cancelWindowMin = 0
  const act = D.trigger(ctx, acc, { source: 'contact', actorId: c[2].id, actorName: 'Piotr' })
  advance(20)
  D.instanceAction(ctx, acc, c[2], act.instances[0].id, 'accept')
  advance(11 * 60) // 20:20 → minęło 15:00 + 4 h
  assert.equal(act.instances.length, 2)
  assert.equal(act.instances[1].history.find(h => h.event === 'offered').contactId, c[2].id)
})

test('próbny alarm: bez kodów, raport z reakcjami, aktualizacja daty ćwiczenia', () => {
  const { ctx, acc, c, advance } = setup()
  const act = D.startDrill(ctx, acc)
  const inst = act.instances[0]
  assert.throws(() => D.revealSecrets(ctx, acc, c[0], inst.id), /ćwiczenia/)
  advance(20) // Marta milczy → Ewa pominięta → Piotr
  D.instanceAction(ctx, acc, c[2], inst.id, 'accept')
  assert.equal(act.status, 'ended')
  assert.equal(act.report.covered, 1)
  assert.deepEqual(act.report.silent, ['Marta'])
  assert.deepEqual(act.report.skipped, ['Ewa'])
  assert.equal(acc.lastDrillAt, ctx.now)
  assert.ok(act.report.issues.some(i => /Ewa/.test(i.text)))
  assert.ok(!act.report.issues.some(i => /próbn/.test(i.text)))
})

test('check-in: przypomnienie, potem zgłoszenie z oknem anulowania', () => {
  const { ctx, acc, advance, outbox } = setup()
  D.updateCheckin(ctx, acc, { enabled: true, time: '10:00', graceMin: 60 })
  advance(26 * 60 + 1) // następny dzień 11:01, brak „jestem OK” od 10:00 + 60 min
  assert.ok(outbox.some(m => m.to === 'owner' && /jestem OK/.test(m.text)))
  assert.equal(D.openActivation(acc)?.source, 'checkin')
  const act = D.openActivation(acc)
  assert.equal(act.status, 'pending')
})

test('check-in potwierdzony = brak alarmu', () => {
  const { ctx, acc, advance } = setup()
  D.updateCheckin(ctx, acc, { enabled: true, time: '10:00', graceMin: 60 })
  advance(15 * 60) // do północy
  advance(9 * 60)
  D.checkinOk(ctx, acc)
  advance(4 * 60)
  assert.equal(D.openActivation(acc), null)
})

test('pakiet bezpłatny: limit zadań, brak dostępów czasowych i check-inu', () => {
  const { ctx, acc } = setup({ tier: 'free' })
  D.upsertTask(ctx, acc, null, { title: 'a', time: '08:00' })
  D.upsertTask(ctx, acc, null, { title: 'b', time: '09:00' })
  assert.throws(() => D.upsertTask(ctx, acc, null, { title: 'c', time: '10:00' }), e => e.status === 402)
  assert.throws(() => D.upsertTask(ctx, acc, acc.tasks[0].id, { title: 'a', time: '08:00', secrets: [{ label: 'x', value: 'y' }] }), e => e.status === 402)
  assert.throws(() => D.updateCheckin(ctx, acc, { enabled: true, time: '09:00', graceMin: 60 }), e => e.status === 402)
})

test('gotowość wykrywa nieaktualne dane i brak ćwiczenia', () => {
  const { ctx, acc } = setup()
  ctx.now += 200 * DAY
  const r = D.readiness(acc, ctx.now)
  const t = r.items.map(i => i.text).join('\n')
  assert.match(t, /Ewa: nie potwierdził/)
  assert.match(t, /niepotwierdzone od/)
  assert.match(t, /próbnego alarmu/)
  assert.match(t, /upoważnienie/)
  assert.ok(r.critical >= 1)
})

test('widok zaufanej osoby: przed przyjęciem roli brak danych; tylko przejmujący widzi instrukcję', () => {
  const { ctx, acc, c } = setup()
  acc.settings.cancelWindowMin = 0
  const act = D.trigger(ctx, acc, { source: 'contact', actorId: c[0].id, actorName: 'Marta' })
  const ewa = D.contactView(acc, c[1], ctx.now)
  assert.equal(ewa.activation, null)
  D.instanceAction(ctx, acc, c[0], act.instances[0].id, 'accept')
  assert.equal(D.contactView(acc, c[0], ctx.now).myTasks[0].instructions, 'świetlica')
  assert.equal(D.contactView(acc, c[2], ctx.now).myTasks.length, 0)
})
