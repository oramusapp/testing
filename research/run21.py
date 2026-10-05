"""Alpha sleeve, round 3: tournament / TS selection inside the market gates that protect the current RSPS
(breadth of alts vs BTC with hysteresis 70/60, LTPI veto), and BTC×trend parking."""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run20.py').read().split("print('=== sleeve alone")[0])
E10 = ELIG[10]
br_votes = {}
for a in P.columns:
    if a == 'btc': continue
    r = (P[a] / P['btc']); br_votes[a] = (r > r.shift(1).rolling(50).mean()).astype(float).where(r.shift(1).rolling(50).count() == 50)
BV = pd.DataFrame(br_votes).where(E10.drop(columns='btc'))
BREADTH = BV.mean(axis=1)
def hyst_gate(x, enter=0.7, exit_=0.6):
    st, out = False, []
    for v in x.values:
        st = (v >= exit_) if st else (v >= enter) if np.isfinite(v) else False
        out.append(float(st))
    return pd.Series(out, index=x.index)
G_BR = hyst_gate(BREADTH)
G_LT = (ctx.ltpi > 0).astype(float)
BT = ctx.trend['btc'].fillna(0)
def with_gate(Wsel, gate, park='btc_trend'):
    W = Wsel.mul(gate, axis=0)
    rest = (1 - W.sum(axis=1)).clip(lower=0)
    if park == 'btc_trend':
        W['btc'] = W['btc'] + rest * BT * G_LT
    return W
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
print('=== reference')
run('RSPS obecny (parking stable)', S.rsps(ctx, **KW, fallback='cash', ltpi_veto=True), S_)
run('RSPS obecny (parking BTC×trend)', S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True), S_)
run('Tylko BTC×trend×LTPI (bez altów)', with_gate(pd.DataFrame(0.0, index=P.index, columns=P.columns), G_BR*0), S_)
print('=== tournament inside gates (alts only: btc excluded from picks)')
for top in (2, 3):
    Wt, _ = tournament(10, top, 'don', include_btc=False)
    Wt['btc'] = 0
    g = G_BR * G_LT * (BT >= 0.5)
    run(f'Turniej top{top} + bramki, parking stable', thresh(with_gate(Wt, g, None)), S_)
    run(f'Turniej top{top} + bramki, parking BTC×trend', thresh(with_gate(Wt, g)), S_)
print('=== TS trend inside gates')
Wf = ts_full(10, th=0.0); Wf['btc'] = 0
Wf = Wf.div(Wf.sum(axis=1).replace(0, np.nan), axis=0).fillna(0)   # fully invested among trending alts
g = G_BR * G_LT * (BT >= 0.5)
run('TS alty (1/vol) + bramki, parking stable', thresh(with_gate(Wf, g, None)), S_)
run('TS alty (1/vol) + bramki, parking BTC×trend', thresh(with_gate(Wf, g)), S_)
print('breadth gate open share (2020→):', round(G_BR.loc[START:].mean()*100), '%; all gates:', round(g.loc[START:].mean()*100), '%; IS', round(g.loc[START:IS_END].mean()*100), '% OOS', round(g.loc[OOS:].mean()*100), '%')
pickle.dump(dict(S_=S_, G_BR=G_BR, BREADTH=BREADTH), open(SP + 'alpha21.pkl', 'wb'))
