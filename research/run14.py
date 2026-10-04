"""Capital rotation: SDCA ↔ RSPS rebalancing rules, where RSPS capital parks when its gate is closed,
and a portfolio-level volatility cap with the remainder in stablecoins."""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
from data2 import load
from engine import backtest, metrics
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding, sdca_equity
import strategies as S
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
P, C, Q = load(); df = btc_full()
df = pd.concat([df, pd.DataFrame({'price': P['btc'].loc[df.index[-1] + pd.Timedelta(days=1):], 'mvrv': np.nan})])
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, Q.rolling(30).mean(), risk)
START, IS_END, OOS, COST = '2020-01-01', '2023-12-31', '2024-01-01', 0.0015
KW = dict(lookback=(30, 60, 90), top=3, conf=0.7, cap=0.5, every=1, exit_conf=0.6)
sd_r, sd_w = sdca_equity(df['price'].reindex(P.index).ffill(), risk.reindex(P.index), start=START)
sd_w = sd_w.reindex(P.index).fillna(0)
ctx.fallback_series = sd_w.shift(1).fillna(0)        # yesterday's SDCA BTC share (known at decision)
sleeves = {}
for fb in ['trend', 'cash', 'series']:
    W = S.rsps(ctx, **KW, fallback=fb)
    r, t, h = backtest(W, P)
    sleeves[fb] = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
def simulate(rs, rexp, sd_r, sd_exp, w_sdca=0.6, rule='yearly', band=0.10, vol_cap=None):
    """Two sub-accounts; returns daily portfolio returns and total market exposure."""
    idx = rs.index
    sd_r, sd_exp = sd_r.reindex(idx).fillna(0), sd_exp.reindex(idx).fillna(0)
    vals = np.array([w_sdca, 1 - w_sdca]); out, expo = [], []
    period = {'monthly': 'MS', 'quarterly': 'QS', 'yearly': 'YS'}.get(rule)
    starts = set(pd.Series(1, idx).resample(period).first().index) if period else set()
    hist = []; scale = 1.0
    for i, d in enumerate(idx):
        tot = vals.sum(); w = vals / tot
        do = (d in starts and i > 0) if period else (rule == 'band' and abs(w[0] - w_sdca) > band)
        cost = 0.0
        if do:
            moved = abs(w[0] - w_sdca)          # fraction of capital moved between sleeves
            ex = (sd_exp.iloc[i] + rexp.iloc[i]) / 2
            cost = moved * ex * COST * 2       # sell in one sleeve, buy in the other
            vals = np.array([w_sdca, 1 - w_sdca]) * tot
        e = (vals[0] * sd_exp.iloc[i] + vals[1] * rexp.iloc[i]) / vals.sum()
        rr = (vals[0] * sd_r.iloc[i] + vals[1] * rs.iloc[i]) / vals.sum()
        if vol_cap:
            new_scale = 1.0
            if len(hist) >= 30:
                v = np.std(hist[-30:]) * np.sqrt(365)
                new_scale = min(1.0, vol_cap / v) if v > 0 else 1.0
            cost += abs(new_scale - scale) * e * COST; scale = new_scale
            rr *= scale; e *= scale
        hist.append((vals[0] * sd_r.iloc[i] + vals[1] * rs.iloc[i]) / vals.sum())
        vals = vals * (1 + np.array([sd_r.iloc[i], rs.iloc[i]]))
        out.append(rr - cost); expo.append(e)
    return pd.Series(out, idx), pd.Series(expo, idx)
def line(n, r, e):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    print(f"{n:44s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} CAGR {b['CAGR']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} Cal {f['Calmar']:.2f} | ekspozycja śr. {e.mean()*100:4.0f}%")
rs, rexp = sleeves['trend']
print('=== 1. rebalance rule (RSPS parks in BTC×trend)')
res = {}
for rule, band in [('none', 0), ('yearly', 0), ('quarterly', 0), ('monthly', 0), ('band', 0.05), ('band', 0.10), ('band', 0.15)]:
    r, e = simulate(rs, rexp, sd_r, sd_w, rule=rule, band=band); res[(rule, band)] = (r, e)
    line(f'{rule}{" ±"+str(int(band*100))+"pp" if rule=="band" else ""}', r, e)
print('=== 2. where RSPS capital parks when the gate is closed (yearly rebalance)')
for fb, name in [('trend', 'BTC × trend (obecnie)'), ('cash', '100% stablecoin'), ('series', 'jak SDCA (udział BTC SDCA)')]:
    r, e = simulate(*sleeves[fb], sd_r, sd_w, rule='yearly'); line(name, r, e)
print('=== 3. portfolio volatility cap (remainder in stablecoins)')
for vc in [None, 0.8, 0.6, 0.5, 0.4]:
    r, e = simulate(rs, rexp, sd_r, sd_w, rule='yearly', vol_cap=vc); line(f'vol cap {vc}', r, e)
r, e = simulate(rs, rexp, sd_r, sd_w, rule='yearly')
print('=== exposure profile of the recommended portfolio (2020-01 … 2026-10)')
print('udział dni z ekspozycją: <25%:', f"{(e<0.25).mean()*100:.0f}%", ' 25-50%:', f"{((e>=0.25)&(e<0.5)).mean()*100:.0f}%", ' 50-75%:', f"{((e>=0.5)&(e<0.75)).mean()*100:.0f}%", ' ≥75%:', f"{(e>=0.75).mean()*100:.0f}%")
print('średnia ekspozycja wg roku:', (e.groupby(e.index.year).mean()*100).round(0).to_dict())
print('SDCA BTC share avg', round(sd_w.loc[START:].mean()*100), '% | RSPS gross avg', round(rexp.mean()*100), '%')
pickle.dump(dict(res=res, e=e, r=r), open(SP + 'rotation.pkl', 'wb'))
