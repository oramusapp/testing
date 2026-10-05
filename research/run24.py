"""Ideas from the TRW Crypto Investing Masterclass notes (user-supplied), tested with the same protocol.
SDCA (valuation = mean reversion, keep core):
  A  accumulation pace: deep-value buy rate 10%/d (current) vs slower paces (Adam: ~114-145 DCA-able days → ~0.7-0.9%/d)
  B  LSI: remaining stablecoins deployed when LTPI turns positive after high value (risk < 50)
  C  distribution 90/10: valuation sells only 90% of BTC; the last 10% is sold only on LTPI < 0
RSPS (trend + ratios, tiered):
  D  tiered parking: gate closed → strongest major (BTC/ETH/SOL by ratio strength, own trend up) × trend, not only BTC
  E  ranking by Omega ratio of the BTC-ratio returns instead of VAMS
  F  TPI rate of change: BTC trend weight halved when the 10-signal MTPI is > 0 but falling over 5 days
Portfolio:
  G  SUPT: Omega-optimal SDCA/RSPS split fitted 2020-2023, applied 2024→"""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run23.py').read().split("OUT = {}; rk")[0])
_s = open('run14.py').read(); exec('def simulate' + _s.split('def simulate')[1].split("rs, rexp = sleeves['trend']")[0])
from engine import weekly_dates, hold_between, cap_weights
rk = risk.reindex(P.index)
SCALE_CURVE = lambda k: np.where(DEFAULT_CURVE > 0, DEFAULT_CURVE * k, DEFAULT_CURVE)
def sdca3(risk_s, buy_k=1.0, lsi=False, hold10=False, safety=True, cost=0.0015, start=START):
    curve = SCALE_CURVE(buy_k)
    p = price.loc[start:]; r = risk_s.reindex(p.index).shift(1); l = LT.reindex(p.index).shift(1)
    cash, btc, eq, wb, owed, prev_l, lsi_left, minr = 1.0, 0.0, [], [], 0.0, 0.0, 0, 100.0
    for d in p.index:
        px = p[d]; rkd = r[d]; ls = l[d] if np.isfinite(l[d]) else 0.0
        if np.isfinite(rkd): minr = min(minr, rkd)
        rate = curve_rate(curve, rkd) if np.isfinite(rkd) else 0.0
        if lsi and ls > 0 and prev_l <= 0 and minr < 25 and np.isfinite(rkd) and rkd < 50: lsi_left = 5
        if lsi_left > 0 and cash > 0: rate = max(rate, 1.0 / lsi_left); lsi_left -= 1
        if rate > 0 and cash > 0:
            amt = cash * min(rate, 1); cash -= amt; btc += amt * (1 - cost) / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0:
            tot = cash + btc * px
            floor = 0.10 * tot / px if (hold10 and ls > 0) else 0.0      # keep 10% trend-managed while LTPI > 0
            q = max(0.0, min(btc * -rate, btc - floor)); btc -= q; cash += q * px * (1 - cost)
        if safety and ls < 0 and np.isfinite(rkd) and rkd >= 70:
            q = btc * 0.02; btc -= q; v = q * px * (1 - cost); cash += v; owed += v
        elif safety and ls > 0 and owed > 0 and cash > 0:
            amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * (1 - cost) / px; owed -= amt
        if hold10 and ls < 0 and np.isfinite(rkd) and rkd >= 70 and not safety:
            q = btc * 0.02; btc -= q; cash += q * px * (1 - cost)
        if rkd is not None and np.isfinite(rkd) and rkd > 60: minr = 100.0     # reset after leaving value
        prev_l = ls
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wb, index=p.index)
OUT = {}
def go(n, **k):
    OUT[n] = sdca3(rk, **k); show(n, *OUT[n])
print('=== SDCA (bezpiecznik LTPI włączony we wszystkich, jak w 1.8.0)')
go('SDCA 1.8.0 (zakupy do 10%/d)')
for k in (0.5, 0.2, 0.1):
    go(f'A tempo zakupów ×{k} ({10*k:g}%/d w głębokiej wartości)', buy_k=k)
for k in (1.0, 0.2, 0.1):
    go(f'B LSI po zwrocie LTPI, tempo ×{k}', buy_k=k, lsi=True)
go('C dystrybucja 90/10 (10% sprzedaje tylko LTPI)', hold10=True)
go('B+C tempo ×0,2 + LSI + 90/10', buy_k=0.2, lsi=True, hold10=True)
pickle.dump(OUT, open(SP + 'sdca24.pkl', 'wb'))
