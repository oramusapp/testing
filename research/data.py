"""Loads Coin Metrics community CSVs into aligned daily price / market-cap panels."""
import pandas as pd, numpy as np, os

CM = os.environ.get('CM_DIR', '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/cm')
# Non-meme, non-stablecoin assets with a real PriceUSD series in Coin Metrics community data.
UNIVERSE = ['btc', 'eth', 'bnb', 'xrp', 'ada', 'link', 'ltc', 'bch', 'xlm', 'etc', 'dot', 'uni',
            'aave', 'algo', 'xmr', 'trx', 'icp', 'xtz', 'eos', 'mkr', 'mana']
EXCLUDED_MEME = ['doge', 'shib', 'pepe', 'wif', 'bonk', 'floki']

def load(start='2018-06-01'):
    px, cap = {}, {}
    for a in UNIVERSE:
        f = f'{CM}/{a}.csv'
        if a == 'btc' and not os.path.exists(f):
            f = f'{CM}/../btc.csv'
        d = pd.read_csv(f, usecols=lambda c: c in ('time', 'PriceUSD', 'CapMrktCurUSD', 'CapMrktEstUSD'), parse_dates=['time']).set_index('time')
        px[a] = pd.to_numeric(d.get('PriceUSD'), errors='coerce')
        c = pd.to_numeric(d.get('CapMrktCurUSD'), errors='coerce') if 'CapMrktCurUSD' in d else None
        if c is None or c.notna().sum() == 0:
            c = pd.to_numeric(d.get('CapMrktEstUSD'), errors='coerce')
        cap[a] = c
    P = pd.DataFrame(px).sort_index().loc[start:]
    C = pd.DataFrame(cap).sort_index().reindex(P.index)
    end = P['btc'].last_valid_index()
    P, C = P.loc[:end], C.loc[:end]
    # stop at the last day where most assets still report (CSV tails can be partial)
    good = P.notna().sum(axis=1)
    last_full = good[good >= good.max() - 2].index[-1]
    return P.loc[:last_full].ffill(limit=3), C.loc[:last_full].ffill(limit=5)

if __name__ == '__main__':
    P, C = load()
    print(P.index[0], P.index[-1], P.shape)
    print(P.loc['2020-01-01'].notna().sum(), 'assets with price on 2020-01-01')
    print(P.apply(lambda s: s.first_valid_index()).sort_values())
