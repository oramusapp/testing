"""Alpha sleeve candidates from the literature vs the current RSPS.

Tested ideas (sources in README):
- time-series trend per coin from an ensemble of Donchian breakouts over many lookbacks, volatility-scaled
  position sizes, rotational universe of the most liquid coins (Zarattini, Pagani & Barbon 2025,
  "Catching Crypto Trends"). The lookbacks/exit/target vol below are ours; the paper text was not reachable.
- time-series vs cross-sectional momentum (Gbadebo 2026; Liu, Tsyvinski & Wu 2022 size/momentum factors).
- hybrid: current RSPS picks, each scaled by its own Donchian-ensemble trend.
"""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run14.py').read().split("rs, rexp = sleeves['trend']")[0])   # data, ctx, sdca, simulate(), line()
from engine import top_n_universe, cap_weights
LBS = (10, 20, 30, 60, 90, 150, 250)

def donchian_state(p, L, exit_frac=1.0):
    """Long-only breakout state: 1 after close > prior L-day high, 0 after close < prior (L*exit_frac)-day low."""
    hi = p.shift(1).rolling(L).max(); lo = p.shift(1).rolling(max(2, int(L * exit_frac))).min()
    st = pd.Series(np.where(p > hi, 1.0, np.where(p < lo, 0.0, np.nan)), index=p.index)
    return st.ffill().fillna(0.0).where(hi.notna())

def don_ens(p, lbs=LBS, exit_frac=0.5):
    return sum(donchian_state(p, L, exit_frac) for L in lbs) / len(lbs)

SIG = {a: don_ens(P[a]) for a in P.columns}
SIG1 = {a: don_ens(P[a], exit_frac=1.0) for a in P.columns}
VOL = {a: np.log(P[a]).diff().ewm(span=30, min_periods=20).std() * np.sqrt(365) for a in P.columns}
Q30 = Q.rolling(30).mean()
ELIG = {n: top_n_universe(Q30, P, n) for n in (10, 15, 20)}

def thresh(W, th=0.02):
    """No-trade band: keep yesterday's weight unless the target moved by more than th."""
    out = np.array(W.values, dtype=float); prev = np.zeros(W.shape[1])
    for i in range(len(out)):
        row = out[i]; ch = np.abs(row - prev) > th
        ch |= (row == 0) & (prev != 0)      # always close fully
        prev = np.where(ch, row, prev); out[i] = prev
    return pd.DataFrame(out, index=W.index, columns=W.columns)

def ts_trend(n=10, tv=0.25, incl_btc=True, sig=SIG, gate=None, max_single=0.25, th=0.02):
    """Each eligible coin: weight = signal × min(max_single, tv/vol)/n·(n/  #coins) … simple risk budget 1/n."""
    E = ELIG[n]; W = pd.DataFrame(0.0, index=P.index, columns=P.columns)
    for a in P.columns:
        if a == 'btc' and not incl_btc: continue
        w = sig[a] * (tv / VOL[a]).clip(upper=max_single * n) / n
        W[a] = w.where(E[a]).fillna(0.0)
    if gate is not None:
        W = W.mul(gate.reindex(P.index).fillna(0), axis=0)
    tot = W.sum(axis=1); W = W.div(tot.clip(lower=1.0), axis=0)           # never above 100%
    return thresh(W, th)

def run(name, W, store=None):
    r, t, h = backtest(W, P)
    a, b, f = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h), metrics(r, START, None, t, h)
    print(f"{name:46s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} CAGR {b['CAGR']*100:5.1f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} | obrót/rok {f['Turnover/yr']:4.1f}x eksp {f['AvgGross']*100:3.0f}%")
    if store is not None: store[name] = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
    return r
S_ = {}
print('=== 1. sleeve alone (costs 0.15%/side), IS 2020–2023, OOS 2024→')
run('BTC kup i trzymaj', S.buy_hold_btc(ctx))
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
run('RSPS obecny (parking stable, veto LTPI)', S.rsps(ctx, **KW, fallback='cash', ltpi_veto=True), S_)
run('RSPS obecny (parking BTC×trend)', S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True), S_)
for n in (10, 15, 20):
    for tv in (0.2, 0.3, 0.4):
        run(f'TS Donchian-ens top{n} tv{int(tv*100)}% (z BTC)', ts_trend(n, tv), S_)
run('TS Donchian-ens top10 tv30% bez BTC', ts_trend(10, 0.3, incl_btc=False), S_)
run('TS Donchian-ens top10 tv30% wyjście=L (nie L/2)', ts_trend(10, 0.3, sig=SIG1), S_)
run('TS top10 tv30% + veto LTPI', ts_trend(10, 0.3, gate=(ctx.ltpi > 0).astype(float)), S_)
run('TS top10 tv30% bez progu transakcji', ts_trend(10, 0.3, th=0.0), S_)
# hybrid: RSPS selection scaled by own Donchian trend
W0 = S.rsps(ctx, **KW, fallback='cash', ltpi_veto=True)
Wh = W0.copy()
for a in P.columns:
    if a != 'btc': Wh[a] = W0[a] * SIG[a].reindex(P.index).fillna(0)
run('Hybryda: RSPS × trend Donchian', thresh(Wh), S_)
pickle.dump(S_, open(SP + 'alpha19.pkl', 'wb'))
