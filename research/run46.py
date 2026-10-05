"""RSPS alpha search within the current rules (rotation by relative strength vs BTC, breadth gate, LTPI veto from $TOTAL,
hybrid parking). Grid: number of picks, weight cap, universe size, weighting (score/vol, equal, score), own-trend floor,
exposure scaled by breadth instead of an on/off gate, extra gate MTPI($TOTAL) > 0 (notes: RSPS 'manages the exposure to
the overall market' with a TPI-like system). Chosen on IS 2020-23, checked on OOS 2024→; portfolio = SDCA (LTPI BTC) 60/40."""
import numpy as np, pandas as pd, warnings, itertools
warnings.filterwarnings('ignore')
_t = open('run44.py').read(); exec(_t[:_t.index("print('=== 1.")])
from engine import top_n_universe, cap_weights
idx = P.index; rkp = risk.reindex(idx).ffill()
LT_T = S_[('TOTAL', 0.0, 'L')].reindex(idx).ffill().fillna(0); MT_T = S_[('TOTAL', 0.0, 'M')].reindex(idx).ffill().fillna(0)
LT = S_[('BTC', 0.0, 'L')].reindex(idx).ffill()                      # SDCA uses BTC LTPI (global used by sdca3)
SDR, SDW = sdca3(risk.reindex(P.index), 'ltpi_mult', 0.25)
TR = {a: ctx.trend[a] for a in P.columns}; VOL = {a: ctx.vol[a] for a in P.columns}
LOGR = np.log(P.div(P['btc'], axis=0))
Q30 = Q.rolling(30).mean()
ELIG = {n: top_n_universe(Q30, P, n) for n in (10, 15, 20)}
def scores(i, elig_row, lbs=(30, 60, 90)):
    out = {}
    for a in P.columns:
        if a == 'btc' or not elig_row[a]: continue
        v = VOL[a].iloc[i]
        if not (v > 0): continue
        vals = [LOGR[a].iloc[i] - LOGR[a].iloc[i - L] for L in lbs]
        if any(np.isnan(vals)): continue
        out[a] = float(np.mean(vals)) / v
    return out
def breadth(i, elig_row):
    vals = []
    for a in P.columns:
        if a == 'btc' or not elig_row[a]: continue
        r = LOGR[a].iloc[i - 50:i + 1]
        if r.notna().all(): vals.append(r.iloc[-1] > r.iloc[:-1].mean())
    return np.mean(vals) if vals else np.nan
CACHE = {}
def pre(n):
    if n in CACHE: return CACHE[n]
    E = ELIG[n]; sc, br = {}, {}
    for i in range(200, len(idx)):
        row = E.iloc[i]; sc[i] = scores(i, row); br[i] = breadth(i, row)
    CACHE[n] = (sc, br); return CACHE[n]
def run(n=10, top=3, cap=0.5, weight='sv', floor=0.5, scale=False, mtpi_gate=False, enter=0.7, exit_=0.6):
    sc, br = pre(n); W = np.zeros((len(idx), len(P.columns))); col = {a: j for j, a in enumerate(P.columns)}; active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]
        active = (b >= exit_ if active else b >= enter) if np.isfinite(b) else False
        park = LT_T.iloc[i] > 0 and rkp.iloc[i] < 80
        w = {}
        ok = active and bt >= 0.5 and LT_T.iloc[i] > 0 and (not mtpi_gate or MT_T.iloc[i] > 0)
        if ok:
            ranked = [a for a, s in sorted(sc[i].items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= floor][:top]
            if ranked:
                raw = [sc[i][a] / VOL[a].iloc[i] if weight == 'sv' else 1.0 if weight == 'eq' else sc[i][a] for a in ranked]
                cw = np.minimum(cap_weights(raw, cap), cap)
                k = min(1.0, b) if scale else 1.0
                for a, x in zip(ranked, cw): w[a] = x * k
        rest = 1 - sum(w.values())
        if rest > 1e-9 and park and bt > 0: w['btc'] = rest * bt
        for a, x in w.items(): W[i, col[a]] = x
    Wd = pd.DataFrame(W, index=idx, columns=P.columns)
    r, t, h = backtest(Wd, P)
    rr, e = simulate(r.loc[START:], h.loc[START:].abs().sum(axis=1), SDR, SDW.reindex(P.index).fillna(0), rule='band', band=0.10)
    return r, rr
def fmt(name, r, rr):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    pa, pb, pf = metrics(rr, START, IS_END), metrics(rr, OOS), metrics(rr, START)
    print(f"{name:44s} RSPS IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | PORTFEL IS {pa['Sharpe']:.2f} OOS {pb['Sharpe']:.2f} CAGR {pf['CAGR']*100:5.1f} DD {pf['MaxDD']*100:5.1f}", flush=True)
fmt('BAZA: top3 cap50 uni10 score/vol', *run())
for top in (1, 2, 4, 5): fmt(f'top{top}', *run(top=top, cap=max(0.5, 1 / top) if top < 2 else 0.5))
for cap in (0.34, 0.7, 1.0): fmt(f'cap {cap}', *run(cap=cap))
for n in (15, 20): fmt(f'uniwersum {n}', *run(n=n))
for wt in ('eq', 'score'): fmt(f'wagi {wt}', *run(weight=wt))
for fl in (0.75, 1.0): fmt(f'trend tokena ≥ {fl}', *run(floor=fl))
fmt('ekspozycja × szerokość', *run(scale=True))
fmt('bramka + MTPI($TOTAL) > 0', *run(mtpi_gate=True))
for en, ex in ((0.6, 0.5), (0.8, 0.7)): fmt(f'bramka {en}/{ex}', *run(enter=en, exit_=ex))
