"""Robustness of ATH-day selling (run36): unit size, growth factor, reset rule, weekly ATHs, year by year,
and the full SDCA 60 / RSPS 40 portfolio."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run36.py').read(); exec(_t[:_t.index("rk = risk.reindex")])
from engine import metrics
rk = risk.reindex(P.index)
for g in (1.0, 1.05, 1.1, 1.15, 1.2):
    SCHED[f'x{g}'] = (lambda gg: (lambda k: gg ** k))(g)
for g in ('x1.0', 'x1.05', 'x1.1', 'x1.15', 'x1.2'):
    for u in (0.005, 0.01, 0.015):
        show(f'ATH {g:6s} u={u*100:.1f}%', *sdca_ath(rk, g, u, 70))
base = sdca_ath(rk); cand = sdca_ath(rk, 'x1.1', 0.01, 70)
yr = lambda r: (1 + r).groupby(r.index.year).prod() - 1
print('\nrok: obecna vs ATH x1.1 u=1%'); print(pd.DataFrame({'obecna': yr(base[0]), 'ATH': yr(cand[0])}).round(3).T.to_string())
# weekly ATH (only first ATH close per calendar week counts)
wk = is_ath & ~is_ath.groupby(is_ath.index.to_period('W')).cummax().shift(1, fill_value=False).where(is_ath.index.to_period('W') == pd.Series(is_ath.index.to_period('W'), index=is_ath.index).shift(1), False)
first_in_week = is_ath & (is_ath.groupby(is_ath.index.to_period('W')).cumsum() == 1)
_saved = is_ath.copy(); is_ath = first_in_week
show('ATH tygodnie x1.1 u=2%', *sdca_ath(rk, 'x1.1', 0.02, 70)); show('ATH tygodnie x1.0 u=3%', *sdca_ath(rk, 'x1.0', 0.03, 70))
is_ath = _saved
# full portfolio
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
for fb, fn in (('cash', 'parking stable'), ('trend_ltpi', 'parking BTC×trend')):
    W = S.rsps(ctx, **KW, fallback=fb, ltpi_veto=True); r, t, h = backtest(W, P); sl = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
    for n, (sr, sw) in (('SDCA obecna', base), ('SDCA + ATH x1.1 u=1%', cand)):
        rr, e = simulate(*sl, sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10); line(f'Portfel {n} | {fn}', rr, e)
