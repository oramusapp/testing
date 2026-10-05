export const CHANGELOG = [
  {
    v: '1.6.1', date: '2026-10-05',
    items: [
      'Ręczne odczyty σ wpisywane jako liczba (np. 0,5 lub −1,75) zamiast wyboru',
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
