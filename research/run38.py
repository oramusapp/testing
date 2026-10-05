"""Beta rotation (Masterclass notes, LTPI/TPI sections: 'consider increasing beta' early / 'reduce beta' at the
top): RSPS alt holdings are switched to BTC (lower beta) or stablecoin once SDCA valuation risk is high.
High-beta preference early: when risk is low, allow the RSPS picks; at risk >= R, alts -> BTC/stable."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
src = open('run19.py').read(); exec(src.split("S_ = {}")[0])
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
rk = risk.reindex(P.index).ffill()
for fb, fn in (('cash', 'parking stable'), ('trend_ltpi', 'parking BTC×trend')):
    W0 = S.rsps(ctx, **KW, fallback=fb, ltpi_veto=True)
    run(f'RSPS obecny | {fn}', W0)
    alts = [c for c in W0.columns if c != 'btc']
    for R in (60, 70, 80):
        hi = (rk >= R).reindex(W0.index).fillna(False)
        for to in ('btc', 'stable'):
            W = W0.copy(); a = W[alts].sum(axis=1)
            W.loc[hi, alts] = 0.0
            if to == 'btc': W.loc[hi, 'btc'] = W.loc[hi, 'btc'] + a[hi]
            run(f'  ryzyko≥{R}: alty → {to}', thresh(W))
# beta of picks: average 90d beta of held alts vs BTC in low-risk vs high-risk days
