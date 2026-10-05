"""Honest protocol (user request: real results, no hindsight). Every variant is point-in-time; the choice is made on
2020–23 (IS) only and 2024→ (OOS) is reported, not used. 2.25 setup (coherent LTPI on BTC and $TOTAL, 7/21/42, VAMS BTC,
gold hierarchy, SDCA ×2 below range).
A  one pool: top 10 by 30-day liquidity (as before 2.24).
B  notes tiers, point-in-time: large caps = the 4 most liquid alts on that day; small caps (rest of the top 10) only while
   the small-cap group beats the large-cap group; ranking by strength only (no priority for large caps).
C  B with priority for large caps (run57).
For information only (hindsight, NOT a valid result): fixed list ETH/SOL/XRP/SUI added to the pool / tiers."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r57 = open('run57.py').read(); exec(_r57[:_r57.index("rep('jedna pula")])
FIX = pd.DataFrame({a: (a in ['eth', 'sol', 'xrp', 'sui']) & (hist[a] >= 91) for a in P.columns}, index=idx)
def run_v(core_mask, tiers=True, prio=False, pool_fixed=False):
    core_mask = core_mask.reindex(columns=P.columns, fill_value=False).fillna(False)
    SMALL = ELIG10.copy() & ~core_mask; SMALL['btc'] = False
    big = lr.where(core_mask).copy(); big['btc'] = lr['btc']
    grp = (lr.where(SMALL.shift(1).fillna(False)).mean(axis=1) - big.mean(axis=1)).fillna(0).cumsum()
    son = (grp > grp.rolling(50).mean()) & ((sum(grp - grp.shift(L) for L in LB) / 3) > 0)
    br = pre(10)[1]; cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            cm = core_mask.iloc[i]
            if pool_fixed: row = ELIG10.iloc[i] | cm
            elif tiers: row = cm | SMALL.iloc[i] if bool(son.iloc[i]) else cm.copy()
            else: row = ELIG10.iloc[i].copy()
            row = row.copy(); row['btc'] = False
            sc = scores(i, row, LB)
            ok = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5]
            if prio: ok = [a for a in ok if cm[a]] + [a for a in ok if not cm[a]]
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
for k in (3, 4, 5):
    PITk = (liq.rank(axis=1, ascending=False) <= k)
    rep(f'B  warstwy, duże = top {k} płynności, bez priorytetu', run_v(PITk))
    rep(f'C  warstwy, duże = top {k}, z priorytetem', run_v(PITk, prio=True))
rep('A  jedna pula top 10', run_v(FIX, tiers=False))
print('--- tylko informacyjnie (wiedza z przyszłości, nie jest wynikiem) ---')
rep('stała lista dodana do puli, bez priorytetu', run_v(FIX, pool_fixed=True))
rep('stała lista jako duże, warstwy, bez priorytetu', run_v(FIX))
