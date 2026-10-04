import numpy as np, pandas as pd, warnings, pickle, json
warnings.filterwarnings('ignore')
from data import load
from engine import backtest, metrics, ADF_5PCT
import strategies as S
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
F = pickle.load(open(SP + 'final.pkl', 'rb'))
P, C = load(); df = btc_full()
risk = (price_risk_expanding(df) + mvrv_risk_expanding(df)) / 2
ctx = S.Ctx(P, C, risk)
START, IS_END, OOS = '2020-01-01', '2023-12-31', '2024-01-01'
def blend_rebal(parts):
    rets = pd.concat([r for _, r in parts], axis=1).fillna(0); w0 = np.array([a for a, _ in parts]); vals = w0.copy(); out = []
    starts = set(rets.resample('YS').first().index)
    for d, row in rets.iterrows():
        if d in starts and d != rets.index[0]: vals = w0 * vals.sum()
        prev = vals.sum(); vals = vals * (1 + row.values); out.append(vals.sum() / prev - 1)
    return pd.Series(out, index=rets.index)
ew = backtest(S.equal_weight(ctx), P)[0].loc[START:]
short_v = backtest(S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5, short_k=3, short_gross=0.3), P)[0].loc[START:]
base = S.rsps(ctx, lookback=90, top=3, conf=0.7, cap=0.5)
t = ctx.trend['btc'].fillna(0); boost = ((t == 1) & (ctx.adf > ADF_5PCT) & (base['btc'] > 0.99)).astype(float)
W = base.copy(); W['btc'] = W['btc'] * (1 + boost); lev_r = backtest(W, P)[0].loc[START:]
combo = blend_rebal([(0.5, F['sd_r']), (0.5, F['rsps_r'])])
combo_lev = blend_rebal([(0.5, F['sd_r']), (0.5, lev_r)])
combo_short = blend_rebal([(0.5, F['sd_r']), (0.5, short_v)])
series = {
 'btc': ('BTC buy & hold', F['btc_r']), 'ew': ('Top 10 równe wagi', ew), 'sdca': ('SDCA (krzywa)', F['sd_r']),
 'trend': ('BTC trend', F['trend_r']), 'rsps': ('RSPS bramka 0,7', F['rsps_r']),
 'combo': ('SDCA 50% + RSPS 50%', combo), 'combo_lev': ('… + dźwignia BTC 2×', combo_lev), 'combo_short': ('… + short alty 30%', combo_short)}
out = {'metrics': {}, 'equity': {}, 'dd': {}, 'years': {}}
for k, (name, r) in series.items():
    r = r.loc[:'2026-05-23']
    out['metrics'][k] = {'name': name, **{p: {m: float(v) for m, v in metrics(r, *rng).items()} for p, rng in [('IS', (START, IS_END)), ('OOS', (OOS, None)), ('FULL', (START, None))]}}
    eq = (1 + r).cumprod(); dd = eq / eq.cummax() - 1
    wk = eq.resample('W').last(); out['equity'][k] = [round(float(x), 4) for x in wk.values]
    out['dd'][k] = [round(float(x), 4) for x in dd.resample('W').min().values]
    out['years'][k] = {str(y): float(v) for y, v in (1 + r).groupby(r.index.year).prod().sub(1).items()}
out['dates'] = [d.strftime('%Y-%m-%d') for d in (1 + F['btc_r']).cumprod().resample('W').last().index]
json.dump(out, open(SP + 'report_data.json', 'w'))
for k, v in out['metrics'].items(): print(f"{v['name']:24s} FULL CAGR {v['FULL']['CAGR']*100:6.1f} Sh {v['FULL']['Sharpe']:.2f} DD {v['FULL']['MaxDD']*100:6.1f} Cal {v['FULL']['Calmar']:.2f} | OOS CAGR {v['OOS']['CAGR']*100:5.1f} Sh {v['OOS']['Sharpe']:.2f} DD {v['OOS']['MaxDD']*100:5.1f}")
print(json.dumps(out['years']['combo'])); print(json.dumps(out['years']['btc']))
