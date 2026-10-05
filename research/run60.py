"""Honest one-at-a-time sensitivity of the 2.26 setup (pool top 10, 14/28/56, coherent LTPI, VAMS BTC, gold hierarchy,
SDCA ×2 below range, tilt by coherent LTPI $TOTAL). Pre-registered rule: adopt a change only if on 2020–23 the portfolio
Sharpe rises ≥ 0.03, CAGR does not fall and max drawdown is not worse by > 2 pp. 2024→ is printed but not used."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r58 = open('run58.py').read(); exec(_r58[:_r58.index("for k in (3, 4, 5):")])
from engine import top_n_universe
LB = (14, 28, 56)
for n in (8, 12):
    if n not in ELIG: ELIG[n] = top_n_universe(Q30, P, n)
def rs(universe=10, top=3, cap=0.5, every=1, floor=0.5, enter=0.7, exit_=0.6, wmode='sv'):
    E = ELIG[universe]; sc_, br = pre(universe)
    cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False; w = {}
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= exit_ if active else b >= enter) if np.isfinite(b) else False
        if (i - 200) % every: 
            for a, x in w.items(): W[i, col[a]] = x
            continue
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            row = E.iloc[i].copy(); row['btc'] = False
            sc = scores(i, row, LB)
            ranked = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= floor][:top]
            if ranked:
                raw = [sc[a] / VOL[a].iloc[i] for a in ranked] if wmode == 'sv' else [1.0 / VOL[a].iloc[i] for a in ranked] if wmode == 'iv' else [1.0] * len(ranked)
                cw = np.minimum(cap_weights(raw, cap), cap)
                for a, x in zip(ranked, cw): w[a] = x
        rest = 1 - sum(w.values())
        gstrong = np.isfinite(g_.iloc[i]) and gtr.iloc[i] >= 0.5 and bool(ratio_mom.iloc[i])
        bsize = 1.0 if bt >= 0.75 else 0.5 if bt >= 0.5 else 0.0
        if rest > 1e-9:
            if gstrong: w['paxg'] = rest
            elif lt and bsize > 0: w['btc'] = rest * bsize
        for a, x in w.items(): W[i, col[a]] = x
    r, _, _ = backtest(pd.DataFrame(W, index=idx, columns=cols), P2)
    return r
def ev(r, sd=None, tilt=None):
    global SDR, SDW, r_rs
    SDR, SDW = sd if sd is not None else SDf; r_rs = r; pt = sim(tilt if tilt is not None else tilt1)
    return metrics(pt, START, IS_END), metrics(pt, OOS), metrics(pt, START)
base = ev(rs())
def line(name, res):
    i_, o, f = res; bi = base[0]
    ok = (i_['Sharpe'] - bi['Sharpe'] >= 0.03) and (i_['CAGR'] >= bi['CAGR']) and (i_['MaxDD'] >= bi['MaxDD'] - 0.02)
    print(f"{name:40s} IS Sh {i_['Sharpe']:.2f} CAGR {i_['CAGR']*100:5.1f} DD {i_['MaxDD']*100:5.1f} | {'PRZYJĘTE' if ok else 'odrzucone':10s} | 2024→ Sh {o['Sharpe']:.2f} CAGR {o['CAGR']*100:5.1f} | całość CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f}", flush=True)
line('BAZA 2.26', base)
for nm, kw in (('rotacja co 3 dni', dict(every=3)), ('rotacja co 7 dni', dict(every=7)), ('top 2', dict(top=2)), ('top 4', dict(top=4)),
               ('limit 34%', dict(cap=0.34)), ('limit 70%', dict(cap=0.7)), ('uniwersum 8', dict(universe=8)), ('uniwersum 12', dict(universe=12)),
               ('trend tokena ≥ 0,75', dict(floor=0.75)), ('wagi = 1/zmienność', dict(wmode='iv')), ('wagi równe', dict(wmode='eq')),
               ('bramka 65/55', dict(enter=0.65, exit_=0.55)), ('bramka 75/65', dict(enter=0.75, exit_=0.65))):
    line(nm, ev(rs(**kw)))
r0 = rs()
for nm, t in (('podział stały 60/40', pd.Series(0.6, idx)), ('podział stały 50/50', pd.Series(0.5, idx)), ('przechył 50/50 → 30/70', pd.Series(np.where(ltt1 > 0, 0.3, 0.5), idx))):
    line(nm, ev(r0, tilt=t))
