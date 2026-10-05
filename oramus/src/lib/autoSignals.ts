// Automatic pillar inputs, recomputed after every daily (00:00 UTC) candle close.
import { adf, ADF_CRIT, logReturns, mean, std, sma } from './quant';
import { computeTpi, MTPI_SPEC, LTPI_SPEC, type TpiResult } from './tpi';

export interface AutoSignals {
  date: string;
  mtpi: TpiResult; ltpiTpi: TpiResult; ltpiSma: number;
  trendEnsemble: number; ltpi: number; sdcaRisk: number; mvrvRisk: number;
  adfStat: number; adfTrending: boolean; tStat90: number;
  vol30: number; volMedian365: number; volBelowMedian: boolean;
  persistDays: number;
  zMom: number; zVal: number;
  /** pillar z-scores (σ), positive = favourable */
  system: number; onchain: number; stats: number;
  ta: number; taParts: TaParts;
}


function trendAt(p: number[], i: number) {
  const votes = [20, 50, 100, 200].map((L) => {
    if (i < L) return NaN;
    let s = 0; for (let k = i - L + 1; k <= i; k++) s += p[k];
    return p[i] > s / L ? 1 : 0;
  });
  return votes.some(Number.isNaN) ? NaN : mean(votes);
}
function volAt(p: number[], i: number, n = 30) {
  return std(logReturns(p.slice(i - n, i + 1))) * Math.sqrt(365);
}
function adfAt(p: number[], i: number, w = 90) {
  return adf(p.slice(i - w + 1, i + 1).map(Math.log)).stat;
}

/** Same automatic conditions as the backtested strict leverage gate (research/run7.py); LTPI from the chosen source. */
function gateAt(p: number[], risk: number[], i: number, ltpiAt: (i: number) => number) {
  const vols: number[] = [];
  for (let k = i - 364; k <= i; k++) vols.push(volAt(p, k));
  const med = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
  return trendAt(p, i) >= 1 && adfAt(p, i) > ADF_CRIT['5%'] && ltpiAt(i) > 0 && risk[i] < 50 && volAt(p, i) < med;
}

export interface TaParts { bbWeekly: number; bbDaily: number; structure: number; }
const clamp3 = (x: number) => Math.max(-3, Math.min(3, x));
/** Position of the last close inside Bollinger Bands, in σ of the band's window: (close − SMA) / SD. */
function bbPos(closes: number[], n: number) {
  if (closes.length < n) return NaN;
  const w = closes.slice(-n), m = mean(w), sd = std(w);
  return sd > 0 ? (closes[closes.length - 1] - m) / sd : NaN;
}
/** Market structure from confirmed swing points (pivot = extreme within ±L days): higher highs and higher lows = +1,
 *  lower highs and lower lows = −1, mixed = 0. Replaces the discretionary reading with a fixed rule. */
export function structureScore(p: number[], L = 10) {
  const highs: number[] = [], lows: number[] = [];
  for (let k = L; k < p.length - L; k++) {
    let hi = true, lo = true;
    for (let j = k - L; j <= k + L; j++) { if (p[j] > p[k]) hi = false; if (p[j] < p[k]) lo = false; }
    if (hi) highs.push(p[k]); if (lo) lows.push(p[k]);
  }
  if (highs.length < 2 || lows.length < 2) return 0;
  const hh = highs[highs.length - 1] > highs[highs.length - 2], hl = lows[lows.length - 1] > lows[lows.length - 2];
  return hh && hl ? 1 : !hh && !hl ? -1 : 0;
}
/** Automatic technical-analysis pillar: BTC weekly BB(20) position, daily BB(50) position and market structure. */
export function taAuto(prices: number[]): { z: number; parts: TaParts } {
  const weekly: number[] = [];
  for (let k = prices.length - 1; k >= 0; k -= 7) weekly.unshift(prices[k]);
  const parts = { bbWeekly: bbPos(weekly, 20), bbDaily: bbPos(prices, 50), structure: structureScore(prices.slice(-400)) };
  const xs = [parts.bbWeekly, parts.bbDaily, parts.structure].filter(Number.isFinite).map(clamp3);
  return { z: xs.length ? mean(xs) : NaN, parts };
}

/** z-score of the latest 90-day log return against the distribution of 90-day returns over the last 8 years. */
function momentumZ(p: number[], h = 90, years = 8) {
  const n = p.length - 1;
  const from = Math.max(h, n - years * 365);
  const rs: number[] = [];
  for (let k = from; k <= n; k += 1) rs.push(Math.log(p[k] / p[k - h]));
  return (rs[rs.length - 1] - mean(rs)) / std(rs);
}

export function computeAuto(dates: string[], prices: number[], compositeRisk: number[], mvrvSeries: number[], compositeZ: number[], mvrvZ: number[], ltpiSource: 'ensemble' | 'sma200' = 'ensemble', tpiPrices?: number[], hyst = 0): AutoSignals {
  // LTPI / MTPI are built on $TOTAL (course notes); BTC-specific inputs (trend sizing, ADF, volatility, momentum) stay on BTC
  const tp = tpiPrices && tpiPrices.length === prices.length ? tpiPrices : prices;
  const i = prices.length - 1;
  const trendEnsemble = trendAt(prices, i);
  const s200 = sma(tp.slice(-200), 200).at(-1)!;
  const ltpiSma = tp[i] > s200 ? 1 : -1;
  const W = 1500, off = prices.length - Math.min(W, prices.length);
  const mtpi = computeTpi(tp, MTPI_SPEC, W, hyst);
  const ltpiTpi = computeTpi(tp, LTPI_SPEC, W, hyst);
  // significance needs the whole history (the 1500-day window leaves only ~3 years after warm-up)
  mtpi.sig = computeTpi(tp, MTPI_SPEC, tp.length, hyst).sig;
  ltpiTpi.sig = computeTpi(tp, LTPI_SPEC, tp.length, hyst).sig;
  const ltpiAt = (k: number) => ltpiSource === 'ensemble'
    ? (ltpiTpi.stateSeries[k - off] ?? 0)
    : (tp[k] > sma(tp.slice(k - 199, k + 1), 200).at(-1)! ? 1 : -1);
  const ltpi = ltpiAt(i);
  const sdcaRisk = compositeRisk[i];
  const mvrvRisk = mvrvSeries[i];
  const adfStat = adfAt(prices, i);
  const adfTrending = adfStat > ADF_CRIT['5%'];
  const r = logReturns(prices.slice(-91));
  const tStat90 = mean(r) / (std(r) / Math.sqrt(r.length));
  const vol30 = volAt(prices, i);
  const vols: number[] = [];
  for (let k = i - 364; k <= i; k++) vols.push(volAt(prices, k));
  const volMedian365 = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
  let persistDays = 0;
  for (let k = i; k > i - 40 && k > 600; k--) { if (gateAt(prices, compositeRisk, k, ltpiAt)) persistDays++; else break; }
  const zMom = momentumZ(prices);
  const ta = taAuto(prices.slice(0, i + 1));
  const zVal = compositeZ[i];
  return {
    date: dates[i], mtpi, ltpiTpi, ltpiSma, trendEnsemble, ltpi, sdcaRisk, mvrvRisk, adfStat, adfTrending, tStat90, vol30, volMedian365,
    volBelowMedian: vol30 < volMedian365, persistDays,
    zMom, zVal,
    system: Number.isFinite(zVal) ? mean([zMom, zVal]) : zMom,
    onchain: Number.isFinite(mvrvZ[i]) ? mvrvZ[i] : NaN,
    stats: tStat90 * (adfTrending ? 1 : 0.5),
    ta: ta.z, taParts: ta.parts
  };
}

/** Contrarian z of Fear & Greed vs its own history: extreme fear → positive z. */
export const sentimentZ = (fg: number, mu: number, sd: number) => (sd > 0 ? -(fg - mu) / sd : NaN);
