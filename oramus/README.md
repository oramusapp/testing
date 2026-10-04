# Oramus — SDCA · RSPS · Notatnik · Excel

Aplikacja na iPhone'a (PWA + opcjonalnie natywne .ipa przez Capacitor).

## Instalacja na iPhonie

### A. PWA (zalecane, bez konta Apple Developer)
1. Zbudowana aplikacja leży w katalogu głównym repozytorium (`index.html`, `assets/`, `sw.js`).
   Hostuj ją przez HTTPS, np. GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / root*.
2. Otwórz adres w **Safari** → **Udostępnij** → **Do ekranu początkowego**.
3. Aplikacja działa na pełnym ekranie i offline.

**Aktualizacje:** po wgraniu nowej wersji na hosting aplikacja pokaże baner „Dostępna aktualizacja”.
Podmieniany jest tylko kod — dane (IndexedDB: notatki, arkusze, ustawienia, dzienniki) zostają.

### B. Natywne .ipa (sideloading)
1. W GitHubie: *Actions → iOS build (unsigned IPA) → Run workflow* (albo tag `v*`).
2. Pobierz `Oramus-<wersja>.ipa` z zakładki *Releases*.
3. Zainstaluj przez **Sideloadly** lub **AltStore** (podpisują plik Twoim Apple ID;
   darmowe konto wymaga odświeżenia podpisu co 7 dni).
4. Aktualizacja = instalacja nowszego .ipa na starszy. Bundle id `app.oramus.mobile` się nie zmienia,
   więc dane zostają w telefonie.

## Rozwój

```bash
cd oramus
npm install
npm run dev        # serwer deweloperski
npm test           # testy (model SDCA, ADF, dźwignia, silnik arkusza)
npm run build      # build PWA do katalogu głównego repo
npm run build:ios  # build + synchronizacja projektu Xcode (ios/)
```

Zasady zachowania danych przy zmianach:
- nowe pola ustawień mają wartości domyślne (`{ ...DEFAULTS, ...zapisane }`),
- zmiana struktury danych = nowa migracja w `src/lib/db.ts` (`MIGRATIONS`) i podbicie `SCHEMA_VERSION`,
- nie zmieniać `appId` w `capacitor.config.json` ani nazw magazynów IndexedDB.

## Źródła danych
- Historia BTC od 2010 r. (cena, MVRV): Coin Metrics Community Data — wbudowana, odświeżana z
  `community-api.coinmetrics.io` i Binance.
- Tokeny RSPS: Binance (`api.binance.com`, zapasowo `data-api.binance.vision`).

Model SDCA jest rekonstrukcją metodologii strony sygnałów (regresja kwantylowa log-ceny względem
log-czasu z osobną krzywizną dla każdego kwantyla). Proxy MTPI/LTPI/confidence i Kelly w RSPS to
przybliżenia na danych publicznych, nie oryginalne wskaźniki. Narzędzie analityczne, nie porada inwestycyjna.

Silnik formuł: HyperFormula (licencja GPLv3) · odczyt/zapis .xlsx: ExcelJS (MIT).
