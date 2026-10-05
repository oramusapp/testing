"""Follow-up to run30: SDCA safety threshold (risk ≥ R with LTPI < 0), with buy-back, at portfolio level."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
exec(open('run23.py').read().split("OUT = {}; rk")[0])
_s = open('run14.py').read(); exec('def simulate' + _s.split('def simulate')[1].split("rs, rexp = sleeves['trend']")[0])
rk = risk.reindex(P.index)
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
W = S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True); r, t, h = backtest(W, P); rs = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
W2 = S.rsps(ctx, **KW, fallback='cash', ltpi_veto=True); r2, t2, h2 = backtest(W2, P); rs2 = (r2.loc[START:], h2.loc[START:].abs().sum(axis=1))
for R in (None, 30, 40, 50, 60, 70, 80):
    sr, sw = (sdca(rk) if R is None else sdca2(rk, R, 0.0, True))
    nm = 'bez bezpiecznika' if R is None else f'bezpiecznik R ≥ {R}'
    show(f'SDCA {nm}', sr, sw)
    for rr_, lab in ((rs, 'parking BTC×trend'), (rs2, 'parking stable')):
        rr, e = simulate(*rr_, sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10); line(f'  60/40 {lab}', rr, e)
