"""Masterclass slides: event studies (SentimenTrader / OddStats style). BTC returns after events, overlapping signals
excluded (min 30 days apart), z = (mean − mean of all days) / (sd of all days / √n)."""
import numpy as np, pandas as pd
from sdca import btc_full
p = btc_full()['price'].loc['2013':]
lr = np.log(p).diff()
vol = lr.rolling(30).std() * np.sqrt(365)
def first(mask, gap=90):
    out, last = [], None
    for d in p.index[mask.reindex(p.index).fillna(False).values]:
        if last is None or (d - last).days > gap: out.append(d); last = d
    return out
ev = {
 'Zmienność 30d > 2× mediana roczna (1. raz od 90 d)': first((vol > 2 * vol.rolling(365).median()) & (vol.shift(1) <= 2 * vol.rolling(365).median().shift(1))),
 'Spadek dzienny ≤ −10%': first(lr < np.log(0.9), 30),
 'Nowy szczyt wszech czasów (1. od 90 d)': first(p >= p.cummax(), 90),
 'Przebicie SMA200 w górę': first((p > p.rolling(200).mean()) & (p.shift(1) <= p.rolling(200).mean().shift(1)), 30),
 'Przebicie SMA200 w dół': first((p < p.rolling(200).mean()) & (p.shift(1) >= p.rolling(200).mean().shift(1)), 30),
}
H = {'1 tydz.': 7, '1 mies.': 30, '3 mies.': 90}
for k, dates in ev.items():
    row = []
    for nm, h in H.items():
        f = np.log(p.shift(-h) / p).dropna(); x = f.reindex(dates).dropna()
        z = (x.mean() - f.mean()) / (f.std() / np.sqrt(len(x))) if len(x) > 1 else np.nan
        row.append(f'{nm}: med {np.expm1(x.median())*100:+5.1f}% · {(x>0).mean()*100:3.0f}% · z {z:+.1f}')
    print(f'{k} (n={len(dates)})\n   ' + ' | '.join(row))
