// Builds every per-day series the SDCA tab needs from the raw BTC history.
// Runs inside a Web Worker (sdca.worker.ts) because the quantile fits take a few seconds.
// No look-ahead: every day's value uses only data available at that day's close. The quantile rails are refitted
// each year on data before 1 January (research/sdca.py price_risk_expanding); percentiles use only past values.
import { fitCurvature, priceRisk, rails, detrendedRiskExpanding, rollingSharpe, ema, percentileRankExpanding, normInv, TAUS, type CurvatureModel } from './quant';
import { freshToday, type Row } from './market';

export const INDICATORS = [
  { id: 'price', name: 'Asymmetric Tail Curvature (cena)', note: 'Regresja kwantylowa log-ceny względem log-czasu, osobna krzywizna dla każdego kwantyla.' },
  { id: 'sharpe', name: 'Sharpe (365d, EMA 14d)', note: 'Zastępstwo „Sharpe (realized P/L)” — rolling Sharpe ceny; brak darmowych danych realized P/L.' },
  { id: 'mvrv', name: 'Cost Basis P/L Ratio — MVRV (EMA 7d)', note: 'MVRV z Coin Metrics, odtrendowane względem log-czasu, percentyl historyczny.' },
  { id: 'manual', name: 'Onchain Risk Composite (ręcznie)', note: 'Wartość ryzyka 0–100% wpisana ręcznie, np. odczytana ze strony sygnałów.' }
] as const;
export type IndicatorId = (typeof INDICATORS)[number]['id'];

export interface SdcaModel {
  dates: string[];
  prices: number[];
  risk: Record<Exclude<IndicatorId, 'manual'>, number[]>; // 0..100
  z: Record<Exclude<IndicatorId, 'manual'>, number[]>;
  rails: number[][]; // per day, prices at RAIL_TAUS
  mvrvStaleFrom: string | null;
  betas: number[][];
}
export const RAIL_TAUS = [0.01, 0.1, 0.25, 0.5, 0.75, 0.95, 0.99];
/** First year with a point-in-time model (fitted on 2010-07 … 2012-12); earlier days have no valuation. */
export const FIRST_FIT_YEAR = 2013;

export function buildModel(rows: Row[]): SdcaModel {
  const dates = rows.map((r) => r[0]);
  const prices = rows.map((r) => r[1]);
  const railIdx = RAIL_TAUS.map((t) => TAUS.indexOf(t));
  const lastYear = +dates[dates.length - 1].slice(0, 4);
  const models = new Map<number, CurvatureModel>();
  for (let Y = FIRST_FIT_YEAR; Y <= lastYear; Y++) {
    const n = dates.findIndex((d) => d >= `${Y}-01-01`);
    if (n > 365) models.set(Y, fitCurvature(dates.slice(0, n), prices.slice(0, n)));
  }
  const modelFor = (d: string) => models.get(+d.slice(0, 4));
  const pr = dates.map((d, i) => { const m = modelFor(d); return m ? priceRisk(m, d, prices[i]) : { risk: NaN, z: NaN }; });
  const railsPerDay = dates.map((d) => { const m = modelFor(d); if (!m) return railIdx.map(() => NaN); const r = rails(m, d); return railIdx.map((i) => r[i]); });
  const m = models.get(lastYear) ?? fitCurvature(dates, prices);

  // MVRV on days without on-chain data yet: hold the last realized price (slow-moving) and use today's close, instead of
  // carrying MVRV itself (which would hold the market/realized ratio fixed while the price moves)
  let lastRp = NaN, staleFrom: string | null = null;
  const mv = rows.map((r) => {
    if (r[2] != null && r[2] > 0) { lastRp = r[1] / r[2]; staleFrom = null; return r[2]; }
    if (!staleFrom && Number.isFinite(lastRp)) staleFrom = r[0];
    return lastRp > 0 ? r[1] / lastRp : NaN;
  });
  const mvr = detrendedRiskExpanding(dates, ema(mv, 7), FIRST_FIT_YEAR);
  const sh = ema(rollingSharpe(prices), 14);
  const shRisk = percentileRankExpanding(sh);
  return {
    dates, prices, betas: m.betas, rails: railsPerDay, mvrvStaleFrom: staleFrom,
    risk: { price: pr.map((x) => x.risk * 100), mvrv: mvr.risk.map((x) => x * 100), sharpe: shRisk.map((x) => x * 100) },
    z: { price: pr.map((x) => x.z), mvrv: mvr.z, sharpe: shRisk.map((r) => (Number.isFinite(r) ? -normInv(Math.min(Math.max(r, 0.001), 0.999)) : NaN)) }
  };
}

/** Manual risk indicator, only if entered after the latest daily close (it resets at every 00:00 UTC close). */
export const freshManual = (c: { manualRisk: number | null; manualUpdated?: number }) => (freshToday(c.manualUpdated) ? c.manualRisk : null);

/** Equal-weight composite of enabled indicators (manual indicator applies to the latest day only). */
export function composite(model: SdcaModel, enabled: Record<string, boolean>, manualRisk: number | null) {
  const ids = (['price', 'sharpe', 'mvrv'] as const).filter((id) => enabled[id]);
  const n = model.dates.length;
  const risk = new Array(n).fill(NaN), z = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const rs: number[] = [], zs: number[] = [];
    for (const id of ids) {
      if (Number.isFinite(model.risk[id][i])) { rs.push(model.risk[id][i]); zs.push(model.z[id][i]); }
    }
    if (i === n - 1 && enabled.manual && manualRisk != null && Number.isFinite(manualRisk)) {
      rs.push(manualRisk); zs.push(-normInv(Math.min(Math.max(manualRisk / 100, 0.001), 0.999)));
    }
    if (rs.length) { risk[i] = rs.reduce((a, b) => a + b, 0) / rs.length; z[i] = zs.reduce((a, b) => a + b, 0) / zs.length; }
  }
  return { risk, z };
}
