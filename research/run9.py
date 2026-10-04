"""Re-run on Binance data (35 non-meme assets incl. SOL/AVAX/NEAR…), liquidity-ranked top 10,
daily vs weekly review. IS 2020-2023, OOS 2024-01-01 … 2026-10-03."""
import numpy as np, pandas as pd, warnings, itertools, pickle, time
warnings.filterwarnings('ignore')
from data2 import load
from engine import backtest, metrics
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding, sdca_equity
import strategies as S
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
P, C, Q = load()
df = btc_full()
ext = P['btc'].loc[df.index[-1] + pd.Timedelta(days=1):]
df = pd.concat([df, pd.DataFrame({'price': ext, 'mvrv': np.nan})])          # extend BTC with Binance closes
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
LIQ = Q.rolling(30).mean()
ctx = S.Ctx(P, LIQ, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
rows, rets = [], {}
t0 = time.time()
for every, lb, conf in itertools.product([7, 1], [30, 60, 90], [0.5, 0.6, 0.7, 0.8]):
    W = S.rsps(ctx, lookback=lb, top=3, conf=conf, cap=0.5, every=every)
    r, t, h = backtest(W, P)
    a, b = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h)
    rows.append(dict(every=every, lb=lb, conf=conf, IS_CAGR=a['CAGR'], IS_Sh=a['Sharpe'], IS_DD=a['MaxDD'], OOS_CAGR=b['CAGR'], OOS_Sh=b['Sharpe'], OOS_DD=b['MaxDD'], TO=a['Turnover/yr']))
    rets[(every, lb, conf)] = r.loc[START:]
T = pd.DataFrame(rows)
pd.set_option('display.width', 250); pd.set_option('display.float_format', lambda x: f'{x:.2f}')
print(T.to_string(index=False)); print('secs', int(time.time() - t0))
print('\nby conf'); print(T.groupby('conf')[['IS_Sh', 'OOS_Sh', 'IS_DD', 'OOS_DD']].mean())
print('\nby every'); print(T.groupby('every')[['IS_Sh', 'OOS_Sh', 'TO']].mean())
print('\nby lb'); print(T.groupby('lb')[['IS_Sh', 'OOS_Sh']].mean())
btc_r = backtest(S.buy_hold_btc(ctx), P)[0].loc[START:]
sd_r, _ = sdca_equity(df['price'].reindex(P.index).ffill(), risk.reindex(P.index), start=START)
for n, r in [('BTC', btc_r), ('SDCA', sd_r)]:
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    print(f"{n}: IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:.1f} | OOS CAGR {b['CAGR']*100:.1f} Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:.1f} | FULL CAGR {f['CAGR']*100:.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:.1f}")
pickle.dump(dict(T=T, rets=rets, btc_r=btc_r, sd_r=sd_r), open(SP + 'bn_grid.pkl', 'wb'))
