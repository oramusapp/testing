"""Alpha sleeve, round 2.
- TS trend fully invested: weights ∝ Donchian-ensemble signal / vol, normalised over the universe.
- Tournament (ratio table): every asset incl. BTC is scored against every other asset by the trend of
  their price ratio; the leaders that are also in their own uptrend are held, otherwise stablecoin.
  (Relative-strength 'ratio table' systems shared by the TRW investing community on TradingView;
  cross-sectional + time-series momentum combination as in the momentum literature.)
"""
import numpy as np, pandas as pd, warnings, pickle
warnings.filterwarnings('ignore')
src = open('run19.py').read()
exec(src.split("S_ = {}")[0])
S_ = {}

def ts_full(n=10, sig=SIG, gate=None, th=0.02, power=1.0):
    E = ELIG[n]
    iv = pd.DataFrame({a: (1 / VOL[a]) ** power for a in P.columns}).where(E)
    base = iv.div(iv.sum(axis=1), axis=0)                  # inverse-vol weights if every coin trended
    W = (base * pd.DataFrame(sig)).fillna(0.0)
    if gate is not None: W = W.mul(gate.reindex(P.index).fillna(0), axis=0)
    return thresh(W, th)

LOGP = np.log(P)
def ratio_trend(a, b, lbs=(30, 60, 90)):
    """Votes in [-1,1]: is the a/b ratio above its SMA for several lookbacks."""
    r = LOGP[a] - LOGP[b]
    return sum(np.sign(r - r.rolling(L).mean()) for L in lbs) / len(lbs)

def tournament(n=10, top=2, own='don', own_min=0.5, cap=0.5, th=0.02, keep_buffer=1, include_btc=True, lbs=(30, 60, 90)):
    E = ELIG[n].copy()
    if include_btc: E['btc'] = P['btc'].notna()
    cols = [c for c in P.columns if E[c].any()]
    # pairwise ratio trends
    pair = {}
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            t = ratio_trend(a, b, lbs); pair[(a, b)] = t; pair[(b, a)] = -t
    score = pd.DataFrame(0.0, index=P.index, columns=cols); cnt = pd.DataFrame(0.0, index=P.index, columns=cols)
    for (a, b), t in pair.items():
        m = E[a] & E[b] & t.notna()
        score[a] += t.where(m, 0); cnt[a] += m.astype(float)
    score = (score / cnt.replace(0, np.nan)).where(E[cols])
    ownsig = pd.DataFrame({a: (SIG[a] if own == 'don' else ctx.trend[a]) for a in cols})
    W = pd.DataFrame(0.0, index=P.index, columns=P.columns); held = []
    sv, ov = score.values, ownsig.values
    for i in range(len(P.index)):
        s = sv[i]
        ok = [(cols[j], s[j]) for j in range(len(cols)) if np.isfinite(s[j]) and s[j] > 0 and ov[i, j] >= own_min]
        ranked = [a for a, _ in sorted(ok, key=lambda x: -x[1])]
        keep = [a for a in held if a in ranked[:top + keep_buffer]][:top]
        picks = keep + [a for a in ranked if a not in keep][:top - len(keep)]
        held = picks
        if picks:
            raw = [1 / VOL[a].iloc[i] for a in picks]
            w = cap_weights(raw, cap) if len(picks) * cap >= 1 else np.full(len(picks), cap)
            w = np.minimum(w, cap)
            for a, x in zip(picks, w): W.iat[i, P.columns.get_loc(a)] = x
    return thresh(W, th), score

print('=== sleeve alone, IS 2020–2023 / OOS 2024→ (costs 0.15%/side)')
run('BTC kup i trzymaj', S.buy_hold_btc(ctx))
ctx.ltpi = (P['btc'] > P['btc'].rolling(200).mean()).astype(float) * 2 - 1
run('RSPS obecny (parking stable, veto LTPI)', S.rsps(ctx, **KW, fallback='cash', ltpi_veto=True), S_)
run('RSPS obecny (parking BTC×trend)', S.rsps(ctx, **KW, fallback='trend_ltpi', ltpi_veto=True), S_)
for n in (10, 20):
    run(f'TS pełny top{n} (1/vol)', ts_full(n), S_)
run('TS pełny top10 + veto LTPI', ts_full(10, gate=(ctx.ltpi > 0).astype(float)), S_)
SC = {}
for top in (1, 2, 3):
    for own in ('don', 'sma'):
        W, sc = tournament(10, top, own); SC[top] = sc
        run(f'Turniej top{top} trend własny={own} (z BTC)', W, S_)
W, _ = tournament(10, 2, 'don', include_btc=False); run('Turniej top2 don BEZ BTC', W, S_)
W, _ = tournament(10, 2, 'don', lbs=(20, 40, 60)); run('Turniej top2 don lb 20/40/60', W, S_)
W, _ = tournament(10, 2, 'don', lbs=(60, 90, 120)); run('Turniej top2 don lb 60/90/120', W, S_)
W, _ = tournament(15, 2, 'don'); run('Turniej top2 don uniwersum 15', W, S_)
W, _ = tournament(10, 2, 'don', keep_buffer=0); run('Turniej top2 don bez bufora', W, S_)
pickle.dump(S_, open(SP + 'alpha20.pkl', 'wb'))
