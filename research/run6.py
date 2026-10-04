import numpy as np, pandas as pd, warnings, itertools
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics
import strategies as S
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
for k, g, fund in itertools.product([0, 1, 3, 5], [0.15, 0.3, 0.5], [0.0, 0.10, 0.20]):
    if k == 0 and (g != 0.3 or fund): continue
    W = S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5, short_k=k, short_gross=g if k else 0)
    r, t, h = backtest(W, P, short_fund=fund)
    a, b = metrics(r, START, IS_END), metrics(r, OOS)
    print(f"short k={k} gross {g:.2f} fund {int(fund*100):2d}%: IS CAGR {a['CAGR']*100:5.1f} Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS CAGR {b['CAGR']*100:5.1f} Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f}")
# how often is the short sleeve on, and per-year contribution
W = S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5, short_k=3, short_gross=0.3)
on = (W.clip(upper=0).sum(axis=1) < 0).loc[START:]
print('short sleeve active days', int(on.sum()), 'of', len(on))
r1 = backtest(W, P)[0]; r0 = backtest(S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5), P)[0]
print((r1 - r0).loc[START:].groupby(lambda d: d.year).sum().round(3))
