"""Breadth thrust (OddStats slide: 'at least 4 of previous 8 days saw all sector ETFs positive') adapted to crypto:
share of the top-10 liquid coins up on the day; event = on >= 4 of the last 8 days at least 90% of them rose.
Forward BTC returns vs all days, events at least 30 days apart (SentimenTrader-style: median, % positive, z)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from data2 import load
from engine import top_n_universe
P, C, Q = load()
E = top_n_universe(Q.rolling(30).mean(), P, 10)
up = (P.pct_change() > 0).astype(float).where(E.astype(bool))
share = up.sum(axis=1) / E.astype(float).sum(axis=1).replace(0, np.nan)
for thr, k in ((0.9, 4), (1.0, 3), (0.9, 3)):
    ev = ((share >= thr).rolling(8).sum() >= k)
    days, last = [], None
    for d in ev[ev].index:
        if d < pd.Timestamp('2019-01-01'): continue
        if last is None or (d - last).days >= 30: days.append(d); last = d
    b = P['btc']
    for h in (7, 30, 90):
        f = np.log(b.shift(-h) / b); allf = f.loc['2019':].dropna(); x = f.reindex(days).dropna()
        z = (x.mean() - allf.mean()) / (allf.std() / np.sqrt(len(x))) if len(x) > 1 else np.nan
        print(f'próg {thr:.0%} × {k}/8 · {h:2d} d: n={len(x):2d} mediana {np.median(x)*100:6.1f}% vs {allf.median()*100:5.1f}% · na plus {np.mean(x>0)*100:3.0f}% vs {np.mean(allf>0)*100:3.0f}% · z {z:5.2f}')
