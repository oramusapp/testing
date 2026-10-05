"""Robustness of the SDCA slow-buy multiplier 0.5 vs 0.25 (run62) across 24 quarterly start dates 2018–2023, SDCA alone,
evaluated only up to 2023-12-31 (no 2024→ data used)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r61 = open('run61.py').read(); exec(_r61[:_r61.index("chk = sdcaX()")])
import inspect
src = inspect.getsource(sdcaX) if False else _r61[_r61.index('def sdcaX'):_r61.index('chk = sdcaX()')]
exec(src.replace('def sdcaX(buy=1.0, sell=1.0, slow=0.25, prm=2.0):', 'def sdcaS(start, slow=0.25, buy=1.0, sell=1.0, prm=2.0):').replace("p_ = price.loc[START:]", "p_ = price.loc[start:IS_END]"))
starts = pd.date_range('2018-01-01', '2023-01-01', freq='QS')
rows = []
for s in starts:
    out = []
    for m in (0.25, 0.5):
        r, _ = sdcaS(s.strftime('%Y-%m-%d'), slow=m); e = (1 + r).cumprod()
        yrs = len(r) / 365; cagr = e.iloc[-1] ** (1 / yrs) - 1; dd = (e / e.cummax() - 1).min(); sh = r.mean() / r.std() * np.sqrt(365)
        out.append((cagr, dd, sh))
    rows.append((s.date(), *out[0], *out[1]))
d = pd.DataFrame(rows, columns=['start', 'cagr25', 'dd25', 'sh25', 'cagr50', 'dd50', 'sh50'])
print(f"startów: {len(d)}  (wyniki do końca 2023)")
print(f"mediana CAGR   ×0,25 {d.cagr25.median()*100:5.1f}%  ×0,5 {d.cagr50.median()*100:5.1f}%")
print(f"najgorsze DD   ×0,25 {d.dd25.min()*100:5.1f}%  ×0,5 {d.dd50.min()*100:5.1f}%")
print(f"mediana DD     ×0,25 {d.dd25.median()*100:5.1f}%  ×0,5 {d.dd50.median()*100:5.1f}%")
print(f"Sharpe lepszy przy ×0,5: {(d.sh50 > d.sh25).sum()}/{len(d)} startów; DD gorsze przy ×0,5: {(d.dd50 < d.dd25 - 1e-9).sum()}/{len(d)}")
print('--- pozostali kandydaci z run61 (vs baza) ---')
for nm, kw in (('kupno × 1,5', dict(buy=1.5)), ('Probable Range × 3', dict(prm=3.0))):
    res = []
    for s in starts:
        a = []
        for k in ({}, kw):
            r, _ = sdcaS(s.strftime('%Y-%m-%d'), **k); e = (1 + r).cumprod()
            a.append((e.iloc[-1] ** (365 / len(r)) - 1, (e / e.cummax() - 1).min(), r.mean() / r.std() * np.sqrt(365)))
        res.append((*a[0], *a[1]))
    d2 = pd.DataFrame(res, columns=['c0', 'd0', 's0', 'c1', 'd1', 's1'])
    print(f"{nm}: mediana CAGR {d2.c0.median()*100:.1f} → {d2.c1.median()*100:.1f}% | najgorsze DD {d2.d0.min()*100:.1f} → {d2.d1.min()*100:.1f}% | Sharpe lepszy {(d2.s1 > d2.s0).sum()}/{len(d2)} | DD gorsze {(d2.d1 < d2.d0 - 1e-9).sum()}/{len(d2)}")
print('--- kontrola zmiany już wdrożonej (2.22): Probable Range ×2 vs ×1 ---')
res = []
for s in starts:
    a = []
    for k in (dict(prm=1.0), {}):
        r, _ = sdcaS(s.strftime('%Y-%m-%d'), **k); e = (1 + r).cumprod()
        a.append((e.iloc[-1] ** (365 / len(r)) - 1, (e / e.cummax() - 1).min(), r.mean() / r.std() * np.sqrt(365)))
    res.append((*a[0], *a[1]))
d3 = pd.DataFrame(res, columns=['c0', 'd0', 's0', 'c1', 'd1', 's1'])
print(f"PR ×1 → ×2: mediana CAGR {d3.c0.median()*100:.1f} → {d3.c1.median()*100:.1f}% | najgorsze DD {d3.d0.min()*100:.1f} → {d3.d1.min()*100:.1f}% | mediana DD {d3.d0.median()*100:.1f} → {d3.d1.median()*100:.1f}% | Sharpe lepszy {(d3.s1 > d3.s0).sum()}/{len(d3)} | DD gorsze {(d3.d1 < d3.d0 - 1e-9).sum()}/{len(d3)}")
