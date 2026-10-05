"""Automatic TA pillar (app 2.11): mean of BTC weekly BB(20) position, daily BB(50) position (both in σ, clipped ±3)
and market structure from ±10-day pivots (HH/HL +1, LH/LL −1). Pivots are only used once confirmed (no look-ahead).
Checks: Spearman with forward 20/90-day BTC returns (IS 2014-2019 / OOS 2020→) and as a long/cash filter (z > 0)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from sdca import btc_full
from scipy.stats import spearmanr
p = btc_full()['price']; p = p[p.index >= '2012-01-01']
v = p.values; n = len(v)
bbD = ((p - p.rolling(50).mean()) / p.rolling(50).std()).clip(-3, 3)
w = p.resample('W').last(); bbW = ((w - w.rolling(20).mean()) / w.rolling(20).std()).clip(-3, 3).reindex(p.index, method='ffill')
L = 10; st = np.zeros(n); highs, lows = [], []
for i in range(n):
    k = i - L                                   # pivot at k is confirmed at i = k + L
    if k >= L:
        seg = v[k - L:k + L + 1]
        if v[k] == seg.max(): highs.append(v[k])
        if v[k] == seg.min(): lows.append(v[k])
    if len(highs) >= 2 and len(lows) >= 2:
        hh, hl = highs[-1] > highs[-2], lows[-1] > lows[-2]
        st[i] = 1 if hh and hl else -1 if (not hh and not hl) else 0
ta = pd.concat([bbW, bbD, pd.Series(st, p.index)], axis=1).mean(axis=1)
r = np.log(p).diff()
for h in (20, 90):
    f = np.log(p.shift(-h) / p)
    for a, b in (('2014', '2019'), ('2020', '2026')):
        m = pd.concat([ta.loc[a:b], f.loc[a:b]], axis=1).dropna()
        print(f'Spearman TA vs zwrot {h}d {a}-{b}: {spearmanr(m.iloc[:,0], m.iloc[:,1])[0]:.3f}')
def sh(x): return x.mean() / x.std() * np.sqrt(365)
pos = (ta > 0).astype(float).shift(2).fillna(0); cost = pos.diff().abs() * 0.0015
for a, b in (('2014', '2019'), ('2020', '2026')):
    s = (pos * r - cost).loc[a:b]; bh = r.loc[a:b]
    print(f'Filtr TA>0 {a}-{b}: Sharpe {sh(s):.2f} vs B&H {sh(bh):.2f}, ekspozycja {pos.loc[a:b].mean()*100:.0f}%')
tr = sum((p > p.rolling(L2).mean()).astype(float) for L2 in (20, 50, 100, 200)) / 4
pos2 = (tr >= 0.5).astype(float).shift(2).fillna(0)
for a, b in (('2014', '2019'), ('2020', '2026')):
    s = (pos2 * r - pos2.diff().abs() * 0.0015).loc[a:b]
    print(f'Dla porównania 4 średnie ≥0,5 {a}-{b}: Sharpe {sh(s):.2f}')
