"""Rate of distribution (Masterclass lecture): 'perhaps combining ATH days/weeks with valuation would be
an optimal strategy' + sale-size schedules per ATH from the slide (Linear+2, Expon, Incr1, Incr2, x1.1).
Our reading of the schedules (slide shows only labels): unit size u of current BTC holdings on the k-th ATH
day of the cycle: Linear+2 = 1,3,5,..; Expon = 1,2,4,..; Incr1 = 1,2,3,..; Incr2 = 1,2,4,6,..; x1.1 = 1.1^k.
A sale happens only on a new all-time-high close while composite risk >= R. Counter resets when price is
50% below its ATH. Everything else as current SDCA with LTPI safety; curve buys stay."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run23.py').read(); exec(_t[:_t.index('OUT = {}; rk')])
SCHED = {'Linear+2': lambda k: 1 + 2 * k, 'Expon': lambda k: 2 ** k, 'Incr1': lambda k: 1 + k,
         'Incr2': lambda k: 1 if k == 0 else 2 * k, 'x1.1': lambda k: 1.1 ** k}
pfull = df['price']; ath = pfull.cummax()
is_ath = (pfull >= ath) & (pfull > pfull.shift(1).cummax())
def sdca_ath(risk_s, sched=None, u=0.01, R=70, keep_curve_sells=True, cost=0.0015, start=START):
    p = price.loc[start:]; r = risk_s.reindex(p.index).shift(1); l = LT.reindex(p.index).shift(1)
    A = is_ath.reindex(p.index).shift(1).fillna(False); dd = (pfull / ath - 1).reindex(p.index).shift(1)
    cash, btc, eq, wb, owed, k = 1.0, 0.0, [], [], 0.0, 0
    for d in p.index:
        px = p[d]; rk = r[d]; ls = l[d]
        if np.isfinite(dd[d]) and dd[d] < -0.5: k = 0
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate < 0 and not keep_curve_sells: rate = 0.0
        if rate > 0 and cash > 0:
            amt = cash * min(rate, 1); cash -= amt; btc += amt * (1 - cost) / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0:
            q = btc * -rate; btc -= q; cash += q * px * (1 - cost); owed *= (btc / (btc + q)) if btc + q > 0 else 0
        if sched and A[d] and np.isfinite(rk) and rk >= R and btc > 0:
            q = btc * min(1.0, u * SCHED[sched](k)); btc -= q; cash += q * px * (1 - cost); k += 1
        if ls < 0 and np.isfinite(rk) and rk >= 70:
            q = btc * 0.02; btc -= q; v = q * px * (1 - cost); cash += v; owed += v
        elif ls > 0 and owed > 0 and cash > 0:
            amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * (1 - cost) / px; owed -= amt
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wb, index=p.index)
rk = risk.reindex(P.index)
print('ATH days by year (2020→):', is_ath.loc[START:].groupby(is_ath.loc[START:].index.year).sum().to_dict())
show('SDCA obecna (bezpiecznik)', *sdca_ath(rk))
for R in (50, 60, 70):
    for u in (0.01, 0.02):
        for s in SCHED:
            show(f'ATH {s:8s} u={int(u*100)}% R≥{R}', *sdca_ath(rk, s, u, R))
for s in ('Incr1', 'Linear+2'):
    show(f'ATH {s} u=2% R≥60 zamiast sprzedaży z krzywej', *sdca_ath(rk, s, 0.02, 60, keep_curve_sells=False))
