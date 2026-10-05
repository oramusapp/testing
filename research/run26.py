"""Masterclass slide: TPI + market regime decision matrix (BTC).
  Long + leverage (max 2x) = LTPI > 0 and MTPI > 0 and regime trending
  Long spot               = MTPI > 0 and regime mean-reverting (or LTPI ≤ 0)
  Cash                    = MTPI < 0 (any regime)  — never fade MTPI in a mean-reverting regime
Regime proxy: rolling ADF (90d, log price): unit root not rejected (stat > −2.86) = trending; rejected = mean reverting.
Also Hurst-like variance ratio as an alternative regime proxy."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
exec(open('run17.py').read().split("print('=== BTC timing")[0])
from engine import rolling_adf, ADF_5PCT
def hyst(sig, h=0.2):
    out, st = [], 0.0
    for v in sig.fillna(0).values:
        if st <= 0 and v > h: st = 1.0
        elif st >= 0 and v < -h: st = -1.0
        out.append(st)
    return pd.Series(out, index=sig.index)
LT = hyst(lt)
adf = ctx.adf
trending = adf > ADF_5PCT
lr = np.log(P['btc']).diff()
vr = (lr.rolling(10).sum().rolling(90).var() / (10 * lr.rolling(90).var()))   # variance ratio > 1 → trending
trending_vr = vr > 1.0
def bt(name, w):
    W = S.W_single(ctx, 'btc', w.fillna(0)); r, t, h = backtest(W, P)
    a, b, f = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h), metrics(r, START, None, t, h)
    print(f"{name:52s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} CAGR {b['CAGR']*100:5.1f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} | śr. ekspozycja {f['AvgGross']:.2f}")
print('=== BTC only, costs 0.15%/side, leverage financing 10%/yr')
bt('BTC kup i trzymaj', pd.Series(1.0, index=P.index))
for mname, M in [('MTPI 10 wsk. (histereza)', hyst(mt)), ('MTPI = 4 średnie > 0,5', (ctx.trend['btc'] >= 0.5).astype(float) * 2 - 1)]:
    long = (M > 0).astype(float)
    bt(f'{mname}: long gdy MTPI > 0 (spot)', long)
    for rn, R in [('ADF', trending), ('VR', trending_vr)]:
        lev = long * np.where((LT > 0) & R, 2.0, 1.0)
        bt(f'{mname}: macierz, dźwignia 2× ({rn})', pd.Series(lev, index=P.index))
        bt(f'{mname}: macierz 1,5× ({rn})', pd.Series(long * np.where((LT > 0) & R, 1.5, 1.0), index=P.index))
    bt(f'{mname}: long tylko gdy LTPI > 0 i MTPI > 0', ((M > 0) & (LT > 0)).astype(float))
    bt(f'{mname}: BŁĄD z slajdu: long przy MTPI<0 w MR', pd.Series(np.where(M > 0, 1.0, np.where(~trending, 1.0, 0.0)), index=P.index))
print('regime trending share 2020→ ADF', round(trending.loc[START:].mean()*100), '% VR', round(trending_vr.loc[START:].mean()*100), '%')
