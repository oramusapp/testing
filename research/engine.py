"""Daily weight-based backtest engine and signal library.

Timing convention (no look-ahead): a target weight computed from data up to the close
of day t is traded at the close of day t+1 and earns returns from day t+2 onward.
"""
import numpy as np, pandas as pd

DAYS = 365

def backtest(W, P, cost=0.0015, lev_cost=0.10, short_fund=0.0):
    """W: target weights (index = dates, columns ⊆ P.columns); cash = 1 - sum(W).
    cost: one-way cost per unit traded (fee + slippage).
    lev_cost: annual financing on gross long exposure above 1x.
    short_fund: annual cost on short notional (positive = shorts pay)."""
    W = W.reindex(P.index).fillna(0.0)
    R = P[W.columns].pct_change().fillna(0.0)
    held = W.shift(2).fillna(0.0)            # decided t, traded t+1, earns from t+2
    traded = W.shift(1).fillna(0.0)
    turnover = traded.diff().abs().sum(axis=1).fillna(0.0)
    gross_long = held.clip(lower=0).sum(axis=1)
    short = (-held.clip(upper=0)).sum(axis=1)
    ret = (held * R).sum(axis=1) - turnover * cost \
        - (gross_long - 1).clip(lower=0) * lev_cost / DAYS - short * short_fund / DAYS
    return ret, turnover, held

def metrics(ret, start, end=None, turnover=None, held=None):
    r = ret.loc[start:end]
    eq = (1 + r).cumprod()
    yrs = len(r) / DAYS
    cagr = eq.iloc[-1] ** (1 / yrs) - 1
    vol = r.std() * np.sqrt(DAYS)
    down = r[r < 0].std() * np.sqrt(DAYS)
    dd = eq / eq.cummax() - 1
    # longest drawdown (days below previous peak)
    under = (dd < 0).astype(int)
    runs = under.groupby((under == 0).cumsum()).sum()
    out = dict(CAGR=cagr, Vol=vol, Sharpe=(r.mean() * DAYS) / vol if vol else np.nan,
               Sortino=(r.mean() * DAYS) / down if down else np.nan, MaxDD=dd.min(),
               Calmar=cagr / abs(dd.min()) if dd.min() < 0 else np.nan, DDdays=int(runs.max()),
               Total=eq.iloc[-1] - 1)
    if turnover is not None:
        out['Turnover/yr'] = turnover.loc[start:end].sum() / yrs
    if held is not None:
        h = held.loc[start:end]
        out['AvgGross'] = h.abs().sum(axis=1).mean()
        out['AvgNet'] = h.sum(axis=1).mean()
    return out

# ---------------- signals ----------------
def trend_ensemble(p, lookbacks=(20, 50, 100, 200)):
    """Fraction of 'price above its SMA' votes, in [0, 1]."""
    votes = [(p > p.rolling(L).mean()).astype(float) for L in lookbacks]
    s = sum(votes) / len(votes)
    return s.where(p.rolling(max(lookbacks)).mean().notna())

def ann_vol(p, n=30):
    return np.log(p).diff().rolling(n).std() * np.sqrt(DAYS)

def adf_stat(y):
    """ADF t-stat (constant, 1 lag) for a 1-D array."""
    dy = np.diff(y)
    Y = dy[1:]
    X = np.column_stack([np.ones(len(Y)), y[1:-1], dy[:-1]])
    beta, *_ = np.linalg.lstsq(X, Y, rcond=None)
    resid = Y - X @ beta
    s2 = resid @ resid / (len(Y) - X.shape[1])
    cov = s2 * np.linalg.inv(X.T @ X)
    return beta[1] / np.sqrt(cov[1, 1])

def rolling_adf(p, window=90):
    lp = np.log(p.values)
    out = np.full(len(p), np.nan)
    for i in range(window, len(p)):
        seg = lp[i - window + 1:i + 1]
        if np.isfinite(seg).all():
            out[i] = adf_stat(seg)
    return pd.Series(out, index=p.index)

ADF_5PCT = -2.86

def top_n_universe(C, P, n=10, min_history=90):
    """Point-in-time eligibility: top-n market cap on each date among assets with enough history."""
    hist = P.notna().cumsum()
    capm = C.where(hist >= min_history).where(P.notna())
    rank = capm.rank(axis=1, ascending=False)
    return rank <= n

def monthly_dates(idx):
    s = pd.Series(idx, index=idx)
    return set(s.groupby([idx.year, idx.month]).first().values)

def weekly_dates(idx, every=7):
    return set(idx[::every])

def hold_between(rebal_weights, idx, cols):
    """Forward-fill weights decided on rebalance dates."""
    W = pd.DataFrame(np.nan, index=idx, columns=cols)
    for d, w in rebal_weights.items():
        W.loc[d] = 0.0
        for k, v in w.items():
            W.loc[d, k] = v
    return W.ffill().fillna(0.0)

def cap_weights(w, cap):
    w = np.asarray(w, float)
    if w.sum() <= 0:
        return w
    w = w / w.sum()
    for _ in range(50):
        over = w > cap + 1e-12
        if not over.any():
            break
        excess = (w[over] - cap).sum()
        w[over] = cap
        free = ~over & (w > 0)
        if not free.any():
            break
        w[free] += excess * w[free] / w[free].sum()
    return w
