"""Notes ideas on the 2.32 setup (LTPI persistence 5 d), honest protocol (IS 2020–23 rule as run60; 21 starts for SDCA).
T1 time-coherent trend score instead of trend4 (SMA20/50/100/200): candidates price>SMA100/150/200, EMA20>50, EMA30>60,
   ROC60>0, ROC90>0, Donchian 50; keep those with 3–10 flips/yr on BTC 2018–23; (a) BTC sizing+gate only, (b) all coins.
T2 multi-asset LTPI: mean of the 7 coherent LTPI votes on BTC, ETH and $TOTAL (21 votes), persistence 5 d.
T3 faster SDCA safety sell: 5% / 10% per day (now 2%).
T4 one-way barbell: rebalance only when RSPS is above target + 10 pp (excess → SDCA).
T6 exhaustion: MTPI(BTC) ≥ 0.8 within 20 d and 5-day ROC ≤ −0.2 while MTPI > 0 → alt weights × 0.5."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r64 = open('run64.py').read(); exec(_r64[:_r64.index("r0 = rs(); base = ev(r0)")])
exec(_r64[_r64.index('def persist'):_r64.index('for n in (')])
LT0, LTT0 = LT.copy(), LT_T.copy()
LT = persist(LT0, 5); LT_T = persist(LTT0.reindex(idx), 5)
ltt5 = persist(ltt1, 5); tilt5 = pd.Series(np.where(ltt5 > 0, 0.4, 0.6), idx)
tilt1 = tilt5
SDf = sdcaX()
r0 = rs(); base = ev(r0); line('BAZA 2.32', base)
# T1
import tpi as T
def donch(p, n): return T.donchian_state(p, n)
CAND = {'SMA100': lambda p: T.sign(p - T.sma(p, 100)), 'SMA150': lambda p: T.sign(p - T.sma(p, 150)), 'SMA200': lambda p: T.sign(p - T.sma(p, 200)),
        'EMA20>50': lambda p: T.sign(T.ema(p, 20) - T.ema(p, 50)), 'EMA30>60': lambda p: T.sign(T.ema(p, 30) - T.ema(p, 60)),
        'ROC60': lambda p: T.sign(p.pct_change(60)), 'ROC90': lambda p: T.sign(p.pct_change(90)), 'Donchian50': lambda p: donch(p, 50)}
bp = P['btc']; keep = []
for k, f in CAND.items():
    v = f(bp).loc['2018':'2023']; fl = (v.diff().abs() > 0).sum() / (len(v) / 365)
    print(f"  {k}: {fl:.1f} zmian/rok", end=''); 
    if 3 <= fl <= 10: keep.append(k)
print('\n  wybrane:', keep)
def tscore(p): return (sum((CAND[k](p) > 0).astype(float) for k in keep) / len(keep)).where(p.notna())
TR0 = dict(TR)
TR['btc'] = tscore(P['btc']); line('T1a spójny trend dla BTC', ev(rs()))
for a in P.columns: TR[a] = tscore(P[a])
line('T1b spójny trend dla wszystkich coinów', ev(rs()))
TR.clear(); TR.update(TR0)
# T2 multi-asset LTPI
spec = spec_wo(*FAST)
vb = T.tpi(btcp, spec)[0]; ve = T.tpi(P['eth'].dropna(), spec)[0].reindex(btcp.index); vt = T.tpi(TOTp, spec)[0]
vm = pd.concat([vb, ve, vt], axis=1).mean(axis=1)
LTm = persist(np.sign(vm).replace(0, np.nan).ffill().fillna(0), 5)
LT = LTm.reindex(price.index).ffill().fillna(0); LT_T = LTm.reindex(idx).ffill().fillna(0)
line('T2 LTPI z BTC+ETH+$TOTAL', ev(rs(), sd=sdcaX()))
LT = persist(LT0, 5); LT_T = persist(LTT0.reindex(idx), 5)
# T3 faster safety
s61 = open('run61.py').read(); src = s61[s61.index('def sdcaX'):s61.index('chk = sdcaX()')]
exec(src.replace('def sdcaX(buy=1.0, sell=1.0, slow=0.25, prm=2.0):', 'def sdcaF(rate_s=0.02):').replace('buy', '1.0').replace("q = btc * 0.02; btc -= q", "q = btc * rate_s; btc -= q").replace('rate *= 1.0', 'rate *= 1.0').replace('rate *= sell', 'rate *= 1.0').replace('rate *= slow', 'rate *= 0.25').replace('rate *= prm', 'rate *= 2.0'))
for s_ in (0.05, 0.10): line(f'T3 bezpiecznik SDCA {int(s_*100)}%/dzień', ev(r0, sd=sdcaF(s_)))
# T4 one-way barbell
s47 = open('run47.py').read(); simsrc = s47[s47.index('def sim'):s47.index('def show2')]
exec(simsrc.replace('def sim(target, band=0.10):', 'def sim1(target, band=0.10):').replace('if abs(w - t) > band:', 'if (1 - w) - (1 - t) > band:'))
global_sim = sim
def ev1(r):
    global SDR, SDW, r_rs
    SDR, SDW = SDf; r_rs = r; pt = sim1(tilt1)
    return metrics(pt, START, IS_END), metrics(pt, OOS), metrics(pt, START)
line('T4 barbell jednokierunkowy', ev1(r0))
# T6 exhaustion
mv = T.tpi(P['btc'], T.MTPI)[0]
exh = (mv.rolling(20).max() >= 0.8) & ((mv - mv.shift(5)) <= -0.2) & (mv > 0)
src60 = open('run60.py').read(); rsrc = src60[src60.index('def rs('):src60.index('def ev(')]
exec(rsrc.replace('def rs(', 'def rsE(').replace("for a, x in zip(ranked, cw): w[a] = x", "for a, x in zip(ranked, cw): w[a] = x * (0.5 if bool(exh.iloc[i]) else 1.0)"))
line('T6 wyczerpanie MTPI → alty × 0,5', ev(rsE()))
