"""SDCA safety (LTPI) with buy-back: what the safety sold is bought back when LTPI turns positive again
(only the safety's own sales; the valuation curve stays as is). Then the full portfolio SDCA 60 / RSPS 40."""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run22.py').read().split("OUT = {}")[0])
def sdca2(risk_s, R=70, cap=0.0, rebuy=True, cost=0.0015, start=START):
    p = price.loc[start:]; r = risk_s.reindex(p.index).shift(1); l = LT.reindex(p.index).shift(1)
    cash, btc, eq, wb, owed = 1.0, 0.0, [], [], 0.0      # owed: stablecoins raised by the safety
    for d in p.index:
        px = p[d]; rk = r[d]; ls = l[d]
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate > 0 and cash > 0:
            amt = cash * min(rate, 1); cash -= amt; btc += amt * (1 - cost) / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0:
            q = btc * -rate; btc -= q; cash += q * px * (1 - cost); owed *= (btc / (btc + q)) if btc + q > 0 else 0
        if R is not None and ls < 0 and np.isfinite(rk) and rk >= R:
            share = btc * px / (cash + btc * px)
            if share > cap:
                q = min(btc * 0.02, btc * (1 - cap / share)); btc -= q; v = q * px * (1 - cost); cash += v; owed += v
        elif rebuy and ls > 0 and owed > 0 and cash > 0:
            amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * (1 - cost) / px; owed -= amt
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wb, index=p.index)
_s = open('run14.py').read(); exec('def simulate' + _s.split('def simulate')[1].split("rs, rexp = sleeves['trend']")[0])
OUT = {}; rk = risk.reindex(P.index)
OUT['SDCA obecna'] = sdca(rk); show('SDCA obecna', *OUT['SDCA obecna'])
for R in (60, 70):
    for cap in (0.5, 0.0):
        for rb in (False, True):
            n = f'Bezpiecznik R≥{R} maks {int(cap*100)}%{" + odkup przy LTPI>0" if rb else ""}'
            OUT[n] = sdca2(rk, R, cap, rb); show(n, *OUT[n])
print('=== full portfolio SDCA 60 / RSPS 40 (band ±10pp, RSPS with LTPI veto)')
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
SL = {}
for fb in ('cash', 'trend_ltpi'):
    W = S.rsps(ctx, **KW, fallback=fb, ltpi_veto=True); r, t, h = backtest(W, P); SL[fb] = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
PF = {}
for sn in ['SDCA obecna', 'Bezpiecznik R≥70 maks 0% + odkup przy LTPI>0', 'Bezpiecznik R≥70 maks 50% + odkup przy LTPI>0', 'Bezpiecznik R≥70 maks 0%']:
    sr, sw = OUT[sn]
    for fb, fn in (('cash', 'RSPS parking stable'), ('trend_ltpi', 'RSPS parking BTC×trend')):
        rr, e = simulate(*SL[fb], sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10)
        PF[(sn, fb)] = (rr, e); line(f'{sn[:30]} | {fn}', rr, e)
pickle.dump(dict(OUT=OUT, PF=PF, SL=SL), open(SP + 'sdca23.pkl', 'wb'))
