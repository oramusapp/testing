"""Split SDCA / RSPS: static 60/40, 50/50, 40/60 vs dynamic tilt by the $TOTAL TPIs (market direction indicator):
more RSPS when $TOTAL LTPI and/or MTPI are positive. RSPS veto and SDCA safety use LTPI on BTC (user choice), parking hybrid.
Rebalance when SDCA share leaves target ±10 pp (target can move with the tilt). 2020→."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run46.py').read(); exec(_t[:_t.index("fmt('BAZA")])
LT_T = S_[('BTC', 0.0, 'L')].reindex(idx).ffill().fillna(0)     # RSPS veto now from BTC LTPI (run() reads LT_T)
LTT = S_[('TOTAL', 0.0, 'L')].reindex(idx).ffill().fillna(0); MTT = S_[('TOTAL', 0.0, 'M')].reindex(idx).ffill().fillna(0)
r_rs, _ = run()
rs_exp = None
def sim(target, band=0.10):
    """target: Series of SDCA target share per day (decided at t, applied from t+1)."""
    d = r_rs.loc[START:].index; sr = SDR.reindex(d).fillna(0); sw = SDW.reindex(d).fillna(0); rr_ = r_rs.reindex(d).fillna(0)
    tg = target.shift(1).reindex(d).ffill().fillna(0.6)
    va, vb, out = tg.iloc[0], 1 - tg.iloc[0], []
    for i, day in enumerate(d):
        tot = va + vb; w = va / tot; t = tg.iloc[i]; cost = 0
        if abs(w - t) > band: cost = abs(w - t) * 0.0015 * 2 * 0.5; va, vb = tot * t, tot * (1 - t)
        t0 = va + vb; va *= 1 + sr.iloc[i]; vb *= 1 + rr_.iloc[i]
        out.append((va + vb) / t0 - 1 - cost)
    return pd.Series(out, d)
def show2(name, r):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    print(f"{name:52s} IS {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS {b['Sharpe']:.2f} CAGR {b['CAGR']*100:5.1f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f}", flush=True)
a, b, f = metrics(r_rs, START, IS_END), metrics(r_rs, OOS), metrics(r_rs, START)
print(f"RSPS (weto LTPI BTC): IS {a['Sharpe']:.2f} OOS {b['Sharpe']:.2f} CAGR {f['CAGR']*100:.1f} DD {f['MaxDD']*100:.1f}")
one = pd.Series(1.0, idx)
for s in (0.7, 0.6, 0.5, 0.4): show2(f'stały podział SDCA {int(s*100)} / RSPS {int(100-s*100)}', sim(one * s))
both = (LTT > 0) & (MTT > 0)
for lo in (0.4, 0.3):
    show2(f'dynamiczny: 60/40, gdy $TOTAL LTPI+ i MTPI+ → {int(lo*100)}/{int(100-lo*100)}', sim(pd.Series(np.where(both, lo, 0.6), idx)))
    show2(f'dynamiczny: 60/40, gdy $TOTAL LTPI+ → {int(lo*100)}/{int(100-lo*100)}', sim(pd.Series(np.where(LTT > 0, lo, 0.6), idx)))
show2('dynamiczny: $TOTAL LTPI+ i MTPI+ → 40/60, oba − → 70/30', sim(pd.Series(np.where(both, 0.4, np.where((LTT < 0) & (MTT < 0), 0.7, 0.6)), idx)))
