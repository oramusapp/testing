"""Masterclass slides on discretionary TA, tested systematically on BTCUSDT daily (Binance OHLC, 2018→):
 1) candlestick patterns (engulfing, hammer, shooting star, doji, three white soldiers / black crows): forward returns vs all days
 2) market structure from swing highs/lows (higher highs + higher lows = up) as a long filter, vs the 4-average trend."""
import json, time, urllib.request, numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
rows, t = [], int(pd.Timestamp('2017-09-01').timestamp() * 1000)
while True:
    j = json.load(urllib.request.urlopen(f'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&startTime={t}', timeout=30))
    if not j: break
    rows += [(pd.to_datetime(k[0], unit='ms'), *map(float, k[1:5])) for k in j]
    if len(j) < 1000: break
    t = j[-1][0] + 86400000; time.sleep(0.2)
d = pd.DataFrame(rows, columns=['t', 'o', 'h', 'l', 'c']).set_index('t'); d = d[d.index + pd.Timedelta(days=1) <= pd.Timestamp.utcnow().tz_localize(None)]
o, h, l, c = d.o, d.h, d.l, d.c
body = (c - o).abs(); rng = (h - l).replace(0, np.nan); up = c > o; dn = c < o
lower = np.minimum(o, c) - l; upper = h - np.maximum(o, c)
prev_down = c.shift(1) < c.shift(5)   # short-term context: falling into the candle
prev_up = c.shift(1) > c.shift(5)
pat = {
 'Objęcie hossy (bullish engulfing)': up & dn.shift(1) & (c > o.shift(1)) & (o < c.shift(1)),
 'Objęcie bessy (bearish engulfing)': dn & up.shift(1) & (c < o.shift(1)) & (o > c.shift(1)),
 'Młot (hammer) po spadku': (lower > 2 * body) & (upper < body) & prev_down,
 'Spadająca gwiazda po wzroście': (upper > 2 * body) & (lower < body) & prev_up,
 'Doji': body < 0.1 * rng,
 'Trzech białych żołnierzy': up & up.shift(1) & up.shift(2) & (c > c.shift(1)) & (c.shift(1) > c.shift(2)),
 'Trzy czarne wrony': dn & dn.shift(1) & dn.shift(2) & (c < c.shift(1)) & (c.shift(1) < c.shift(2)),
}
print('=== formacje świecowe: średni zwrot po N dniach (sygnał na zamknięciu dnia t) vs wszystkie dni, t = Welch')
for H in (5, 20):
    fwd = np.log(c.shift(-H) / c); base = fwd.dropna()
    print(f'--- {H} dni | wszystkie dni: {base.mean()*100:+.2f}% (n={len(base)})')
    for k, m in pat.items():
        x = fwd[m.fillna(False)].dropna()
        tt = (x.mean() - base.mean()) / np.sqrt(x.var() / (len(x) / H) + base.var() / (len(base) / H)) if len(x) > 5 else np.nan
        print(f'  {k:36s} n={len(x):4d}  {x.mean()*100:+6.2f}%  % >0 {(x>0).mean()*100:3.0f}%  t(eff) {tt:+.2f}')
print('=== struktura rynku: swing high/low (pivot ±N dni, potwierdzony po N dniach), long gdy ostatni szczyt i dołek wyższe od poprzednich')
from engine import backtest, metrics, trend_ensemble
P = pd.DataFrame({'btc': c})
def structure(N):
    ph = (h == h.rolling(2 * N + 1, center=True).max()); pl = (l == l.rolling(2 * N + 1, center=True).min())
    st = pd.Series(np.nan, index=c.index); highs, lows = [], []
    for i in range(len(c)):
        j = i - N                                   # pivot at j is known at i (N bars later)
        if j >= 0:
            if ph.iloc[j]: highs.append(h.iloc[j])
            if pl.iloc[j]: lows.append(l.iloc[j])
        if len(highs) >= 2 and len(lows) >= 2:
            if highs[-1] > highs[-2] and lows[-1] > lows[-2]: st.iloc[i] = 1
            elif highs[-1] < highs[-2] and lows[-1] < lows[-2]: st.iloc[i] = 0
    return st.ffill().fillna(0)
def show(nm, w):
    W = pd.DataFrame({'btc': w}); r, tr, hh = backtest(W, P)
    a, b = metrics(r, '2020-01-01', '2023-12-31'), metrics(r, '2024-01-01')
    print(f'  {nm:40s} IS Sh {a["Sharpe"]:.2f} DD {a["MaxDD"]*100:5.1f} | OOS Sh {b["Sharpe"]:.2f} DD {b["MaxDD"]*100:5.1f} | w rynku {w.loc["2020":].mean()*100:3.0f}%')
show('BTC kup i trzymaj', pd.Series(1.0, index=c.index))
show('4 średnie ≥ 0,5 (obecny trend)', (trend_ensemble(c) >= 0.5).astype(float))
for N in (3, 5, 10, 20): show(f'struktura HH/HL, pivot ±{N}', structure(N))
