import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
from data2 import load
from engine import backtest, metrics, ADF_5PCT
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
import strategies as S
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
G = pickle.load(open(SP + 'bn_grid.pkl', 'rb'))
P, C, Q = load(); df = btc_full()
df = pd.concat([df, pd.DataFrame({'price': P['btc'].loc[df.index[-1] + pd.Timedelta(days=1):], 'mvrv': np.nan})])
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, Q.rolling(30).mean(), risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
def show(n, r, t=None, h=None):
    a, b, f = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h), metrics(r, START, None, t, h)
    print(f"{n:40s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS CAGR {b['CAGR']*100:5.1f} Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} Cal {f['Calmar']:.2f}" + (f" TO {a.get('Turnover/yr', 0):.0f}" if t is not None else ''))
    return r.loc[START:]
res = {}
for conf in [0.6, 0.7, 0.8]:
    for every in [1, 7]:
        W = S.rsps(ctx, lookback=(30, 60, 90), top=3, conf=conf, cap=0.5, every=every)
        r, t, h = backtest(W, P); res[(conf, every)] = show(f'ensemble 30/60/90 conf {conf} every {every}', r.loc[START:], t, h)
W = S.rsps(ctx, lookback=(30, 60, 90), top=3, conf=0.7, cap=0.5, every=1)
for c in [0.003, 0.005]:
    r, t, h = backtest(W, P, cost=c); show(f'  daily ens 0.7 cost {c*100:.1f}%', r.loc[START:], t, h)
pickle.dump(res, open(SP + 'bn_ens.pkl', 'wb'))
