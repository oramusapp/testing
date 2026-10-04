import numpy as np, pandas as pd, warnings, json, sys
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding, sdca_equity
import strategies as S

P, C = load()
df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS_START = '2020-01-01', '2023-12-31', '2024-01-01'

def sleeve(W, **kw):
    r, t, h = backtest(W, P, **kw)
    return r.loc[START:], t, h

def blend(parts):
    """Separate sub-accounts with a fixed initial capital split (no cross-rebalancing)."""
    eq = sum(a * (1 + r).cumprod() for a, r in parts)
    return eq.pct_change().fillna(eq.iloc[0] - 1)

res = {}
def add(name, r, t=None, h=None):
    res[name] = {'IS': metrics(r, START, IS_END, t, h), 'OOS': metrics(r, OOS_START, None, t, h), 'FULL': metrics(r, START, None, t, h), 'ret': r}

r, t, h = sleeve(S.buy_hold_btc(ctx)); add('BTC buy&hold', r, t, h)
r, t, h = sleeve(S.equal_weight(ctx)); add('Top10 równe wagi (bez memów)', r, t, h)
sd_r, sd_w = sdca_equity(df['price'].reindex(P.index).ffill(), risk.reindex(P.index), start=START); add('SDCA krzywa (od gotówki)', sd_r)
r, t, h = sleeve(S.btc_trend(ctx)); add('BTC trend (ensemble SMA)', r, t, h)
r, t, h = sleeve(S.btc_trend(ctx, vol_target=0.5, max_lev=1.0)); add('BTC trend + vol target 50%', r, t, h)
r, t, h = sleeve(S.btc_trend_adf_lev(ctx, 2.0)); add('BTC trend + 2x gdy ADF trend', r, t, h)
r, t, h = sleeve(S.rsps(ctx, conf=0.0)); add('RSPS bez bramki', r, t, h)
r, t, h = sleeve(S.rsps(ctx, conf=0.5)); add('RSPS bramka breadth≥0.5', r, t, h)
r, t, h = sleeve(S.rsps(ctx, conf=0.6)); add('RSPS bramka breadth≥0.6', r, t, h)
r, t, h = sleeve(S.rsps(ctx, conf=0.5, short_k=3, short_gross=0.3)); add('RSPS 0.5 + short alt 30%', r, t, h)
r, t, h = sleeve(S.combine((1, S.btc_trend(ctx)), (1, S.btc_short_sleeve(ctx, 0.5)))); add('BTC trend + short BTC 50%', r, t, h)

for k, v in res.items():
    print(f"{k:34s}", ' | '.join(f"{p}: CAGR {v[p]['CAGR']*100:6.1f}% Sh {v[p]['Sharpe']:.2f} DD {v[p]['MaxDD']*100:6.1f}% Cal {v[p]['Calmar']:.2f}" for p in ('IS', 'OOS')))
pd.to_pickle(res, '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/res1.pkl')
