"""$TOTAL proxy: chain-linked, market-cap-weighted index of 45 Coin Metrics assets (incl. USDT, USDC, DAI), so assets
that start or stop reporting do not cause jumps. Before 2013 (BTC dominance ~95%+) it follows BTC.
Level is scaled to the summed market cap on the last day with full data, so it reads in USD."""
import pandas as pd, numpy as np, glob, os
SP = '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/'
def caps():
    out = {}
    for f in glob.glob(SP + 'cm/*.csv'):
        a = os.path.basename(f)[:-4]
        d = pd.read_csv(f, usecols=lambda c: c in ('time', 'CapMrktCurUSD', 'CapMrktEstUSD'), parse_dates=['time']).set_index('time')
        for col in ('CapMrktCurUSD', 'CapMrktEstUSD'):
            if col in d and d[col].notna().sum() > 100: out[a] = d[col]; break
    return pd.DataFrame(out)
def total_index(C=None):
    C = caps() if C is None else C
    C = C.where(C > 0)
    w = C.shift(1); r = C / C.shift(1) - 1
    both = w.notna() & r.notna() & (r.abs() < 3)            # guard against data glitches
    ret = (w.where(both) * r.where(both)).sum(axis=1) / w.where(both).sum(axis=1)
    ret = ret.loc['2010-07-18':].fillna(0)
    lvl = (1 + ret).cumprod()
    full = C.sum(axis=1, min_count=1)
    ref = full.loc[:'2026-04-30'].index[-1]
    return lvl * (full[ref] / lvl[ref])
if __name__ == '__main__':
    T = total_index()
    print(T.loc[['2017-12-17', '2021-11-09', '2022-11-21', '2025-10-06']].map(lambda x: f'{x/1e9:,.0f} mld'))
    print(T.index[-1], T.iloc[-3:])
