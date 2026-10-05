"""Robustness of shorter relative-strength lookbacks in RSPS (run52 R2): neighbour grid, per-year returns,
double trading cost, turnover. Same setup as run52 (2.22.0)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r52 = open('run52.py').read(); exec(_r52[:_r52.index("SD0 = sdca4()")])
SD0 = sdca4()
GRID = [(30, 60, 90), (10, 20, 40), (7, 21, 42), (14, 30, 60), (7, 14, 30)]
res = {}
for lb in GRID:
    r = rsps3(lbs=lb); res[lb] = r; show4(f'okna {lb}', r)
print('\nRSPS rok po roku (zwrot %):')
yrs = range(2020, 2027)
print('okna'.ljust(16) + ''.join(f'{y:>8d}' for y in yrs))
for lb in ((30, 60, 90), (20, 40, 60), (14, 30, 60), (7, 14, 30)):
    r = res[lb]; print(str(lb).ljust(16) + ''.join(f"{((1 + r.loc[str(y)]).prod() - 1) * 100:8.0f}" for y in yrs))
print('\nKoszt 0,3% za stronę (podwójny):')
for lb in ((30, 60, 90), (20, 40, 60), (14, 30, 60), (7, 14, 30)):
    r, tv = rsps3(lbs=lb, cost=0.003, turn=True)
    print(f"  obrót roczny {tv.loc[START:].sum() / ((len(tv.loc[START:])) / 365):5.1f}×", end=' ')
    show4(f'koszt 0,3% okna {lb}', r)
print('\nBez roku 2021 (portfel CAGR, czy zysk nie pochodzi z jednego roku) i koszt 0,3%:')
for lb in ((30, 60, 90), (10, 20, 40), (7, 21, 42), (14, 30, 60), (7, 14, 30)):
    global r_rs
    SDR, SDW = SD0; r_rs = res[lb]; pt = sim(tiltL)
    x = pt.loc[START:]; x = x[x.index.year != 2021]
    eqx = (1 + x).prod() ** (365 / len(x)) - 1
    r2 = rsps3(lbs=lb, cost=0.003); SDR, SDW = SD0; r_rs = r2; p2 = sim(tiltL); m2 = metrics(p2, START)
    print(f"  {str(lb):14s} portfel bez 2021 CAGR {eqx*100:5.1f}% | koszt 0,3%: CAGR {m2['CAGR']*100:5.1f} OOS {metrics(p2, OOS)['Sharpe']:.2f}")
