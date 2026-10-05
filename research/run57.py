"""Honesty check of the tiered RSPS (run54 V5): the fixed large-cap list (ETH, SOL, XRP, SUI) was chosen in 2026, with
hindsight. Point-in-time alternative: 'large caps' = the 4 most liquid alts (30-day quote volume, ≥ 91 days of history)
known at each date. Same rules otherwise (2.25.0 setup, coherent LTPI)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r56 = open('run56.py').read(); exec(_r56[:_r56.index("for nm, drop in")])
lt1 = state0(btcp, spec_wo(*FAST))[0]
LT = lt1.reindex(price.index).ffill().fillna(0); LT_T = lt1.reindex(idx).ffill().fillna(0)
from total import total_index
TOTp = total_index().reindex(df.index).ffill()
ltt1 = state0(TOTp, spec_wo(*FAST))[0].reindex(idx).ffill().fillna(0); tilt1 = pd.Series(np.where(ltt1 > 0, 0.4, 0.6), idx)
SDf = sdca4()
alts = [a for a in P.columns if a not in ('btc',)]
liq = Q30[alts].where(hist[alts] >= 91)
rank = liq.rank(axis=1, ascending=False)
PIT_CORE = (rank <= 4)
src = open('run54.py').read()
body = src[src.index('def elig_row'):src.index('def yearly')]
def run_core(core_df, name):
    global CORE, SMALL, small_on, SCC
    g = {}
    if core_df is None: core_mask = pd.DataFrame({a: (a in ['eth', 'sol', 'xrp', 'sui']) & (hist[a] >= 91) for a in P.columns}, index=idx)
    else: core_mask = core_df.reindex(columns=P.columns, fill_value=False).fillna(False)
    SMALL = ELIG10.copy() & ~core_mask; SMALL['btc'] = False
    big = lr.where(core_mask).copy(); big['btc'] = lr['btc']
    bigr = big.mean(axis=1); smr = lr.where(SMALL.shift(1).fillna(False)).mean(axis=1)
    grp = (smr - bigr).fillna(0).cumsum()
    small_on = (grp > grp.rolling(50).mean()) & ((sum(grp - grp.shift(L) for L in LB) / 3) > 0)
    SCC = {}
    br = pre(10)[1]; cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            row = core_mask.iloc[i].copy()
            if bool(small_on.iloc[i]): row = row | SMALL.iloc[i]
            row['btc'] = False
            sc = scores(i, row, LB); cm = core_mask.iloc[i]
            ok = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5]
            ok = [a for a in ok if cm[a]] + [a for a in ok if not cm[a]]
            ranked = ok[:3]
            if ranked:
                cw = np.minimum(cap_weights([sc[a] / VOL[a].iloc[i] for a in ranked], 0.5), 0.5)
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
g_ = g
def rep(name, r):
    global SDR, SDW, r_rs
    SDR, SDW = SDf; r_rs = r; pt = sim(tilt1)
    m, o, i_ = metrics(pt, START), metrics(pt, OOS), metrics(pt, START, IS_END)
    x = pt.loc[START:]; xe = x[x.index.year != 2021]
    print(f"{name:46s} CAGR {m['CAGR']*100:5.1f} DD {m['MaxDD']*100:5.1f} IS {i_['Sharpe']:.2f} OOS {o['Sharpe']:.2f} | bez 2021 {((1+xe).prod()**(365/len(xe))-1)*100:5.1f} | 2024→ {o['CAGR']*100:5.1f}", flush=True)
rep('jedna pula top 10 (bez warstw)', rsps3(lbs=(7, 21, 42)))
rep('warstwy: stała lista ETH/SOL/XRP/SUI (2.25)', run_core(None, ''))
rep('warstwy: duże = 4 najpłynniejsze w danym dniu', run_core(PIT_CORE, ''))
