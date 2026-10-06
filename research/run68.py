"""Per-coin accuracy of RSPS (2.33 setup: pool top 10 by liquidity, 14/28/56, coherent LTPI with 5-day persistence, VAMS BTC,
gold hierarchy). For every coin the app knows: data start, days in the candidate pool, entries, days held, coin vs BTC on the
held days (the decision RSPS makes is 'this coin beats BTC'), share of holding episodes that beat BTC, contribution to the
RSPS return, and buy & hold since 2020 (or since its first day). Weights as executed (decided t, held from t+2)."""
import numpy as np, pandas as pd, warnings
warnings.filterwarnings('ignore')
_r66 = open('run66.py').read(); exec(_r66[:_r66.index("rows = {")])
src60 = open('run60.py').read(); rsrc = src60[src60.index('def rs('):src60.index('def ev(')]
exec(rsrc.replace('def rs(', 'def rsW(').replace("    r, _, _ = backtest(pd.DataFrame(W, index=idx, columns=cols), P2)\n    return r",
                  "    Wd = pd.DataFrame(W, index=idx, columns=cols); r, _, _ = backtest(Wd, P2)\n    return r, Wd"))
r, Wd = rsW()
held = Wd.shift(2).fillna(0).loc[START:]
R = P2.pct_change().fillna(0).loc[START:]
rb = R['btc']
APP = ['ETH','HYPE','BNB','XRP','SOL','ADA','TRX','LINK','AVAX','DOT','LTC','BCH','XLM','ATOM','NEAR','UNI','AAVE','ETC','ICP','FIL','POL','ALGO','XTZ','VET','HBAR','APT','SUI','TON','ARB','OP','INJ','MANA']
elig = ELIG[10].loc[START:]
rows = []
for s in APP:
    a = s.lower()
    if a not in P2.columns:
        rows.append((s, 'brak danych', *[np.nan] * 9)); continue
    first = P2[a].first_valid_index()
    since = max(pd.Timestamp(START), first)
    h = held[a]; on = h > 0
    days = int(on.sum()); inpool = int(elig[a].sum()) if a in elig else 0
    ep = (on & ~on.shift(1, fill_value=False)).cumsum().where(on)
    wins = []; 
    for k, g in R.loc[on, [a, 'btc']].groupby(ep[on]):
        wins.append((1 + g[a]).prod() > (1 + g['btc']).prod())
    coin_h = (1 + R.loc[on, a]).prod() - 1 if days else np.nan
    btc_h = (1 + rb[on]).prod() - 1 if days else np.nan
    contrib = (h * R[a]).sum()                       # sum of weight × daily return (additive approx.)
    px = P2[a].loc[since:].dropna(); bh = px.iloc[-1] / px.iloc[0] - 1
    bb = P2['btc'].loc[px.index[0]:].iloc[-1] / P2['btc'].loc[px.index[0]] - 1
    rows.append((s, ('od 2020' if first <= pd.Timestamp(START) else f'od {first.date()}'), inpool, len(wins), days, coin_h, btc_h,
                 np.mean(wins) if wins else np.nan, contrib, bh, bb))
d = pd.DataFrame(rows, columns=['coin', 'dane', 'dni w puli', 'wejścia', 'dni trzymany', 'coin gdy trzymany', 'BTC w te dni', 'trafne epizody', 'wkład', 'kup i trzymaj', 'BTC ten okres'])
d = d.sort_values('wkład', ascending=False)
pd.set_option('display.width', 250); pd.set_option('display.max_rows', 60)
fmt = d.copy()
for c in ('coin gdy trzymany', 'BTC w te dni', 'kup i trzymaj', 'BTC ten okres', 'wkład'):
    fmt[c] = d[c].map(lambda x: '' if pd.isna(x) else f"{x*100:+.0f}%")
fmt['trafne epizody'] = d['trafne epizody'].map(lambda x: '' if pd.isna(x) else f"{x*100:.0f}%")
print(fmt.to_string(index=False))
tot = d.dropna(subset=['wejścia'])
allw = [w for w in tot['trafne epizody'].dropna()]
print(f"\nRazem: epizodów {int(tot['wejścia'].sum())}; średnia trafność (ważona liczbą epizodów) "
      f"{(tot['trafne epizody'] * tot['wejścia']).sum() / tot['wejścia'].sum() * 100:.0f}%; wkład altów łącznie {tot['wkład'].sum()*100:+.0f}%")
print(f"BTC w RSPS: dni {int((held['btc']>0).sum())}, wkład {(held['btc']*rb).sum()*100:+.0f}%; PAXG: dni {int((held['paxg']>0).sum())}, wkład {(held['paxg']*R['paxg']).sum()*100:+.0f}%")
print("Poza listą aplikacji, ale w danych badań:", [c for c in P2.columns if c.upper() not in APP and c not in ('btc', 'paxg')])
d.to_csv('/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/rsps_per_coin.csv', index=False)
