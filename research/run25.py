"""RSPS ideas from the masterclass notes (tiered RSPS, Omega ranking, TPI rate of change) + SUPT split."""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run14.py').read().split("sleeves = {}")[0])
_s = open('run14.py').read(); exec('def simulate' + _s.split('def simulate')[1].split("rs, rexp = sleeves['trend']")[0])
import tpi as T
from engine import weekly_dates, hold_between, cap_weights
from strategies import rs_scores, breadth
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
LR = {a: np.log(P[a] / P['btc']).diff() for a in P.columns if a != 'btc'}
def omega_scores(d, lbs=(30, 60, 90)):
    i = ctx.idx.get_loc(d); out = {}
    for a, r in LR.items():
        if not ctx.elig.loc[d, a]: continue
        vals = []
        for L in lbs:
            seg = r.iloc[i - L + 1:i + 1]
            if i < L or seg.isna().any(): break
            g, l = seg[seg > 0].sum(), -seg[seg < 0].sum()
            vals.append(np.log(g / l) if g > 0 and l > 0 else 0.0)
        if len(vals) == len(lbs): out[a] = float(np.mean(vals))
    return out
MAJ = ['eth', 'sol']
def major_pick(d):
    """Tier 2: strongest major vs BTC (VAMS ensemble), only if in its own uptrend; else BTC."""
    i = ctx.idx.get_loc(d); best, bs = 'btc', 0.0
    for a in MAJ:
        vals = []
        for L in (30, 60, 90):
            if i < L + 1: break
            rr = (P[a] / P['btc']).iloc[i - L:i + 1]
            v = ctx.vol[a].iloc[i]
            if rr.isna().any() or not np.isfinite(v): break
            vals.append(np.log(rr.iloc[-1] / rr.iloc[0]) / v)
        if len(vals) == 3 and np.mean(vals) > bs and ctx.trend[a].get(d, 0) >= 0.5:
            best, bs = a, float(np.mean(vals))
    return best
mt, _ = T.tpi(df['price'], T.MTPI); mt = mt.reindex(P.index)
MT_FALL = ((mt > 0) & (mt.diff(5) < 0)).astype(float)
def rsps2(score='vams', park='cash', roc=False, lookback=(30, 60, 90), top=3, cap=0.5, conf=0.7, exit_conf=0.6):
    reb = {}; active = False
    for d in ctx.idx:
        bt = ctx.trend['btc'].get(d, np.nan)
        if not np.isfinite(bt): continue
        sc = rs_scores(ctx, d, lookback) if score == 'vams' else omega_scores(d, lookback)
        br = breadth(ctx, d)
        active = np.isfinite(br) and (br >= exit_conf if active else br >= conf)
        lt_ok = ctx.ltpi.get(d, 1) > 0
        w = {}
        if sc and active and bt >= 0.5 and lt_ok:
            ranked = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and ctx.trend[a].get(d, 0) >= 0.5]
            picks = ranked[:top]
            if picks:
                raw = [max(sc[a], 1e-6) / ctx.vol[a][d] for a in picks]
                cw = np.minimum(cap_weights(raw, cap), cap)
                for a, x in zip(picks, cw): w[a] = float(x)
        rest = 1 - sum(w.values())
        if rest > 1e-9 and park != 'cash' and lt_ok:
            bw = bt * (0.5 if roc and MT_FALL.get(d, 0) > 0 else 1.0)
            tgt = major_pick(d) if park == 'majors' else 'btc'
            w[tgt] = w.get(tgt, 0) + rest * bw
        reb[d] = w
    return hold_between(reb, ctx.idx, ctx.P.columns)
def run(name, W, store):
    r, t, h = backtest(W, P)
    a, b, f = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h), metrics(r, START, None, t, h)
    print(f"{name:46s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} CAGR {b['CAGR']*100:5.1f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} | obrót {f['Turnover/yr']:4.1f}x")
    store[name] = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
SL = {}
print('=== RSPS sleeve (daily review)')
run('RSPS obecny, parking stable', rsps2(), SL)
run('RSPS obecny, parking BTC×trend', rsps2(park='btc'), SL)
run('D warstwowy: parking najsilniejszy major ×trend', rsps2(park='majors'), SL)
run('E ranking Omega, parking stable', rsps2(score='omega'), SL)
run('E ranking Omega, parking BTC×trend', rsps2(score='omega', park='btc'), SL)
run('F BTC×trend, ½ gdy MTPI>0 i spada', rsps2(park='btc', roc=True), SL)
run('D+F warstwowy + tempo MTPI', rsps2(park='majors', roc=True), SL)
pickle.dump(SL, open(SP + 'rsps25.pkl', 'wb'))
# ---- G: SUPT split (Omega-optimal on 2020-2023), with SDCA 1.8.0
s23 = pickle.load(open(SP + 'sdca23.pkl', 'rb'))
sr, sw = s23['OUT']['Bezpiecznik R≥70 maks 0% + odkup przy LTPI>0']
def omega(r, thr=0.0):
    x = r - thr; return x[x > 0].sum() / -x[x < 0].sum()
print('=== G: podział SDCA/RSPS (band ±10pp), SDCA z bezpiecznikiem')
for key in ['RSPS obecny, parking stable', 'RSPS obecny, parking BTC×trend', 'D warstwowy: parking najsilniejszy major ×trend']:
    best = None
    for w in np.arange(0.3, 0.95, 0.1):
        rr, e = simulate(*SL[key], sr, sw.reindex(P.index).fillna(0), w_sdca=w, rule='band', band=0.10)
        om = omega(rr.loc[START:IS_END])
        if best is None or om > best[0]: best = (om, w)
        if abs(w - 0.6) < 1e-9 or abs(w - 0.9) < 1e-9: line(f'{key[:28]} | SDCA {w:.0%}', rr, e)
    rr, e = simulate(*SL[key], sr, sw.reindex(P.index).fillna(0), w_sdca=best[1], rule='band', band=0.10)
    line(f'{key[:28]} | Omega-opt IS: SDCA {best[1]:.0%}', rr, e)
