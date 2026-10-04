import numpy as np, pandas as pd, warnings, pickle, json
warnings.filterwarnings('ignore')
from data2 import load
from engine import backtest, metrics, ADF_5PCT
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding, sdca_equity
import strategies as S
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
P, C, Q = load(); df = btc_full()
df = pd.concat([df, pd.DataFrame({'price': P['btc'].loc[df.index[-1] + pd.Timedelta(days=1):], 'mvrv': np.nan})])
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, Q.rolling(30).mean(), risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
KW = dict(lookback=(30, 60, 90), top=3, conf=0.7, cap=0.5, every=1, exit_conf=0.6)
base = S.rsps(ctx, **KW)
rs_r = backtest(base, P)[0].loc[START:]
btc_r = backtest(S.buy_hold_btc(ctx), P)[0].loc[START:]
sd_r, _ = sdca_equity(df['price'].reindex(P.index).ffill(), risk.reindex(P.index), start=START)
def blend_rebal(parts):
    rets = pd.concat([r for _, r in parts], axis=1).fillna(0); w0 = np.array([a for a, _ in parts]); vals = w0.copy(); out = []
    starts = set(rets.resample('YS').first().index)
    for d, row in rets.iterrows():
        if d in starts and d != rets.index[0]: vals = w0 * vals.sum()
        prev = vals.sum(); vals = vals * (1 + row.values); out.append(vals.sum() / prev - 1)
    return pd.Series(out, index=rets.index)
def line(n, r):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    print(f"{n:30s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS CAGR {b['CAGR']*100:5.1f} Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} Cal {f['Calmar']:.2f}")
    return dict(IS=a, OOS=b, FULL=f)
M = {}
M['btc'] = line('BTC buy&hold', btc_r); M['sdca'] = line('SDCA', sd_r); M['rsps'] = line('RSPS v2 (dzienny)', rs_r)
print('--- split (annual rebalance)')
combos = {}
for rsp in [20, 30, 40, 50, 60, 70]:
    c = blend_rebal([(1 - rsp / 100, sd_r), (rsp / 100, rs_r)]); combos[rsp] = c; M[f'c{rsp}'] = line(f'SDCA {100-rsp} / RSPS {rsp}', c)
print('--- short proposal sleeve (BTC trend ≤ 0.25), inside RSPS')
for g in [0.15, 0.3]:
    for fund in [0.0, 0.1]:
        W = S.rsps(ctx, **KW, short_k=3, short_gross=g); r = backtest(W, P, short_fund=fund)[0].loc[START:]
        line(f'RSPS + short {int(g*100)}% fund {int(fund*100)}%', r)
        line(f'  w portfelu SDCA60/RSPS40', blend_rebal([(0.6, sd_r), (0.4, r)]))
print('--- strict leverage gate on RSPS BTC fallback (1.5x)')
t = ctx.trend['btc'].fillna(0); vol = ctx.vol['btc']
g = (t == 1) & (ctx.adf > ADF_5PCT) & (ctx.ltpi > 0) & (ctx.risk < 50) & (vol < vol.rolling(365).median())
g = g & (g.rolling(10).sum() == 10)
W = base.copy(); on = g & (W['btc'] > 0.99); W['btc'] = W['btc'] * np.where(on, 1.5, 1.0)
lr = backtest(W, P, lev_cost=0.15)[0].loc[START:]
print('days levered', int(on.loc[START:].sum()))
line('SDCA60/RSPS40 + dźwignia propozycja', blend_rebal([(0.6, sd_r), (0.4, lr)]))
pickle.dump(dict(btc=btc_r, sdca=sd_r, rsps=rs_r, combos=combos, M=M), open(SP + 'bn_final.pkl', 'wb'))
