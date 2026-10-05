"""RSPS reserve hierarchy (user idea): the RSPS share not in alt picks goes to
  gold (PAXG) when gold is strong → otherwise BTC when BTC is strong → otherwise stablecoin.
'Strong' variants: gold trend (4 SMA) ≥ 0.5; gold trend ≥ 0.5 AND gold stronger than BTC (PAXG/BTC ratio above its 50-day mean,
or 30/60/90 ratio momentum > 0). BTC strong = LTPI(BTC) > 0 and BTC trend > 0 (sized by trend, as now; the unsized part may go to gold).
Compared with: current (BTC×trend first, rest stable) and 'BTC first, gold for the rest' (option goldTrend in 2.19)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r49 = open('run49.py').read(); exec(_r49[:_r49.index("r0, e0 = run_full('btc')")]); exec(_r49[_r49.index("one = pd.Series(1.0, idx); tilt"):_r49.index("line('stablecoin")])
P2 = P.copy(); P2['paxg'] = g
lr = np.log(g / P['btc'])
ratio_up = lr > lr.rolling(50).mean()
ratio_mom = sum(lr - lr.shift(L) for L in (30, 60, 90)) / 3 > 0
def run_res(mode):
    sc, br = pre(10); cols = list(P2.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False
    for i in range(200, len(idx)):
        b = br[i]; bt = TR['btc'].iloc[i]; active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            ranked = [a for a, s in sorted(sc[i].items(), key=lambda x: -x[1]) if s > 0 and TR[a].iloc[i] >= 0.5][:3]
            if ranked:
                cw = np.minimum(cap_weights([sc[i][a] / VOL[a].iloc[i] for a in ranked], 0.5), 0.5)
                for a, x in zip(ranked, cw): w[a] = x
        rest = 1 - sum(w.values())
        gok = np.isfinite(g.iloc[i]) and gtr.iloc[i] >= 0.5
        btc_ok = lt and bt > 0
        if mode == 'gold_strong_ratio': gstrong = gok and bool(ratio_up.iloc[i])
        elif mode == 'gold_strong_mom': gstrong = gok and bool(ratio_mom.iloc[i])
        else: gstrong = gok
        if rest > 1e-9:
            if mode == 'current':
                if btc_ok: w['btc'] = rest * bt
            elif mode == 'btc_then_gold':
                if btc_ok: w['btc'] = rest * bt
                if gok: w['paxg'] = 1 - sum(w.values())
            else:   # gold first when strong, else BTC, else stable
                if gstrong: w['paxg'] = rest
                elif btc_ok:
                    w['btc'] = rest * bt
        for a, x in w.items(): W[i, col[a]] = x
    r, t, h = backtest(pd.DataFrame(W, index=idx, columns=cols), P2)
    return r, pd.DataFrame(W, index=idx, columns=cols)
for mode, name in (('current', 'obecnie: BTC×trend, reszta stable'), ('btc_then_gold', 'BTC×trend, reszta złoto w trendzie (2.19)'),
                   ('gold_first', 'złoto w trendzie → BTC → stable'), ('gold_strong_ratio', 'złoto silne (trend i PAXG/BTC > śr.50) → BTC → stable'),
                   ('gold_strong_mom', 'złoto silne (trend i mom. PAXG/BTC) → BTC → stable')):
    r, W = run_res(mode)
    line(name, r)
    sh = W.loc[START:]; print(f"   śr. udział RSPS: złoto {sh['paxg'].mean()*100:.0f}%, BTC {sh['btc'].mean()*100:.0f}%", flush=True)
