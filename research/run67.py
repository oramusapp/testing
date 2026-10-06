"""Robustness of option 2 (split 40/60, tilt 20/80 while LTPI $TOTAL > 0) vs current (60/40 → 40/60): rolling 1- and
2-year windows (every 30 days) and yearly results."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r66 = open('run66.py').read(); exec(_r66[:_r66.index("rows = {")])
cur = port(tilt1); opt = port(pd.Series(np.where(ltt5 > 0, 0.2, 0.4), idx))
for L in (365, 730):
    ec, eo = (1 + cur).cumprod(), (1 + opt).cumprod(); rc, ro, dc, do = [], [], [], []
    for i in range(0, len(ec) - L, 30):
        a, b = ec.iloc[i:i + L + 1], eo.iloc[i:i + L + 1]
        rc.append(a.iloc[-1] / a.iloc[0] - 1); ro.append(b.iloc[-1] / b.iloc[0] - 1)
        dc.append((a / a.cummax() - 1).min()); do.append((b / b.cummax() - 1).min())
    rc, ro, dc, do = map(np.array, (rc, ro, dc, do))
    print(f"okna {L} d (n={len(rc)}): opcja 2 wyższy zwrot w {np.mean(ro > rc)*100:.0f}% okien | mediana zwrotu {np.median(rc)*100:.0f}% → {np.median(ro)*100:.0f}% | najgorszy {rc.min()*100:.0f}% → {ro.min()*100:.0f}% | mediana DD {np.median(dc)*100:.1f} → {np.median(do)*100:.1f}% | najgorsze DD {dc.min()*100:.1f} → {do.min()*100:.1f}%")
for y in range(2020, 2027):
    print(y, f"obecny {((1 + cur.loc[str(y)]).prod() - 1)*100:5.0f}%  opcja 2 {((1 + opt.loc[str(y)]).prod() - 1)*100:5.0f}%")
