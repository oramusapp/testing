"""Start-date robustness of LTPI-scaled accumulation (run40): start every quarter 2018-2024 from 100% stablecoin,
measure CAGR to today and max drawdown, and the share of starts where the variant beats the current curve."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run40.py').read(); exec(_t[:_t.index('rk = risk.reindex')])
rk = risk.reindex(P.index)
starts = pd.date_range('2018-01-01', '2024-07-01', freq='QS')
V = {'obecna': dict(), 'x0.5': dict(mode='ltpi_mult', m=0.5), 'x0.25': dict(mode='ltpi_mult', m=0.25), 'x0.1': dict(mode='ltpi_mult', m=0.1)}
res = {k: [] for k in V}
for s in starts:
    for k, kw in V.items():
        r, w = sdca3(rk, start=str(s.date()), **kw)
        eq = (1 + r).cumprod(); yrs = len(r) / 365
        res[k].append((eq.iloc[-1] ** (1 / yrs) - 1, (eq / eq.cummax() - 1).min(), r.mean() / r.std() * np.sqrt(365)))
for k in V:
    a = np.array(res[k]); b = np.array(res['obecna'])
    print(f"{k:8s} CAGR med {np.median(a[:,0])*100:5.1f}% | DD med {np.median(a[:,1])*100:5.1f}% worst {a[:,1].min()*100:5.1f}% | Sharpe med {np.median(a[:,2]):.2f} | lepszy Sharpe niż obecna w {np.mean(a[:,2] > b[:,2])*100:3.0f}% startów, mniejsze DD w {np.mean(a[:,1] > b[:,1])*100:3.0f}%")
