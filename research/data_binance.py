"""Daily closes + quote volume from Binance public market data (data-api.binance.vision), cached as CSV."""
import os, json, time, urllib.request
import pandas as pd
CACHE = os.environ.get('BN_DIR', '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/bn')
HOST = 'https://data-api.binance.vision/api/v3/klines'
# non-meme large/mid caps; Binance USDT pairs
SYMBOLS = ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'TRX', 'LINK', 'AVAX', 'DOT', 'LTC', 'BCH', 'XLM', 'ATOM', 'NEAR',
           'UNI', 'AAVE', 'ETC', 'ICP', 'FIL', 'MATIC', 'POL', 'ALGO', 'XTZ', 'EOS', 'MKR', 'XMR', 'VET', 'HBAR', 'APT',
           'SUI', 'TON', 'ARB', 'OP', 'INJ', 'MANA']

def fetch(sym, start='2018-06-01'):
    os.makedirs(CACHE, exist_ok=True)
    f = f'{CACHE}/{sym}.csv'
    if os.path.exists(f):
        return pd.read_csv(f, parse_dates=['time']).set_index('time')
    t = int(pd.Timestamp(start).timestamp() * 1000); rows = []
    while True:
        url = f'{HOST}?symbol={sym}USDT&interval=1d&limit=1000&startTime={t}'
        try:
            j = json.load(urllib.request.urlopen(url, timeout=30))
        except Exception as e:
            if rows: break
            print(sym, 'error', e); return None
        if not isinstance(j, list) or not j: break
        rows += [(pd.to_datetime(k[0], unit='ms'), float(k[4]), float(k[7])) for k in j]
        if len(j) < 1000: break
        t = j[-1][0] + 86400000; time.sleep(0.2)
    if not rows: return None
    d = pd.DataFrame(rows, columns=['time', 'close', 'qvol']).set_index('time')
    d = d[d.index + pd.Timedelta(days=1) <= pd.Timestamp.now('UTC').tz_localize(None)]  # closed candles only
    d.to_csv(f)
    return d

if __name__ == '__main__':
    for s in SYMBOLS:
        d = fetch(s)
        print(s, None if d is None else (d.index[0].date(), d.index[-1].date(), len(d)))
