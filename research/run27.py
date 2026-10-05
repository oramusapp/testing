"""Masterclass slide: log price against Bitcoin supply (linear regression with σ bands) as a valuation input for SDCA.
Two variants, both fitted each year only on data before that year (no look-ahead):
  S1 OLS of ln(price) on supply over all days; risk = Φ(residual / σ_resid)
  S2 'floor' fit on monthly lows only (as on the slide: Log Low vs supply); risk = percentile of the daily residual vs history
Tested as an extra component in the SDCA composite (current = price model + MVRV) with the LTPI safety."""
import numpy as np, pandas as pd, warnings, pickle
from scipy.stats import norm
warnings.filterwarnings('ignore')
exec(open('run23.py').read().split("OUT = {}; rk")[0])
_s = open('run14.py').read(); exec('def simulate' + _s.split('def simulate')[1].split("rs, rexp = sleeves['trend']")[0])
cm = pd.read_csv('/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/cm/btc.csv', usecols=['time', 'SplyCur'], parse_dates=['time']).set_index('time')['SplyCur']
sply = cm.reindex(df.index)
last = sply.last_valid_index(); rate = (sply.loc[last] - sply.loc[last - pd.Timedelta(days=30)]) / 30
sply.loc[sply.index > last] = sply.loc[last] + rate * (sply.index[sply.index > last] - last).days   # deterministic issuance
p = df['price']; lp = np.log(p)
def expanding(kind):
    out = pd.Series(np.nan, index=df.index)
    for yr in range(2016, df.index[-1].year + 1):
        tr = (df.index < f'{yr}-01-01') & sply.notna() & (p > 0)
        if kind == 'ols':
            X, y = sply[tr].values / 1e6, lp[tr].values
        else:
            ml = lp[tr].resample('ME').min(); ms = (sply[tr] / 1e6).resample('ME').last()
            X, y = ms.values, ml.values
        b, a = np.polyfit(X, y, 1)
        res_hist = lp[tr].values - (a + b * sply[tr].values / 1e6)
        seg = (df.index >= f'{yr}-01-01') & (df.index < f'{yr+1}-01-01')
        res = lp[seg].values - (a + b * sply[seg].values / 1e6)
        if kind == 'ols':
            out[seg] = norm.cdf(res / res_hist.std()) * 100
        else:
            srt = np.sort(res_hist); out[seg] = np.searchsorted(srt, res) / len(srt) * 100
    return out
s1, s2 = expanding('ols'), expanding('floor')
pr, mv = price_risk_expanding(df), mvrv_risk_expanding(df)
print('corr with price model risk 2020→:', round(s1.loc[START:].corr(pr.loc[START:]), 2), round(s2.loc[START:].corr(pr.loc[START:]), 2))
OUT = {}
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
W = S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True); r, t, h = backtest(W, P); rs = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
for name, rk_ in [('obecna: cena + MVRV', (pr + mv) / 2), ('+ S1 podaż OLS', (pr + mv + s1) / 3), ('+ S2 podaż dołki', (pr + mv + s2) / 3),
                  ('S1 zamiast modelu ceny', (s1 + mv) / 2), ('S2 zamiast modelu ceny', (s2 + mv) / 2)]:
    sr, sw = sdca2(rk_.reindex(P.index), 70, 0.0, True)
    show(f'SDCA {name}', sr, sw)
    rr, e = simulate(*rs, sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10); line(f'  portfel 60/40 {name}', rr, e)
x = pd.DataFrame({'p': p, 's1': s1, 's2': s2, 'pr': pr}).resample('QE').last().loc['2020':]
print(x.round(1).to_string())
