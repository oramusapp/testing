import numpy as np, pandas as pd, warnings, itertools, pickle
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
import strategies as S
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
rows, rets = [], {}
for lb, top, conf, cap in itertools.product([14, 30, 60, 90], [2, 3, 5], [0.4, 0.5, 0.6, 0.7], [0.35, 0.5]):
    W = S.rsps(ctx, lookback=lb, top=top, conf=conf, cap=cap)
    r, t, h = backtest(W, P)
    a, b = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h)
    rows.append(dict(lb=lb, top=top, conf=conf, cap=cap, IS_CAGR=a['CAGR'], IS_Sh=a['Sharpe'], IS_DD=a['MaxDD'], IS_Cal=a['Calmar'],
                     OOS_CAGR=b['CAGR'], OOS_Sh=b['Sharpe'], OOS_DD=b['MaxDD'], OOS_Cal=b['Calmar'], TO=a['Turnover/yr']))
    rets[(lb, top, conf, cap)] = r.loc[START:]
T = pd.DataFrame(rows)
pd.set_option('display.width', 250); pd.set_option('display.float_format', lambda x: f'{x:.2f}')
print(T.sort_values('IS_Sh', ascending=False).head(15).to_string(index=False))
print('\nmean by lookback'); print(T.groupby('lb')[['IS_Sh','OOS_Sh','IS_DD','OOS_DD']].mean())
print('\nmean by conf'); print(T.groupby('conf')[['IS_Sh','OOS_Sh','IS_DD','OOS_DD']].mean())
print('\nmean by top'); print(T.groupby('top')[['IS_Sh','OOS_Sh','IS_DD','OOS_DD']].mean())
print('\nmean by cap'); print(T.groupby('cap')[['IS_Sh','OOS_Sh']].mean())
print('\nIS rank vs OOS rank spearman', T['IS_Sh'].rank().corr(T['OOS_Sh'].rank()))
T.to_pickle('/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/rsps_grid.pkl')
pickle.dump(rets, open('/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/rsps_rets.pkl', 'wb'))
