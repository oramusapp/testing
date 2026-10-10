# Plan B – prototyp

Plan zastępstwa, który uruchamia się, gdy opiekun nagle znika (szpital, wypadek, brak kontaktu): rozdziela zadania między zaufane osoby, eskaluje, gdy ktoś nie odpowiada, pokazuje stan na żywo i wydaje kody/instrukcje tylko na czas zadania.

> **To prototyp. Nie wpisuj prawdziwych kodów, danych medycznych ani danych dzieci** – patrz sekcja „Czego jeszcze nie wolno”.

## Uruchomienie

Wymagany tylko **Node.js 20+** (bez `npm install` – zero zależności).

```bash
cd planb
npm run demo      # tryb demo: dane przykładowe, symulowany czas i SMS-y → http://localhost:3000
npm test          # testy pełnego scenariusza (eskalacja, dostępy, ćwiczenie, check-in, pakiety)
npm start         # tryb „czysty”: pusta baza, zakładanie planu na stronie startowej
```

Na stronie startowej w trybie demo są linki do wszystkich ról (Anna – właścicielka, Marta, Piotr, Ewa, Tomek, karta QR) i scenariusz krok po kroku. Otwieraj je w osobnych kartach. Pasek na górze przewija czas serwera (+5 min, +20 min, +1 h, +1 dzień), żeby eskalację było widać bez czekania. Reset demo: zatrzymaj serwer i usuń `data/demo.json`.

Zmienne środowiskowe: `PORT`, `PLANB_KEY` (klucz szyfrujący, 32 bajty w base64: `openssl rand -base64 32`), `PLANB_DATA_DIR`, `PLANB_ALLOW_SIGNUP=0`, `PLANB_DEMO=1`.

## Jak to działa

| Funkcja | Gdzie |
|---|---|
| Zadania z godziną, instrukcją, kolejką 3 osób, listą spraw „poza aplikacją” | właściciel → *Zadania i kolejki* |
| Zaproszenie → osoba **musi przyjąć rolę**; bez tego plan ją pomija i ostrzega właściciela | *Zaufane osoby*, widok osoby |
| Uruchomienie: zaufana osoba (z prawem „może uruchomić”) / karta QR / brak „jestem OK” | widok osoby, `k.html`, check-in |
| Ochrona przed fałszywym uruchomieniem: okno anulowania (15 min, karta QR 30 min); właściciel anuluje jednym kliknięciem; **inna** zaufana osoba może potwierdzić wcześniej lub odrzucić | baner u właściciela i u osób |
| Eskalacja: zadanie → 1. osoba → po 20 min (krócej, gdy zadanie jest blisko) → kolejna; „Nie mogę” = od razu dalej; nikt → alarm „BRAK OPIEKUNA” do wszystkich + notatka „co robić” | `src/domain.js` → `offerNext`, `tick` |
| Widok na żywo (SSE) dla wszystkich uczestników | tablica zadań |
| Dostępy czasowe: od 60 min przed zadaniem, tylko dla osoby, która je przejęła; wygasają po „Zrobione”, zakończeniu planu lub 3 h po czasie; każdy odczyt w dzienniku | „Pokaż kody” |
| Zadania powtarzają się codziennie, dopóki plan trwa; pierwszeństwo ma osoba z poprzedniego dnia | `ensureInstances` |
| Próbny alarm: wiadomości [ĆWICZENIE], ta sama eskalacja, **bez wydawania kodów i danych medycznych**; raport: kto reagował, kto milczał, kogo pominięto, co jest nieaktualne | *Próbny alarm* |
| Gotowość planu i przypomnienia: niepotwierdzone role, dane starsze niż 180 dni, zadania bez zastępstwa, niezałatwione upoważnienia, brak ćwiczenia > pół roku; cotygodniowe przypomnienia do właściciela i osób zaproszonych | `readiness`, `tickReminders` |

## Wybory techniczne (łatwe do zmiany)

- **Node.js bez zależności, jeden proces** – najprostsze do uruchomienia i przeczytania. Logika jest w `src/domain.js` i nie zależy od HTTP, więc da się ją przenieść do innego frameworka.
- **Plik JSON zapisywany atomowo** (`data/store.json` + `.bak`) – wystarcza w prototypie; w produkcji to baza danych (np. PostgreSQL).
- **Logowanie przez osobiste linki z tokenem** (256 bitów, w bazie tylko skrót SHA-256, token w `#` adresu, więc nie trafia do logów ani do nagłówka Referer). Osoby zaufane nie muszą zakładać konta ani instalować aplikacji, a to najważniejsze przy „zimnym starcie”. Ponowne zaproszenie unieważnia stary link.
- **Szyfrowanie AES-256-GCM** instrukcji, kodów, dawkowania, notatek o podopiecznych i notatki awaryjnej.
- **SSE** dla widoku na żywo, z automatycznym ponownym łączeniem i zapasowym odświeżaniem co 30 s.
- **Pakiety** – `src/plans.js`: cała aplikacja pyta tylko `features(konto)` (limity, `timedAccess`, `checkin`, `orgReporting`). Konto ma pole `orgId` pod licencje B2B. Próbne alarmy są w pakiecie darmowym celowo, bo od nich zależy, czy plan w ogóle zadziała.
- **Zegar wstrzykiwany** (`ctx.now`) – stąd przewijanie czasu w demo i testy bez czekania.

## Co trzeba podłączyć przed użyciem produkcyjnym

1. **Wysyłka wiadomości** – funkcja `deliver()` w `src/server.js` zapisuje dziś wiadomości do symulowanej skrzynki (`/outbox.html`). Trzeba ją podłączyć do bramki SMS (np. SMSAPI.pl, Twilio), powiadomień push (Web Push / FCM / APNs) i najlepiej do **połączeń głosowych** przy eskalacji i „BRAK OPIEKUNA”. Do tego potwierdzenia doręczenia, ponowienia i kolejka wysyłki. Linki w wiadomościach są względne, więc trzeba poprzedzić je publicznym adresem HTTPS.
2. **Niezawodność samego serwera** – plan jest bezużyteczny, jeśli serwer nie działa akurat wtedy, gdy jest potrzebny. Potrzebne są: hosting z redundancją, baza z kopiami zapasowymi, zewnętrzny monitoring zegara (alarm, gdy `tick` przestanie chodzić) i harmonogram zadań odporny na restart (logika już liczy wszystko od zapisanych terminów).
3. **Klucze** – `PLANB_KEY` z menedżera sekretów lub KMS, docelowo osobny klucz na konto i rotacja. Plik `data/key.bin` służy tylko do prototypu.
4. **Płatności** – zmiana pakietu jest dziś symulowana (`PUT /api/owner/tier`).
5. **Strefy czasowe** – godziny zadań liczone są w strefie serwera (`TZ`). W produkcji potrzebna jest strefa przypisana do konta.
6. **Karta QR** – na stronie wydruku kod generuje biblioteka `qrcodejs` z cdnjs. Bez internetu zostaje sam link pod kartą. W produkcji tę bibliotekę trzeba dołączyć do aplikacji.

## Co jest uproszczone lub niezabezpieczone – czego jeszcze nie wolno uruchamiać na prawdziwych danych

- **Brak prawdziwego logowania właściciela**: kto ma link właściciela, ma pełny dostęp, w tym do kodów i danych medycznych. Brakuje hasła/passkey, 2FA i wylogowania na innych urządzeniach. Link można stracić (nie ma odzyskiwania konta).
- Imiona i numery telefonów zaufanych osób są w magazynie **jawne** (szyfrowane są treści wrażliwe). Tokeny osób są zaszyfrowane tym samym kluczem co dane, bo trzeba je wysyłać w SMS-ach.
- Brak HTTPS (serwer mówi czystym HTTP; w produkcji tylko za reverse proxy z TLS), brak CSRF-tokenów (nie są potrzebne, bo uwierzytelnianie idzie nagłówkiem, a nie ciasteczkiem), proste ograniczanie prób w pamięci procesu.
- Kod z wyświetlonego dostępu **zostaje w pamięci osoby, która go zobaczyła**. Wygaśnięcie dotyczy tylko aplikacji, więc fizyczny kod do skrytki trzeba zmienić po zakończeniu planu. Aplikacja tego nie robi i o tym nie przypomina; to do dodania.
- Zgłoszenie z karty QR może wysłać każdy, kto ma kartę. Ochroną jest wyłącznie okno anulowania i potwierdzenie przez zaufaną osobę.
- Zaufana osoba z prawem uruchamiania może też anulować zgłoszenie (np. prawdziwe). Zostaje to w dzienniku, a wszyscy dostają powiadomienie, ale nie ma głosowania ani drugiego potwierdzenia.
- Brak RODO-wych elementów: zgód, eksportu i usuwania danych, polityki retencji dziennika, umów powierzenia z dostawcą SMS. Dane o zdrowiu i dzieciach to [Inference] najpewniej dane szczególnej kategorii – przed startem potrzebna jest analiza prawna. Nie mogę tego zweryfikować.
- **Formalności**: aplikacja tylko przypomina (listy „do załatwienia poza aplikacją”). Nie wystawia upoważnień i nie gwarantuje, że szkoła, apteka czy inna instytucja wyda dziecko lub leki osobie z planu. Podpowiedzi w aplikacji są ogólne i nie są poradą prawną.
- Tryb demo (`--demo`) wystawia endpointy bez uwierzytelniania (przewijanie czasu, skrzynka wiadomości z linkami-tokenami) i zapisuje linki w `demo.json`. **Nigdy nie uruchamiaj go publicznie.**
- Jeden proces i jeden plik danych: nie skaluje się poziomo, a równoległe instancje uszkodziłyby dane.
