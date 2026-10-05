// Quantitative toolkit used by the SDCA and RSPS tabs. Pure functions, no I/O,
// so everything here is unit-testable (see quant.test.ts).

export type Series = number[];

// ---------- basic statistics ----------
export const mean = (a: Series) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function std(a: Series): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
export function ema(a: Series, n: number): Series {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = NaN;
  for (const x of a) {
    if (!Number.isFinite(x)) { out.push(prev); continue; }
    prev = Number.isFinite(prev) ? x * k + prev * (1 - k) : x;
    out.push(prev);
  }
  return out;
}
export function sma(a: Series, n: number): Series {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    out.push(i >= n - 1 ? s / n : NaN);
  }
  return out;
}
export const logReturns = (p: Series) => p.slice(1).map((x, i) => Math.log(x / p[i]));

// Standard normal CDF and its inverse (Acklam's approximation).
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
export function normInv(p: number): number {
  p = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---------- linear algebra ----------
/** Solves A x = b (A small, dense) with Gaussian elimination + partial pivoting. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

/** Weighted least squares on design rows X (each row = regressors). */
export function wls(X: number[][], y: number[], w?: number[]) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const wi = w ? w[i] : 1;
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      Xty[a] += wi * xi[a] * y[i];
      for (let b = a; b < k; b++) XtX[a][b] += wi * xi[a] * xi[b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  return { beta: solve(XtX, Xty), XtX };
}

/** Linear quantile regression via iteratively re-weighted least squares. */
export function quantReg(X: number[][], y: number[], tau: number, iters = 60): number[] {
  let beta = wls(X, y).beta;
  for (let it = 0; it < iters; it++) {
    const w = y.map((yi, i) => {
      const r = yi - dot(X[i], beta);
      return (r >= 0 ? tau : 1 - tau) / Math.max(Math.abs(r), 1e-4);
    });
    beta = wls(X, y, w).beta;
  }
  return beta;
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

// ---------- SDCA valuation model ----------
const GENESIS = Date.UTC(2009, 0, 3);
export const daysSinceGenesis = (iso: string) => (Date.parse(iso + 'T00:00:00Z') - GENESIS) / 86400000;

/** Quantile grid used for the rainbow / price-risk interpolation. */
export const TAUS = [0.01, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99];

export const BANDS = [
  { from: 0.01, to: 0.1, label: 'Fire sale', color: '#1d3b63' },
  { from: 0.1, to: 0.25, label: 'Accumulate', color: '#1f5c66' },
  { from: 0.25, to: 0.5, label: 'Value', color: '#2b6b3a' },
  { from: 0.5, to: 0.75, label: 'Above mid', color: '#8a8a2a' },
  { from: 0.75, to: 0.95, label: 'Hot', color: '#a8582a' },
  { from: 0.95, to: 0.99, label: 'Bubble', color: '#8c2323' }
];

export interface CurvatureModel {
  /** beta per tau, model: log10 P = b0 + b1*x + b2*x^2, x = log10(days since genesis) */
  betas: number[][];
  taus: number[];
}

/**
 * "Asymmetric tail curvature" reconstruction: one quadratic-in-log-time quantile
 * regression per quantile. Each tail gets its own curvature, so the upper rails
 * can compress faster than the lower ones (diminishing bubbles).
 */
export function fitCurvature(dates: string[], prices: number[], taus = TAUS): CurvatureModel {
  const X: number[][] = [];
  const y: number[] = [];
  dates.forEach((d, i) => {
    const t = daysSinceGenesis(d);
    if (t < 1 || !(prices[i] > 0)) return;
    const x = Math.log10(t);
    X.push([1, x, x * x]);
    y.push(Math.log10(prices[i]));
  });
  return { betas: taus.map((tau) => quantReg(X, y, tau)), taus };
}

export function rails(model: CurvatureModel, iso: string): number[] {
  const x = Math.log10(Math.max(daysSinceGenesis(iso), 1));
  const v = model.betas.map((b) => 10 ** (b[0] + b[1] * x + b[2] * x * x));
  return v.sort((a, b) => a - b); // guard against quantile crossing
}

/** Price risk in [0,1] (position of price within the quantile rails) and z-score (positive = cheap). */
export function priceRisk(model: CurvatureModel, iso: string, price: number) {
  const r = rails(model, iso).map(Math.log10);
  const taus = model.taus;
  const lp = Math.log10(price);
  let risk: number;
  if (lp <= r[0]) {
    const slope = (taus[1] - taus[0]) / (r[1] - r[0] || 1e-9);
    risk = Math.max(0, taus[0] + (lp - r[0]) * slope);
  } else if (lp >= r[r.length - 1]) {
    const n = r.length - 1;
    const slope = (taus[n] - taus[n - 1]) / (r[n] - r[n - 1] || 1e-9);
    risk = Math.min(1, taus[n] + (lp - r[n]) * slope);
  } else {
    let i = 0;
    while (lp > r[i + 1]) i++;
    risk = taus[i] + ((lp - r[i]) / (r[i + 1] - r[i] || 1e-9)) * (taus[i + 1] - taus[i]);
  }
  // asymmetric sigma: each side of the median scaled by its own tail (Q1 / Q99 ≈ ±2.326σ)
  const mid = r[taus.indexOf(0.5)];
  const sigma = lp < mid ? (mid - r[0]) / 2.326 : (r[r.length - 1] - mid) / 2.326;
  const z = (mid - lp) / (sigma || 1e-9);
  return { risk, z };
}

/** Empirical percentile rank in [0,1] of each value within the full finite sample. */
export function percentileRank(a: Series): Series {
  const sorted = a.filter(Number.isFinite).sort((x, y) => x - y);
  const n = sorted.length;
  return a.map((v) => {
    if (!Number.isFinite(v) || !n) return NaN;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return lo / Math.max(n - 1, 1);
  });
}

/** Detrended (vs log-time) percentile risk — used for MVRV whose cycle peaks decay over time. */
export function detrendedRisk(dates: string[], values: Series) {
  const X: number[][] = [];
  const y: number[] = [];
  const idx: number[] = [];
  values.forEach((v, i) => {
    if (!(v > 0)) return;
    const x = Math.log10(Math.max(daysSinceGenesis(dates[i]), 1));
    X.push([1, x]);
    y.push(Math.log(v));
    idx.push(i);
  });
  const resid: number[] = new Array(values.length).fill(NaN);
  if (X.length > 10) {
    const { beta } = wls(X, y);
    idx.forEach((i, k) => (resid[i] = y[k] - dot(X[k], beta)));
  }
  const risk = percentileRank(resid);
  return { risk, z: risk.map((r) => (Number.isFinite(r) ? -normInv(Math.min(Math.max(r, 0.001), 0.999)) : NaN)) };
}

/** Rolling annualised Sharpe of daily log returns. */
export function rollingSharpe(prices: Series, n = 365): Series {
  const out: number[] = new Array(prices.length).fill(NaN);
  const r = [NaN, ...logReturns(prices)];
  let s = 0, s2 = 0;
  for (let i = 1; i < prices.length; i++) {
    s += r[i]; s2 += r[i] * r[i];
    if (i > n) { s -= r[i - n]; s2 -= r[i - n] * r[i - n]; }
    if (i >= n) {
      const m = s / n;
      const v = s2 / n - m * m;
      out[i] = v > 0 ? (m / Math.sqrt(v)) * Math.sqrt(365) : NaN;
    }
  }
  return out;
}

// ---------- Accumulation / distribution curve ----------
export const CURVE_X = Array.from({ length: 21 }, (_, i) => i * 5); // risk % nodes
// Default shape read off the reference site's "Accum/Dist curve" (percent per day).
export const DEFAULT_CURVE = [10, 10, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.5, -2, -4, -10];

/** Curve rate (percent per day) at a given risk percentage (0–100), linear interpolation. */
export function curveRate(curve: number[], riskPct: number): number {
  const x = Math.min(Math.max(riskPct, 0), 100) / 5;
  const i = Math.min(Math.floor(x), 19);
  return curve[i] + (curve[i + 1] - curve[i]) * (x - i);
}

export interface BacktestResult {
  days: number; buys: number; sells: number; holds: number;
  btc: number; cash: number; avgBuy: number; value: number; pnl: number; pnlPct: number;
  avgRate: number; avgRisk: number; lump: number; lumpPct: number; vsLump: number; vsLumpPct: number;
  maxDD: number; maxDDLump: number;
  equity: number[]; lumpEquity: number[]; actions: number[]; startIndex: number;
}

// ---------- SDCA safety (research/run22.py, run23.py) ----------
// When the long-term trend is negative (LTPI state < 0) while valuation risk is high (≥ 70%), the SDCA
// sleeve sells 2% of its BTC per day to stablecoin (down to 0% BTC). Stablecoins raised this way are bought
// back at 20% per day once LTPI turns positive again. The accumulation/distribution curve is unchanged.
// Backtest 2020→: no change in 2020–2023; 2024→ portfolio drawdown −31.5% → −27.3% at equal CAGR.
export const SAFETY = { riskMin: 70, cap: 0, sellRate: 0.02, rebuyRate: 0.2 };

/** One day of the safety rule (applied after the curve). Returns the USD to sell (<0 means buy back). */
export function safetyStep(riskPct: number, ltpi: number, btcUsd: number, cashUsd: number, owed: number): { kind: 'sell' | 'rebuy' | null; usd: number } {
  const tot = btcUsd + cashUsd;
  if (ltpi < 0 && Number.isFinite(riskPct) && riskPct >= SAFETY.riskMin) {
    const share = tot > 0 ? btcUsd / tot : 0;
    if (share > SAFETY.cap) return { kind: 'sell', usd: Math.min(btcUsd * SAFETY.sellRate, btcUsd * (1 - SAFETY.cap / share)) };
    return { kind: null, usd: 0 };
  }
  if (ltpi > 0 && owed > 0 && cashUsd > 0) return { kind: 'rebuy', usd: Math.min(owed, cashUsd, Math.max(owed * SAFETY.rebuyRate, Math.min(owed, 10))) };
  return { kind: null, usd: 0 };
}

/** ltpiState: optional LTPI state per day (aligned with prices) — enables the SDCA safety. */
export function backtest(prices: Series, riskPct: Series, curve: number[], startIndex: number, capital: number, ltpiState?: Series): BacktestResult {
  let cash = capital, btc = 0, spent = 0, bought = 0, buys = 0, sells = 0, holds = 0, owed = 0;
  let peak = 0, maxDD = 0, peakL = 0, maxDDL = 0, rateSum = 0, riskSum = 0, n = 0;
  const p0 = prices[startIndex];
  const equity: number[] = [], lumpEquity: number[] = [], actions: number[] = [];
  for (let i = startIndex; i < prices.length; i++) {
    const p = prices[i];
    const r = riskPct[i];
    const rate = Number.isFinite(r) ? curveRate(curve, r) / 100 : 0;
    let act = rate;
    if (rate > 1e-6 && cash > 0) {
      const amt = cash * rate;
      cash -= amt; btc += amt / p; spent += amt; bought += amt / p; buys++; owed = Math.max(0, owed - amt);
    } else if (rate < -1e-6 && btc > 0) {
      const q = btc * -rate;
      owed *= btc > 0 ? (btc - q) / btc : 0;
      btc -= q; cash += q * p; sells++;
    } else holds++;
    if (ltpiState) {
      const st = safetyStep(r, ltpiState[i] ?? 0, btc * p, cash, owed);
      if (st.kind === 'sell' && st.usd > 0) { btc -= st.usd / p; cash += st.usd; owed += st.usd; act = Math.min(act, -SAFETY.sellRate); }
      else if (st.kind === 'rebuy' && st.usd > 0) { cash -= st.usd; btc += st.usd / p; owed -= st.usd; spent += st.usd; bought += st.usd / p; act = Math.max(act, 1e-4); }
    }
    actions.push(act);
    rateSum += rate; if (Number.isFinite(r)) { riskSum += r; n++; }
    const eq = cash + btc * p;
    const lq = (capital / p0) * p;
    equity.push(eq); lumpEquity.push(lq);
    peak = Math.max(peak, eq); maxDD = Math.min(maxDD, eq / peak - 1);
    peakL = Math.max(peakL, lq); maxDDL = Math.min(maxDDL, lq / peakL - 1);
  }
  const last = prices[prices.length - 1];
  const value = cash + btc * last;
  const lump = (capital / p0) * last;
  const days = prices.length - startIndex;
  return {
    days, buys, sells, holds, btc, cash, avgBuy: bought ? spent / bought : NaN, value,
    pnl: value - capital, pnlPct: (value / capital - 1) * 100,
    avgRate: (rateSum / Math.max(days, 1)) * 100, avgRisk: n ? riskSum / n : NaN,
    lump, lumpPct: (lump / capital - 1) * 100, vsLump: value - lump, vsLumpPct: (value / lump - 1) * 100,
    maxDD: maxDD * 100, maxDDLump: maxDDL * 100, equity, lumpEquity, actions, startIndex
  };
}

export function riskZone(riskPct: number) {
  if (!Number.isFinite(riskPct)) return { label: '—', tone: 'dim' as const };
  if (riskPct < 25) return { label: 'Buy zone', tone: 'buy' as const };
  if (riskPct < 50) return { label: 'Accumulate', tone: 'acc' as const };
  if (riskPct < 75) return { label: 'Trim', tone: 'trim' as const };
  return { label: 'Sell zone', tone: 'sell' as const };
}

// ---------- RSPS / trend toolkit ----------
/**
 * Augmented Dickey–Fuller test (constant, no trend) on a series.
 * Returns the t-statistic of gamma in  Δy_t = α + γ y_{t-1} + Σ β_i Δy_{t-i} + ε.
 */
export function adf(y: Series, lags = 1) {
  const dy = y.slice(1).map((v, i) => v - y[i]);
  const X: number[][] = [];
  const Y: number[] = [];
  for (let t = lags; t < dy.length; t++) {
    const row = [1, y[t]];
    for (let i = 1; i <= lags; i++) row.push(dy[t - i]);
    X.push(row);
    Y.push(dy[t]);
  }
  if (X.length < 10) return { stat: NaN, crit: ADF_CRIT };
  const { beta, XtX } = wls(X, Y);
  const resid = Y.map((v, i) => v - dot(X[i], beta));
  const k = beta.length;
  const s2 = resid.reduce((s, r) => s + r * r, 0) / (Y.length - k);
  // variance of gamma = s2 * (X'X)^-1 [1][1]
  const e1 = new Array(k).fill(0); e1[1] = 1;
  const inv1 = solve(XtX, e1);
  const se = Math.sqrt(s2 * inv1[1]);
  return { stat: beta[1] / se, crit: ADF_CRIT };
}
export const ADF_CRIT = { '1%': -3.43, '5%': -2.86, '10%': -2.57 };

/** Trending = ADF fails to reject a unit root (non-stationary) at the chosen level. */
export function isTrending(prices: Series, window = 90, level: keyof typeof ADF_CRIT = '5%', lags = 1) {
  const seg = prices.slice(-window).map(Math.log);
  const { stat } = adf(seg, lags);
  return { stat, trending: Number.isFinite(stat) ? stat > ADF_CRIT[level] : false, crit: ADF_CRIT[level] };
}

/** Continuous-time Kelly ("optimal") leverage estimate: annualised μ / σ². */
export function kellyLeverage(prices: Series, lookback = 365) {
  const r = logReturns(prices.slice(-lookback - 1)).map((x) => Math.exp(x) - 1);
  const m = mean(r), v = std(r) ** 2;
  return v > 0 ? m / v : NaN;
}

/**
 * Practical leverage from the RSPS post: about half of "optimal", rounded down,
 * never below 1x — optimal 2–3x → 1x (ETH, SOL), optimal 4x → 2x (BTC).
 */
export function practicalLeverage(optimal: number, cap = 2) {
  if (!Number.isFinite(optimal) || optimal < 2) return 1;
  return Math.max(1, Math.min(cap, Math.floor(optimal / 2)));
}

export function annVol(prices: Series, n = 30) {
  return std(logReturns(prices.slice(-n - 1))) * Math.sqrt(365);
}

/** Volatility-adjusted momentum: lookback log return divided by annualised volatility. */
export function vams(prices: Series, lookback = 30, volN = 30) {
  if (prices.length < Math.max(lookback, volN) + 2) return NaN;
  const mom = Math.log(prices[prices.length - 1] / prices[prices.length - 1 - lookback]);
  const vol = annVol(prices, volN);
  return vol > 0 ? mom / vol : NaN;
}

/** Ratio trend: fast EMA of ratio above slow EMA → +1, else −1. */
export function ratioTrend(ratio: Series, fast = 12, slow = 26) {
  const f = ema(ratio, fast), s = ema(ratio, slow);
  return f[f.length - 1] > s[s.length - 1] ? 1 : -1;
}

/** Simple trend-probability proxy in [-1, 1]: average of binary trend votes. */
export function tpiProxy(prices: Series, horizon: 'medium' | 'long') {
  const p = prices[prices.length - 1];
  const [a, b, c] = horizon === 'medium' ? [20, 50, 30] : [50, 200, 180];
  const fast = ema(prices, a), slow = ema(prices, b);
  const votes = [
    p > slow[slow.length - 1] ? 1 : -1,
    fast[fast.length - 1] > slow[slow.length - 1] ? 1 : -1,
    p > prices[prices.length - 1 - c] ? 1 : -1,
    p > sma(prices, b * 2).at(-1)! ? 1 : -1
  ];
  return mean(votes);
}

/** Caps single weights at `cap` and re-distributes the excess proportionally. */
export function capWeights(w: number[], cap = 0.5): number[] {
  let out = [...w];
  const total = out.reduce((s, x) => s + x, 0);
  if (!total) return out;
  out = out.map((x) => x / total);
  for (let iter = 0; iter < 20; iter++) {
    const over = out.map((x) => x > cap + 1e-12);
    if (!over.some(Boolean)) break;
    const excess = out.reduce((s, x, i) => s + (over[i] ? x - cap : 0), 0);
    const freeSum = out.reduce((s, x, i) => s + (over[i] ? 0 : x), 0);
    out = out.map((x, i) => (over[i] ? cap : freeSum ? x + (excess * x) / freeSum : x));
    if (!freeSum) break;
  }
  return out;
}

/** Annualised Sharpe, Sortino and Omega (threshold 0) of daily returns over the last n closes. */
export function ratios(closes: number[], n = 365): { sharpe: number; sortino: number; omega: number } {
  const c = closes.slice(-(n + 1));
  const r = c.slice(1).map((v, i) => v / c[i] - 1).filter(Number.isFinite);
  if (r.length < 30) return { sharpe: NaN, sortino: NaN, omega: NaN };
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  const dn = Math.sqrt(r.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / r.length);
  const g = r.reduce((a, b) => a + Math.max(b, 0), 0), l = r.reduce((a, b) => a - Math.min(b, 0), 0);
  return { sharpe: sd ? (m * 365) / (sd * Math.sqrt(365)) : NaN, sortino: dn ? (m * 365) / (dn * Math.sqrt(365)) : NaN, omega: l ? g / l : NaN };
}

/** Variance ratio of q-day vs 1-day log returns over the last n days (> 1 = trending, < 1 = mean reverting). */
export function varianceRatio(prices: number[], q = 10, n = 90): number {
  const lr = prices.slice(-(n + q + 1)).map((p, i, a) => (i ? Math.log(p / a[i - 1]) : NaN)).slice(1);
  if (lr.length < n + q) return NaN;
  const d = lr.slice(-n), sums: number[] = [];
  for (let i = lr.length - n; i < lr.length; i++) { let s = 0; for (let k = i - q + 1; k <= i; k++) s += lr[k]; sums.push(s); }
  const v = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1); };
  return v(sums) / (q * v(d));
}
