"""Masterclass slides on fit quality: underfitted / good fit / overfitted, polynomial degree.
SDCA price model = quantile regression of log10 price on a polynomial in log10(days since genesis).
Degree 1 = power law (straight line on log-log), 2 = current, 3 = more flexible. Refit every January on past data only."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
exec(open('run23.py').read().split("OUT = {}; rk")[0])
_s = open('run14.py').read(); exec('def simulate' + _s.split('def simulate')[1].split("rs, rexp = sleeves['trend']")[0])
import sdca as SD
def Xd(idx, deg):
    t = np.log10(np.maximum((idx - SD.GENESIS).days.values, 1)); return np.column_stack([t ** k for k in range(deg + 1)])
def price_risk(deg, first_year=2016):
    out = pd.Series(np.nan, index=df.index); oos_err = []
    for yr in range(first_year, df.index[-1].year + 1):
        tr = df[df.index < f'{yr}-01-01']; X, y = Xd(tr.index, deg), np.log10(tr['price'].values)
        betas = np.array([SD.quantreg(X, y, t) for t in SD.TAUS])
        seg = df[(df.index >= f'{yr}-01-01') & (df.index < f'{yr+1}-01-01')]
        if seg.empty: continue
        rails = np.sort(Xd(seg.index, deg) @ betas.T, axis=1); lp = np.log10(seg['price'].values)
        out[seg.index] = [np.interp(v, r, SD.TAUS, left=0.0, right=1.0) * 100 for v, r in zip(lp, rails)]
        med = rails[:, list(SD.TAUS).index(0.5)]; oos_err.append(np.mean(np.abs(lp - med)))   # next-year error of the median rail
        # calibration: share of next-year days below the 10% / above the 90% rail
    return out, np.mean(oos_err)
mv = mvrv_risk_expanding(df)
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
W = S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True); r, t, h = backtest(W, P); rs = (r.loc[START:], h.loc[START:].abs().sum(axis=1))
for deg, name in [(1, 'stopień 1 · prawo potęgowe'), (2, 'stopień 2 · obecny'), (3, 'stopień 3')]:
    pr, err = price_risk(deg)
    x = pr.loc['2016':]; below, above = (x < 10).mean(), (x > 90).mean()
    print(f'--- {name}: błąd mediany w kolejnym roku (log10) {err:.3f}; dni < 10% rail {below*100:.0f}% (oczekiwane ~10%), > 90% rail {above*100:.0f}% (~10%); ryzyko dziś {pr.iloc[-1]:.0f}%')
    sr, sw = sdca2(((pr + mv) / 2).reindex(P.index), 70, 0.0, True); show(f'SDCA {name}', sr, sw)
    rr, e = simulate(*rs, sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10); line(f'  portfel 60/40', rr, e)
p1, _ = price_risk(1); p2, _ = price_risk(2)
sr, sw = sdca2((((p1 + p2) / 2 + mv) / 2).reindex(P.index), 70, 0.0, True); show('SDCA średnia stopni 1 i 2', sr, sw)
rr, e = simulate(*rs, sr, sw.reindex(P.index).fillna(0), rule='band', band=0.10); line('  portfel 60/40', rr, e)
