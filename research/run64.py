"""42 Macro report ideas (methods only, no report data), price-only, honest protocol: chosen on 2020–23 (portfolio IS
Sharpe +0.03, CAGR not lower, DD not worse > 2 pp); 2024→ reported; SDCA changes also need the 21-start check (run63).
R1 KISS halving of the SDCA BTC holding: cap = vams3(BTC trend) × (0.5 if LTPI<0); when BTC share > cap sell 2%/day
   (rebuy via 'owed' when share < cap and LTPI>0). R1b: same only when valuation risk ≥ 50.
R2 RSPS halving instead of exit when LTPI<0: picks kept at 50% if the gate is open and BTC trend ≥ 0.75.
R4 persistence filter: an LTPI sign change counts only after holding 7 / 15 / 21 days (BTC and $TOTAL).
R6 impulse on $TOTAL (annualised ROC 90 > 180 > 365 = strong +; reversed = strong −): tilt 40/60 only with strong +;
   R6b: strong − blocks RSPS picks."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r61 = open('run61.py').read(); exec(_r61[:_r61.index("chk = sdcaX()")])
TRB = TR['btc'].reindex(price.index).ffill()
def vams3(t): return 1.0 if t >= 0.75 else 0.5 if t >= 0.5 else 0.0
def sdcaK(only_risk=None):
    p_ = price.loc[START:]; rr = risk.reindex(P.index).reindex(p_.index).shift(1); l = LT.reindex(p_.index).shift(1)
    tb = TRB.reindex(p_.index).shift(1); lo = below.reindex(p_.index).shift(1).fillna(False)
    cash, btc, eq, owed, wb = 1.0, 0.0, [], 0.0, []
    for d in p_.index:
        px = p_[d]; rk = rr[d]; ls = l[d]
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate > 0:
            if ls < 0: rate *= 0.25
            if lo[d]: rate *= 2.0
            if rate * 100 <= 1: rate = 0.0
        if rate > 0 and cash > 0: amt = cash * min(rate, 1); cash -= amt; btc += amt * 0.9985 / px; owed = max(0.0, owed - amt)
        elif rate < 0 and btc > 0: q = btc * min(-rate, 1); btc -= q; cash += q * px * 0.9985
        if ls < 0 and np.isfinite(rk) and rk >= 70: q = btc * 0.02; btc -= q; v = q * px * 0.9985; cash += v; owed += v
        elif ls > 0 and owed > 0 and cash > 0: amt = min(owed, cash, owed * 0.2 + 1e-9); cash -= amt; btc += amt * 0.9985 / px; owed -= amt
        # KISS cap on the BTC share
        cap = vams3(tb[d] if np.isfinite(tb[d]) else 0) * (0.5 if ls < 0 else 1.0)
        share = btc * px / (cash + btc * px)
        if (only_risk is None or (np.isfinite(rk) and rk >= only_risk)) and share > cap + 1e-9 and btc > 0:
            q = btc * 0.02; btc -= q; v = q * px * 0.9985; cash += v; owed += v
        eq.append(cash + btc * px); wb.append(btc * px / (cash + btc * px))
    eq = pd.Series(eq, index=p_.index); return eq.pct_change().fillna(0), pd.Series(wb, index=p_.index)
r0 = rs(); base = ev(r0); line('BAZA 2.31', base)
line('R1 KISS: limit BTC w SDCA (trend×LTPI)', ev(r0, sd=sdcaK()))
line('R1b KISS tylko przy ryzyku ≥ 50', ev(r0, sd=sdcaK(50)))
_rs_src = _r61[_r61.index('def rs('):_r61.index('def ev(')] if 'def rs(' in _r61 else open('run60.py').read()
src60 = open('run60.py').read(); rsrc = src60[src60.index('def rs('):src60.index('def ev(')]
exec(rsrc.replace('def rs(', 'def rsH(').replace("if active and bt >= 0.5 and lt:", "half = (not lt) and active and bt >= 0.75\n        if active and bt >= 0.5 and (lt or half):").replace(
  "for a, x in zip(ranked, cw): w[a] = x", "for a, x in zip(ranked, cw): w[a] = x * (0.5 if half else 1.0)"))
line('R2 RSPS połowa zamiast wyjścia (LTPI<0)', ev(rsH()))
LT0, LTT0 = LT.copy(), LT_T.copy()
def persist(s, n):
    s = s.fillna(0); out = []; cur = s.iloc[0]; run = 0; last = s.iloc[0]
    for x in s.values:
        if np.sign(x) != np.sign(last): run = 1; last = x
        else: run += 1
        if np.sign(x) != np.sign(cur) and run >= n: cur = x
        out.append(cur)
    return pd.Series(out, s.index)
for n in (7, 15, 21):
    LT = persist(LT0, n); LT_T = persist(LTT0.reindex(idx), n)
    lt1n = persist(ltt1, n)
    line(f'R4 trwałość zmiany LTPI {n} dni', ev(rs(), sd=sdcaX(), tilt=pd.Series(np.where(lt1n > 0, 0.4, 0.6), idx)))
LT, LT_T = LT0, LTT0
TOTi = TOTp.reindex(idx).ffill()
roc = {L: (TOTi / TOTi.shift(L)) ** (365 / L) - 1 for L in (90, 180, 365)}
imp_pos = (roc[90] > roc[180]) & (roc[180] > roc[365]); imp_neg = (roc[90] < roc[180]) & (roc[180] < roc[365])
line('R6 przechył tylko przy silnym impulsie +', ev(r0, tilt=pd.Series(np.where((ltt1 > 0) & imp_pos, 0.4, 0.6), idx)))
exec(rsrc.replace('def rs(', 'def rsI(').replace("if active and bt >= 0.5 and lt:", "if active and bt >= 0.5 and lt and not bool(imp_neg.iloc[i]):"))
line('R6b silny impuls − blokuje RSPS', ev(rsI()))
