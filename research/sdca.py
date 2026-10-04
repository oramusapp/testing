"""SDCA valuation risk without look-ahead: quantile rails refit every January on data
available up to that date (BTC history since 2010), plus expanding-window MVRV percentile."""
import numpy as np, pandas as pd, json, os
from engine import DAYS

TAUS = np.array([0.01,0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9,0.95,0.99])
GENESIS = pd.Timestamp('2009-01-03')
DEFAULT_CURVE = np.array([10,10,10,10,5,0,0,0,0,0,0,0,0,0,0,0,0,-0.5,-2,-4,-10], float)

def btc_full():
    j = json.load(open(os.path.join(os.path.dirname(__file__), '../oramus/src/data-btc.json')))
    df = pd.DataFrame(j['rows'], columns=['time', 'price', 'mvrv'])
    df['time'] = pd.to_datetime(df['time'])
    return df.set_index('time')

def _x(idx):
    t = np.log10(np.maximum((idx - GENESIS).days.values, 1))
    return np.column_stack([np.ones_like(t), t, t * t])

def quantreg(X, y, tau, iters=60):
    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    for _ in range(iters):
        r = y - X @ beta
        w = np.where(r >= 0, tau, 1 - tau) / np.maximum(np.abs(r), 1e-4)
        Xw = X * w[:, None]
        beta = np.linalg.solve(X.T @ Xw, Xw.T @ y)
    return beta

def price_risk_expanding(df, first_year=2019):
    """Risk 0-100 for each day, using the model fitted on data before Jan 1 of that day's year."""
    out = pd.Series(np.nan, index=df.index)
    for yr in range(first_year, df.index[-1].year + 1):
        train = df[df.index < f'{yr}-01-01']
        X, y = _x(train.index), np.log10(train['price'].values)
        betas = np.array([quantreg(X, y, t) for t in TAUS])
        seg = df[(df.index >= f'{yr}-01-01') & (df.index < f'{yr+1}-01-01')]
        if seg.empty:
            continue
        rails = np.sort(_x(seg.index) @ betas.T, axis=1)
        lp = np.log10(seg['price'].values)
        risk = np.array([np.interp(v, r, TAUS, left=np.nan, right=np.nan) for v, r in zip(lp, rails)])
        lo = lp < rails[:, 0]; hi = lp > rails[:, -1]
        risk[lo] = np.maximum(0, TAUS[0] + (lp[lo] - rails[lo, 0]) * (TAUS[1]-TAUS[0]) / (rails[lo, 1]-rails[lo, 0]))
        risk[hi] = np.minimum(1, TAUS[-1] + (lp[hi] - rails[hi, -1]) * (TAUS[-1]-TAUS[-2]) / (rails[hi, -1]-rails[hi, -2]))
        out.loc[seg.index] = risk * 100
    return out

def mvrv_risk_expanding(df, first_year=2019):
    """Detrended log-MVRV (7d EMA) percentile vs. history available before each year."""
    m = df['mvrv'].ffill().ewm(span=7).mean()
    out = pd.Series(np.nan, index=df.index)
    for yr in range(first_year, df.index[-1].year + 1):
        train = m[(m.index < f'{yr}-01-01') & (m > 0) & (m.index >= '2011-01-01')]
        X = _x(train.index)[:, :2]
        beta = np.linalg.lstsq(X, np.log(train.values), rcond=None)[0]
        hist_resid = np.sort(np.log(train.values) - X @ beta)
        seg = m[(m.index >= f'{yr}-01-01') & (m.index < f'{yr+1}-01-01')]
        if seg.empty:
            continue
        resid = np.log(seg.values) - _x(seg.index)[:, :2] @ beta
        out.loc[seg.index] = np.searchsorted(hist_resid, resid) / len(hist_resid) * 100
    return out

def curve_rate(curve, risk):
    return np.interp(np.clip(risk, 0, 100), np.arange(0, 101, 5), curve) / 100

def sdca_equity(price, risk, curve=DEFAULT_CURVE, start='2020-01-01', cost=0.0015):
    """Daily curve DCA from 100% cash. Trades at next close (one-day lag). Returns daily
    returns of the portfolio and the BTC weight path."""
    p = price.loc[start:]
    r = risk.reindex(p.index).shift(1)            # yesterday's risk → today's trade
    cash, btc = 1.0, 0.0
    eq, wbtc = [], []
    for d in p.index:
        px = p[d]
        rate = curve_rate(curve, r[d]) if np.isfinite(r[d]) else 0.0
        if rate > 0 and cash > 0:
            amt = cash * rate; cash -= amt; btc += amt * (1 - cost) / px
        elif rate < 0 and btc > 0:
            q = btc * -rate; btc -= q; cash += q * px * (1 - cost)
        v = cash + btc * px
        eq.append(v); wbtc.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wbtc, index=p.index)

def sdca_equity_v2(price, risk, trend=None, vol=None, curve=DEFAULT_CURVE, start='2020-01-01', cost=0.0015,
                   buy_gate=None, sell_gate=None, vol_ref=None, reserve_floor=0.0):
    """SDCA variants (all signals lagged one day):
    buy_gate: only buy when BTC trend ensemble ≥ buy_gate (avoid catching falling knives)
    sell_gate: only sell when trend ensemble ≤ sell_gate (let winners run while trend is intact)
    vol_ref: scale daily buy/sell rate by vol_ref / realised vol, capped at 1 (volatility management)"""
    p = price.loc[start:]
    r = risk.reindex(p.index).shift(1)
    tr = trend.reindex(p.index).shift(1) if trend is not None else None
    vl = vol.reindex(p.index).shift(1) if vol is not None else None
    cash, btc, eq, wb = 1.0, 0.0, [], []
    for d in p.index:
        px = p[d]
        rate = curve_rate(curve, r[d]) if np.isfinite(r[d]) else 0.0
        if vol_ref and vl is not None and np.isfinite(vl[d]) and vl[d] > 0:
            rate *= min(1.0, vol_ref / vl[d])
        t = tr[d] if tr is not None else np.nan
        if rate > 0 and buy_gate is not None and np.isfinite(t) and t < buy_gate:
            rate = 0.0
        if rate < 0 and sell_gate is not None and np.isfinite(t) and t > sell_gate:
            rate = 0.0
        if rate > 0 and cash > 0:
            amt = cash * rate; cash -= amt; btc += amt * (1 - cost) / px
        elif rate < 0 and btc > 0:
            q = btc * -rate; btc -= q; cash += q * px * (1 - cost)
        v = cash + btc * px
        eq.append(v); wb.append(btc * px / v)
    eq = pd.Series(eq, index=p.index)
    return eq.pct_change().fillna(eq.iloc[0] - 1), pd.Series(wb, index=p.index)
