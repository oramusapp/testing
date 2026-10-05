"""SDCA accumulation driven by valuation AND LTPI (Masterclass: rate of accumulation = remaining stablecoin spread
over the expected value period, 114 +/- 32 days; 'LSI on positive trend' once the trend turns up after the value zone;
'too slow is marginally preferred over too fast'). Every day a % of the REMAINING stablecoin is bought.
Variants of the buy rate (sell side, LTPI safety unchanged):
  curve          current: curve(risk) % of remaining stablecoin per day (up to 10%/day)
  ltpi_mult m    curve(risk) x m while LTPI < 0, full curve while LTPI > 0
  sched N        risk < 50 & LTPI < 0: 1/(N - d) of remaining (d = days already spent in the value zone, floor 1/30);
                 risk < 50 & LTPI > 0: curve rate x boost (LSI-like)"""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run23.py').read(); exec(_t[:_t.index('OUT = {}; rk')])
def sdca3(risk_s, mode='curve', m=1.0, N=114, boost=1.0, cost=0.0015, start=START):
    p = price.loc[start:]; r = risk_s.reindex(p.index).shift(1); l = LT.reindex(p.index).shift(1)
    cash, btc, eq, wb, owed, d_in = 1.0, 0.0, [], [], 0.0, 0
    for d in p.index:
        px = p[d]; rk = r[d]; ls = l[d]
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate > 0:
            if mode == 'ltpi_mult' and ls < 0: rate *= m
            elif mode == 'sched':
                if ls < 0: rate = 1.0 / max(30, N - d_in); d_in += 1
                else: rate = min(1.0, rate * boost)
        if not (np.isfinite(rk) and rk < 50): d_in = 0 if rk >= 60 else d_in
        if rate > 0 and cash > 0:
            amt = cash * min(rate, 1); cash -= amt; btc += amt * (1 - cost) / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0:
            q = btc * -rate; btc -= q; cash += q * px * (1 - cost); owed *= (btc / (btc + q)) if btc + q > 0 else 0
        if ls < 0 and np.isfinite(rk) and rk >= 70:
            q = btc * 0.02; btc -= q; v = q * px * (1 - cost); cash += v; owed += v
        elif ls > 0 and owed > 0 and cash > 0:
            amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * (1 - cost) / px; owed -= amt
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wb, index=p.index)
rk = risk.reindex(P.index)
for st in ('2020-01-01', '2018-01-01'):
    START_ = st
    print(f'=== start {st} (100% stablecoin at start)')
    show('obecna krzywa', *sdca3(rk, start=st))
    for m in (0.1, 0.25, 0.5): show(f'krzywa × {m} gdy LTPI<0', *sdca3(rk, 'ltpi_mult', m, start=st))
    for N in (82, 114, 146):
        for b in (1.0, 3.0): show(f'harmonogram 1/(N−d) N={N}, LTPI>0 krzywa×{b}', *sdca3(rk, 'sched', N=N, boost=b, start=st))
