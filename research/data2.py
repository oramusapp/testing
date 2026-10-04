"""Panel from Binance daily closes (prices, liquidity) + Coin Metrics market caps (ranking)."""
import pandas as pd, numpy as np, os
from data_binance import fetch, SYMBOLS
CM = os.environ.get('CM_DIR', '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/cm')

def _cap(sym):
    f = f'{CM}/{sym.lower()}.csv'
    if not os.path.exists(f):
        return None
    d = pd.read_csv(f, usecols=lambda c: c in ('time', 'CapMrktCurUSD', 'CapMrktEstUSD'), parse_dates=['time']).set_index('time')
    c = pd.to_numeric(d.get('CapMrktCurUSD'), errors='coerce') if 'CapMrktCurUSD' in d else None
    if c is None or c.notna().sum() < 100:
        c = pd.to_numeric(d.get('CapMrktEstUSD'), errors='coerce') if 'CapMrktEstUSD' in d else None
    return c

def load(start='2018-06-01'):
    px, qv, cap = {}, {}, {}
    for s in SYMBOLS:
        if s in ('MATIC', 'POL'):
            continue
        d = fetch(s)
        if d is None: continue
        px[s.lower()], qv[s.lower()] = d['close'], d['qvol']
        cap[s.lower()] = _cap(s)
    # MATIC → POL migrated 1:1 in Sept 2024: one continuous series
    m, p = fetch('MATIC'), fetch('POL')
    px['pol'] = pd.concat([m['close'], p['close']]).groupby(level=0).last()
    qv['pol'] = pd.concat([m['qvol'], p['qvol']]).groupby(level=0).last()
    cm = _cap('MATIC'); cp = _cap('POL')
    cap['pol'] = pd.concat([x for x in (cm, cp) if x is not None]).groupby(level=0).last() if (cm is not None or cp is not None) else None
    P = pd.DataFrame(px).sort_index().loc[start:]
    idx = P.index
    P = P.ffill(limit=2)
    # a delisted pair stops: after its last real close it is no longer tradable
    for c in P.columns:
        last = pd.DataFrame(px)[c].last_valid_index()
        P.loc[P.index > last, c] = np.nan
    Q = pd.DataFrame(qv).reindex(idx)
    C = pd.DataFrame({k: (v.reindex(idx) if v is not None else pd.Series(np.nan, index=idx)) for k, v in cap.items()})
    C = C.ffill(limit=150)          # Coin Metrics ends 2026-05; carry last cap for ranking only
    return P, C, Q

if __name__ == '__main__':
    P, C, Q = load()
    print(P.shape, P.index[0].date(), P.index[-1].date())
    print('assets with cap data:', C.notna().any().sum(), 'missing cap:', [c for c in C if C[c].notna().sum() == 0])
    d = pd.Timestamp('2021-06-01'); print('top10 cap', C.loc[d].where(P.loc[d].notna()).nlargest(10).index.tolist())
    print('top10 liq', Q.rolling(30).mean().loc[d].where(P.loc[d].notna()).nlargest(10).index.tolist())
