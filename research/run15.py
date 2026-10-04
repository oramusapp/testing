import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run14.py').read().split("rs, rexp = sleeves['trend']")[0])
for fb, veto, name in [('trend', False, 'badanie: BTC×trend'), ('trend_ltpi', True, 'aplikacja: LTPI<0 → 100% stable')]:
    W = S.rsps(ctx, **KW, fallback=fb, ltpi_veto=veto); r, t, h = backtest(W, P)
    rr, e = simulate(r.loc[START:], h.loc[START:].abs().sum(axis=1), sd_r, sd_w, rule='band', band=0.10)
    line(name + ' (rebalans ±10pp)', rr, e)
