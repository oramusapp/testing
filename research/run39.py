"""RSPS parking when the gate is closed: 'BTC up to a certain point of the trend, stablecoins afterwards'
(user idea), plus a conditional BTC short in a confirmed downtrend (proposal only, never automatic).
Parking weight = BTC trend ensemble while LTPI > 0 AND the 'still early' condition holds, else stablecoin.
Early conditions tested: valuation risk < R; days since LTPI turned positive < N; BTC gain since that day < X;
fewer than K ATH days in the cycle. Short: when LTPI < 0 and BTC trend ensemble <= 0.25, park at -s BTC
(financing assumed 10%/yr on the short notional)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run23.py').read(); exec(_t[:_t.index('OUT = {}; rk')])
idx = P.index; bt = ctx.trend['btc'].reindex(idx); pb = P['btc']
ltpi = ((pb > pb.rolling(200).mean()).astype(float) * 2 - 1); ctx.ltpi = ltpi
rkp = risk.reindex(idx).ffill()
up = ltpi > 0; start = (up & ~up.shift(1, fill_value=False))
grp = start.cumsum()
days_in = up.groupby(grp).cumsum()                                  # days since LTPI turned positive
gain = pb / pb.where(start).ffill() - 1                             # BTC gain since that day
athd = (pb >= pb.cummax()) & (pb > pb.shift(1).cummax())
cyc = (pb < pb.cummax() * 0.5).cumsum()                             # new cycle after a 50% drawdown
ath_n = athd.groupby(cyc).cumsum()
base = bt.where(up, 0.0)
SDR, SDW = sdca2(risk.reindex(P.index))
def go(name, park, short=None, sf=0.10):
    if short is not None: park = park.where(~((ltpi < 0) & (bt <= 0.25)), -short)
    ctx.fallback_series = park.fillna(0)
    W = S.rsps(ctx, **KW, fallback='series', ltpi_veto=True)
    r, t, h = backtest(W, P, short_fund=sf)
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    rr, e = simulate(r.loc[START:], h.loc[START:].abs().sum(axis=1), SDR, SDW.reindex(P.index).fillna(0), rule='band', band=0.10)
    pa, pb_, pf = metrics(rr, START, IS_END), metrics(rr, OOS), metrics(rr, START)
    print(f"{name:40s} RSPS IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} FULL CAGR {f['CAGR']*100:5.1f} | PORTFEL IS {pa['Sharpe']:.2f} OOS {pb_['Sharpe']:.2f} DD {pb_['MaxDD']*100:5.1f} CAGR {pb_['CAGR']*100:5.1f} | FULL CAGR {pf['CAGR']*100:5.1f} DD {pf['MaxDD']*100:5.1f}")
go('stablecoin (obecny domyślny)', base * 0)
go('BTC×trend przy LTPI>0 (obecna opcja)', base)
for R in (50, 60, 70, 80): go(f'BTC×trend dopóki ryzyko < {R}%', base.where(rkp < R, 0))
for N in (90, 180, 365, 540): go(f'BTC×trend przez {N} dni trendu', base.where(days_in < N, 0))
for X in (0.5, 1.0, 2.0): go(f'BTC×trend do +{int(X*100)}% od startu trendu', base.where(gain < X, 0))
for K in (1, 10, 20): go(f'BTC×trend do {K} dni ATH w cyklu', base.where(ath_n < K, 0))
print('--- conditional short in confirmed downtrend (LTPI<0 and BTC trend ≤ 0.25)')
for s in (0.25, 0.5):
    go(f'stablecoin + short {int(s*100)}%', base * 0, s)
    go(f'BTC×trend + short {int(s*100)}%', base, s)
    go(f'BTC×trend dopóki ryzyko<70 + short {int(s*100)}%', base.where(rkp < 70, 0), s)
