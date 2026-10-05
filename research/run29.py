"""Masterclass slide: decomposition into trend + seasonal + random. Is BTC seasonality stable enough to use?
Month-of-year and day-of-week mean log returns: 2013-2019 (design) vs 2020-2026 (test), plus a seasonal filter backtest."""
import numpy as np, pandas as pd, warnings
from scipy import stats
warnings.filterwarnings('ignore')
from sdca import btc_full
from engine import backtest, metrics
df = btc_full(); p = df['price']; r = np.log(p).diff().dropna()
r = r.loc['2013':]
A, B = r.loc[:'2019'], r.loc['2020':]
def table(g, name):
    a = A.groupby(g(A.index)).agg(['mean', 'std', 'count']); b = B.groupby(g(B.index)).agg(['mean', 'std', 'count'])
    ta = a['mean'] / (a['std'] / np.sqrt(a['count'])); tb = b['mean'] / (b['std'] / np.sqrt(b['count']))
    out = pd.DataFrame({'2013-19 %/d': a['mean'] * 100, 't': ta, '2020-26 %/d': b['mean'] * 100, 't ': tb})
    print(f'=== {name}'); print(out.round(3).to_string())
    print('korelacja średnich między okresami:', round(np.corrcoef(a['mean'], b['mean'])[0, 1], 2), '| Spearman', round(stats.spearmanr(a['mean'], b['mean'])[0], 2))
    # stability: Kruskal-Wallis test of equal distributions across groups, per period
    for nm, X in (('2013-19', A), ('2020-26', B)):
        groups = [X[g(X.index) == k].values for k in sorted(set(g(X.index)))]
        print(f'  Kruskal-Wallis {nm}: p = {stats.kruskal(*groups).pvalue:.3f}')
table(lambda i: i.month, 'miesiąc roku'); table(lambda i: i.dayofweek, 'dzień tygodnia (0 = pon.)')
# seasonal filter: from 2020, hold BTC only in months whose 2013-2019 mean was positive
good = A.groupby(A.index.month).mean() > 0
P = pd.DataFrame({'btc': p.loc['2019-12-01':]})
w = pd.Series([1.0 if good[d.month] else 0.0 for d in P.index], index=P.index)
for nm, W in (('BTC kup i trzymaj', pd.DataFrame({'btc': 1.0}, index=P.index)), ('Filtr sezonowy (miesiące dodatnie 2013-19)', pd.DataFrame({'btc': w}))):
    ret, t, h = backtest(W, P); m = metrics(ret, '2020-01-01')
    print(f'{nm:45s} CAGR {m["CAGR"]*100:5.1f}% Sharpe {m["Sharpe"]:.2f} DD {m["MaxDD"]*100:5.1f}%')
