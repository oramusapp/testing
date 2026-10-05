"""Tokenized gold (PAXG, Binance from 2020-08-28) instead of stablecoin in RSPS. RSPS as in the app (veto LTPI on BTC,
parking BTC×trend). The share that would sit in stablecoin goes to PAXG: (a) always, (b) only while gold's own 4-SMA trend
≥ 0.5, (c) only in defence (LTPI < 0). Before Aug 2020 stablecoin. Portfolio: SDCA (LTPI BTC) with tilt 40/60 and 60/40."""
import numpy as np, pandas as pd, warnings, json
warnings.filterwarnings('ignore')
_r48 = open('run48.py').read(); exec(_r48[:_r48.index("one = pd.Series(1.0, idx)")])
g = pd.Series({pd.Timestamp(d): c for d, c in json.load(open(SP + 'PAXGUSDT.json'))}).reindex(idx)
gr = g.pct_change().fillna(0.0)
gtr = sum((g > g.rolling(L).mean()).astype(float) for L in (20, 50, 100, 200)) / 4
def with_gold(r_rsps, expo_rsps, mode):
    """Adds gold return on the stablecoin share (1 − exposure), decided at t, held from t+2; switch cost 0.15%."""
    stable = (1 - expo_rsps).clip(0, 1)
    ok = g.notna()
    if mode == 'trend': ok &= gtr >= 0.5
    if mode == 'defence': ok &= LT_T.reindex(idx) < 0
    w = (stable * ok.astype(float)).shift(2).fillna(0)
    return r_rsps + w * gr - w.diff().abs().fillna(0) * 0.0015
def run_full(park='btc'):
    sc, br = pre(10); W = np.zeros((len(idx), len(P.columns))); col = {a: j for j, a in enumerate(P.columns)}; active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            ranked = [a for a, s in sorted(sc[i].items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5][:3]
            if ranked:
                cw = np.minimum(cap_weights([sc[i][a] / VOL[a].iloc[i] for a in ranked], 0.5), 0.5)
                for a, x in zip(ranked, cw): w[a] = x
        rest = 1 - sum(w.values())
        if rest > 1e-9 and lt and bt > 0 and (park == 'btc' or rkp.iloc[i] < 80): w['btc'] = rest * bt
        for a, x in w.items(): W[i, col[a]] = x
    Wd = pd.DataFrame(W, index=idx, columns=P.columns)
    r, t, h = backtest(Wd, P)
    return r, h.abs().sum(axis=1)
r0, e0 = run_full('btc')
one = pd.Series(1.0, idx); tilt = pd.Series(np.where(LTT > 0, 0.4, 0.6), idx)
def line(name, r):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    p6 = port(r, one * 0.6); pt = port(r, tilt)
    m6, mt, o6, ot = metrics(p6, START), metrics(pt, START), metrics(p6, OOS), metrics(pt, OOS)
    print(f"{name:34s} RSPS IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:5.1f} DD {f['MaxDD']*100:5.1f} | 60/40 CAGR {m6['CAGR']*100:5.1f} DD {m6['MaxDD']*100:5.1f} OOS {o6['Sharpe']:.2f} | przechył CAGR {mt['CAGR']*100:5.1f} DD {mt['MaxDD']*100:5.1f} OOS {ot['Sharpe']:.2f}", flush=True)
line('stablecoin (obecnie)', r0)
for m, n in (('always', 'PAXG zawsze'), ('trend', 'PAXG, gdy złoto w trendzie'), ('defence', 'PAXG tylko przy LTPI < 0')):
    line(n, with_gold(r0, e0, m))
gs = g.loc['2020-09-01':]; print('PAXG sam od 09.2020:', f"CAGR {((gs.iloc[-1]/gs.iloc[0])**(365/len(gs))-1)*100:.1f}%", f"DD {((gs/gs.cummax())-1).min()*100:.1f}%")
print('udział stablecoina w RSPS (śr. 2020→):', f"{(1-e0.loc[START:]).mean()*100:.0f}%")
