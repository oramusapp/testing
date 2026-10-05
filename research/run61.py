"""Honest tests of new ideas (same pre-registered rule as run60, chosen on 2020–23 only).
SDCA: buy side × 1.5 / × 0.7, sell side × 0.5 / × 1.5, slow buying while LTPI<0 × 0.5 / × 0.1 (now 0.25), Probable Range × 3 (now 2).
RSPS: (a) skip a coin whose 7-day gain exceeds +40% (over-extension); (b) diversification: skip a pick whose 90-day return
correlation with an already chosen pick is > 0.9."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r60 = open('run60.py').read(); exec(_r60[:_r60.index("line('BAZA 2.26', base)")])
from sdca import curve_rate, DEFAULT_CURVE
def sdcaX(buy=1.0, sell=1.0, slow=0.25, prm=2.0):
    p_ = price.loc[START:]; rr = risk.reindex(P.index).reindex(p_.index).shift(1); l = LT.reindex(p_.index).shift(1)
    lo = below.reindex(p_.index).shift(1).fillna(False)
    cash, btc, eq, wb, owed = 1.0, 0.0, [], [], 0.0
    for d in p_.index:
        px = p_[d]; rk = rr[d]; ls = l[d]
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate > 0:
            rate *= buy
            if ls < 0: rate *= slow
            if lo[d]: rate *= prm
            if rate * 100 <= 1: rate = 0.0
        elif rate < 0: rate *= sell
        if rate > 0 and cash > 0: amt = cash * min(rate, 1); cash -= amt; btc += amt * 0.9985 / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0: q = btc * min(-rate, 1); btc -= q; cash += q * px * 0.9985
        if ls < 0 and np.isfinite(rk) and rk >= 70: q = btc * 0.02; btc -= q; v = q * px * 0.9985; cash += v; owed += v
        elif ls > 0 and owed > 0 and cash > 0: amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * 0.9985 / px; owed -= amt
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p_.index); return eq.pct_change().fillna(0), pd.Series(wb, index=p_.index)
chk = sdcaX(); print('kontrola: SDCA odtworzone', round(metrics(chk[0], START)['CAGR'] * 100, 1), 'vs', round(metrics(SDf[0], START)['CAGR'] * 100, 1))
r0 = rs(); base = ev(r0)
line('BAZA 2.26', base)
for nm, kw in (('SDCA kupno × 1,5', dict(buy=1.5)), ('SDCA kupno × 0,7', dict(buy=0.7)), ('SDCA sprzedaż × 0,5', dict(sell=0.5)), ('SDCA sprzedaż × 1,5', dict(sell=1.5)),
               ('SDCA LTPI− × 0,5', dict(slow=0.5)), ('SDCA LTPI− × 0,1', dict(slow=0.1)), ('SDCA Probable Range × 3', dict(prm=3.0))):
    line(nm, ev(r0, sd=sdcaX(**kw)))
R7 = P / P.shift(7) - 1
LRd = np.log(P).diff()
_rs_src = _r60[_r60.index('def rs('):_r60.index('def ev(')]
code = _rs_src.replace("def rs(", "def rs2(ext=None, corr=None, ").replace(
 "ranked = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= floor][:top]",
 """cand = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= floor and not (ext and R7[a].iloc[i] > ext)]
            ranked = []
            for a in cand:
                if corr and any(LRd[a].iloc[i - 89:i + 1].corr(LRd[b].iloc[i - 89:i + 1]) > corr for b in ranked): continue
                ranked.append(a)
                if len(ranked) == top: break""")
exec(code)
line('RSPS bez przegrzanych (7 d > +40%)', ev(rs2(ext=0.4)))
line('RSPS dywersyfikacja (korelacja > 0,9)', ev(rs2(corr=0.9)))
