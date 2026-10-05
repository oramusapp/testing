import { describe, it, expect } from 'vitest';
import data from '../data-btc.json';
import { fitCurvature, rails, priceRisk, curveRate, DEFAULT_CURVE, backtest, adf, practicalLeverage, capWeights, detrendedRisk, normInv, normCdf } from './quant';

const rows = (data as any).rows as [string, number, number | null][];
const dates = rows.map(r => r[0]), prices = rows.map(r => r[1]);

describe('quant', () => {
  it('normal inverse round-trips', () => {
    for (const p of [0.01, 0.2, 0.5, 0.9]) expect(normCdf(normInv(p))).toBeCloseTo(p, 3);
  });
  it('curvature model gives ordered rails and sane risk', () => {
    const m = fitCurvature(dates, prices);
    const r = rails(m, '2026-10-04');
    console.log('rails 2026-10-04', r[0].toFixed(0), r[10].toFixed(0), r[20].toFixed(0));
    expect(r[0]).toBeLessThan(r[10]);
    const pr = priceRisk(m, '2026-10-04', 85400);
    console.log('risk@85.4k', pr);
    expect(pr.risk).toBeGreaterThan(0); expect(pr.risk).toBeLessThan(1);
    const risks = dates.map((d, i) => priceRisk(m, d, prices[i]).risk * 100);
    const mv = detrendedRisk(dates, rows.map(r => r[2] ?? NaN));
    console.log('mvrv risk last', mv.risk.filter(Number.isFinite).at(-1));
    const s = dates.indexOf('2015-01-01');
    const bt = backtest(prices, risks, DEFAULT_CURVE, s, 10000);
    console.log({ ...bt, equity: undefined, lumpEquity: undefined, actions: undefined });
    expect(bt.value).toBeGreaterThan(0);
  });
  it('curve interpolation', () => {
    expect(curveRate(DEFAULT_CURVE, 0)).toBe(10);
    expect(curveRate(DEFAULT_CURVE, 22.5)).toBe(2.5);
    expect(curveRate(DEFAULT_CURVE, 100)).toBe(-10);
  });
  it('adf: random walk not rejected, AR(0.5) rejected', () => {
    let x = 0; const rw: number[] = []; const ar: number[] = []; let a = 0;
    let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    for (let i = 0; i < 500; i++) { x += rnd(); rw.push(x); a = 0.5 * a + rnd(); ar.push(a); }
    expect(adf(rw).stat).toBeGreaterThan(-2.86);
    expect(adf(ar).stat).toBeLessThan(-2.86);
  });
  it('leverage + weights', () => {
    expect(practicalLeverage(4)).toBe(2); expect(practicalLeverage(2.5)).toBe(1); expect(practicalLeverage(3)).toBe(1);
    const w = capWeights([5, 1, 1]); expect(w[0]).toBeCloseTo(0.5); expect(w[1]).toBeCloseTo(0.25);
  });
});

import { safetyStep, SAFETY } from './quant';
describe('SDCA safety', () => {
  it('sells 2% of BTC when LTPI < 0 and risk ≥ 70', () => {
    expect(safetyStep(75, -1, 1000, 0, 0)).toEqual({ kind: 'sell', usd: 1000 * SAFETY.sellRate });
  });
  it('does nothing below the risk threshold or with LTPI ≥ 0 and nothing owed', () => {
    expect(safetyStep(60, -1, 1000, 0, 0).kind).toBeNull();
    expect(safetyStep(90, 1, 1000, 0, 0).kind).toBeNull();
  });
  it('buys back 20% of what it sold once LTPI turns positive', () => {
    expect(safetyStep(80, 1, 0, 500, 500)).toEqual({ kind: 'rebuy', usd: 100 });
  });
  it('backtest with an always-negative LTPI ends with less BTC than without', () => {
    const n = 400, prices = Array.from({ length: n }, (_, i) => 100 + i), risk = Array.from({ length: n }, (_, i) => (i < 50 ? 0 : 80));
    const a = backtest(prices, risk, DEFAULT_CURVE, 0, 1000), b = backtest(prices, risk, DEFAULT_CURVE, 0, 1000, prices.map(() => -1));
    expect(b.btc).toBeLessThan(a.btc);
  });
});

import { ratios } from './quant';
describe('risk-adjusted ratios', () => {
  it('omega > 1 and positive Sharpe/Sortino for a rising series with dips', () => {
    const c = Array.from({ length: 400 }, (_, i) => 100 * Math.exp(0.002 * i) * (1 + 0.02 * Math.sin(i)));
    const r = ratios(c);
    expect(r.omega).toBeGreaterThan(1); expect(r.sharpe).toBeGreaterThan(0); expect(r.sortino).toBeGreaterThan(r.sharpe);
  });
});

import { varianceRatio } from './quant';
describe('variance ratio', () => {
  it('is > 1 for a persistent trend in returns and < 1 for alternating returns', () => {
    let p = 100; const trend: number[] = [p], alt: number[] = [p];
    for (let i = 0; i < 300; i++) { p *= 1 + 0.01 * Math.sign(Math.sin(i / 15)); trend.push(p); }
    p = 100; for (let i = 0; i < 300; i++) { p *= i % 2 ? 1.02 : 0.98; alt.push(p); }
    expect(varianceRatio(trend)).toBeGreaterThan(1); expect(varianceRatio(alt)).toBeLessThan(1);
  });
});

import { normCdf as Phi } from './quant';
describe('normal table (lesson values)', () => {
  it('matches the z-table', () => {
    expect(Phi(-2.6)).toBeCloseTo(0.0047, 4); expect(Phi(0.54)).toBeCloseTo(0.7054, 4); expect(Phi(-1)).toBeCloseTo(0.1587, 4);
    expect(Phi(1) - Phi(-1)).toBeCloseTo(0.6827, 3); expect(Phi(2) - Phi(-2)).toBeCloseTo(0.9545, 3);
  });
});

import { linfit } from './quant';
describe('linear fit', () => {
  it('recovers a perfect line and r = ±1', () => {
    const f = linfit([1, 2, 3, 4], [3, 5, 7, 9]); expect(f.r).toBeCloseTo(1); expect(f.a).toBeCloseTo(1); expect(f.b).toBeCloseTo(2);
    expect(linfit([1, 2, 3], [3, 2, 1]).r).toBeCloseTo(-1);
  });
});

import { spearman, probit } from './quant';
describe('spearman and probit', () => {
  it('spearman = 1 for a monotonic curve, probit inverts Φ', () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 8, 27, 64, 125])).toBeCloseTo(1);
    expect(probit(0.975)).toBeCloseTo(1.96, 2); expect(probit(0.5)).toBeCloseTo(0, 6);
  });
});

import { polyfit } from './quant';
describe('polyfit', () => {
  it('fits a parabola exactly with degree 2', () => {
    const x = [-2, -1, 0, 1, 2, 3], y = x.map((v) => 1 + 2 * v + 0.5 * v * v);
    const f = polyfit(x, y, 2) as ReturnType<typeof polyfit> & { f: (v: number) => number };
    expect(f.r2).toBeCloseTo(1, 6); expect(f.f(4)).toBeCloseTo(1 + 8 + 8, 6);
  });
});

import { athSellSeries } from './quant';

describe('athSellSeries', () => {
  it('sells growing fractions on ATH days with high risk and resets after a 50% drawdown', () => {
    const prices = [100, 110, 105, 120, 130, 60, 140, 150];
    const risk = [80, 80, 80, 80, 40, 80, 80, 80];
    const { frac, k } = athSellSeries(prices, risk);
    expect(frac[0]).toBe(0);                          // first day: no prior high
    expect(frac[1]).toBeCloseTo(0.01);                // 1st sale
    expect(frac[2]).toBe(0);                          // not an ATH
    expect(frac[3]).toBeCloseTo(0.011);               // 2nd sale ×1.1
    expect(frac[4]).toBe(0);                          // ATH but risk < 70
    expect(k[5]).toBe(0);                             // 60 < 130 × 0.5 → reset
    expect(frac[6]).toBeCloseTo(0.01);
    expect(frac[7]).toBeCloseTo(0.011);
  });
});

import { autoValuation, dailyIssuance, supplySeries } from './onchain';
describe('onchain', () => {
  it('follows the halving schedule and gives finite z for the built-in history', () => {
    expect(dailyIssuance('2012-01-01')).toBe(7200);
    expect(dailyIssuance('2025-01-01')).toBe(450);
    const s = supplySeries(['2020-05-11', '2024-04-20']);
    expect(s[0]).toBeGreaterThan(18.1e6); expect(s[0]).toBeLessThan(18.6e6);
    expect(s[1]).toBeGreaterThan(19.5e6); expect(s[1]).toBeLessThan(19.9e6);
    const v = autoValuation(rows);
    for (const k of ['mvrvz', 'nupl', 'realized', '2yma', 'puell']) expect(Number.isFinite(v.z[k])).toBe(true);
  });
});

import { structureScore, taAuto } from './autoSignals';
describe('taAuto', () => {
  it('scores an uptrend positive and a downtrend negative', () => {
    const up = Array.from({ length: 400 }, (_, i) => 100 + i + 15 * Math.sin(i / 6));
    const down = up.map((x) => 1000 - x);
    expect(structureScore(up)).toBe(1);
    expect(structureScore(down)).toBe(-1);
    expect(taAuto(up).z).toBeGreaterThan(0);
    expect(taAuto(down).z).toBeLessThan(0);
  });
});

import { startPaper, stepPaper, paperStats, paperSummary } from './paper';
describe('live testing (paper portfolio)', () => {
  it('follows SDCA buys and RSPS targets once per closed day, with stats and summaries', () => {
    const base = { prices: { ETH: 2000 }, risk: 20, ltpi: 1, safety: true, split: 0.6 };
    let s = startPaper('2026-01-01', 10000, 50000, 0.6);
    s = stepPaper(s, { ...base, date: '2026-01-01', btcPrice: 50000, sdcaRate: 0.1, rspsTarget: [{ sym: 'ETH', w: 0.5 }] });
    expect(s.sdca.btc).toBeGreaterThan(0);
    expect(s.rsps.units.ETH).toBeCloseTo((0.5 * 4000) / 2000, 2);
    const same = stepPaper(s, { ...base, date: '2026-01-01', btcPrice: 60000, sdcaRate: 0.1, rspsTarget: null });
    expect(same).toBe(s);                                   // idempotent per date
    s = stepPaper(s, { ...base, date: '2026-01-02', btcPrice: 55000, prices: { ETH: 2200 }, sdcaRate: 0, rspsTarget: null });
    expect(s.points.length).toBe(2);
    const st = paperStats(s)!;
    expect(st.value).toBeGreaterThan(10000);
    expect(paperSummary(s, 'month')[0].period).toBe('2026-01');
  });
});

import { minBuyRate } from './quant';
describe('minimum SDCA buy', () => {
  it('holds at 1%/day or less, buys above, leaves sells alone', () => {
    expect(minBuyRate(0.96)).toBe(0);
    expect(minBuyRate(1)).toBe(0);
    expect(minBuyRate(1.25)).toBe(1.25);
    expect(minBuyRate(-2)).toBe(-2);
  });
});

import { score42, kissBtc, MACRO42_EMPTY } from './macro42';
describe('42 Macro weekly readings', () => {
  it('maps readings to a σ score and applies the KISS Bitcoin rule', () => {
    const m = { ...MACRO42_EMPTY, regime: 'R' as const, riskOnProb: 75, btcVams: 'bull' as const, crashRisk: 'high' as const };
    const s = score42(m);
    expect(s.parts.length).toBe(4);
    expect(s.z).toBeCloseTo((1 + 1 + 1 - 1) / 4, 2);
    expect(kissBtc(m)).toBe(10);
    expect(kissBtc({ ...m, regime: 'I', btcVams: 'neutral' })).toBe(2.5);
    expect(score42(MACRO42_EMPTY).z).toBeNull();
  });
});
