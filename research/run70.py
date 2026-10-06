"""Course RSPS token list (37 tokens + CASH, user screenshot) vs the app's list, same rules (2.33): point-in-time top 10 by
30-day liquidity (BTC + 9 alts), strength 14/28/56 vs BTC / 30-day vol, own trend ≥ 0.5, top 3, cap 50%, breadth gate 70/60,
BTC trend ≥ 0.5, LTPI(BTC) veto (coherent, 5-day persistence), BTC 3-state reserve, gold (PAXG) hierarchy; decided t, held t+2,
0.15% per side. Binance daily data (the user trades on Hyperliquid perps: funding not included). Tokens without Binance history
(HYPE, FARTCOIN, MON, LIT, AERO) and earlier days of PUMP/XPL/WLFI/ASTER use Hyperliquid perp candles. XMR Binance data ends 2024-02."""
import numpy as np, pandas as pd, warnings, os
warnings.filterwarnings('ignore')
_r66 = open('run66.py').read(); exec(_r66[:_r66.index("rows = {")])
BN = os.environ.get('BN_DIR', '/tmp/claude-0/-home-user-testing/f5ee9541-1281-5fbe-b5db-d681dbe1bc71/scratchpad/bn')
HL = BN.replace('/bn', '/hl'); HL_ONLY = {'HYPE', 'FARTCOIN', 'MON', 'LIT', 'AERO'}
def load(syms):
    C, Qv = {}, {}
    for s in syms:
        f, fh = f'{BN}/{s}.csv', f'{HL}/{s}.csv'
        d = pd.read_csv(f, parse_dates=['time']).set_index('time') if os.path.exists(f) and s not in HL_ONLY else None
        h = pd.read_csv(fh, parse_dates=['time']).set_index('time') if os.path.exists(fh) else None
        if d is None and h is None: continue
        if d is None: d = h
        elif h is not None: d = pd.concat([h[h.index < d.index[0]], d])   # Hyperliquid perps before the Binance listing
        C[s.lower()] = d['close']; Qv[s.lower()] = d['qvol']
    return pd.DataFrame(C).reindex(idx), pd.DataFrame(Qv).reindex(idx)
COURSE = ['BTC','ETH','SOL','AVAX','BNB','LTC','DOGE','SUI','PEPE','CRV','LINK','XRP','APT','AAVE','WLD','TRX','SHIB','UNI','DOT','ADA','PENDLE','NEAR','ONDO','TAO','ENA','HYPE','FARTCOIN','PAXG','PUMP','XPL','WLFI','ASTER','ZEC','MON','AERO','LIT','XMR']
MEMES = ['DOGE','PEPE','SHIB','PUMP','FARTCOIN']
APPL = ['BTC','ETH','BNB','XRP','SOL','ADA','TRX','LINK','AVAX','DOT','LTC','BCH','XLM','ATOM','NEAR','UNI','AAVE','ETC','ICP','FIL','POL','ALGO','XTZ','VET','HBAR','APT','SUI','TON','ARB','OP','INJ','MANA','PAXG']
def trend4(c):
    return sum((c > c.rolling(L).mean()).astype(float) for L in (20, 50, 100, 200)) / 4
def vams3(t): return 1.0 if t >= 0.75 else 0.5 if t >= 0.5 else 0.0
def run_list(syms, label, universe=10):
    C, Qv = load(syms); C['btc'] = P['btc']; 
    alts = [c for c in C.columns if c not in ('btc', 'paxg')]
    lr = np.log(C[alts].div(C['btc'], axis=0)); vol = np.log(C).diff().rolling(30).std() * np.sqrt(365)
    tr = {c: trend4(C[c]) for c in C.columns}; hist = C.notna().cumsum()
    q30 = Qv[alts].rolling(30).sum().where(hist[alts] >= 91)
    rank = q30.rank(axis=1, ascending=False); E = rank <= universe - 1
    m50 = lr.rolling(50).mean().shift(1)
    cols = list(C.columns); col = {a: j for j, a in enumerate(cols)}
    W = np.zeros((len(idx), len(cols))); active = False
    gp = C['paxg'] if 'paxg' in C else None
    glr = np.log(gp / C['btc']) if gp is not None else None
    gmom = (sum(glr - glr.shift(L) for L in (30, 60, 90)) / 3 > 0) if gp is not None else None
    for i in range(200, len(idx)):
        el = [a for a in alts if bool(E[a].iloc[i])]
        ups = [lr[a].iloc[i] > m50[a].iloc[i] for a in el if np.isfinite(m50[a].iloc[i])]
        b = np.mean(ups) if ups else np.nan
        active = (b >= 0.6 if active else b >= 0.7) if np.isfinite(b) else False
        bt = tr['btc'].iloc[i]; lt = LT_T.iloc[i] > 0; w = {}
        if active and bt >= 0.5 and lt:
            sc = {}
            for a in el:
                v = vol[a].iloc[i]
                vals = [lr[a].iloc[i] - lr[a].iloc[i - L] for L in (14, 28, 56)]
                if v > 0 and not any(np.isnan(vals)): sc[a] = np.mean(vals) / v
            ranked = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and tr[a].iloc[i] >= 0.5][:3]
            if ranked:
                cw = np.minimum(cap_weights([sc[a] / vol[a].iloc[i] for a in ranked], 0.5), 0.5)
                for a, x in zip(ranked, cw): w[a] = x
        rest = 1 - sum(w.values())
        gstrong = gp is not None and np.isfinite(gp.iloc[i]) and tr['paxg'].iloc[i] >= 0.5 and bool(gmom.iloc[i])
        if rest > 1e-9:
            if gstrong: w['paxg'] = rest
            elif lt and vams3(bt) > 0: w['btc'] = rest * vams3(bt)
        for a, x in w.items(): W[i, col[a]] = x
    Wd = pd.DataFrame(W, index=idx, columns=cols)
    r, _, _ = backtest(Wd, C.ffill())
    return r, Wd, C
res = {}
HLOK = ['BTC','ETH','HYPE','XRP','SOL','ADA','AVAX','LTC','NEAR','UNI','AAVE','SUI','ARB','PAXG']
for nm, L in (('lista aplikacji (obecna)', APPL + ['HYPE']), ('aplikacja, tylko handlowalne na HL', HLOK), ('lista z kursu', COURSE), ('lista z kursu bez memów', [s for s in COURSE if s not in MEMES]), ('aplikacja + kurs (suma)', sorted(set(APPL + COURSE)))):
    r, Wd, C = run_list(L, nm); res[nm] = (r, Wd, C)
    a, o, f = metrics(r, START, IS_END), metrics(r, OOS), metrics(r, START)
    SDR, SDW = SDf; r_rs = r; pt = sim(tilt1); pa, po, pf = metrics(pt, START, IS_END), metrics(pt, OOS), metrics(pt, START)
    print(f"{nm:28s} RSPS: CAGR {f['CAGR']*100:6.1f} DD {f['MaxDD']*100:6.1f} IS {a['Sharpe']:.2f} 2024→ {o['Sharpe']:.2f}/{o['CAGR']*100:5.1f}% | PORTFEL: CAGR {pf['CAGR']*100:5.1f} DD {pf['MaxDD']*100:5.1f} IS {pa['Sharpe']:.2f} 2024→ {po['Sharpe']:.2f}/{po['CAGR']*100:5.1f}%", flush=True)
print('\nRok po roku RSPS (%):')
for nm, (r, _, _) in res.items(): print(f"{nm:28s} " + ' '.join(f"{y}:{((1 + r.loc[str(y)]).prod() - 1) * 100:6.0f}" for y in range(2020, 2027)))
# per coin for the course list
r, Wd, C = res['lista z kursu']
held = Wd.shift(2).fillna(0).loc[START:]; R = C.ffill().pct_change().fillna(0).loc[START:]; rb = R['btc']
rows = []
for s in COURSE:
    a = s.lower()
    if a not in C: rows.append((s, 'brak danych', 0, 0, np.nan, np.nan, np.nan, np.nan)); continue
    first = C[a].first_valid_index(); on = held[a] > 0
    ep = (on & ~on.shift(1, fill_value=False)).cumsum().where(on)
    wins = [(1 + g[a]).prod() > (1 + g['btc']).prod() for _, g in R.loc[on, [a, 'btc']].groupby(ep[on])]
    rows.append((s, 'od 2020' if first <= pd.Timestamp(START) else f'od {first.date()}', len(wins), int(on.sum()),
                 (1 + R.loc[on, a]).prod() - 1 if on.any() else np.nan, (1 + rb[on]).prod() - 1 if on.any() else np.nan,
                 np.mean(wins) if wins else np.nan, (held[a] * R[a]).sum()))
d = pd.DataFrame(rows, columns=['token', 'dane', 'wejścia', 'dni', 'coin', 'BTC', 'trafne', 'wkład']).sort_values('wkład', ascending=False)
for _, x in d.iterrows():
    f = lambda v: '' if pd.isna(v) else f"{v*100:+.0f}%"
    print(f"{x.token:8s} {x.dane:14s} wejść {x['wejścia']:3d} dni {x.dni:4d} coin {f(x.coin):>7s} BTC {f(x.BTC):>7s} trafne {'' if pd.isna(x.trafne) else f'{x.trafne*100:.0f}%':>5s} wkład {f(x['wkład']):>6s}")
