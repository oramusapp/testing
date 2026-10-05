"""On-chain valuation components as extra SDCA composite inputs (SDCA assumptions unchanged: same curve,
same LTPI safety, only the risk input changes). Masterclass valuation lessons: many equally weighted
long-term indicators; peaks decline over cycles (alpha decay) -> every component is detrended against
log-time and ranked against history available before each year (no look-ahead).
Components from Coin Metrics community data: NUPL = 1-1/MVRV, MVRV Z = (MC-RC)/std(MC), Puell =
issuance USD / 365d MA, hash ribbon (30d/60d hash-rate MA); from price: 2-year MA multiplier, Pi Cycle
(111d MA / 2x350d MA)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_t = open('run23.py').read(); exec(_t[:_t.index('OUT = {}; rk')])
from sdca import _x
from scipy.stats import spearmanr
cm = pd.read_csv(SP + 'cm/btc.csv', parse_dates=['time']).set_index('time')
idx = df.index
px = df['price']
mc = cm['CapMrktCurUSD'].reindex(idx); mv = cm['CapMVRVCur'].reindex(idx); rc = mc / mv
iss = cm['IssTotUSD'].reindex(idx); hr = cm['HashRate'].reindex(idx)
RAW = {
    'NUPL': (1 - 1 / mv).ewm(span=7).mean(),
    'MVRV Z': ((mc - rc) / mc.expanding(365).std()).ewm(span=7).mean(),
    'Puell': np.log(iss / iss.rolling(365).mean()).ewm(span=7).mean(),
    '2Y MA': np.log(px / px.rolling(730).mean()),
    'Pi Cycle': np.log(px.rolling(111).mean() / (2 * px.rolling(350).mean())),
    'Hash ribbon': np.log(hr.rolling(30).mean() / hr.rolling(60).mean()),
}
def pct_expanding(s, detrend=True, first_year=2015):
    """Percentile 0-100 vs history before Jan 1 of each year; optional log-time linear detrend."""
    out = pd.Series(np.nan, index=s.index)
    for yr in range(first_year, idx[-1].year + 1):
        tr = s[(s.index < f'{yr}-01-01') & (s.index >= '2011-01-01')].dropna()
        seg = s[(s.index >= f'{yr}-01-01') & (s.index < f'{yr+1}-01-01')]
        if len(tr) < 365 or seg.empty: continue
        if detrend:
            X = _x(tr.index)[:, :2]; b = np.linalg.lstsq(X, tr.values, rcond=None)[0]
            h = np.sort(tr.values - X @ b); v = seg.values - _x(seg.index)[:, :2] @ b
        else:
            h = np.sort(tr.values); v = seg.values
        out.loc[seg.index] = np.where(np.isfinite(v), np.searchsorted(h, v) / len(h) * 100, np.nan)
    return out
PR, MR = price_risk_expanding(df, 2015), mvrv_risk_expanding(df, 2015)
RISK = {'Cena (model)': PR, 'MVRV (obecny)': MR}
for k, s in RAW.items():
    RISK[k] = pct_expanding(s, True); RISK[k + ' bez detrendu'] = pct_expanding(s, False)
fwd = np.log(px.shift(-365) / px)
print('=== 1. predictive power: Spearman(risk, next 365d log return), 2015→ (expanding, no look-ahead); more negative = better')
print(f"{'składnik':30s} {'2015-19':>8s} {'2020-23':>8s} {'2015-25':>8s}")
for k, r in RISK.items():
    row = []
    for a, b in (('2015', '2019'), ('2020', '2023'), ('2015', '2025')):
        m = pd.concat([r.loc[a:b], fwd.loc[a:b]], axis=1).dropna()
        row.append(spearmanr(m.iloc[:, 0], m.iloc[:, 1])[0] if len(m) > 100 else np.nan)
    print(f"{k:30s} " + ' '.join(f'{x:8.2f}' for x in row))
print('\n=== correlation with the current composite (redundancy), 2015→')
base = (PR + MR) / 2
for k in RAW: print(f"{k:14s} ρ={spearmanr(*pd.concat([RISK[k], base], axis=1).dropna().values.T)[0]:.2f}")
print('\n=== 2. SDCA with LTPI safety, risk input = equal-weight composite (IS 2020-23 / OOS 2024→)')
def comp(keys): return pd.concat([RISK[k] for k in keys], axis=1).mean(axis=1, skipna=False)
VARS = {'Obecny: cena + MVRV': ['Cena (model)', 'MVRV (obecny)']}
for k in RAW: VARS[f'+ {k}'] = ['Cena (model)', 'MVRV (obecny)', k]
VARS['+ MVRV Z + Puell'] = ['Cena (model)', 'MVRV (obecny)', 'MVRV Z', 'Puell']
VARS['+ MVRV Z + 2Y MA'] = ['Cena (model)', 'MVRV (obecny)', 'MVRV Z', '2Y MA']
VARS['Długoterminowe: cena, MVRV, MVRV Z, NUPL, 2Y MA'] = ['Cena (model)', 'MVRV (obecny)', 'MVRV Z', 'NUPL', '2Y MA']
VARS['Wszystkie 8'] = ['Cena (model)', 'MVRV (obecny)'] + list(RAW)
for n, ks in VARS.items():
    show(n, *sdca2(comp(ks).reindex(P.index)))
print('\n=== 3. alpha decay: current MVRV component detrended vs raw NUPL rank (lecture: NUPL "should theoretically be resistant to alpha decay")')
RISK['NUPL surowy'] = RISK['NUPL bez detrendu']
for n, ks in {'cena + NUPL surowy (zamiast MVRV detrend)': ['Cena (model)', 'NUPL surowy'],
              'cena + MVRV + NUPL surowy': ['Cena (model)', 'MVRV (obecny)', 'NUPL surowy'],
              'cena + MVRV Z surowy': ['Cena (model)', 'MVRV Z bez detrendu']}.items():
    show(n, *sdca2(comp(ks).reindex(P.index)))
