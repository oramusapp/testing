"""Stepwise combination of the SDCA changes that passed run61 (each step must add ≥ 0.03 IS Sharpe, same rule).
Also SDCA alone (its own drawdown) for transparency."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r61 = open('run61.py').read(); exec(_r61[:_r61.index("chk = sdcaX()")])
r0 = rs()
def both(name, kw, ref):
    sd = sdcaX(**kw); res = ev(r0, sd=sd); m, mi, mo = metrics(sd[0], START), metrics(sd[0], START, IS_END), metrics(sd[0], OOS)
    i_, o, f = res
    ok = ref is None or ((i_['Sharpe'] - ref[0]['Sharpe'] >= 0.03) and (i_['CAGR'] >= ref[0]['CAGR']) and (i_['MaxDD'] >= ref[0]['MaxDD'] - 0.02))
    print(f"{name:36s} PORTFEL IS Sh {i_['Sharpe']:.2f} CAGR {i_['CAGR']*100:5.1f} DD {i_['MaxDD']*100:5.1f} | {'krok OK' if ok else 'krok odrzucony':14s} | 2024→ Sh {o['Sharpe']:.2f} CAGR {o['CAGR']*100:5.1f} | całość {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} || SDCA sam: CAGR {m['CAGR']*100:5.1f} DD {m['MaxDD']*100:5.1f} IS {mi['Sharpe']:.2f} OOS {mo['Sharpe']:.2f}", flush=True)
    return res
b = both('BAZA 2.26 (×0,25, kupno ×1, PR ×2)', {}, None)
s1 = both('LTPI− × 0,5', dict(slow=0.5), b)
s2 = both('LTPI− × 0,5 + kupno × 1,5', dict(slow=0.5, buy=1.5), s1)
s3 = both('LTPI− × 0,5 + PR × 3', dict(slow=0.5, prm=3.0), s1)
s4 = both('wszystkie trzy', dict(slow=0.5, buy=1.5, prm=3.0), s1)
