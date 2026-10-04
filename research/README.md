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
