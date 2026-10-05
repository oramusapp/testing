"""Parking BTC×trend vs hybrid, with RSPS coin-exit rules (user: 'RSPS should catch exits from coins well').
RSPS veto = LTPI on BTC. Exit variants on top of the daily rotation (which already drops a coin when it leaves the top or
its own trend < 0.5): (a) faster exit — drop when price < EMA 20 or 20-day ratio momentum < 0; (b) trailing stop −15/−20/−25%
from the coin's peak since entry, 14-day cooldown; (c) hold only while own trend ≥ 0.75. Portfolio 60/40 and tilt 40/60."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r47 = open('run47.py').read(); exec(_r47[:_r47.index("r_rs, _ = run()")]); exec(_r47[_r47.index("def sim"):_r47.index("def show2")])
EMA20 = {a: P[a].ewm(span=20, adjust=False).mean() for a in P.columns}
def run2(park='hybrid', exit_='none', stop=0.2, cool=14, floor=0.5, n=10, top=3, cap=0.5):
    sc, br = pre(n); W = np.zeros((len(idx), len(P.columns))); col = {a: j for j, a in enumerate(P.columns)}; active = False
    peak, held, ban = {}, set(), {}
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]
        active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0
        parkb = lt and bt > 0 and (park == 'btc' or rkp.iloc[i] < 80)
        w = {}
        if active and bt >= 0.5 and lt:
            def ok(a):
                if ban.get(a, -1) >= i: return False
                if TR[a].iloc[i] < floor: return False
                if exit_ == 'fast' and (P[a].iloc[i] < EMA20[a].iloc[i] or LOGR[a].iloc[i] - LOGR[a].iloc[i - 20] < 0): return False
                return True
            ranked = [a for a, s in sorted(sc[i].items(), key=lambda x: -x[1]) if s > 0 and ok(a)][:top]
            if ranked:
                cw = np.minimum(cap_weights([sc[i][a] / VOL[a].iloc[i] for a in ranked], cap), cap)
                for a, x in zip(ranked, cw): w[a] = x
        # trailing stop bookkeeping
        if exit_ == 'stop':
            for a in list(w):
                p = P[a].iloc[i]
                peak[a] = max(peak.get(a, p), p) if a in held else p
                if p < peak[a] * (1 - stop): ban[a] = i + cool; del w[a]
            held = set(w); peak = {a: peak[a] for a in held}
        rest = 1 - sum(w.values())
        if rest > 1e-9 and parkb: w['btc'] = rest * bt
        for a, x in w.items(): W[i, col[a]] = x
    r, t, h = backtest(pd.DataFrame(W, index=idx, columns=P.columns), P)
    return r
def port(r, target):
    global r_rs
    r_rs = r; return sim(target)
one = pd.Series(1.0, idx); tilt = pd.Series(np.where(LTT > 0, 0.4, 0.6), idx)
for park in ('hybrid', 'btc'):
    for ex, kw in (('brak', {}), ('szybkie (EMA20 / mom 20d)', dict(exit_='fast')), ('stop −15%', dict(exit_='stop', stop=0.15)), ('stop −20%', dict(exit_='stop', stop=0.2)), ('stop −25%', dict(exit_='stop', stop=0.25)), ('trend ≥ 0,75', dict(floor=0.75))):
        r = run2(park, **kw)
        a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
        p6 = port(r, one * 0.6); pt = port(r, tilt)
        m6, mt = metrics(p6, START), metrics(pt, START); o6, ot = metrics(p6, OOS), metrics(pt, OOS); i6 = metrics(p6, START, IS_END)
        print(f"parking {park:6s} wyjście {ex:26s} | RSPS IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | 60/40 IS {i6['Sharpe']:.2f} OOS {o6['Sharpe']:.2f} CAGR {m6['CAGR']*100:5.1f} DD {m6['MaxDD']*100:5.1f} | przechył CAGR {mt['CAGR']*100:5.1f} DD {mt['MaxDD']*100:5.1f} OOS {ot['Sharpe']:.2f}", flush=True)
