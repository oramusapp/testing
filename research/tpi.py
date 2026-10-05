"""Trend Probability Indicators built from close-only trend signals (each votes +1 / −1).
Close-only so the same code runs on the full BTC history (Coin Metrics has no high/low)."""
import numpy as np, pandas as pd

def ema(s, n): return s.ewm(span=n, adjust=False).mean()
def sma(s, n): return s.rolling(n).mean()
def sign(x): return np.sign(x).replace(0, np.nan).ffill().fillna(0)

def rsi(p, n):
    d = p.diff(); up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean(); dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn)

def donchian_state(p, n):
    """+1 after a close above the prior n-day closing high, −1 after a close below the prior n-day low."""
    hi, lo = p.rolling(n).max().shift(1), p.rolling(n).min().shift(1)
    st = pd.Series(np.where(p > hi, 1.0, np.where(p < lo, -1.0, np.nan)), index=p.index)
    return st.ffill().fillna(0)

def aroon(p, n):
    """Close-based Aroon: days since n-day high vs low."""
    up = p.rolling(n + 1).apply(lambda x: x.argmax(), raw=True) / n
    dn = p.rolling(n + 1).apply(lambda x: x.argmin(), raw=True) / n
    return sign(up - dn)

def supertrend_close(p, n, mult):
    """Supertrend on closes with ATR approximated by the mean absolute close change."""
    atr = p.diff().abs().rolling(n).mean()
    mid = p; ub = (mid + mult * atr).values; lb = (mid - mult * atr).values; c = p.values
    out = np.zeros(len(p)); fu, fl = ub.copy(), lb.copy(); trend = 1
    for i in range(1, len(p)):
        if np.isnan(ub[i]): continue
        fu[i] = ub[i] if (np.isnan(fu[i - 1]) or ub[i] < fu[i - 1] or c[i - 1] > fu[i - 1]) else fu[i - 1]
        fl[i] = lb[i] if (np.isnan(fl[i - 1]) or lb[i] > fl[i - 1] or c[i - 1] < fl[i - 1]) else fl[i - 1]
        if trend == 1 and c[i] < fl[i]: trend = -1
        elif trend == -1 and c[i] > fu[i]: trend = 1
        out[i] = trend
    return pd.Series(out, index=p.index)

def linreg_slope(p, n):
    lp = np.log(p); x = np.arange(n) - (n - 1) / 2
    return sign(lp.rolling(n).apply(lambda y: np.dot(x, y), raw=True))

def hma(p, n):
    wma = lambda s, k: s.rolling(k).apply(lambda y: np.dot(y, np.arange(1, k + 1)) / (k * (k + 1) / 2), raw=True)
    return wma(2 * wma(p, n // 2) - wma(p, n), int(np.sqrt(n)))

# (name, function) — medium-term: days to weeks
MTPI = {
    'Cena > EMA 21': lambda p: sign(p - ema(p, 21)),
    'EMA 21 > EMA 50': lambda p: sign(ema(p, 21) - ema(p, 50)),
    'MACD (12,26,9)': lambda p: sign((ema(p, 12) - ema(p, 26)) - ema(ema(p, 12) - ema(p, 26), 9)),
    'RSI 14 > 50': lambda p: sign(rsi(p, 14) - 50),
    'ROC 30 > 0': lambda p: sign(p.pct_change(30)),
    'Donchian 20': lambda p: donchian_state(p, 20),
    'Aroon 25': lambda p: aroon(p, 25),
    'Supertrend (10, 3)': lambda p: supertrend_close(p, 10, 3),
    'Regresja liniowa 30': lambda p: linreg_slope(p, 30),
    'HMA 21 rośnie': lambda p: sign(hma(p, 21).diff()),
}
# long-term: months
LTPI = {
    'Cena > SMA 200': lambda p: sign(p - sma(p, 200)),
    'EMA 50 > EMA 200': lambda p: sign(ema(p, 50) - ema(p, 200)),
    'MACD tygodniowy (84,182,63)': lambda p: sign((ema(p, 84) - ema(p, 182)) - ema(ema(p, 84) - ema(p, 182), 63)),
    'RSI 100 > 50': lambda p: sign(rsi(p, 100) - 50),
    'ROC 180 > 0': lambda p: sign(p.pct_change(180)),
    'Donchian 100': lambda p: donchian_state(p, 100),
    'Aroon 100': lambda p: aroon(p, 100),
    'Supertrend (50, 4)': lambda p: supertrend_close(p, 50, 4),
    'Regresja liniowa 180': lambda p: linreg_slope(p, 180),
    'HMA 100 rośnie': lambda p: sign(hma(p, 100).diff()),
}

def tpi(p, spec):
    votes = pd.DataFrame({k: f(p) for k, f in spec.items()})
    return votes.mean(axis=1), votes
