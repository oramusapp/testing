import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
exec(open('run14.py').read().split("rs, rexp = sleeves['trend']")[0])
for fb, name in [('trend_ltpi', 'zamknięta bramka → BTC×trend (LTPI<0 → stable)'), ('cash', 'zamknięta bramka → 100% stable')]:
    W = S.rsps(ctx, **KW, fallback=fb, ltpi_veto=True); r, t, h = backtest(W, P)
    rr, e = simulate(r.loc[START:], h.loc[START:].abs().sum(axis=1), sd_r, sd_w, rule='band', band=0.10)
    line(name, rr, e)
    print('   lata:', {y: round(v*100) for y, v in (1 + rr).groupby(rr.index.year).prod().sub(1).items()})
    # portfolio 30d vol distribution for the vol proposal
    v = rr.rolling(30).std() * np.sqrt(365)
    print('   zmienność portfela 30d: mediana', round(v.median()*100), '% ; >60% przez', round((v > 0.6).mean()*100), '% dni')
