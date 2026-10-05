"""Further return search on the 2.22.0 setup (RSPS with 3-state BTC VAMS, SDCA ×2 below the Probable Range, tilt 40/60).
R1  rank buffer: a held alt stays while it is still in the top 5 (score > 0, trend ≥ 0.5) — less churn.
R2  relative-strength lookbacks: 14/30/60, 7/14/30, 60/90/120 instead of 30/60/90.
R3  ETH as second bench: reserve goes to ETH instead of BTC when ETH/BTC momentum (30/60/90) > 0 and ETH trend ≥ 0.5.
R4  top 2 with buffer / top 4 with buffer.
P1  split rebalance band 5% / 20% (now 10%).  P2  tilt 30/70 while LTPI($TOTAL) > 0.
S1  SDCA without curve sells (only the LTPI safety sells).  S2  SDCA buys ×1.5 while LTPI(BTC) > 0.
Y   idle stablecoin earning 4%/yr (assumption: lending / savings yield; not a strategy rule, shown for reference).
All signals at close t, traded from t+1 (engine shift), 0.15% per side."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r51 = open('run51.py').read()
exec(_r51[:_r51.index("base = rsps2()")])
exec(_r51[_r51.index("pb = df['price']"):_r51.index("f5 = np.log")])
exec(_r51[_r51.index("def sdca_pr"):_r51.index("for lo_, hi_ in")])
ELIG10 = ELIG[10]
SC_CACHE = {}
def sc_for(lbs):
    if lbs == (30, 60, 90): return pre(10)[0]
    if lbs not in SC_CACHE: SC_CACHE[lbs] = {i: scores(i, ELIG10.iloc[i], lbs) for i in range(200, len(idx))}
    return SC_CACHE[lbs]
eb = np.log(P['eth'] / P['btc']); eth_mom = (sum(eb - eb.shift(L) for L in (30, 60, 90)) / 3) > 0
def rsps3(lbs=(30, 60, 90), top=3, buffer=0, eth_bench=False, yield_=0.0, cost=0.0015, turn=False):
    sc = sc_for(lbs); br = pre(10)[1]; cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False; held = []
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            ok = [a for a, s in sorted(sc[i].items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5]
            if buffer:
                keep = [a for a in held if a in ok[:top + buffer]][:top]
                ranked = keep + [a for a in ok if a not in keep][:top - len(keep)]
            else: ranked = ok[:top]
            if ranked:
                cw = np.minimum(cap_weights([sc[i][a] / VOL[a].iloc[i] for a in ranked], 0.5), 0.5)
                for a, x in zip(ranked, cw): w[a] = x
            held = ranked
        else: held = []
        rest = 1 - sum(w.values())
        gstrong = np.isfinite(g.iloc[i]) and gtr.iloc[i] >= 0.5 and bool(ratio_mom.iloc[i])
        bsize = 1.0 if bt >= 0.75 else 0.5 if bt >= 0.5 else 0.0
        estrong = eth_bench and lt and TR['eth'].iloc[i] >= 0.5 and bool(eth_mom.iloc[i]) and 'eth' not in w
        if rest > 1e-9:
            if gstrong: w['paxg'] = rest
            elif estrong: w['eth'] = rest * (1.0 if TR['eth'].iloc[i] >= 0.75 else 0.5)
            elif lt and bsize > 0: w['btc'] = rest * bsize
        for a, x in w.items(): W[i, col[a]] = x
    Wd = pd.DataFrame(W, index=idx, columns=cols)
    r, t, h = backtest(Wd, P2, cost=cost)
    if turn: return r, Wd.diff().abs().sum(axis=1)
    if yield_: r = r + (1 - h.abs().sum(axis=1)).clip(lower=0) * yield_ / 365
    return r
def sdca4(no_sell=False, up_mult=1.0, yield_=0.0):
    p_ = price.loc[START:]; rr = risk.reindex(P.index).reindex(p_.index).shift(1); l = LT.reindex(p_.index).shift(1)
    lo = below.reindex(p_.index).shift(1).fillna(False)
    cash, btc, eq, wb, owed = 1.0, 0.0, [], [], 0.0
    for d in p_.index:
        px = p_[d]; rk = rr[d]; ls = l[d]
        cash *= 1 + yield_ / 365
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if no_sell and rate < 0: rate = 0.0
        if rate > 0:
            if ls < 0: rate *= 0.25
            elif ls > 0: rate *= up_mult
            if lo[d]: rate *= 2.0
            if rate * 100 <= 1: rate = 0.0
        if rate > 0 and cash > 0: amt = cash * min(rate, 1); cash -= amt; btc += amt * 0.9985 / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0: q = btc * -rate; btc -= q; cash += q * px * 0.9985
        if ls < 0 and np.isfinite(rk) and rk >= 70: q = btc * 0.02; btc -= q; v = q * px * 0.9985; cash += v; owed += v
        elif ls > 0 and owed > 0 and cash > 0: amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * 0.9985 / px; owed -= amt
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p_.index); return eq.pct_change().fillna(0), pd.Series(wb, index=p_.index)
def show4(name, r_rsps, sd=None, tilt=tiltL, band=0.10):
    global SDR, SDW, r_rs
    SDR, SDW = sd if sd is not None else SD0
    a, b, f = metrics(r_rsps, START, IS_END), metrics(r_rsps, OOS), metrics(r_rsps, START)
    r_rs = r_rsps; pt = sim(tilt, band); mt, ot, it = metrics(pt, START), metrics(pt, OOS), metrics(pt, START, IS_END)
    print(f"{name:42s} RSPS IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} | PORTFEL IS {it['Sharpe']:.2f} OOS {ot['Sharpe']:.2f} CAGR {mt['CAGR']*100:5.1f} DD {mt['MaxDD']*100:5.1f} Dale {dale(pt):.2f}", flush=True)
    return mt['CAGR']
SD0 = sdca4()
sm = metrics(SD0[0], START); print(f"SDCA baza: CAGR {sm['CAGR']*100:.1f} DD {sm['MaxDD']*100:.1f} IS {metrics(SD0[0], START, IS_END)['Sharpe']:.2f} OOS {metrics(SD0[0], OOS)['Sharpe']:.2f}")
base = rsps3(); show4('BAZA 2.22.0', base)
show4('R1 bufor rankingu top 5', rsps3(buffer=2))
show4('R1 bufor rankingu top 6', rsps3(buffer=3))
for lb in ((14, 30, 60), (7, 14, 30), (60, 90, 120), (20, 40, 60)): show4(f'R2 okna siły {lb}', rsps3(lbs=lb))
show4('R3 ETH jako druga ławka', rsps3(eth_bench=True))
show4('R4 top 2 + bufor', rsps3(top=2, buffer=2))
show4('R4 top 4 + bufor', rsps3(top=4, buffer=2))
show4('P1 pasmo rebalansu 5%', base, band=0.05)
show4('P1 pasmo rebalansu 20%', base, band=0.20)
show4('P2 przechył 30/70', base, tilt=pd.Series(np.where(LTT > 0, 0.3, 0.6), idx))
for nm_, kw in (('S1 SDCA bez sprzedaży z krzywej', dict(no_sell=True)), ('S2 SDCA ×1,5 przy LTPI+', dict(up_mult=1.5))):
    sd = sdca4(**kw); m_ = metrics(sd[0], START)
    print(f"   {nm_}: SDCA CAGR {m_['CAGR']*100:.1f} DD {m_['MaxDD']*100:.1f} IS {metrics(sd[0], START, IS_END)['Sharpe']:.2f} OOS {metrics(sd[0], OOS)['Sharpe']:.2f}")
    show4(nm_, base, sd=sd)
show4('Y  stablecoin 4%/rok (założenie)', rsps3(yield_=0.04), sd=sdca4(yield_=0.04))
