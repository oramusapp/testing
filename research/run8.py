"""SDCA/RSPS split sweep with annual rebalancing (recommended configuration)."""
import numpy as np, pandas as pd, pickle, warnings
warnings.filterwarnings('ignore')
from engine import metrics
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
F = pickle.load(open(SP + 'final.pkl', 'rb'))
def blend_rebal(parts):
    rets = pd.concat([r for _, r in parts], axis=1).fillna(0); w0 = np.array([a for a, _ in parts]); vals = w0.copy(); out = []
    starts = set(rets.resample('YS').first().index)
    for d, row in rets.iterrows():
        if d in starts and d != rets.index[0]: vals = w0 * vals.sum()
        prev = vals.sum(); vals = vals * (1 + row.values); out.append(vals.sum() / prev - 1)
    return pd.Series(out, index=rets.index)
print('RSPS%  | FULL CAGR  Sharpe  MaxDD  Calmar DDdays | IS Sharpe MaxDD | OOS CAGR Sharpe MaxDD')
for rs in [0, 20, 30, 40, 50, 60, 70, 80, 100]:
    r = blend_rebal([(1 - rs / 100, F['sd_r']), (rs / 100, F['rsps_r'])]).loc[:'2026-05-23']
    f, a, b = metrics(r, '2020-01-01'), metrics(r, '2020-01-01', '2023-12-31'), metrics(r, '2024-01-01')
    print(f"{rs:4d}%  | {f['CAGR']*100:6.1f}%  {f['Sharpe']:.2f}  {f['MaxDD']*100:6.1f}%  {f['Calmar']:.2f}  {f['DDdays']:4d} | {a['Sharpe']:.2f} {a['MaxDD']*100:6.1f}% | {b['CAGR']*100:5.1f}% {b['Sharpe']:.2f} {b['MaxDD']*100:6.1f}%")
