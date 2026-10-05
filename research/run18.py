import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run17.py').read().split("print('=== BTC timing")[0])
def hyst(sig, enter, exit_):
    out, st = [], 0.0
    for v in sig.fillna(0).values:
        if st <= 0 and v > enter: st = 1.0
        elif st >= 0 and v < -exit_: st = -1.0
        out.append(st)
    return pd.Series(out, index=sig.index)
def run_variant(name, ltpi, trend01):
    ctx.ltpi = ltpi; ctx.trend['btc'] = trend01
    W = S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True); r, t, h = backtest(W, P)
    rr, e = simulate(r.loc[START:], h.loc[START:].abs().sum(axis=1), sd_r, sd_w, rule='band', band=0.10)
    flips = (trend01.loc[START:].diff().abs() > 0.01).sum() / (len(trend01.loc[START:]) / 365)
    line(f'{name} [zmian/rok {flips:.0f}]', rr, e)
base_trend = ctx.trend['btc'].copy()
run_variant('A: obecne', old_lt, base_trend)
lt_h = hyst(lt, 0.2, 0.2)
run_variant('LTPI ensemble + histereza ±0,2', lt_h, base_trend)
mt_s = mt.ewm(span=5, adjust=False).mean()
run_variant('MTPI ensemble wygładzony EMA5 (ciągły)', old_lt, (mt_s + 1) / 2)
mt_h = hyst(mt, 0.2, 0.2)
run_variant('MTPI ensemble + histereza ±0,2 (0/1)', old_lt, (mt_h + 1) / 2)
comb = ((mt_s + 1) / 2 + base_trend) / 2
run_variant('MTPI = średnia(4 średnie, ensemble EMA5)', old_lt, comb)
run_variant('LTPI hist. + MTPI średnia', lt_h, comb)
