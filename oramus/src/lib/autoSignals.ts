// Automatic pillar inputs, recomputed after every daily (00:00 UTC) candle close.
import { adf, ADF_CRIT, logReturns, mean, std, sma } from './quant';

export interface AutoSignals {
  date: string;
  trendEnsemble: number; ltpi: number; sdcaRisk: number; mvrvRisk: number;
  adfStat: number; adfTrending: boolean; tStat90: number;
  vol30: number; volMedian365: number; volBelowMedian: boolean;
  persistDays: number;
  system: number; onchain: number; stats: number;
}

const clip = (x: number) => Math.max(-1, Math.min(1, x));

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

/** Same automatic conditions as the backtested strict leverage gate (research/run7.py). */
function gateAt(p: number[], risk: number[], i: number) {
  const s200 = sma(p.slice(i - 199, i + 1), 200).at(-1)!;
  const vols: number[] = [];
  for (let k = i - 364; k <= i; k++) vols.push(volAt(p, k));
  const med = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
  return trendAt(p, i) >= 1 && adfAt(p, i) > ADF_CRIT['5%'] && p[i] > s200 && risk[i] < 50 && volAt(p, i) < med;
}

export function computeAuto(dates: string[], prices: number[], compositeRisk: number[], mvrvSeries: number[]): AutoSignals {
  const i = prices.length - 1;
  const trendEnsemble = trendAt(prices, i);
  const s200 = sma(prices.slice(-200), 200).at(-1)!;
  const ltpi = prices[i] > s200 ? 1 : -1;
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
  for (let k = i; k > i - 40 && k > 600; k--) { if (gateAt(prices, compositeRisk, k)) persistDays++; else break; }
  const valuation = Number.isFinite(sdcaRisk) ? clip((50 - sdcaRisk) / 50) : 0;
  return {
    date: dates[i], trendEnsemble, ltpi, sdcaRisk, mvrvRisk, adfStat, adfTrending, tStat90, vol30, volMedian365,
    volBelowMedian: vol30 < volMedian365, persistDays,
    system: mean([2 * trendEnsemble - 1, ltpi, valuation]),
    onchain: Number.isFinite(mvrvRisk) ? clip((50 - mvrvRisk) / 50) : 0,
    stats: clip(tStat90 / 2) * (adfTrending ? 1 : 0.5)
  };
}

/** Contrarian reading of Fear & Greed: extreme fear → +1, extreme greed → −1. */
export const sentimentScore = (fg: number) => clip((50 - fg) / 50);
