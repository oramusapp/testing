"""Notes: 'The TPI is built for $TOTAL'. LTPI / MTPI computed on the $TOTAL proxy (total.py) vs on BTC, and the state rule
from the notes (sell below zero, buy above zero) vs the app's ±0.2 hysteresis. Effects on: TPI long/cash on BTC, SDCA
(LTPI safety + slower buys while LTPI<0), RSPS (LTPI veto) and the 60/40 portfolio. 2020→, IS 2020-23, OOS 2024→."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run40.py').read(); exec(_t[:_t.index('rk = risk.reindex')])
import tpi as T
from total import total_index
TOT = total_index().reindex(df.index).ffill()
btcp = df['price']
def state(p, spec, h):
    v, _ = T.tpi(p, spec)
    if h == 0: return np.sign(v).replace(0, np.nan).ffill().fillna(0)
    st, out = 0.0, []
    for x in v.fillna(0).values:
        if x > h: st = 1.0
        elif x < -h: st = -1.0
        out.append(st)
    return pd.Series(out, v.index)
S_ = {}
for src, p in (('BTC', btcp), ('TOTAL', TOT)):
    for h in (0.2, 0.0):
        S_[(src, h, 'L')] = state(p, T.LTPI, h); S_[(src, h, 'M')] = state(p, T.MTPI, h)
r_b = np.log(btcp).diff()
def tpi_bt(st):
    pos = (st > 0).astype(float).shift(2).fillna(0); r = (np.exp(r_b) - 1) * pos - pos.diff().abs() * 0.0015
    return r
print('=== 1. TPI long BTC / stablecoin')
for k, st in S_.items():
    r = tpi_bt(st)
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    print(f"{k[2]}TPI z {k[0]:5s} próg {'±0,2' if k[1] else '0  '}: IS Sh {a['Sharpe']:.2f} | OOS Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | zmian/rok {(st.diff().abs()>0).loc[START:].sum()/ (len(st.loc[START:])/365):.1f}")
print('=== 2. SDCA (safety + buys ×0.25 while LTPI<0) and portfolio with RSPS veto by the same LTPI (parking hybrid)')
rkp = risk.reindex(P.index).ffill()
for src in ('BTC', 'TOTAL'):
    for h in (0.2, 0.0):
        LT = S_[(src, h, 'L')].reindex(P.index).ffill()
        sr, sw = sdca3(risk.reindex(P.index), 'ltpi_mult', 0.25)
        ctx.ltpi = LT
        bt_ = ctx.trend['btc']
        park = bt_.where((LT > 0) & (rkp < 80), 0.0)
        ctx.fallback_series = park.fillna(0)
        W = S.rsps(ctx, **KW, fallback='series', ltpi_veto=True); r, t, hh = backtest(W, P)
        rr, e = simulate(r.loc[START:], hh.loc[START:].abs().sum(axis=1), sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10)
        a, b, f = metrics(sr, START, IS_END), metrics(sr, OOS), metrics(sr, START)
        pa, pb_, pf = metrics(rr, START, IS_END), metrics(rr, OOS), metrics(rr, START)
        print(f"LTPI z {src:5s} próg {'±0,2' if h else '0  '}: SDCA IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | PORTFEL IS {pa['Sharpe']:.2f} OOS {pb_['Sharpe']:.2f} CAGR {pf['CAGR']*100:5.1f} DD {pf['MaxDD']*100:5.1f}")
