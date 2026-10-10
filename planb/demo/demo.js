// Dane demonstracyjne: samotna mama Anna, syn Kuba, mama Halina i pies Burek.
// Daty „cofnięte w czasie”, żeby od razu było widać przypomnienia o nieaktualnych danych.
import * as D from './domain.js'

export function seedDemo(ctx) {
  const { acc, ownerToken } = D.createAccount(ctx, { ownerName: 'Anna Kowalska', ownerPhone: '+48 600 100 200', tier: 'family' })
  acc.createdAt = ctx.now - 210 * D.DAY
  acc.lastReviewedAt = ctx.now - 40 * D.DAY
  acc.lastDrillAt = ctx.now - 200 * D.DAY

  const kuba = D.upsertWard(ctx, acc, null, { name: 'Kuba (8 lat)', kind: 'child', notes: 'Szkoła Podstawowa nr 12, klasa 2b, wychowawczyni p. Nowak. Alergia na orzechy – w plecaku EpiPen.' })
  const mama = D.upsertWard(ctx, acc, null, { name: 'Halina (mama, 81 lat)', kind: 'senior', notes: 'Mieszka sama, ul. Lipowa 3/5. Cukrzyca typu 2, po udarze – chodzi o kulach.' })
  const burek = D.upsertWard(ctx, acc, null, { name: 'Burek (pies)', kind: 'pet', notes: 'Spokojny, boi się innych psów. Karma w szafce pod zlewem.' })

  const marta = D.upsertContact(ctx, acc, null, { name: 'Marta (siostra)', phone: '+48 601 111 111', relation: 'siostra', canTrigger: true })
  const piotr = D.upsertContact(ctx, acc, null, { name: 'Piotr (sąsiad)', phone: '+48 602 222 222', relation: 'sąsiad z 4 piętra', canTrigger: true })
  const ewa = D.upsertContact(ctx, acc, null, { name: 'Ewa (przyjaciółka)', phone: '+48 603 333 333', relation: 'przyjaciółka', canTrigger: false })
  const tomek = D.upsertContact(ctx, acc, null, { name: 'Tomek (brat)', phone: '+48 604 444 444', relation: 'brat', canTrigger: false })

  D.upsertTask(ctx, acc, null, {
    title: 'Wyjść z Burkiem', time: '07:30', timeLabel: 'rano', wardId: burek.id, queue: [tomek.id, piotr.id],
    instructions: 'Spacer ok. 30 min, smycz wisi przy drzwiach. Po spacerze miska karmy (1 kubek) i świeża woda.',
    secrets: [{ label: 'Kod do skrytki z kluczem (przy domofonie)', value: '4821' }],
    offline: [{ text: 'Zapasowy klucz w skrytce na kod – sprawdź, czy kod działa', done: true }],
  })
  D.upsertTask(ctx, acc, null, {
    title: 'Odebrać Kubę ze szkoły', time: '15:00', timeLabel: 'po lekcjach', wardId: kuba.id, queue: [marta.id, ewa.id, piotr.id],
    instructions: 'Wejście od ul. Szkolnej, świetlica na parterze. Kuba zna Martę i Piotra. Po odbiorze: obiad w lodówce, lekcje do 18:00.',
    secrets: [{ label: 'Hasło do odbioru w świetlicy', value: 'Pomarańczowy rower' }],
    offline: [
      { text: 'Pisemne upoważnienie do odbioru Kuby dla Marty, Ewy i Piotra złożone w sekretariacie szkoły (zapytaj szkołę o wymagany wzór)', done: false },
      { text: 'Osoba odbierająca musi mieć przy sobie dowód osobisty', done: true },
    ],
  })
  D.upsertTask(ctx, acc, null, {
    title: 'Leki dla mamy', time: '18:00', timeLabel: 'wieczorem', wardId: mama.id, queue: [piotr.id, marta.id],
    instructions: 'Zadzwoń do mamy przed wizytą (tel. 22 123 45 67). Pomóż przygotować kolację.',
    secrets: [
      { label: 'Dawkowanie', value: 'Metformina 500 mg – 1 tabl. do kolacji. Pudełko z przegródkami na lodówce, przegródka z dniem tygodnia.' },
      { label: 'Kod do domofonu mamy', value: '35#1290' },
    ],
    offline: [{ text: 'Upoważnienie / dostęp do e-recept mamy dla osoby, która wykupi leki (sprawdź w aptece lub IKP, czego wymagają)', done: false }],
  })
  D.updateSettings(ctx, acc, { ...acc.settings, emergencyNote: 'Jeśli nikt nie może odebrać Kuby: zadzwoń do szkoły (22 765 43 21) – świetlica czynna do 17:30. W sprawie mamy: MOPS dzielnicy, tel. 22 000 00 00.', cardRevealIce: true })

  const links = { owner: `owner.html#t=${ownerToken}`, card: `k.html#t=${D.cardToken(acc)}`, contacts: [] }
  for (const c of [marta, piotr, ewa, tomek]) links.contacts.push({ name: c.name, link: `contact.html#t=${D.inviteContact(ctx, acc, c.id)}` })
  D.respondRole(ctx, acc, marta, true)
  D.respondRole(ctx, acc, piotr, true)
  D.respondRole(ctx, acc, tomek, true)
  piotr.lastConfirmedAt = ctx.now - 400 * D.DAY // Piotr dawno nie potwierdzał danych
  // Ewa zostaje z niepotwierdzoną rolą – plan ją pominie (to celowy element demo)
  acc.messages = []
  ctx.data.outbox = []
  return links
}
