"""Honest re-selection of the relative-strength lookbacks on the final setup (one pool top 10, coherent LTPI): chosen on
2020–23 only; 2024→ reported. Also checks the other 2.22–2.25 choices on IS only."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r58 = open('run58.py').read(); exec(_r58[:_r58.index("for k in (3, 4, 5):")])
_LB = LB
for lb in ((30, 60, 90), (21, 42, 63), (20, 40, 60), (14, 30, 60), (14, 28, 56), (10, 20, 40), (7, 21, 42), (7, 14, 30), (30,)):
    LB = lb; rep(f'okna {lb}', run_v(FIX, tiers=False))
