"""Robustness of the time-coherent LTPI (run55 L1): which fast components matter, years without 2021, double cost,
and the same coherent spec on $TOTAL (tilt). 2.24.0 setup."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r55 = open('run55.py').read(); exec(_r55[:_r55.index("for nm, spec in (('L0")])
FAST = ('Supertrend (50, 4)', 'RSI 100 > 50', 'Cena > SMA 200')
def spec_wo(*drop): return {k: f for k, f in L.items() if k not in drop}
def full(lt, name, tilt_series=None, cost=0.0015):
    global LT, LT_T, SDR, SDW, r_rs, backtest
    LT = lt.reindex(price.index).ffill().fillna(0) if lt is not None else LT0
    LT_T = lt.reindex(idx).ffill().fillna(0) if lt is not None else LT_T0
    _b = backtest; backtest = lambda W, P, cost=cost, **k: _b(W, P, cost=cost)
    sd = sdca4(); r, _ = rsps_t(mode='tier', core_first=True)
    backtest = _b
    SDR, SDW = sd; r_rs = r; pt = sim(tilt_series if tilt_series is not None else tiltL)
    x = pt.loc[START:]; xe = x[x.index.year != 2021]
    m, o, i_ = metrics(pt, START), metrics(pt, OOS), metrics(pt, START, IS_END)
    print(f"{name:40s} CAGR {m['CAGR']*100:5.1f} DD {m['MaxDD']*100:5.1f} IS {i_['Sharpe']:.2f} OOS {o['Sharpe']:.2f} | bez 2021 {((1+xe).prod()**(365/len(xe))-1)*100:5.1f} | 2024→ CAGR {o['CAGR']*100:5.1f}", flush=True)
    LT, LT_T = LT0, LT_T0
for nm, drop in (('L0 obecne', ()), ('bez Supertrend 50/4', FAST[:1]), ('bez RSI 100', FAST[1:2]), ('bez SMA 200', FAST[2:]),
                 ('bez Supertrend + RSI', FAST[:2]), ('L1 bez wszystkich trzech', FAST)):
    full(None if not drop else state0(btcp, spec_wo(*drop))[0], nm)
print('koszt 0,3%:')
full(None, 'L0 koszt 0,3%', cost=0.003); full(state0(btcp, spec_wo(*FAST))[0], 'L1 koszt 0,3%', cost=0.003)
from total import total_index
TOTp = total_index().reindex(df.index).ffill()
ltt1 = state0(TOTp, spec_wo(*FAST))[0].reindex(idx).ffill().fillna(0)
full(state0(btcp, spec_wo(*FAST))[0], 'L1 + przechył wg LTPI $TOTAL L1', tilt_series=pd.Series(np.where(ltt1 > 0, 0.4, 0.6), idx))
