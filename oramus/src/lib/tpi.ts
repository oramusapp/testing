// Trend Probability Indicators (MTPI / LTPI) from close-only trend signals; each votes +1 / −1 and the
// TPI is the mean vote in [−1, 1]. Mirrors research/tpi.py (parity tested in tpi.test.ts).
// Backtest (research/run17–18.py): the 10-signal LTPI with a ±0.2 hysteresis matched the single
// SMA-200 rule (Sharpe OOS 1.03 vs 1.03) with a slightly smaller drawdown, so it drives LTPI. The 10-signal
// MTPI lowered out-of-sample results, so BTC sizing keeps the 4-average trend unless the user opts in.

type S = number[];
const NaNs = (n: number) => new Array(n).fill(NaN);

export function ema(p: S, n: number): S {
  const k = 2 / (n + 1), out: S = []; let prev = NaN;
  for (const x of p) { prev = Number.isFinite(prev) ? x * k + prev * (1 - k) : x; out.push(prev); }
  return out;
}
function sma(p: S, n: number): S {
  const out = NaNs(p.length); let s = 0;
  for (let i = 0; i < p.length; i++) { s += p[i]; if (i >= n) s -= p[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
/** sign with zeros carried forward from the previous vote (pandas: sign → replace(0, nan) → ffill → fillna(0)) */
function sign(x: S): S {
  const out: S = []; let last = 0;
  for (const v of x) { const s = Number.isFinite(v) ? Math.sign(v) : 0; if (s !== 0) last = s; out.push(Number.isFinite(v) && s !== 0 ? s : last); }
  return out;
}
const sub = (a: S, b: S) => a.map((v, i) => v - b[i]);
function rsi(p: S, n: number): S {
  const out: S = [NaN]; let up = NaN, dn = NaN; const a = 1 / n;
  for (let i = 1; i < p.length; i++) {
    const d = p[i] - p[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0);
    up = Number.isFinite(up) ? a * u + (1 - a) * up : u; dn = Number.isFinite(dn) ? a * w + (1 - a) * dn : w;
    out.push(100 - 100 / (1 + up / dn));
  }
  return out;
}
const roc = (p: S, n: number) => p.map((v, i) => (i >= n ? v / p[i - n] - 1 : NaN));
function donchian(p: S, n: number): S {
  const out: S = []; let st = 0;
  for (let i = 0; i < p.length; i++) {
    if (i >= n) {
      let hi = -Infinity, lo = Infinity;
      for (let k = i - n; k < i; k++) { hi = Math.max(hi, p[k]); lo = Math.min(lo, p[k]); }
      if (p[i] > hi) st = 1; else if (p[i] < lo) st = -1;
    }
    out.push(st);
  }
  return out;
}
function aroon(p: S, n: number): S {
  const diff = NaNs(p.length);
  for (let i = n; i < p.length; i++) {
    let im = 0, iM = 0, mn = Infinity, mx = -Infinity;
    for (let k = 0; k <= n; k++) { const v = p[i - n + k]; if (v > mx) { mx = v; iM = k; } if (v < mn) { mn = v; im = k; } }
    diff[i] = (iM - im) / n;
  }
  return sign(diff);
}
function supertrend(p: S, n: number, mult: number): S {
  const atr = NaNs(p.length);
  for (let i = n; i < p.length; i++) { let s = 0; for (let k = i - n + 1; k <= i; k++) s += Math.abs(p[k] - p[k - 1]); atr[i] = s / n; }
  const out = new Array(p.length).fill(0); let fu = NaN, fl = NaN, trend = 1;
  for (let i = 1; i < p.length; i++) {
    if (!Number.isFinite(atr[i])) continue;
    const ub = p[i] + mult * atr[i], lb = p[i] - mult * atr[i];
    fu = !Number.isFinite(fu) || ub < fu || p[i - 1] > fu ? ub : fu;
    fl = !Number.isFinite(fl) || lb > fl || p[i - 1] < fl ? lb : fl;
    if (trend === 1 && p[i] < fl) trend = -1; else if (trend === -1 && p[i] > fu) trend = 1;
    out[i] = trend;
  }
  return out;
}
function linreg(p: S, n: number): S {
  const lp = p.map(Math.log), out = NaNs(p.length);
  for (let i = n - 1; i < p.length; i++) { let s = 0; for (let k = 0; k < n; k++) s += (k - (n - 1) / 2) * lp[i - n + 1 + k]; out[i] = s; }
  return sign(out);
}
function wma(p: S, k: number): S {
  const out = NaNs(p.length), den = (k * (k + 1)) / 2;
  for (let i = k - 1; i < p.length; i++) { let s = 0; for (let j = 0; j < k; j++) s += p[i - k + 1 + j] * (j + 1); out[i] = s / den; }
  return out;
}
function hmaRising(p: S, n: number): S {
  const h = wma(sub(wma(p, Math.floor(n / 2)).map((v) => 2 * v), wma(p, n)), Math.floor(Math.sqrt(n)));
  return sign(h.map((v, i) => (i ? v - h[i - 1] : NaN)));
}
const macd = (p: S, f: number, s: number, g: number) => { const m = sub(ema(p, f), ema(p, s)); return sign(sub(m, ema(m, g))); };

export interface TpiSpec { name: string; fn: (p: S) => S; }
export const MTPI_SPEC: TpiSpec[] = [
  { name: 'Cena > EMA 21', fn: (p) => sign(sub(p, ema(p, 21))) },
  { name: 'EMA 21 > EMA 50', fn: (p) => sign(sub(ema(p, 21), ema(p, 50))) },
  { name: 'MACD (12,26,9)', fn: (p) => macd(p, 12, 26, 9) },
  { name: 'RSI 14 > 50', fn: (p) => sign(rsi(p, 14).map((v) => v - 50)) },
  { name: 'ROC 30 > 0', fn: (p) => sign(roc(p, 30)) },
  { name: 'Donchian 20', fn: (p) => donchian(p, 20) },
  { name: 'Aroon 25', fn: (p) => aroon(p, 25) },
  { name: 'Supertrend (10, 3)', fn: (p) => supertrend(p, 10, 3) },
  { name: 'Regresja liniowa 30', fn: (p) => linreg(p, 30) },
  { name: 'HMA 21 rośnie', fn: (p) => hmaRising(p, 21) }
];
// LTPI: time-coherent components only (course notes: every input should work on the same horizon). The former
// 'Cena > SMA 200', 'RSI 100 > 50' and 'Supertrend (50, 4)' flipped 15–22×/year next to components flipping 1–8×/year;
// without them (research/run55–56.py) the LTPI changes state 2.8×/year instead of 5.5× and the portfolio 2020→ gains
// CAGR 79.8 → 84.4%, Sharpe 2024→ 1.49 → 1.57 at the same max drawdown (also better without 2021 and at double cost).
export const LTPI_SPEC_LEGACY_REMOVED = ['Cena > SMA 200', 'RSI 100 > 50', 'Supertrend (50, 4)'];
export const LTPI_SPEC: TpiSpec[] = [
  { name: 'EMA 50 > EMA 200', fn: (p) => sign(sub(ema(p, 50), ema(p, 200))) },
  { name: 'MACD tygodniowy (84,182,63)', fn: (p) => macd(p, 84, 182, 63) },
  { name: 'ROC 180 > 0', fn: (p) => sign(roc(p, 180)) },
  { name: 'Donchian 100', fn: (p) => donchian(p, 100) },
  { name: 'Aroon 100', fn: (p) => aroon(p, 100) },
  { name: 'Regresja liniowa 180', fn: (p) => linreg(p, 180) },
  { name: 'HMA 100 rośnie', fn: (p) => hmaRising(p, 100) }
];

// Course notes: "I sell if the trend probability swings below zero and buy when it swings above zero" → default threshold 0;
// ±0.2 hysteresis (fewer whipsaws) is an option in LTPI · MTPI settings.
export const HYSTERESIS = 0;
export const HYSTERESIS_OPTIONS = [0, 0.2];

/** State that turns +1 only above +h and −1 only below −h (otherwise keeps the previous state). */
export function hysteresis(tpi: S, h = HYSTERESIS): S {
  const out: S = []; let st = 0;
  for (const v of tpi) { const x = Number.isFinite(v) ? v : 0; if (st <= 0 && x > h) st = 1; else if (st >= 0 && x < -h) st = -1; out.push(st); }
  return out;
}

/** LTPI persistence (42 Macro: a regime change that reverses within days is a false alarm): a new LTPI state counts only
 *  after it has held LTPI_PERSIST consecutive closes. research/run64.py: 3–10 days all better on 2020–23 (portfolio Sharpe
 *  1.97 → 2.01–2.02); SDCA alone better Sharpe at 21/21 start dates 2018–23 with the same median drawdown; 2024→ about
 *  equal (CAGR 55.0 → 53.7%). 5 = middle of that range. */
export const LTPI_PERSIST = 5;
export function persistState(s: S, n = LTPI_PERSIST): S {
  if (!s.length) return [];
  let cur = s[0], last = s[0], run = 0;
  return s.map((x) => {
    if (Math.sign(x) !== Math.sign(last)) { run = 1; last = x; } else run++;
    if (Math.sign(x) !== Math.sign(cur) && run >= n) cur = x;
    return cur;
  });
}

export interface TpiSignificance { h: number; up: number; down: number; all: number; nUp: number; nDown: number; t: number; }
export interface TpiResult {
  value: number; series: S; state: number; stateSeries: S;
  votes: { name: string; vote: number; flipsPerYear: number }[];
  roc5: number;                       // 'rate of change': TPI today minus 5 days ago
  sig: TpiSignificance | null;        // forward returns by state (statistical significance)
}

/** Mean forward log return over h days when the state is positive vs negative, with a Welch t-statistic. */
function significance(p: S, state: S, h = 30, skip = 400): TpiSignificance | null {
  const up: number[] = [], dn: number[] = [];
  for (let i = skip; i + h < p.length; i++) { const r = Math.log(p[i + h] / p[i]); if (!Number.isFinite(r)) continue; (state[i] > 0 ? up : state[i] < 0 ? dn : []).push(r); }
  if (up.length < 30 || dn.length < 30) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const vr = (a: number[], m: number) => a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1);
  const mu = mean(up), md = mean(dn);
  // overlapping windows inflate the sample: effective n ≈ n / h
  const t = (mu - md) / Math.sqrt(vr(up, mu) / (up.length / h) + vr(dn, md) / (dn.length / h));
  return { h, up: Math.exp(mu) - 1, down: Math.exp(md) - 1, all: Math.exp(mean([...up, ...dn])) - 1, nUp: up.length, nDown: dn.length, t };
}

/** Runs on the last `window` closes (long enough for every warm-up) to stay fast on a phone. */
export function computeTpi(prices: S, spec: TpiSpec[], window = 1500, h = HYSTERESIS): TpiResult {
  const p = prices.slice(-window);
  const votes = spec.map((s) => ({ name: s.name, v: s.fn(p) }));
  const series = p.map((_, i) => votes.reduce((a, x) => a + x.v[i], 0) / votes.length);
  const stateSeries = spec === LTPI_SPEC ? persistState(hysteresis(series, h)) : hysteresis(series, h);
  const flips = (v: S) => { const a = v.slice(-730); let n = 0; for (let i = 1; i < a.length; i++) if (a[i] !== a[i - 1]) n++; return (n * 365) / Math.max(a.length - 1, 1); };
  const n = series.length;
  return {
    value: series[n - 1], series, state: stateSeries[n - 1], stateSeries,
    votes: votes.map((x) => ({ name: x.name, vote: x.v[x.v.length - 1], flipsPerYear: flips(x.v) })),
    roc5: n > 5 ? series[n - 1] - series[n - 6] : 0,
    sig: significance(p, stateSeries)
  };
}

/** LTPI state for every day of `prices` (0 during warm-up): 10-signal ensemble with hysteresis or price vs SMA 200. */
export function ltpiStateSeries(prices: S, source: 'ensemble' | 'sma200' = 'ensemble', h = HYSTERESIS): S {
  if (source === 'sma200') { const m = sma(prices, 200); return prices.map((p, i) => (Number.isFinite(m[i]) ? (p > m[i] ? 1 : -1) : 0)); }
  return computeTpi(prices, LTPI_SPEC, prices.length, h).stateSeries;
}
