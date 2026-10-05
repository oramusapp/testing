export const CHANGELOG = [
  {
    v: '2.2.0', date: '2026-10-05',
    items: [
      'RSPS: Sentyment — zwrot BTC po 20 dniach według przedziałów Fear & Greed, liczony na pełnej historii F&G',
      'RSPS: korelacja tokenów z BTC (90 dni) w tabeli jakości aktywów',
      'Statystyka: tryb Korelacja — wykres punktowy, r, R² i prosta regresji'
    ]
  },
  { v: '2.1.1', date: '2026-10-05', items: ['Statystyka: tryb „znane μ i σ”, wykres rozkładu z pasmami 68–95–99,7 i zacieniowanym polem, prawdopodobieństwo przedziału'] },
  {
    v: '2.1.0', date: '2026-10-05',
    items: [
      'LTPI · MTPI: macierz decyzji (LTPI + MTPI + reżim rynku: trend / powrót do średniej) z wynikiem backtestu',
      'Inne: kalkulator statystyczny — σ (÷N i ÷N−1), z-score i pole z tablicy rozkładu normalnego, krok po kroku'
    ]
  },
  { v: '2.0.1', date: '2026-10-05', items: ['Stopka: credits (Prof. Adam · Crypto Investing Masterclass · The Real World) z podglądem zdjęć'] },
  {
    v: '2.0.0', date: '2026-10-05',
    items: [
      'Nowy układ: Strategia (podzakładki SDCA, RSPS, LTPI · MTPI), Portfel (dawniej Sygnały), Inne (Notatnik i Excel)',
      'LTPI i MTPI z ustawieniami i trybem ręcznym w jednej podzakładce; SDCA i RSPS pokazują skrót stanu',
      'Wszystkie dane, notatki i arkusze zostają bez zmian'
    ]
  },
  {
    v: '1.9.0', date: '2026-10-05',
    items: [
      'TPI: odczyt w trzech wymiarach (stan, tempo zmian, siła = zgodność) ze wskazówkami, liczba zmian na rok dla każdego składnika i test istotności na całej historii',
      'SDCA: arkusz wyceny z-score (konwencja TRW, równe wagi, osobno horyzont średni) z możliwością użycia jako wskaźnik ręczny; kalkulator tempa akumulacji',
      'SDCA: wycena z w konwencji TRW na karcie dzisiejszej akcji',
      'RSPS: jakość aktywów (Omega, Sortino, Sharpe z 365 dni); Sygnały: Sortino i Omega portfela'
    ]
  },
  {
    v: '1.8.0', date: '2026-10-05',
    items: [
      'SDCA: bezpiecznik LTPI — przy ujemnym LTPI i ryzyku wyceny ≥ 70% sprzedaż 2% BTC dziennie do stablecoina, odkup po powrocie LTPI na plus',
      'Sygnały: zlecenia bezpiecznika i odkupu z pilnowaniem kwoty do odkupienia',
      'Badanie nowych metod dla RSPS (trend Donchian z artykułu Zarattini i in., „turniej” ratio, hybrydy) — obecny RSPS pozostaje najlepszy'
    ]
  },
  {
    v: '1.7.0', date: '2026-10-05',
    items: [
      'LTPI z 10 wskaźników trendu (SMA/EMA 200, MACD tygodniowy, RSI 100, ROC 180, Donchian, Aroon, Supertrend, regresja, HMA) z histerezą ±0,2',
      'MTPI z 10 wskaźników (EMA 21/50, MACD, RSI 14, ROC 30, Donchian 20, Aroon 25, Supertrend, regresja 30, HMA 21) z podglądem głosów',
      'Wybór źródła LTPI i skalowania BTC; domyślne warianty według backtestu'
    ]
  },
  {
    v: '1.6.1', date: '2026-10-05',
    items: [
      'Ręczne odczyty σ wpisywane jako liczba (np. 0,5 lub −1,75) zamiast wyboru',
      'Przy każdym pytaniu opis, kiedy wpisać plus, a kiedy minus',
      'Aktualizacje instalują się same przy otwarciu aplikacji (dane zostają)'
    ]
  },
  {
    v: '1.6.0', date: '2026-10-04',
    items: [
      'Sygnały: wyniki portfela od startu (TWR całości, SDCA i RSPS, porównanie z BTC, obsunięcie, zmienność, Sharpe)',
      'Codzienny zapis stanu po zamknięciu 00:00 UTC i wykres wyniku',
      'Automatyczne raporty miesięczne zapisywane w historii, z możliwością udostępnienia'
    ]
  },
  {
    v: '1.5.0', date: '2026-10-04',
    items: [
      'Model rozkładu normalnego: każdy filar piramidy jako z-score (σ), P = Φ(z); średnia ważona z',
      'Auto: z momentum BTC 90 dni, z wyceny SDCA, z MVRV, statystyka t, z Fear & Greed względem całej historii',
      'Ręczne filary: odczyt w σ (−2σ…+2σ), np. pozycja w Bollinger Bands',
      'Sygnały: dwa oddzielne portfele SDCA i RSPS z własnymi stablecoinami i wskazówkami; przeniesienie tylko po przekroczeniu ±10 p.p. i kliknięciu'
    ]
  },
  {
    v: '1.4.0', date: '2026-10-04',
    items: [
      'Nowy ekran Sygnały: rozpisanie kwoty na SDCA/RSPS i aktywa, codzienne zlecenia z przyciskiem „Wykonano”',
      'Rotacja SDCA ↔ RSPS przy odchyleniu ±10 p.p., wpłaty i wypłaty, ręczna edycja stanów',
      'Zamknięta bramka RSPS: decyzja użytkownika, domyślnie stablecoin; LTPI < 0 → 100% stablecoin',
      'Propozycja zmniejszenia ekspozycji przy wysokiej zmienności portfela',
      'Ręczne filary: standardowe pytania z linkami do źródeł (FRED, FedWatch, Farside, DefiLlama, TradingView…)'
    ]
  },
  {
    v: '1.3.0', date: '2026-10-04',
    items: [
      'RSPS przeliczony na danych Binance (35 tokenów bez memów, w tym SOL, AVAX, NEAR, SUI)',
      'Codzienny przegląd po zamknięciu 00:00 UTC, siła względem BTC jako średnia z 30/60/90 dni',
      'Bramka szerokości z histerezą: wejście ≥ 70%, wyjście < 60%',
      'Logo i nazwa w nagłówku, stopka © @thenotoriousg'
    ]
  },
  {
    v: '1.2.0', date: '2026-10-04',
    items: [
      'Stały podział SDCA 60% / RSPS 40% (najwyższy Sharpe w backteście, lepszy Calmar przy remisie)',
      'Dźwignia usunięta ze strategii: tylko propozycja w sygnale przy spełnieniu 10 warunków',
      'Short altów jako propozycja zabezpieczenia przy pełnym trendzie spadkowym BTC'
    ]
  },
  {
    v: '1.1.0', date: '2026-10-04',
    items: [
      'Piramida analizy: 7 filarów w kolejności ważności, wagi ROC (Barron i Barrett 1996)',
      'Automatyczne przeliczenie po zamknięciu świecy 00:00 UTC (systematyzacja, on-chain, statystyka, Fear & Greed)',
      'Ręczne filary (fundamenty, makro, analiza techniczna) z szybką edycją i ważnością 7 dni',
      'RSPS według backtestu 2020–2026: uniwersum bez memów, bramka szerokości 70%, lookback 90 dni',
      'Podział SDCA/RSPS 50/50 lub 70/30, shorty opcjonalne (domyślnie wyłączone)',
      'Dźwignia maks. 1,5× tylko przy spełnieniu 10 ścisłych warunków naraz; w pozostałych przypadkach obowiązkowo wyłączona',
      'Dane tylko z zamkniętych świec dziennych'
    ]
  },
  {
    v: '1.0.0', date: '2026-10-04',
    items: [
      'Ekran główny z 4 zakładkami: SDCA, RSPS, Notatnik, Excel',
      'SDCA: EQM Rainbow, Composite Risk, krzywa Accum/Dist z backtestem, dziennik transakcji',
      'RSPS: silnik reżimów (LTPI, MTPI, ADF, confidence), dźwignia praktyczna, skaner 17 tokenów (VAMS)',
      'Notatnik w stylu Notatek iOS: foldery, przypinanie, checklisty, formatowanie, kosz',
      'Excel: otwieranie/edycja .xlsx i .csv, formuły na żywo, zapis z zachowaniem stylów',
      'Kopia zapasowa i aktualizacje bez utraty danych'
    ]
  }
];
