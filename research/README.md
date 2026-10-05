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

## Automatyczny filar TA (run42.py) i breadth thrust (run43.py)
TA = średnia: pozycja BTC w BB 1W(20) i 1D(50) w σ (±3) oraz struktura z punktów zwrotnych ±10 d (HH/HL +1, LH/LL −1, bez look-ahead).
Spearman z zwrotem 90 d: 2014–19 0,28, 2020→ 0,07; filtr TA > 0: Sharpe 1,00 / 0,70 vs B&H 0,51 / 0,61 (4 średnie: 0,88 / 0,77).
Słaby, dodatni → filar z najniższą wagą, liczony automatycznie (TOTAL i wolumen tylko w ręcznej korekcie).
Breadth thrust krypto (≥ 90–100% top-10 na plus w 3–4 z 8 dni, 2019→, n = 54–84): |z| < 1 dla 7/30/90 d → odrzucone.
Pełna lista pokrycia notatek: NOTES_COVERAGE.md.

## TPI na $TOTAL — zgodność z notatkami (total.py, run44.py)
Notatki: „The TPI is built for $TOTAL”. $TOTAL = łańcuchowy indeks kapitalizacji 45 aktywów Coin Metrics (z USDT, USDC, DAI),
ok. 90% prawdziwego $TOTAL (11.2021: 2,66 vs ok. 3,0 bln; 10.2025: 4,04 vs ok. 4,2 bln). TPI long BTC / stable 2020→:
MTPI z $TOTAL ±0,2: OOS Sharpe 0,91 (z BTC 0,63), FULL CAGR 52% (45%); LTPI z $TOTAL ±0,2: OOS 0,30 (z BTC 0,54); próg 0: 0,52 (0,47).
Portfel (SDCA z bezpiecznikiem i zakupami × 0,25 + RSPS z wetem tego samego LTPI, parking hybrydowy): LTPI z BTC ±0,2 — OOS 1,09,
CAGR 53,9%, DD −23,8%; z $TOTAL ±0,2 — 0,92, 49,7%, −26,9%; z $TOTAL próg 0 — 0,88, 48,8%, −27,0%.
Wdrożone zgodnie z notatkami: LTPI i MTPI liczone z $TOTAL, domyślny próg 0 („sell below zero, buy above zero”), histereza ±0,2 jako opcja;
short jako propozycja przy MTPI < 0 i spadającym (notatki: „below zero and falling → consider shorting”).

## Backtest w aplikacji (zakładka Strategia → Backtest)
Silnik RSPS w aplikacji (lib/backtestAll.ts) odtwarza research przy tych samych danych: stablecoin IS 1,37 / OOS 0,33, CAGR 36%, DD −40%
(research 1,29 / 0,34 / 34% / −40%); BTC×trend 1,88 / 0,88 / 87% / −33% (research 1,82 / 0,88 / 84% / −35%). Ujednolicone definicje:
siła względna = zmiana log relacji do BTC / zmienność coina (30/60/90), BTC liczony do top-10 płynności, nieprzydzielona część wg parkingu.

## Model bez patrzenia w przyszłość w aplikacji (2.13.0)
Aplikacja liczy wycenę SDCA tak jak research: szyny kwantylowe przeliczane co rok na danych sprzed 1 stycznia (pierwszy model 2013),
percentyl MVRV po odtrendowaniu tylko z danych sprzed roku, percentyl Sharpe z przeszłych dni. Kontrola (wbudowane dane, od 2020):
SDCA z bezpiecznikiem, LTPI z $TOTAL próg 0, zakupy × 0,25 — CAGR 42,2%, Sharpe 2024→ 0,89, DD −32,9% (research run44: 41,4%, 0,89).
$TOTAL nie jest aktywem w backteście — służy tylko jako wejście TPI (kierunek i trend rynku).

## Źródło LTPI osobno dla SDCA i RSPS (run45.py)
Portfel 60/40, 2020→, próg 0 / ±0,2: oba z BTC — OOS 1,06 / 1,09, CAGR 51,1 / 53,9%; oba z $TOTAL — 0,88 / 0,92, 48,8 / 49,7%;
SDCA z BTC + RSPS z $TOTAL (wdrożone w 2.14.0) — 0,94 / 1,01, CAGR 50,4 / 51,6%, DD −26,1 / −23,9%. Sam SDCA: LTPI z BTC OOS 0,98–1,00 vs 0,87–0,89.
Weto RSPS z LTPI na BTC dawało RSPS OOS 0,88–0,89 vs 0,61–0,69 z $TOTAL — zakładka LTPI·MTPI i RSPS zostają na $TOTAL zgodnie z notatkami.

## Szukanie alfy w RSPS — siatka parametrów (run46.py)
Konfiguracja jak w aplikacji (weto LTPI $TOTAL, parking hybrydowy, SDCA z LTPI BTC), 2020→. Baza top 3 / cap 50% / uniwersum 10 /
waga = siła/zmienność: RSPS IS 1,39, OOS 0,63, CAGR 47,5%; portfel IS 1,76, OOS 0,95, CAGR 49,3%, DD −26,6%.
Żaden wariant nie poprawił jednocześnie IS i CAGR: top 1/2/4/5 (CAGR 36–49%), cap 0,34/0,7/1,0, uniwersum 15/20 (gorzej: 38/32%),
wagi równe/wg siły, trend tokena ≥ 0,75/1,0, bramka MTPI($TOTAL) (OOS 0,48), bramka 0,6/0,5 i 0,8/0,7 (IS 0,92/1,08).
Ekspozycja × szerokość: OOS 0,72 przy tym samym IS, ale CAGR 46,1% — nie podnosi zwrotu. Obecne parametry zostają.
Największe dźwignie zwrotu (kosztem ryzyka): parking BTC×trend (portfel CAGR ok. 73% vs 67%, DD −27% vs −24%, run39)
i weto RSPS z LTPI na BTC (portfel CAGR 53,9% vs 51,6%, run45) — do decyzji użytkownika.

## RSPS na LTPI z BTC i przechylenie podziału wg $TOTAL (run47.py)
RSPS z wetem LTPI na BTC (wdrożone 2.15.0): IS 1,36, OOS 0,91, CAGR 53,3%. Portfel (SDCA LTPI BTC, parking hybrydowy), 2020→:
stały 70/30 — CAGR 49,9%, DD −28,7%, OOS 1,05; 60/40 — 51,0%, −25,0%, 1,10; 50/50 — 51,9%, −25,1%, 1,09; 40/60 — 53,2%, −27,7%, 1,08.
Przechył wg $TOTAL (LTPI+ → 40/60): 54,2%, −29,7%, 1,05; LTPI+ → 30/70: 55,7%, −31,5%, 1,04; LTPI+ i MTPI+ → 40/60: 54,1%, −29,6%, 1,00.
W aplikacji: przełącznik w Portfelu (domyślnie wyłączony, 40/60). $TOTAL zostaje wskaźnikiem kierunku rynku w zakładce LTPI·MTPI.

## Parking BTC×trend i reguły wyjścia z coinów (run48.py) — wdrożone 2.16.0
Weto RSPS i SDCA na LTPI z BTC, 2020→. Portfel 60/40: parking hybrydowy — CAGR 50,8%, DD −25,3%, IS 1,74, OOS 1,06;
BTC×trend — 59,6%, −28,0%, 1,86, 1,05; BTC×trend + przechył 40/60 przy LTPI($TOTAL)+ — 66,7%, −29,3%, OOS 1,00.
Wyjścia z coinów ponad dzienną rotację: szybkie (cena < EMA 20 lub momentum relacji 20 d < 0) — RSPS OOS 0,65–0,67, CAGR −10 pp;
trailing stop −15/−20/−25% z 14-dniową blokadą — CAGR −1…−3 pp; trend tokena ≥ 0,75 — bez poprawy. Zostaje dzienna rotacja.

## Audyt „bez przyszłości” (2.16.0)
Wszystkie sygnały i backtesty używają tylko danych do zamknięcia świecy: model wyceny przeliczany co rok na danych sprzed 1 stycznia,
percentyle z przeszłości, TPI z przyczynowych wskaźników, backtest SDCA w aplikacji wykonuje sygnał z poprzedniego zamknięcia
(jak research), RSPS/TPI: decyzja t, pozycja od t+2. Usunięta szacowana data halvingu 2028 (emisja i zegar tylko z dat, które już były).

## Złoto tokenizowane (PAXG) zamiast stablecoina w RSPS (run49.py) — opcja w 2.19.0
PAXGUSDT z Binance od 28.08.2020 (XAUT dopiero od 03.2026 — za krótko); wcześniej stablecoin. RSPS jak w aplikacji (weto LTPI BTC,
parking BTC×trend); średnio 52% RSPS w stablecoinie 2020→. Portfel z przechyłem: stablecoin — CAGR 65,5%, DD −29,3%, OOS 1,00;
PAXG gdy złoto w trendzie (4 średnie ≥ 0,5) — 68,0%, −29,4%, 1,13; PAXG zawsze — 69,3%, −31,2%, 1,13; PAXG tylko przy LTPI<0 — 68,7%, −31,6%, 1,08.
Sam RSPS: IS 1,59 → 1,52–1,58 (lekko niżej), OOS 0,87 → 1,05–1,13. PAXG sam od 09.2020: CAGR 12,9%, DD −28,1% — przewaga OOS w dużej
części z hossy złota 2024–2026. Silnik aplikacji (fixture): CAGR RSPS 87,2 → 93,1%, OOS 0,88 → 1,13, DD bez zmian.

## Hierarchia rezerwy RSPS: złoto → BTC → stablecoin (run50.py) — domyślna od 2.20.0
Część RSPS poza altami: złoto (PAXG), gdy silne; inaczej BTC × trend (LTPI BTC > 0); inaczej stablecoin. Portfel z przechyłem, 2020→:
obecnie (BTC→stable) — CAGR 65,5%, DD −29,3%, OOS 1,00, RSPS IS 1,59; BTC→złoto w trendzie — 68,2%, −28,1%, 1,13, IS 1,52;
złoto w trendzie → BTC → stable — 51,2%, −26,0%, 1,22, IS 1,07 (złoto wypycha BTC); złoto silne = trend i PAXG/BTC > średnia 50 d —
72,8%, −29,0%, 1,37, IS 1,49; złoto silne = trend i momentum PAXG/BTC 30/60/90 d > 0 (wybrane) — 71,4%, −26,7%, 1,25, IS 1,55.
Średni udział w RSPS (wybrany wariant): złoto 28%, BTC 30%. Silnik aplikacji (fixture): CAGR RSPS 87,2 → 99,3%, IS 1,88 → 1,84, OOS 0,88 → 1,27.

## 42 Macro — cotygodniowe odczyty (2.21.0)
Raport 42 Macro jest płatny i objęty zakazem redystrybucji — w repozytorium nie ma jego treści. Aplikacja ma kartę, w której
użytkownik co tydzień wpisuje odczyty modeli: Global Macro Risk Matrix (reżim, P(risk-on)), VAMS BTC/ETH/złota, Macro Weather Model
(BTC, utrzymanie risk-on), Global Liquidity (trend, wskaźniki wyprzedzające), GRID (modalny wynik), Positioning (ryzyko korekty
i krachu), KISS i Dr. Mo dla BTC. Punktacja (własne przypisanie, równe wagi, bez backtestu — historie modeli nie są publiczne)
zasila filar Makro w Piramidzie przez 7 dni; reguła KISS dla BTC (10%/5% wg risk-on/off × 100/50/0% wg VAMS) liczona dla podglądu.
