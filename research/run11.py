import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
from data2 import load
from engine import backtest, metrics
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
import strategies as S
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
P, C, Q = load(); df = btc_full()
df = pd.concat([df, pd.DataFrame({'price': P['btc'].loc[df.index[-1] + pd.Timedelta(days=1):], 'mvrv': np.nan})])
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, Q.rolling(30).mean(), risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
out = {}
for buf, sticky in [(0, False), (2, False), (0, True), (2, True)]:
    W = S.rsps(ctx, lookback=(30, 60, 90), top=3, conf=0.7, cap=0.5, every=1, buffer=buf, sticky=sticky)
    for c in [0.0015, 0.003, 0.005]:
        r, t, h = backtest(W, P, cost=c)
        a, b, f = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h), metrics(r, START, None, t, h)
        print(f"buffer {buf} sticky {sticky!s:5s} cost {c*100:.2f}%: IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS CAGR {b['CAGR']*100:5.1f} Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} | FULL Sh {f['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | TO {a['Turnover/yr']:.0f}")
        out[(buf, sticky, c)] = r.loc[START:]
pickle.dump(out, open(SP + 'bn_buf.pkl', 'wb'))
