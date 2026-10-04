import numpy as np, pandas as pd, warnings, itertools
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics, trend_ensemble, ann_vol
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding, sdca_equity_v2
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
price = df['price']
tr = trend_ensemble(price); vol = ann_vol(price)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
rows = []
for bg, sg, vr in itertools.product([None, 0.25, 0.5], [None, 0.75, 0.5], [None, 0.6]):
    r, w = sdca_equity_v2(price, risk, tr, vol, start=START, buy_gate=bg, sell_gate=sg, vol_ref=vr)
    r = r.loc[:'2026-05-23']
    a, b = metrics(r, START, IS_END), metrics(r, OOS)
    rows.append(dict(buy_gate=bg, sell_gate=sg, vol_ref=vr, IS_CAGR=a['CAGR'], IS_Sh=a['Sharpe'], IS_DD=a['MaxDD'], IS_Cal=a['Calmar'],
                     OOS_CAGR=b['CAGR'], OOS_Sh=b['Sharpe'], OOS_DD=b['MaxDD'], OOS_Cal=b['Calmar'], AvgBTC=w.mean()))
T = pd.DataFrame(rows)
pd.set_option('display.width', 250); pd.set_option('display.float_format', lambda x: f'{x:.2f}')
print(T.sort_values('IS_Cal', ascending=False).to_string(index=False))
T.to_pickle('/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/sdca_grid.pkl')
