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
