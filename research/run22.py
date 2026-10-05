"""SDCA (the safer sleeve) refinements that keep its core: buy BTC in low valuation, sell to stablecoin in high.
Tested add-ons (all lagged one day):
 L1 'bezpiecznik LTPI': when LTPI state < 0 and valuation risk ≥ R, cap the BTC share at `cap` (sell excess 2%/day)
 L2 'wolniejsze zakupy': halve the buy rate while LTPI < 0 (falling-knife damping)
 L3 'lump sum': LTPI turns positive while risk < 40 → deploy the remaining stablecoins over 5 days
 F  funding overlay: 30-day mean perp funding (Binance BTCUSDT) as a z-score shifts risk (contrarian;
    K33 Research: negative 30-day funding historically preceded strong 90-day returns)."""
import numpy as np, pandas as pd, warnings, glob, pickle
warnings.filterwarnings('ignore')
exec(open('run14.py').read().split("sleeves = {}")[0])
import tpi as T
from sdca import curve_rate, DEFAULT_CURVE
FD = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/fund/'
fr = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(FD + '*.csv'))])
fr['t'] = pd.to_datetime(fr['calc_time'], unit='ms').dt.floor('D')
fund = fr.groupby('t')['last_funding_rate'].sum()              # daily funding (sum of 8h prints)
f30 = fund.rolling(30).mean()
fz = ((f30 - f30.expanding(180).mean()) / f30.expanding(180).std()).reindex(P.index)
lt, _ = T.tpi(df['price'], T.LTPI); lt = lt.reindex(P.index)
def hyst(x, h=0.2):
    st, out = 0.0, []
    for v in x.fillna(0).values:
        if st <= 0 and v > h: st = 1.0
        elif st >= 0 and v < -h: st = -1.0
        out.append(st)
    return pd.Series(out, index=x.index)
LT = hyst(lt)
price = df['price'].reindex(P.index).ffill()
def sdca(risk_s, R=None, cap=1.0, slow=1.0, lump=False, cost=0.0015, start=START):
    p = price.loc[start:]; r = risk_s.reindex(p.index).shift(1); l = LT.reindex(p.index).shift(1)
    cash, btc, eq, wb, lump_left, prev_l = 1.0, 0.0, [], [], 0, 0
    for d in p.index:
        px = p[d]; rk = r[d]; ls = l[d]
        rate = curve_rate(DEFAULT_CURVE, rk) if np.isfinite(rk) else 0.0
        if rate > 0 and ls < 0: rate *= slow
        if lump and ls > 0 and prev_l <= 0 and np.isfinite(rk) and rk < 40: lump_left = 5
        if lump_left > 0 and cash > 0:
            rate = max(rate, 1.0 / lump_left); lump_left -= 1
        if rate > 0 and cash > 0:
            amt = cash * min(rate, 1); cash -= amt; btc += amt * (1 - cost) / px
        elif rate < 0 and btc > 0:
            q = btc * -rate; btc -= q; cash += q * px * (1 - cost)
        if R is not None and ls < 0 and np.isfinite(rk) and rk >= R:
            share = btc * px / (cash + btc * px)
            if share > cap:
                q = btc * min(0.02 / share * 1, 1 - cap / share) if False else min(btc * 0.02 / 1, btc * (1 - cap / share))
                btc -= q; cash += q * px * (1 - cost)
        prev_l = ls if np.isfinite(ls) else prev_l
        v = cash + btc * px; eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wb, index=p.index)
def show(n, r, w):
    a, b, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    print(f"{n:44s} IS Sh {a['Sharpe']:.2f} DD {a['MaxDD']*100:5.1f} | OOS Sh {b['Sharpe']:.2f} So {b['Sortino']:.2f} CAGR {b['CAGR']*100:5.1f} DD {b['MaxDD']*100:5.1f} | FULL CAGR {f['CAGR']*100:5.1f} Sh {f['Sharpe']:.2f} DD {f['MaxDD']*100:5.1f} Cal {f['Calmar']:.2f} | BTC śr {w.mean()*100:3.0f}%")
OUT = {}
def go(n, *a, **k):
    r, w = sdca(*a, **k); OUT[n] = (r, w); show(n, r, w)
rk = risk.reindex(P.index)
go('SDCA obecna', rk)
for R in (50, 60, 70):
    for cap in (0.5, 0.3, 0.0):
        go(f'L1 bezpiecznik LTPI: ryzyko≥{R}, maks BTC {int(cap*100)}%', rk, R=R, cap=cap)
go('L2 zakupy ×0,5 przy LTPI<0', rk, slow=0.5)
go('L3 lump sum przy zwrocie LTPI i ryzyku<40', rk, lump=True)
for k in (5, 10):
    for zc in (1.0, 1.5):
        adj = rk + k * fz.clip(-3, 3).where(fz.abs() >= zc, 0).fillna(0)
        go(f'F finansowanie: ±{k} pkt ryzyka gdy |z|≥{zc}', adj)
print('funding z coverage from', fz.first_valid_index().date())
pickle.dump(dict(OUT=OUT, fz=fz, LT=LT), open(SP + 'sdca22.pkl', 'wb'))
