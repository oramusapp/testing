"""Strategy definitions. Every rule uses only information available at the decision close."""
import numpy as np, pandas as pd
from engine import (trend_ensemble, ann_vol, rolling_adf, ADF_5PCT, top_n_universe, weekly_dates,
                    monthly_dates, hold_between, cap_weights)

class Ctx:
    def __init__(self, P, C, risk, n_universe=10):
        self.P, self.C = P, C
        self.idx = P.index
        self.risk = risk.reindex(P.index)                     # SDCA composite risk 0-100
        self.elig = top_n_universe(C, P, n_universe)
        self.btc = P['btc']
        self.trend = {a: trend_ensemble(P[a]) for a in P.columns}
        self.vol = {a: ann_vol(P[a]) for a in P.columns}
        self.adf = rolling_adf(self.btc, 90)
        self.ltpi = (self.btc > self.btc.rolling(200).mean()).astype(float) * 2 - 1   # long-term trend proxy

def W_single(ctx, col, w):
    W = pd.DataFrame(0.0, index=ctx.idx, columns=ctx.P.columns)
    W[col] = w
    return W

def buy_hold_btc(ctx):
    return W_single(ctx, 'btc', 1.0)

def equal_weight(ctx):
    reb = {}
    for d in sorted(monthly_dates(ctx.idx)):
        names = [a for a in ctx.P.columns if ctx.elig.loc[d, a]]
        reb[d] = {a: 1 / len(names) for a in names}
    return hold_between(reb, ctx.idx, ctx.P.columns)

def btc_trend(ctx, vol_target=None, max_lev=1.0):
    w = ctx.trend['btc'].fillna(0)
    if vol_target:
        w = w * (vol_target / ctx.vol['btc']).clip(upper=max_lev)
    return W_single(ctx, 'btc', w.clip(upper=max_lev))

def btc_trend_adf_lev(ctx, lev=2.0):
    """User rule: leverage only when trend is fully up (all votes) AND ADF says trending."""
    t = ctx.trend['btc'].fillna(0)
    trending = ctx.adf > ADF_5PCT
    w = t.where(~((t == 1) & trending), lev)
    return W_single(ctx, 'btc', w)

def rs_scores(ctx, d, lookback):
    """Relative strength vs BTC, volatility-adjusted (VAMS on the BTC ratio).
    lookback may be a tuple: the score is then the average over those lookbacks (ensemble)."""
    if isinstance(lookback, (tuple, list)):
        parts = [rs_scores(ctx, d, L) for L in lookback]
        keys = set.intersection(*[set(p) for p in parts]) if all(parts) else set()
        return {k: float(np.mean([p[k] for p in parts])) for k in keys}
    P = ctx.P
    i = ctx.idx.get_loc(d)
    if i < lookback + 1:
        return {}
    out = {}
    for a in P.columns:
        if a == 'btc' or not ctx.elig.loc[d, a]:
            continue
        ratio = (P[a] / P['btc']).iloc[i - lookback:i + 1]
        if ratio.isna().any():
            continue
        mom = np.log(ratio.iloc[-1] / ratio.iloc[0])
        v = ctx.vol[a].iloc[i]
        if np.isfinite(v) and v > 0:
            out[a] = mom / v
    return out

def breadth(ctx, d, sma=50):
    """Share of eligible alts whose BTC-ratio is above its SMA (RSPS confidence proxy)."""
    i = ctx.idx.get_loc(d)
    vals = []
    for a in ctx.P.columns:
        if a == 'btc' or not ctx.elig.loc[d, a]:
            continue
        ratio = (ctx.P[a] / ctx.P['btc']).iloc[max(0, i - sma):i + 1]
        if ratio.notna().all() and len(ratio) > sma:
            vals.append(ratio.iloc[-1] > ratio.iloc[:-1].mean())
    return np.mean(vals) if vals else np.nan

def rsps(ctx, lookback=30, top=3, cap=0.5, conf=0.0, every=7, fallback='trend', short_k=0, short_gross=0.0, buffer=0, sticky=False, exit_conf=None, ltpi_veto=False):
    """Relative-strength rotation among point-in-time large caps.
    Active only when breadth ≥ conf; picks must also be in their own uptrend (ensemble ≥ 0.5).
    Weights ∝ score / vol, capped; unfilled weight goes to BTC scaled by BTC trend (fallback).
    Optional short sleeve: when BTC trend ensemble ≤ 0.25, short the k weakest alts in downtrend."""
    reb = {}
    held, prev_w, prev_key = [], None, None
    active = False
    for d in sorted(weekly_dates(ctx.idx, every)):
        bt = ctx.trend['btc'].get(d, np.nan)
        if not np.isfinite(bt):
            continue
        w = {}
        sc = rs_scores(ctx, d, lookback)
        br = breadth(ctx, d)
        if fallback == 'trend':
            btc_w = bt
        elif fallback == 'trend_ltpi':      # BTC × trend, but all stablecoin while LTPI (SMA200) is negative
            btc_w = bt if ctx.ltpi.get(d, 1) > 0 else 0.0
        elif fallback == 'cash':
            btc_w = 0.0
        elif fallback == 'series':          # follow an external BTC weight path (e.g. the SDCA sleeve)
            btc_w = float(ctx.fallback_series.get(d, 0.0))
        else:
            btc_w = 1.0
        if exit_conf is None:
            active = np.isfinite(br) and br >= conf
        else:   # hysteresis: enter at conf, leave only below exit_conf
            active = np.isfinite(br) and (br >= exit_conf if active else br >= conf)
        if sc and active and bt >= 0.5 and not (ltpi_veto and ctx.ltpi.get(d, 1) <= 0):
            ranked = [a for a, s in sorted(sc.items(), key=lambda x: -x[1]) if s > 0 and ctx.trend[a].get(d, 0) >= 0.5]
            if buffer:
                # rank buffer: keep a held name while it stays within top+buffer, fill the rest by rank
                keep = [a for a in held if a in ranked[:top + buffer]][:top]
                picks = keep + [a for a in ranked if a not in keep][:top - len(keep)]
            else:
                picks = ranked[:top]
            if picks:
                raw = [sc[a] / ctx.vol[a][d] for a in picks]
                cw = cap_weights(raw, cap)
                cw = np.minimum(cw, cap)
                for a, x in zip(picks, cw):
                    w[a] = float(x)
        rest = 1 - sum(w.values())
        if rest > 1e-9:
            w['btc'] = w.get('btc', 0) + rest * btc_w
        if short_k and bt <= 0.25 and sc:
            losers = [a for a, s in sorted(sc.items(), key=lambda x: x[1])
                      if s < 0 and ctx.trend[a].get(d, 1) <= 0.25][:short_k]
            for a in losers:
                w[a] = w.get(a, 0) - short_gross / len(losers)
        key = (tuple(sorted(a for a in w if a != 'btc')), round(w.get('btc', 0), 2))
        if sticky and prev_key is not None and key[0] == prev_key[0] and abs(key[1] - prev_key[1]) < 0.25:
            w = prev_w          # same holdings and similar BTC share: no re-weighting trade
        else:
            prev_w, prev_key = w, key
        held = [a for a in w if a != 'btc' and w[a] > 0]
        reb[d] = w
    return hold_between(reb, ctx.idx, ctx.P.columns)

def btc_short_sleeve(ctx, gross=0.5):
    """Short BTC when every trend vote is down and ADF says trending (mirror of the leverage rule)."""
    t = ctx.trend['btc'].fillna(0.5)
    trending = ctx.adf > ADF_5PCT
    return W_single(ctx, 'btc', np.where((t == 0) & trending, -gross, 0.0))

def combine(*parts):
    """parts: (weight, W) pairs → blended weights."""
    out = None
    for a, W in parts:
        out = W * a if out is None else out.add(W * a, fill_value=0)
    return out

def sdca_weights(ctx, w_btc_path):
    W = pd.DataFrame(0.0, index=ctx.idx, columns=ctx.P.columns)
    W['btc'] = w_btc_path.reindex(ctx.idx).fillna(0)
    return W

def valuation_overlay(ctx, W, hi=75, cut=0.5):
    """Scale long exposure down when SDCA risk is in the sell zone (risk ≥ hi)."""
    scale = pd.Series(np.where(ctx.risk >= hi, cut, 1.0), index=ctx.idx)
    longs = W.clip(lower=0).mul(scale, axis=0)
    return longs + W.clip(upper=0)
