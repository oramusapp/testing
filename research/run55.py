"""Gaps found in the 2026-10-05 notes audit, tested on the 2.24.0 setup (tiered RSPS V5, lookbacks 7/21/42, VAMS BTC,
gold hierarchy, SDCA ×2 below range, tilt 40/60). 2020→, IS 2020–23, OOS 2024→.
L  time coherence of the LTPI (notes: components should work on the same horizon). LTPI on BTC drives the SDCA safety,
   slow buying and the RSPS veto. L1 drop the fast components (Supertrend 50/4, RSI 100, price > SMA 200);
   L2 replace them with slower ones (Supertrend 100/6, RSI 180, price > SMA 365); L3 neutral votes (dead bands) on
   SMA 200 (±3%), RSI 100 (48–52), ROC 180 (±5%).
V  TPI relevance ∝ market-cap share (notes): alt picks are not vetoed by LTPI(BTC) — only BTC/PAXG follow it.
S  SDCA: deploy all leftover cash when LTPI turns positive while valuation risk < 50% (notes: "marriage of LSI and DCA")."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r54 = open('run54.py').read(); exec(_r54[:_r54.index('print(f"małe coiny')])
import tpi as T
def state0(p, spec):
    v, votes = T.tpi(p, spec); return np.sign(v).replace(0, np.nan).ffill().fillna(0), votes
def band(x, lo, hi):   # +1 above hi, −1 below lo, 0 between (neutral vote)
    return pd.Series(np.where(x > hi, 1.0, np.where(x < lo, -1.0, 0.0)), index=x.index)
btcp = df['price']
L = dict(T.LTPI)
L1 = {k: f for k, f in L.items() if k not in ('Supertrend (50, 4)', 'RSI 100 > 50', 'Cena > SMA 200')}
L2 = dict(L1); L2.update({'Supertrend (100, 6)': lambda p: T.supertrend_close(p, 100, 6), 'RSI 180 > 50': lambda p: T.sign(T.rsi(p, 180) - 50), 'Cena > SMA 365': lambda p: T.sign(p - T.sma(p, 365))})
L3 = dict(L); L3.update({'Cena > SMA 200': lambda p: band(p / T.sma(p, 200) - 1, -0.03, 0.03), 'RSI 100 > 50': lambda p: band(T.rsi(p, 100), 48, 52), 'ROC 180 > 0': lambda p: band(p.pct_change(180), -0.05, 0.05)})
def flips(votes): return (votes.loc['2020':].diff().abs() > 0).sum() / (len(votes.loc['2020':]) / 365)
LT0, LT_T0 = LT.copy(), LT_T.copy()
def run_with(lt_series, name, **kw):
    global LT, LT_T
    LT = lt_series.reindex(price.index).ffill().fillna(0) if lt_series is not None else LT0
    LT_T = lt_series.reindex(idx).ffill().fillna(0) if lt_series is not None else LT_T0
    sd = sdca4(); r, _ = rsps_t(mode='tier', core_first=True, **kw)
    m = metrics(sd[0], START)
    print(f"   SDCA CAGR {m['CAGR']*100:.1f} DD {m['MaxDD']*100:.1f} OOS {metrics(sd[0], OOS)['Sharpe']:.2f}")
    show4(name, r, sd=sd)
    LT, LT_T = LT0, LT_T0
for nm, spec in (('L0 LTPI obecne', L), ('L1 bez szybkich składników', L1), ('L2 wolniejsze zamienniki', L2), ('L3 głosy neutralne', L3)):
    st, votes = state0(btcp, spec)
    fl = flips(votes); stf = (st.loc['2020':].diff().abs() > 0).sum() / (len(st.loc['2020':]) / 365)
    print(f"{nm}: zmiany stanu LTPI {stf:.1f}/rok · składniki {fl.min():.1f}–{fl.max():.1f}/rok (rozrzut {fl.max() / max(fl.min(), 0.1):.0f}×)")
    run_with(st if nm != 'L0 LTPI obecne' else None, nm)
# V: alt picks not vetoed by LTPI (relevance ∝ market-cap share)
_src = open('run54.py').read()
exec(_src[_src.index('def rsps_t'):_src.index('def yearly')].replace("def rsps_t(mode='base', ref=False, core_first=False):", "def rsps_v(mode='tier', ref=False, core_first=True):").replace("if active and bt >= 0.5 and lt:", "if active and bt >= 0.5:"))
r, _ = rsps_v(); show4('V  alty bez weta LTPI (ważność ∝ udział)', r)
# S: lump sum of leftover cash when LTPI turns positive at risk < 50%
_s52 = open('run52.py').read()
code = _s52[_s52.index('def sdca4'):_s52.index('def show4')].replace('def sdca4(no_sell=False, up_mult=1.0, yield_=0.0):', 'def sdca5(no_sell=False, up_mult=1.0, yield_=0.0):')
code = code.replace("        if rate > 0 and cash > 0: amt", "        if ls > 0 and prev_ls is not None and prev_ls <= 0 and np.isfinite(rk) and rk < 50 and cash > 0: btc += cash * 0.9985 / px; cash = 0.0\n        prev_ls = ls\n        if rate > 0 and cash > 0: amt")
code = code.replace("cash, btc, eq, wb, owed = 1.0, 0.0, [], [], 0.0", "cash, btc, eq, wb, owed = 1.0, 0.0, [], [], 0.0; prev_ls = None")
exec(code)
sd = sdca5(); m = metrics(sd[0], START)
print(f"   SDCA lump sum: CAGR {m['CAGR']*100:.1f} DD {m['MaxDD']*100:.1f} IS {metrics(sd[0], START, IS_END)['Sharpe']:.2f} OOS {metrics(sd[0], OOS)['Sharpe']:.2f}")
r0, _ = rsps_t(mode='tier', core_first=True)
show4('BAZA 2.24.0', r0)
show4('S  lump sum reszty przy LTPI → +', r0, sd=sd)
