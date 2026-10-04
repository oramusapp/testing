import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics, ADF_5PCT
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
import strategies as S
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
base = S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5)
t = ctx.trend['btc'].fillna(0); trending = ctx.adf > ADF_5PCT
for lev in [1.0, 1.5, 2.0]:
    for fund in [0.10, 0.20]:
        W = base.copy()
        boost = ((t == 1) & trending & (W['btc'] > 0.99)).astype(float)   # only when 100% in BTC fallback
        W['btc'] = W['btc'] * (1 + boost * (lev - 1))
        r, tt, h = backtest(W, P, lev_cost=fund)
        a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
        print(f"lev {lev} funding {int(fund*100)}%/yr: IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:.1f}% | OOS Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:.1f}% CAGR {b['CAGR']*100:.1f}% | FULL Sh {f['Sharpe']:.2f} CAGR {f['CAGR']*100:.1f}% DD {f['MaxDD']*100:.1f}%  days levered {int(boost.loc[START:].sum())}")
