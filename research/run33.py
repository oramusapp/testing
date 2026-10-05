"""Masterclass slide: MACD, RSI, Stochastic, CCI, ATR. Stochastic and CCI on BTCUSDT 1D, used two ways:
 trend-following (above midline = long) vs mean-reversion (buy oversold, sell overbought); and as extra MTPI votes."""
import json, time, urllib.request, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from engine import backtest, metrics, trend_ensemble
rows, t = [], int(pd.Timestamp('2017-09-01').timestamp() * 1000)
while True:
    j = json.load(urllib.request.urlopen(f'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime={t}', timeout=30))
    if not j: break
    rows += [(pd.to_datetime(k[0], unit='ms'), *map(float, k[1:5])) for k in j]
    if len(j) < 1000: break
    t = j[-1][0] + 86400000; time.sleep(0.2)
d = pd.DataFrame(rows, columns=['t', 'o', 'h', 'l', 'c']).set_index('t'); d = d[d.index + pd.Timedelta(days=1) <= pd.Timestamp.utcnow().tz_localize(None)]
h, l, c = d.h, d.l, d.c
P = pd.DataFrame({'btc': c})
def stoch(n=14, k=3): return (100 * (c - l.rolling(n).min()) / (h.rolling(n).max() - l.rolling(n).min())).rolling(k).mean()
def cci(n=20):
    tp = (h + l + c) / 3; ma = tp.rolling(n).mean(); md = tp.rolling(n).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
    return (tp - ma) / (0.015 * md)
def mr(x, lo, hi):            # mean reversion: enter long when oversold, exit when overbought
    st, out = 0.0, []
    for v in x.values:
        if np.isfinite(v):
            if v < lo: st = 1.0
            elif v > hi: st = 0.0
        out.append(st)
    return pd.Series(out, index=x.index)
def show(nm, w):
    r, tr, hh = backtest(pd.DataFrame({'btc': w.fillna(0)}), P)
    a, b = metrics(r, '2020-01-01', '2023-12-31', tr), metrics(r, '2024-01-01', None, tr)
    print(f'{nm:46s} IS Sh {a["Sharpe"]:.2f} DD {a["MaxDD"]*100:5.1f} | OOS Sh {b["Sharpe"]:.2f} DD {b["MaxDD"]*100:5.1f} | obrót/rok {b["Turnover/yr"]:5.1f} | w rynku {w.loc["2020":].mean()*100:3.0f}%')
show('BTC kup i trzymaj', pd.Series(1.0, index=c.index))
show('4 średnie ≥ 0,5 (obecny trend)', (trend_ensemble(c) >= 0.5).astype(float))
for n in (14, 50):
    s = stoch(n); show(f'Stochastic {n}: trend (> 50)', (s > 50).astype(float)); show(f'Stochastic {n}: powrót do średniej (<20 kup, >80 sprzedaj)', mr(s, 20, 80))
for n in (20, 50):
    x = cci(n); show(f'CCI {n}: trend (> 0)', (x > 0).astype(float)); show(f'CCI {n}: powrót do średniej (<−100 kup, >100 sprzedaj)', mr(x, -100, 100))
# as extra votes in the 10-signal MTPI (close-only components from tpi.py) → 12 votes
import tpi as T
mt, mv = T.tpi(c, T.MTPI)
votes = mv.copy(); votes['stoch'] = np.sign(stoch(14) - 50); votes['cci'] = np.sign(cci(20))
mt12 = votes.mean(axis=1)
show('MTPI 10 wskaźników > 0', (mt > 0).astype(float)); show('MTPI 12 (+ Stochastic, CCI) > 0', (mt12 > 0).astype(float))
