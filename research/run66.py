"""User question: does SDCA only lower the return and raise max drawdown vs RSPS alone? 2.33 setup (LTPI persistence 5 d).
Splits SDCA/RSPS: 100/0 … 0/100 (fixed) and the live tilt; full / 2020–23 / 2024→, plus 2022 start and quarterly starts."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r65 = open('run65.py').read(); exec(_r65[:_r65.index("SDf = sdcaX()") + len("SDf = sdcaX()")])
r0 = rs(); sd = SDf
def m(r, a, b=None):
    x = r.loc[a:b] if b else r.loc[a:]
    e = (1 + x).cumprod(); y = len(x) / 365
    return e.iloc[-1] ** (1 / y) - 1, (e / e.cummax() - 1).min(), x.mean() / x.std() * np.sqrt(365)
def port(t):
    global SDR, SDW, r_rs
    SDR, SDW = sd; r_rs = r0; return sim(t)
rows = {'SDCA sam': sd[0].loc[START:], 'RSPS sam': r0.loc[START:]}
for w in (0.6, 0.4, 0.2): rows[f'stały {int(w*100)}/{int(100-w*100)}'] = port(pd.Series(w, idx))
rows['obecny przechył 60/40→40/60'] = port(tilt1)
rows['przechył 40/60→20/80'] = port(pd.Series(np.where(ltt5 > 0, 0.2, 0.4), idx))
btc = P['btc'].pct_change().fillna(0); rows['BTC kup i trzymaj'] = btc.loc[START:]
print(f"{'':30s} {'2020→ CAGR':>10s} {'DD':>7s} {'Sh':>5s} | {'20–23 CAGR':>10s} {'DD':>7s} | {'2024→ CAGR':>10s} {'DD':>7s} {'Sh':>5s} | {'od 2022 CAGR':>12s} {'DD':>7s}")
for k, r in rows.items():
    f = m(r, START); i_ = m(r, START, IS_END); o = m(r, OOS); s22 = m(r, '2022-01-01')
    print(f"{k:30s} {f[0]*100:10.1f} {f[1]*100:7.1f} {f[2]:5.2f} | {i_[0]*100:10.1f} {i_[1]*100:7.1f} | {o[0]*100:10.1f} {o[1]*100:7.1f} {o[2]:5.2f} | {s22[0]*100:12.1f} {s22[1]*100:7.1f}")
print('\nRok po roku (%):')
for k in ('SDCA sam', 'RSPS sam', 'obecny przechył 60/40→40/60', 'BTC kup i trzymaj'):
    r = rows[k]; print(f"{k:30s} " + ' '.join(f"{y}:{((1 + r.loc[str(y)]).prod() - 1) * 100:6.0f}" for y in range(2020, 2027)))
# rolling 1-year windows: how often each beats / worst 1-year
print('\nOkna 365 dni (co 30 dni): najgorszy rok, mediana, % okien ze stratą')
for k in ('SDCA sam', 'RSPS sam', 'obecny przechył 60/40→40/60'):
    r = rows[k]; e = (1 + r).cumprod(); w = [(e.iloc[i + 365] / e.iloc[i] - 1) for i in range(0, len(e) - 365, 30)]
    print(f"{k:30s} najgorszy {min(w)*100:6.1f}%  mediana {np.median(w)*100:6.1f}%  strata w {np.mean(np.array(w) < 0)*100:4.0f}% okien")
