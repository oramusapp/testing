"""Masterclass slides: probabilistic range of outcomes, biased by value and trend.
Forward 90-day BTC returns grouped by SDCA valuation zone (no look-ahead, yearly refit) × LTPI state (10-signal, hysteresis)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
from sdca import btc_full, price_risk_expanding, mvrv_risk_expanding
import tpi as T
df = btc_full(); p = df['price']
risk = ((price_risk_expanding(df, 2014) + mvrv_risk_expanding(df, 2014)) / 2)
lt, _ = T.tpi(p, T.LTPI)
st, s = [], 0.0
for v in lt.fillna(0).values:
    if s <= 0 and v > 0.2: s = 1.0
    elif s >= 0 and v < -0.2: s = -1.0
    st.append(s)
LT = pd.Series(st, index=lt.index)
for H in (30, 90):
    fwd = np.log(p.shift(-H) / p)
    d = pd.DataFrame({'r': fwd, 'risk': risk, 'lt': LT}).loc['2014':].dropna()
    d['val'] = pd.cut(d['risk'], [-1, 30, 70, 101], labels=['tanio <30', 'środek 30–70', 'drogo >70'])
    d['tr'] = np.where(d['lt'] > 0, 'LTPI +', 'LTPI −')
    q = lambda x: pd.Series({'dni': len(x), 'P10': np.exp(x.quantile(.1)) - 1, 'P25': np.exp(x.quantile(.25)) - 1, 'mediana': np.exp(x.median()) - 1,
                             'P75': np.exp(x.quantile(.75)) - 1, 'P90': np.exp(x.quantile(.9)) - 1, '% >0': (x > 0).mean()})
    print(f'=== zwrot po {H} dniach (2014→)')
    print('wszystkie dni:', q(d['r']).round(3).to_dict())
    print(d.groupby(['val', 'tr'])['r'].apply(q).unstack().round(3).to_string())
