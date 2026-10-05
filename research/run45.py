"""Mixed LTPI sources: SDCA uses LTPI on BTC (safety + slower buys), RSPS uses LTPI on $TOTAL (veto) — vs both BTC / both TOTAL.
Threshold 0 (notes) and ±0.2. Portfolio 60/40, RSPS parking hybrid, 2020→."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run44.py').read(); exec(_t[:_t.index("print('=== 1.")])
rkp = risk.reindex(P.index).ffill()
for h in (0.0, 0.2):
    for sd_src, rs_src in (('BTC', 'BTC'), ('TOTAL', 'TOTAL'), ('BTC', 'TOTAL')):
        LT = S_[(sd_src, h, 'L')].reindex(P.index).ffill()
        sr, sw = sdca3(risk.reindex(P.index), 'ltpi_mult', 0.25)
        L2 = S_[(rs_src, h, 'L')].reindex(P.index).ffill()
        ctx.ltpi = L2
        park = ctx.trend['btc'].where((L2 > 0) & (rkp < 80), 0.0); ctx.fallback_series = park.fillna(0)
        W = S.rsps(ctx, **KW, fallback='series', ltpi_veto=True); r, t, hh = backtest(W, P)
        rr, e = simulate(r.loc[START:], hh.loc[START:].abs().sum(axis=1), sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10)
        b, f = metrics(sr, OOS), metrics(sr, START); rb, rf = metrics(r, OOS), metrics(r, START)
        pa, pb_, pf = metrics(rr, START, IS_END), metrics(rr, OOS), metrics(rr, START)
        print(f"próg {h}: SDCA LTPI {sd_src:5s} RSPS LTPI {rs_src:5s} | SDCA OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} | RSPS OOS {rb['Sharpe']:.2f} CAGR {rf['CAGR']*100:5.1f} | PORTFEL IS {pa['Sharpe']:.2f} OOS {pb_['Sharpe']:.2f} CAGR {pf['CAGR']*100:5.1f} DD {pf['MaxDD']*100:5.1f}")
