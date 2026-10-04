"""Strict leverage gate: every automatic condition must hold at once."""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics, ADF_5PCT
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
import strategies as S
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
F = pickle.load(open(SP + 'final.pkl', 'rb'))
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
base = S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5)
t = ctx.trend['btc'].fillna(0); adf_ok = ctx.adf > ADF_5PCT; ltpi = ctx.ltpi > 0
vol = ctx.vol['btc']
def blend_rebal(parts):
    rets = pd.concat([r for _, r in parts], axis=1).fillna(0); w0 = np.array([a for a, _ in parts]); vals = w0.copy(); out = []
    starts = set(rets.resample('YS').first().index)
    for d, row in rets.iterrows():
        if d in starts and d != rets.index[0]: vals = w0 * vals.sum()
        prev = vals.sum(); vals = vals * (1 + row.values); out.append(vals.sum() / prev - 1)
    return pd.Series(out, index=rets.index)
gates = {
  'brak dźwigni': pd.Series(False, index=P.index),
  'trend=1 & ADF (stara reguła)': (t == 1) & adf_ok,
  '+ LTPI>0 & ryzyko SDCA<50': (t == 1) & adf_ok & ltpi & (ctx.risk < 50),
  '+ vol BTC < mediana 365d': (t == 1) & adf_ok & ltpi & (ctx.risk < 50) & (vol < vol.rolling(365).median()),
  '+ trwałość ≥10 dni': None,
}
g = (t == 1) & adf_ok & ltpi & (ctx.risk < 50) & (vol < vol.rolling(365).median())
gates['+ trwałość ≥10 dni'] = g & (g.rolling(10).sum() == 10)
for name, gate in gates.items():
    W = base.copy(); on = gate & (W['btc'] > 0.99)
    W['btc'] = W['btc'] * np.where(on, 1.5, 1.0)
    r = backtest(W, P, lev_cost=0.15)[0].loc[START:]
    combo = blend_rebal([(0.5, F['sd_r']), (0.5, r)]).loc[:'2026-05-23']
    a, b, f = metrics(combo, START, IS_END), metrics(combo, OOS), metrics(combo, START)
    print(f"{name:32s} dni z dźwignią {int(on.loc[START:].sum()):4d} | combo IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f}")
