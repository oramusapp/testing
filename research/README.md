# Badanie strategii SDCA + RSPS (+ shorty), 2020–2026

Odtworzenie wszystkich liczb z raportu:

```bash
pip install numpy pandas scipy
# dane: CSV z https://github.com/coinmetrics/data (csv/<asset>.csv) w katalogu $CM_DIR
python3 run.py    # strategie bazowe
python3 run2.py   # warianty SDCA (filtry trendu, skalowanie zmiennością)
python3 run3.py   # siatka 96 wariantów RSPS
python3 run4.py   # bramka >0,7, koszty, kombinacje, PSR/DSR
python3 run5.py   # dźwignia
python3 run6.py   # shorty altów (27 wariantów, koszt finansowania)
python3 export.py # dane do raportu
```

- `engine.py` – backtest na wagach (sygnał t → transakcja t+1), koszty, metryki, sygnały (ensemble SMA, ADF, uniwersum top-N wg kapitalizacji w danym dniu).
- `sdca.py` – model wyceny SDCA dopasowywany co roku tylko na danych z przeszłości oraz symulacja krzywej accum/dist.
- `strategies.py` – BTC B&H, równe wagi, trend BTC, reguła dźwigni ADF, RSPS z bramką szerokości rynku, shorty.

Okres projektowania: 2020-01-01–2023-12-31. Test poza próbą: 2024-01-01–2026-05-23.
Koszt 0,15% za stronę transakcji. Uniwersum: 21 tokenów bez memów i stablecoinów z prawdziwą ceną w Coin Metrics.

## Aktualizacja: dane Binance (35 tokenów bez memów), test poza próbą do 2026-10-03

```bash
python3 data_binance.py   # pobiera dzienne świece (tylko zamknięte) do cache
python3 run9.py           # siatka RSPS: przegląd 1 vs 7 dni × lookback × bramka
python3 run10.py          # ensemble lookbacków 30/60/90, koszty
python3 run11.py          # bufor rankingu / brak przeważania
python3 run12.py          # histereza bramki
python3 run13.py          # podział SDCA/RSPS, shorty, bramka dźwigni
```

Top 10 wybierany wg 30-dniowego średniego wolumenu (Binance). Kapitalizacja z Coin Metrics okazała się
nieprzydatna do rankingu (XRP, XLM, ICP liczone od całkowitej podaży; brak BNB).
Wybrana konfiguracja (wg okresu 2020–2023): przegląd codzienny, siła = średnia VAMS ratio z 30/60/90 dni,
bramka wejście ≥ 70% / wyjście < 60%, maks. 3 pozycje, limit 50%, podział SDCA 60 / RSPS 40.

## MTPI / LTPI z 10 wskaźników (run17.py, run18.py)

`tpi.py`: wskaźniki trendu liczone z samych cen zamknięcia (EMA/SMA, MACD, RSI, ROC, Donchian, Aroon, Supertrend
na zmianach zamknięć, nachylenie regresji, HMA), każdy głosuje ±1; TPI = średnia.
Wynik: LTPI z 10 wskaźników i histerezą ±0,2 ≈ reguła SMA 200 (Sharpe OOS 1,03 vs 1,03, mniejsze obsunięcie
−30,0% vs −31,5%) → używany w aplikacji. MTPI z 10 wskaźników obniżał wynik OOS (0,82–0,95 vs 1,03), więc
skalowanie BTC zostaje na 4 średnich; MTPI jest wyświetlany informacyjnie (opcjonalnie można go włączyć).

## Runda badań 2026-10 (run19–run23): nowe narzędzia z literatury

Druga strategia (alfa) — porównanie z obecnym RSPS (koszty 0,15%/stronę, IS 2020–2023, OOS 2024→):
- `run19.py`, `run20.py`: trend per token z zestawu wybić Donchiana i wagami wg zmienności (pomysł z Zarattini, Pagani,
  Barbon 2025 „Catching Crypto Trends”; parametry nasze, bo treść artykułu była niedostępna z sandboxa),
  „turniej” ratio (każdy token kontra każdy, styl tabel ratio RSPS), hybryda RSPS × trend Donchiana.
- `run21.py`: te same selekcje wewnątrz bramek RSPS (szerokość 70/60, veto LTPI).
Wynik: żadna z metod nie pobiła obecnej selekcji RSPS poza próbą; „turniej” bez bramek rynku miał obsunięcia −80%.
Największy wpływ ma parkowanie przy zamkniętej bramce (stablecoin OOS Sharpe 0,34 vs BTC×trend 0,88).

SDCA (część bezpieczniejsza) — `run22.py`, `run23.py`:
- bezpiecznik LTPI: LTPI < 0 i ryzyko ≥ 70% → sprzedaż 2% BTC/dzień do stablecoina, odkup 20%/dzień po LTPI > 0.
  Portfel SDCA 60 / RSPS 40: IS bez zmian; OOS obsunięcie −31,5% → −27,3% (parking BTC×trend) i −25,8% → −21,0%
  (parking stable) przy tym samym CAGR. Wdrożony (z przełącznikiem). Próg 70 wybrany spośród 50/60/70 —
  wszystkie warianty obniżały obsunięcie OOS, ale wybór progu częściowo widział OOS.
- stopy finansowania (Binance BTCUSDT, kontrariańsko): poprawa tylko dla jednego progu (|z| ≥ 1), brak efektu przy
  1,5 → zbyt kruche, nie wdrożone. Wolniejsze zakupy przy LTPI < 0 pogarszały wynik; lump sum nie zadziałał.

## Notatki z Crypto Investing Masterclass (run24–run25)

Przetestowane reguły z notatek użytkownika (ten sam protokół):
- SDCA: wolniejsze tempo akumulacji (×0,5 / ×0,2 / ×0,1) obniża obsunięcie IS, ale tnie CAGR (57,6% → 35–51%);
  LSI po zwrocie LTPI prawie bez efektu (gotówka zwykle już wydana); dystrybucja 90/10 neutralna → bez zmian.
- RSPS warstwowy (najsilniejszy z BTC/ETH/SOL przy zamkniętej bramce): IS lepiej (2,02), OOS gorzej (0,40, DD −52%).
- Ranking Omega zamiast VAMS: OOS 0,74 vs 0,88. Skalowanie po tempie zmian MTPI: OOS 0,73 vs 0,88.
- SUPT (podział optymalny wg Omega na 2020–2023): 30% SDCA — sprzeczne z rolą SDCA jako części bezpieczniejszej, OOS Sharpe niższy.
Wdrożone jako narzędzia (bez zmiany reguł): trzy pochodne TPI, spójność czasowa składników, istotność TPI,
arkusz wyceny z-score, kalkulator tempa akumulacji, Omega/Sortino/Sharpe.

## Macierz TPI + reżim rynku (run26.py, slajd z kursu)
BTC 2020→: dźwignia 2× przy LTPI+, MTPI+ i trendzie zwiększała obsunięcie (−57…−86%) bez poprawy Sharpe → tylko odczyt.
Kupowanie przy MTPI < 0 w reżimie powrotu do średniej (błąd ze slajdu) pogarszało OOS (0,87 → 0,72; 0,63 → 0,52).
Reżim: ADF (90 d) wskazywał trend w 96% dni → słaby; iloraz wariancji 10/1 d (90 d) dzieli 25/75 → użyty w aplikacji.

## Wycena: logarytm ceny względem podaży BTC (run27.py, slajd z kursu)
S1 = OLS ln(cena) ~ podaż, S2 = dopasowanie do miesięcznych dołków (jak na slajdzie); fit co rok tylko na przeszłości.
Jako 3. składnik wyceny SDCA: portfel 60/40 obsunięcie −27,3% → −25,2%, ale CAGR 72,8% → 68,8%, Sharpe OOS 1,04 → 1,00.
Zamiast modelu ceny: wyraźnie gorzej. Prosta w podaży zakłada wykładniczy wzrost przy podaży zbliżającej się do 21 mln
(model w 10.2026 nadal „średnio drogo” 66% vs 8% w modelu ceny) → nie wdrożone.

## Dopasowanie modelu wyceny SDCA: stopień wielomianu (run28.py, slajdy o przeuczeniu)
Regresja kwantylowa log ceny na wielomianie w log czasu, refit co rok tylko na przeszłości:
stopień 1 (prawo potęgowe): najmniejszy błąd mediany w kolejnym roku (0,247), ale portfel OOS DD −39,7% (nie uznał 2024–25 za drogie);
stopień 2 (obecny): błąd 0,259, portfel OOS Sharpe 1,04, DD −27,3% — najlepszy; stopień 3: błąd 0,324, gorzej wszędzie (przeuczony);
średnia stopni 1 i 2: OOS DD −37,8%. Zostaje stopień 2.

## Sezonowość BTC (run29.py, slajd o dekompozycji)
Średnie dzienne log-zwroty wg miesiąca: korelacja 2013–19 vs 2020–26 = 0,19; Kruskal-Wallis p = 0,14 i 0,44 (brak różnic).
Dni tygodnia: korelacja 0,31, p = 0,79 i 0,17. Filtr „miesiące dodatnie w 2013–19” od 2020: Sharpe 0,84 vs 0,92 (B&H).
Tylko październik dodatni w obu okresach (t 2,4 i 3,0) — możliwy przypadek przy 12 testach. Nie wdrożone do sygnałów.

## Probabilistyczny zakres wyników: wartość × trend (run30.py, run31.py)
Zwrot BTC po 90 dniach (2014→, wycena bez look-ahead × LTPI z histerezą): tanio + LTPI+: P10 −9%, mediana +9%, 68% dodatnich;
środek + LTPI+: mediana +25%, 78%; środek + LTPI−: mediana −14%, 31% (najgorzej); wszystkie dni: mediana +7%, 57%.
Próg bezpiecznika SDCA (LTPI < 0 i ryzyko ≥ R, z odkupem): R = 30…60 obniżają DD, ale też CAGR i Sharpe; R = 70 najlepszy → bez zmian.
W aplikacji: stożek prawdopodobieństwa w SDCA.

## Uznaniowa analiza techniczna (run32.py, slajdy: formacje, świece, struktura, linie trendu)
BTCUSDT 1D OHLC 2018→: żadna formacja świecowa (objęcie hossy/bessy, młot, spadająca gwiazda, doji, trzech żołnierzy,
trzy wrony) nie daje istotnie innego zwrotu 5/20-dniowego niż wszystkie dni (|t| < 1,4; formacje „niedźwiedzie” 50–57% dni na plusie).
Struktura HH/HL (pivot ±3/5/10/20) jako filtr long: Sharpe OOS 0,09–0,62 vs 0,89 (4 średnie) i 0,78 (B&H). Zgodne z lekcją: nie wdrażamy.

## Oscylatory: Stochastic i CCI, trend vs powrót do średniej (run33.py)
BTCUSDT 1D: jako trend (powyżej środka = long) Sharpe IS/OOS 0,86–1,48 / 0,68–0,96; jako powrót do średniej (kup przy
wyprzedaniu, sprzedaj przy wykupieniu) 0,20–0,30 / 0,32–0,70 — zgodne z lekcją (TPI = trend, nie mean reversion).
Dodanie Stochastic 14 i CCI 20 do MTPI (12 głosów): IS 1,26 → 1,10, OOS 1,02 → 0,90 → nie dodane.

## Badanie zdarzeń (run34.py, slajdy SentimenTrader / OddStats)
BTC 2014→, sygnały co najmniej 30–90 dni od siebie, z vs wszystkie dni: skok zmienności 30 d > 2× mediana (n=6) z ≈ 0,4–0,7;
spadek dzienny ≤ −10% (n=36) z ≈ 1,1–1,6; przebicia SMA 200 (n=21–25) |z| < 0,7; nowy ATH (n=14): 1 tydz. z = 3,6, dalej < 2.
Zdarzenia F&G (< 12 / > 90) liczy aplikacja na historii F&G z telefonu (w sandboxie brak dostępu do alternative.me).

## Składniki on-chain w wycenie SDCA (run35.py, lekcje o wycenie i alpha decay)
Coin Metrics: NUPL, MVRV Z, Puell, hash ribbon; z ceny: mnożnik 2Y MA, Pi Cycle. Każdy jako percentyl względem historii
sprzed roku (z detrendem log-czasu i bez). Spearman z przyszłym zwrotem 365 d, 2015–25: cena −0,32, MVRV (obecny, detrend) −0,12,
NUPL surowy −0,27, MVRV Z surowy −0,25, Puell −0,24, 2Y MA surowy −0,29, Pi Cycle −0,15, hash ribbon −0,26.
Korelacja z obecnym composite: NUPL/MVRV Z/2Y MA 0,93–0,94 (redundantne), Puell 0,71, Pi Cycle 0,78, hash ribbon 0,33.
SDCA z bezpiecznikiem, OOS 2024→ Sharpe: obecny 0,98; + MVRV Z 1,01; + NUPL 0,95; + 2Y MA 0,94; + Puell 0,82 (DD −49%);
+ Pi Cycle 0,68; + hash ribbon 0,90; wszystkie 8: 0,77. Cena + NUPL surowy: FULL CAGR 57,6 → 62,3%, ale OOS DD −34,8 → −37,4%;
cena + MVRV Z surowy: OOS 1,03, DD −28,7%, IS 1,65 → 1,66. Różnice małe względem szumu → bez zmian w modelu.
Detrend w oknie rozszerzanym osłabia predykcję (2015–19 odwrotny znak) — zgodne z uwagą z lekcji, że NUPL powinien być odporny na alpha decay.

## Sprzedaż w dni nowego ATH (run36.py, run37.py, lekcja „Rate of Distribution”)
Na każdym nowym ATH przy ryzyku ≥ 70% sprzedaj u × g^k BTC (k = sprzedaże w cyklu, reset po −50% od ATH). Harmonogramy ze slajdu
(nasza interpretacja, slajd podaje tylko nazwy): Linear+2, Expon, Incr1, Incr2, ×1,1. SDCA z bezpiecznikiem 2020→:
obecna IS 1,65 / OOS 0,98, DD OOS −34,8%; wszystkie harmonogramy OOS 1,14–1,22, DD −28,7%, IS 1,50–1,63.
Siatka u 0,5–1,5% × g 1,0–1,2: OOS 1,02–1,22, FULL Sharpe 1,39–1,48 (obecna 1,37). Wybrane ×1,1, u = 1% (środek plateau).
Lata: 2021 +16,0% → +12,6%, 2025 +0,8% → +4,5%, 2026 +13,4% → +23,7%. Portfel 60/40 (parking BTC×trend): OOS Sharpe 1,04 → 1,18,
DD −27,3% → −24,4%, FULL CAGR 72,8 → 73,7%. Tylko dwie hossy w próbie → w aplikacji jako opcja, domyślnie wyłączona.

## Rotacja bety w RSPS (run38.py, notatki TPI: „increase beta” / „reduce beta”)
Alty RSPS → BTC lub stablecoin, gdy ryzyko wyceny ≥ 60/70/80%: IS Sharpe 1,82 → 1,16–1,23, FULL CAGR 84 → 39–45%.
Sezon altów 2021 wypadł przy wysokiej wycenie BTC, więc cięcie bety po wycenie usuwa główne źródło alfy. Nie wdrożone.

## Parking RSPS: „BTC do pewnego momentu trendu, potem stablecoin” + warunkowy short (run39.py)
Bramka zamknięta, LTPI > 0: BTC × trend, dopóki warunek „wcześnie” trwa, potem stablecoin. Cały portfel 60/40 z bezpiecznikiem:
stablecoin — FULL CAGR 54,4%, DD −24,2%, OOS Sharpe 0,94; BTC×trend — 72,8%, −27,3%, 1,04;
ryzyko wyceny < 80% — 67,2%, −24,2%, 1,07 (wybrane jako „hybryda”, domyślnie); < 70% — 62,9%, −24,2%, 1,02;
do 1. dnia ATH — 65,3%, −23,3%, 1,09; 365 dni trendu — 73,4%, −27,3%, 1,04; do +100% — 67,2%, −27,9%, 1,08.
Short BTC przy LTPI < 0 i trendzie ≤ 0,25 (finansowanie 10%/rok): każdy wariant gorszy (np. BTC×trend + short 25%: 69,6%, OOS 1,00) —
short zostaje wyłącznie warunkową propozycją.

## Akumulacja SDCA według wyceny i LTPI (run40.py, run41.py, lekcja „Rate of Accumulation”)
Codziennie % pozostałych stablecoinów wg krzywej; przy LTPI < 0 × m. Start 2020: obecna 57,6% CAGR, × 0,25 43,6%;
start 2018: obecna DD −49,6%, × 0,25 −34,1%, Sharpe 1,24 → 1,27. 27 kwartalnych startów 2018–2024: × 0,25 mniejsze DD
w 100% startów (najgorsze −59,0% → −43,1%), Sharpe lepszy w 48%, mediana CAGR 43,7 → 40,1%. Harmonogram 1/(N − d) dni
(N = 82/114/146) gorszy od mnożnika. W aplikacji: ustawienie „Tempo zakupów przy ujemnym LTPI”, domyślnie × 0,25.

## Analiza zdjęć z notatek (167 slajdów, dopasowanych do tekstu)
Nowe i wdrożone: sprzedaż przy ATH jako propozycja z powiadomieniem; tempo akumulacji wg LTPI; parking hybrydowy;
42 Macro GRID (OECD CLI Δ3m × CPI r/r Δ3m; BTC rocznie: Goldilocks +483%, Reflacja +104%, Inflacja +64%, Deflacja −10%, n 7–22)
jako ręczna karta makro; automatyczne z-score MVRV Z, NUPL, cena zrealizowana, 2Y MA, Puell w arkuszu wyceny.
Już obecne lub odrzucone wcześniej: macierz TPI × reżim, F&G w badaniu zdarzeń, rotacja bety, dźwignia, Omega/SUPT, sezonowość,
analiza techniczna. Bez danych w sandboxie: cykl kredytowy (HY), opóźnienia płynności (CrossBorder), Realized Loss, CACRI (brak slajdu).
