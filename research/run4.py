import numpy as np, pandas as pd, warnings, itertools, pickle
from scipy import stats
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding, sdca_equity
import strategies as S
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
def line(name, r, t=None, h=None):
    a, b, f = metrics(r, START, IS_END, t, h), metrics(r, OOS, None, t, h), metrics(r, START, None, t, h)
    print(f"{name:44s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f}% | OOS CAGR {b['CAGR']*100:5.1f}% Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f}% | FULL CAGR {f['CAGR']*100:5.1f}% Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f}% Cal {f['Calmar']:.2f} DDd {f['DDdays']}")
    return dict(IS=a, OOS=b, FULL=f)
out = {}
print('--- gate beyond grid edge (lb 90, top 3, cap .5)')
for conf in [0.7, 0.8, 0.9]:
    W = S.rsps(ctx, lookback=90, top=3, conf=conf, cap=0.5); r, t, h = backtest(W, P); out[f'rsps{conf}'] = line(f'RSPS conf {conf}', r.loc[START:], t, h)
print('--- cost sensitivity (RSPS 90/3/0.7/0.5)')
W = S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5)
for c in [0.0015, 0.003, 0.005]:
    r, t, h = backtest(W, P, cost=c); line(f'RSPS cost {c*100:.2f}%/side', r.loc[START:], t, h)
rsps_r, _, rsps_h = backtest(W, P); rsps_r = rsps_r.loc[START:]
btc_r = backtest(S.buy_hold_btc(ctx), P)[0].loc[START:]
sd_r, sd_w = sdca_equity(df['price'].reindex(P.index).ffill(), risk.reindex(P.index), start=START)
trend_r = backtest(S.btc_trend(ctx), P)[0].loc[START:]
print('--- combos: separate sub-accounts, fixed initial split')
def blend(parts):
    eq = sum(a * (1 + r).cumprod() for a, r in parts)
    return eq.pct_change().fillna(eq.iloc[0] - 1)
combos = {}
for a in [1.0, 0.7, 0.5, 0.3, 0.0]:
    rr = blend([(a, sd_r), (1 - a, rsps_r)]); combos[a] = rr; out[f'combo{a}'] = line(f'SDCA {int(a*100)}% + RSPS {int((1-a)*100)}%', rr)
rr = blend([(0.5, sd_r), (0.5, trend_r)]); line('SDCA 50% + BTC trend 50%', rr)
print('--- annual rebalancing between sleeves (50/50)')
def blend_rebal(parts, freq='YS'):
    rets = pd.concat([r for _, r in parts], axis=1).fillna(0); w0 = np.array([a for a, _ in parts])
    vals = w0.copy(); out = []
    starts = set(rets.resample(freq).first().index)
    for d, row in rets.iterrows():
        if d in starts and d != rets.index[0]:
            tot = vals.sum(); vals = w0 * tot
        prev = vals.sum(); vals = vals * (1 + row.values); out.append(vals.sum() / prev - 1)
    return pd.Series(out, index=rets.index)
rr = blend_rebal([(0.5, sd_r), (0.5, rsps_r)]); out['combo_rebal'] = line('SDCA 50/RSPS 50, roczny rebalans', rr)
print('--- correlation of daily returns'); print(pd.concat([sd_r, rsps_r, btc_r, trend_r], axis=1, keys=['SDCA', 'RSPS', 'BTC', 'trend']).corr().round(2))
# Probabilistic / deflated Sharpe (Bailey & López de Prado)
def psr(r, sr_bench=0.0):
    sr = r.mean() / r.std(); n = len(r); g3 = stats.skew(r); g4 = stats.kurtosis(r, fisher=False)
    return stats.norm.cdf((sr - sr_bench) * np.sqrt(n - 1) / np.sqrt(1 - g3 * sr + (g4 - 1) / 4 * sr ** 2))
def dsr(r, trials_sr):
    N = len(trials_sr); v = np.var(trials_sr); e = 0.5772156649
    sr0 = np.sqrt(v) * ((1 - e) * stats.norm.ppf(1 - 1 / N) + e * stats.norm.ppf(1 - 1 / (N * np.e)))
    return psr(r, sr0)
grid = pickle.load(open(SP + 'rsps_rets.pkl', 'rb'))
trial_sr = np.array([g.loc[:IS_END].mean() / g.loc[:IS_END].std() for g in grid.values()])
print('--- statistical tests (daily Sharpe, IS = design period, OOS = test period)')
for name, r in [('BTC B&H', btc_r), ('SDCA', sd_r), ('RSPS 90/3/0.7', rsps_r), ('SDCA50+RSPS50', combos[0.5])]:
    print(f"{name:18s} PSR(SR>0) IS {psr(r.loc[:IS_END]):.3f} OOS {psr(r.loc[OOS:]):.3f} | PSR(SR>BTC) OOS {psr(r.loc[OOS:], btc_r.loc[OOS:].mean()/btc_r.loc[OOS:].std()):.3f}")
print(f"RSPS deflated Sharpe (IS, {len(trial_sr)} trials): {dsr(rsps_r.loc[:IS_END], trial_sr):.3f}")
pickle.dump(dict(out=out, sd_r=sd_r, rsps_r=rsps_r, btc_r=btc_r, trend_r=trend_r, combos=combos, sd_w=sd_w, rsps_h=rsps_h), open(SP + 'final.pkl', 'wb'))
