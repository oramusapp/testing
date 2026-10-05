"""Ideas from the 42 Macro methodology (no report data needed), tested on the current app setup
(RSPS veto LTPI BTC, parking BTC×trend, reserve gold→BTC→stable with PAXG/BTC momentum, tilt 40/60 by LTPI $TOTAL):
 A  Dr. Mo-style pick sizing: half position while the coin's trend is neutral (0.5), full when ≥ 0.75.
 B  three-state VAMS for BTC in the reserve: exposure 0 / 50 / 100% (trend ≤0.25 / 0.5 / ≥0.75) instead of linear trend.
 C  Probable Range: SDCA buys ×1.5 when BTC closes below the lower band (20-day mean − 1.5σ), ×0.5 above the upper band.
 D  tilt by ETH/BTC momentum (risk appetite, like 42 Macro's High-Beta/Low-Beta ratio) instead of LTPI $TOTAL.
 E  volatility targeting for RSPS (KISS: risk overlay): scale RSPS by min(1, 80% / realised 30-day vol).
Also reports the 'Dale Test' (years to recover the max drawdown at the period CAGR)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r50 = open('run50.py').read(); exec(_r50[:_r50.index("for mode, name in")])
def rsps2(dr_mo=False, vams3=False, voltarget=None):
    sc, br = pre(10); cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            ranked = [a for a, s in sorted(sc[i].items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5][:3]
            if ranked:
                cw = np.minimum(cap_weights([sc[i][a] / VOL[a].iloc[i] for a in ranked], 0.5), 0.5)
                for a, x in zip(ranked, cw): w[a] = x * (0.5 if dr_mo and TR[a].iloc[i] < 0.75 else 1.0)
        rest = 1 - sum(w.values())
        gstrong = np.isfinite(g.iloc[i]) and gtr.iloc[i] >= 0.5 and bool(ratio_mom.iloc[i])
        bsize = (1.0 if bt >= 0.75 else 0.5 if bt >= 0.5 else 0.0) if vams3 else bt
        if rest > 1e-9:
            if gstrong: w['paxg'] = rest
            elif lt and bsize > 0: w['btc'] = rest * bsize
        for a, x in w.items(): W[i, col[a]] = x
    Wd = pd.DataFrame(W, index=idx, columns=cols)
    r, t, h = backtest(Wd, P2)
    if voltarget:
        rv = r.rolling(30).std() * np.sqrt(365)
        k = (voltarget / rv).clip(upper=1.0).shift(2).fillna(1.0)
        r = r * k - k.diff().abs().fillna(0) * h.abs().sum(axis=1) * 0.0015
    return r
def dale(r, a=START, b=None):
    m = metrics(r, a, b); return np.log(1 / (1 + m['MaxDD'])) / np.log(1 + m['CAGR']) if m['CAGR'] > 0 else np.inf
ETHB = np.log(P['eth'] / P['btc']); ethmom = (sum(ETHB - ETHB.shift(L) for L in (30, 60, 90)) / 3) > 0
tiltL = pd.Series(np.where(LTT > 0, 0.4, 0.6), idx); tiltE = pd.Series(np.where(ethmom, 0.4, 0.6), idx)
def show3(name, r, tilt=tiltL):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    pt = port(r, tilt); mt, ot, it = metrics(pt, START), metrics(pt, OOS), metrics(pt, START, IS_END)
    print(f"{name:44s} RSPS IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | PORTFEL IS {it['Sharpe']:.2f} OOS {ot['Sharpe']:.2f} CAGR {mt['CAGR']*100:5.1f} DD {mt['MaxDD']*100:5.1f} Dale {dale(pt):.2f} lat", flush=True)
base = rsps2(); show3('BAZA (konfiguracja aplikacji)', base)
show3('A  Dr. Mo: pół pozycji przy trendzie 0,5', rsps2(dr_mo=True))
show3('B  VAMS 3-stanowy dla BTC w rezerwie', rsps2(vams3=True))
show3('D  przechył wg momentum ETH/BTC', base, tiltE)
show3('D2 przechył: LTPI $TOTAL i ETH/BTC', base, pd.Series(np.where((LTT > 0) & ethmom, 0.4, 0.6), idx))
for vt in (0.6, 0.8, 1.0): show3(f'E  cel zmienności RSPS {int(vt*100)}%', rsps2(voltarget=vt))
# C: SDCA probable-range multiplier
pb = df['price']; m20 = pb.rolling(20).mean(); s20 = pb.rolling(20).std()
below = (pb < m20 - 1.5 * s20).reindex(P.index).fillna(False); above = (pb > m20 + 1.5 * s20).reindex(P.index).fillna(False)
f5 = np.log(pb.shift(-5) / pb).reindex(P.index)
for nm, msk in (('poniżej dolnej granicy', below), ('powyżej górnej granicy', above)):
    x = f5[msk].loc['2014':].dropna(); allf = f5.loc['2014':].dropna()
    print(f"Probable Range BTC {nm}: n={len(x)} średni 5d {x.mean()*100:.2f}% vs {allf.mean()*100:.2f}% · na plus {np.mean(x>0)*100:.0f}% vs {np.mean(allf>0)*100:.0f}% · z {(x.mean()-allf.mean())/(allf.std()/np.sqrt(len(x))):.2f}")
def sdca_pr(mult_lo=1.5, mult_hi=0.5):
    p_ = price.loc[START:]; rr = risk.reindex(P.index).reindex(p_.index).shift(1); l = LT.reindex(p_.index).shift(1)
    lo = below.reindex(p_.index).shift(1).fillna(False); hi = above.reindex(p_.index).shift(1).fillna(False)
    cash, btc, eq, wb, owed = 1.0, 0.0, [], [], 0.0
    for d in p_.index:
        px = p_[d]; rk = rr[d]; ls = l[d]
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate > 0:
            if ls < 0: rate *= 0.25
            rate *= mult_lo if lo[d] else mult_hi if hi[d] else 1.0
            if rate * 100 <= 1: rate = 0.0
        if rate > 0 and cash > 0: amt = cash * min(rate, 1); cash -= amt; btc += amt * 0.9985 / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0: q = btc * -rate; btc -= q; cash += q * px * 0.9985
        if ls < 0 and np.isfinite(rk) and rk >= 70: q = btc * 0.02; btc -= q; v = q * px * 0.9985; cash += v; owed += v
        elif ls > 0 and owed > 0 and cash > 0: amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * 0.9985 / px; owed -= amt
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p_.index); return eq.pct_change().fillna(0), pd.Series(wb, index=p_.index)
for lo_, hi_ in ((1.0, 1.0), (1.5, 0.5), (2.0, 1.0), (1.5, 1.0)):
    sr, sw = sdca_pr(lo_, hi_); a, b, f = metrics(sr, START, IS_END), metrics(sr, OOS), metrics(sr, START)
    print(f"C  SDCA zakupy ×{lo_} poniżej / ×{hi_} powyżej zakresu: IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} Dale {dale(sr):.2f}", flush=True)
# B + C together on the whole portfolio (SDCA sleeve replaced by the probable-range variant)
_sr0, _sw0 = sdca_pr(1.0, 1.0); SDR, SDW = _sr0, _sw0; show3('BAZA (silnik SDCA z run51)', base)
_srC, _swC = sdca_pr(2.0, 1.0); SDR, SDW = _srC, _swC; show3('C  SDCA ×2 pod zakresem', base)
show3('B + C razem', rsps2(vams3=True))
