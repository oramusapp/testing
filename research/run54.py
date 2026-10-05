"""Tiered RSPS as described in the course notes ("tiered TPI-like system that manages: exposure to the overall market;
the balance between individual large-caps; between large-caps and small-caps as groups; between small-caps and their
reference large-caps" — "sometimes it will just hold BTC & ETH and no small-caps when the dominance of majors is strong").
Core large-caps (user list): BTC, ETH, SOL, XRP, SUI (HYPE: no history before 09.2026 in reachable data → not testable).
Small caps = the other point-in-time top-liquidity tokens. Setup = 2.23.0 (lookbacks 7/21/42, VAMS BTC, gold hierarchy,
SDCA ×2 below range, tilt 40/60). 2020→, decisions at close t, traded t+1, 0.15% per side.
V1 core only (rotation among ETH/SOL/XRP/SUI vs BTC).
V2 core always eligible + top-liquidity small caps (one pool).
V3 tiered: small caps allowed only while the small-cap group beats the large-cap group (equal-weight index ratio:
   above its 50-day mean AND 7/21/42 momentum > 0); otherwise picks only from the core.
V4 = V3 + each small cap must also beat its reference large-cap (ETH-ecosystem tokens vs ETH, the rest vs BTC).
V5 = V3 with group weights: core slot always first, small caps only take the slots the core leaves."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r52 = open('run52.py').read(); exec(_r52[:_r52.index("SD0 = sdca4()")])
SD0 = sdca4()
LB = (7, 21, 42)
CORE = ['eth', 'sol', 'xrp', 'sui']
ETH_ECO = {'arb', 'op', 'uni', 'aave', 'link', 'mkr', 'pol', 'mana'}
hist = P.notna().cumsum()
core_ok = pd.DataFrame({a: (hist[a] >= 91) for a in P.columns}, index=idx)
SMALL = ELIG10.copy()
for a in ['btc'] + CORE: SMALL[a] = False
# group indices: equal-weight daily log returns
lr = np.log(P).diff()
big_ret = lr[['btc'] + CORE].where(core_ok[['btc'] + CORE]).mean(axis=1)
small_ret = lr.where(SMALL.shift(1).fillna(False)).mean(axis=1)
grp = (small_ret - big_ret).fillna(0).cumsum()
small_on = (grp > grp.rolling(50).mean()) & ((sum(grp - grp.shift(L) for L in LB) / 3) > 0)
def mom(a, ref, i):
    x = np.log(P[a] / P[ref]); return np.nanmean([x.iloc[i] - x.iloc[i - L] for L in LB])
def elig_row(i, mode):
    core = {a: bool(core_ok[a].iloc[i]) for a in CORE}
    small = SMALL.iloc[i]
    row = pd.Series(False, index=P.columns)
    if mode == 'base': return ELIG10.iloc[i]
    for a, v in core.items(): row[a] = v
    if mode == 'core': return row
    if mode == 'pool' or bool(small_on.iloc[i]):
        for a in P.columns:
            if small[a]: row[a] = True
    return row
SCC = {}
def rsps_t(mode='base', ref=False, core_first=False):
    br = pre(10)[1]; cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            key = (mode, i)
            if key not in SCC: SCC[key] = scores(i, elig_row(i, mode), LB)
            sc = SCC[key]
            ok = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5]
            if ref: ok = [a for a in ok if a in CORE or mom(a, 'eth' if a in ETH_ECO else 'btc', i) > 0]
            if core_first: ok = [a for a in ok if a in CORE] + [a for a in ok if a not in CORE]
            ranked = ok[:3]
            if ranked:
                cw = np.minimum(cap_weights([sc[a] / VOL[a].iloc[i] for a in ranked], 0.5), 0.5)
                for a, x in zip(ranked, cw): w[a] = x
        rest = 1 - sum(w.values())
        gstrong = np.isfinite(g.iloc[i]) and gtr.iloc[i] >= 0.5 and bool(ratio_mom.iloc[i])
        bsize = 1.0 if bt >= 0.75 else 0.5 if bt >= 0.5 else 0.0
        if rest > 1e-9:
            if gstrong: w['paxg'] = rest
            elif lt and bsize > 0: w['btc'] = rest * bsize
        for a, x in w.items(): W[i, col[a]] = x
    Wd = pd.DataFrame(W, index=idx, columns=cols)
    r, t, h = backtest(Wd, P2)
    return r, Wd
def yearly(r): return ' '.join(f"{y}:{((1 + r.loc[str(y)]).prod() - 1) * 100:5.0f}" for y in range(2020, 2027))
print(f"małe coiny silniejsze od dużych (grupy): {small_on.loc['2020':].mean()*100:.0f}% dni od 2020")
out = {}
for nm, kw in (('BAZA 2.23.0 (top 10 płynności)', dict(mode='base')), ('V1 tylko stałe duże', dict(mode='core')),
               ('V2 stałe duże + małe (jedna pula)', dict(mode='pool')), ('V3 warstwy: małe gdy grupa silna', dict(mode='tier')),
               ('V4 V3 + małe vs coin referencyjny', dict(mode='tier', ref=True)), ('V5 V3 + najpierw duże', dict(mode='tier', core_first=True))):
    r, Wd = rsps_t(**kw); out[nm] = (r, Wd); show4(nm, r)
    sh = Wd.loc['2020':]; print(f"   udział: małe {sh[[c for c in sh.columns if c not in CORE + ['btc', 'paxg']]].sum(axis=1).mean()*100:4.1f}%  duże alty {sh[CORE].sum(axis=1).mean()*100:4.1f}%  BTC {sh['btc'].mean()*100:4.1f}%  PAXG {sh['paxg'].mean()*100:4.1f}% | {yearly(r)}")
