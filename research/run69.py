"""More RSPS ideas on 2.33 (pre-registered rule as run60).
N1 rotation every 2 days. N2 lookback ensemble 7/14/21/28/42/56 (robustness, not tuned). N3 pick also needs its ratio to BTC
above its 50-day mean (relative trend confirmation). N4 breadth = share of top-10 coins with positive relative-strength score
(instead of ratio > 50-day mean)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r66 = open('run66.py').read(); exec(_r66[:_r66.index("rows = {")])
src60 = open('run60.py').read(); rsrc = src60[src60.index('def rs('):src60.index('def ev(')]
base = ev(r0); line('BAZA 2.33', base)
line('N1 rotacja co 2 dni', ev(rs(every=2)))
_LB = LB; LB = (7, 14, 21, 28, 42, 56); line('N2 zespół okien 7–56', ev(rs())); LB = _LB
LOGR = np.log(P.div(P['btc'], axis=0)); M50 = LOGR.rolling(50).mean().shift(1)
exec(rsrc.replace('def rs(', 'def rs3(').replace("if s > 0 and TR[a].iloc[i] >= floor]", "if s > 0 and TR[a].iloc[i] >= floor and LOGR[a].iloc[i] > M50[a].iloc[i]]"))
line('N3 + ratio nad średnią 50 d', ev(rs3()))
code = rsrc.replace('def rs(', 'def rs4(').replace("E = ELIG[universe]; sc_, br = pre(universe)", "E = ELIG[universe]; sc_, br0 = pre(universe); br = {}").replace(
  "b = br[i];", "row0 = E.iloc[i].copy(); row0['btc'] = False; s0 = scores(i, row0, LB); b = (np.mean([v > 0 for v in s0.values()]) if s0 else np.nan);")
exec(code)
line('N4 szerokość = odsetek z dodatnią siłą', ev(rs4()))
