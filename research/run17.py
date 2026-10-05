"""MTPI / LTPI ensembles vs the single-rule versions: signal quality and effect on the full strategy."""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run14.py').read().split("rs, rexp = sleeves['trend']")[0])   # data, ctx, sdca, simulate(), line()
import tpi as T
bt = df['price']                                   # BTC since 2010 (+ Binance extension)
mt, mv = T.tpi(bt, T.MTPI); lt, lv = T.tpi(bt, T.LTPI)
mt, lt = mt.reindex(P.index), lt.reindex(P.index)
old_lt = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
old_mt = ctx.trend['btc'] * 2 - 1
def timing(name, sig):
    w = (sig > 0).astype(float)
    W = S.W_single(ctx, 'btc', w); r = backtest(W, P)[0].loc[START:]
    flips = (w.loc[START:].diff().abs() > 0).sum() / (len(w.loc[START:]) / 365)
    a, b = metrics(r, START, IS_END), metrics(r, OOS)
    print(f"{name:34s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} DD {b['MaxDD']*100:5.1f} | w rynku {w.loc[START:].mean()*100:3.0f}% | zmian/rok {flips:4.1f}")
print('=== BTC timing: long when indicator > 0, else stablecoin (costs incl.)')
timing('LTPI stary (cena > SMA200)', old_lt); timing('LTPI ensemble (10 wskaźników)', lt)
timing('MTPI stary (4 średnie, >0.5)', old_mt); timing('MTPI ensemble (10 wskaźników)', mt)
print('=== agreement between components (avg pairwise corr of votes)')
for n, v in [('MTPI', mv), ('LTPI', lv)]:
    c = v.loc[START:].corr().values; print(n, round((c.sum() - len(c)) / (len(c) ** 2 - len(c)), 2))
print('=== full strategy (SDCA 60 / RSPS 40, band ±10pp, LTPI<0 → RSPS stable)')
def run_variant(name, ltpi, trend01):
    ctx.ltpi = ltpi; ctx.trend['btc'] = trend01
    W = S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True); r, t, h = backtest(W, P)
    rr, e = simulate(r.loc[START:], h.loc[START:].abs().sum(axis=1), sd_r, sd_w, rule='band', band=0.10)
    line(name, rr, e); return rr
base_trend = ctx.trend['btc'].copy()
res = {}
res['A'] = run_variant('A: obecne (SMA200 + 4 średnie)', old_lt, base_trend)
res['B'] = run_variant('B: LTPI ensemble', np.sign(lt).replace(0, -1), base_trend)
res['C'] = run_variant('C: MTPI ensemble (skalowanie BTC)', old_lt, ((mt + 1) / 2))
res['D'] = run_variant('D: oba ensemble', np.sign(lt).replace(0, -1), ((mt + 1) / 2))
pickle.dump(dict(mt=mt, lt=lt, mv=mv, lv=lv, res=res), open(SP + 'tpi.pkl', 'wb'))
