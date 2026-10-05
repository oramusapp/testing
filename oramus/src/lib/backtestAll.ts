// In-app backtests of the whole strategy and of its parts (SDCA, RSPS, LTPI / MTPI), with the same rules as the
// live signals and the research scripts: decisions at the daily close, traded the next day, 0.15% cost per side.
// RSPS uses today's candidate list (survivorship bias: coins that died are missing), so its result is optimistic.
import { capWeights, mean, std } from './quant';
import { klinesAny } from './market';

export const COST = 0.0015;
export const PERIODS = [
  { id: 'full', label: 'Cały okres', from: '', to: '' },
  { id: 'is', label: '2020–2023 (IS)', from: '2020-01-01', to: '2023-12-31' },
  { id: 'oos', label: '2024 → (OOS)', from: '2024-01-01', to: '' }
] as const;

export interface Run { dates: string[]; ret: number[]; expo: number[]; held?: Record<string, number>[] }
export interface Perf { cagr: number; vol: number; sharpe: number; sortino: number; maxDD: number; total: number; expo: number; days: number }

export function perf(run: Run, from = '', to = ''): Perf | null {
  const idx = run.dates.map((d, i) => [d, i] as const).filter(([d]) => (!from || d >= from) && (!to || d <= to)).map(([, i]) => i);
  if (idx.length < 30) return null;
  const r = idx.map((i) => run.ret[i]), e = idx.map((i) => run.expo[i]);
  let eq = 1, peak = 1, dd = 0;
  for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const yrs = r.length / 365, m = mean(r), sd = std(r);
  const down = Math.sqrt(r.reduce((a, x) => a + Math.min(x, 0) ** 2, 0) / Math.max(r.length - 1, 1));
  return { cagr: eq ** (1 / yrs) - 1, vol: sd * Math.sqrt(365), sharpe: sd > 0 ? (m / sd) * Math.sqrt(365) : NaN, sortino: down > 0 ? (m / down) * Math.sqrt(365) : NaN, maxDD: dd, total: eq - 1, expo: mean(e), days: r.length };
}

export const equity = (ret: number[]) => { let e = 1; return ret.map((x) => (e *= 1 + x)); };

/** Buy & hold BTC from the first date of `dates`. */
export function buyHold(dates: string[], prices: number[]): Run {
  return { dates, ret: prices.map((p, i) => (i ? p / prices[i - 1] - 1 : 0)), expo: prices.map(() => 1) };
}

/** Long BTC while the TPI state is positive, otherwise stablecoin (decided at close t, held from t+2 like the research engine). */
export function tpiRun(dates: string[], prices: number[], state: number[], start: number): Run {
  const ret: number[] = [], expo: number[] = [], ds: string[] = [];
  for (let i = start; i < prices.length; i++) {
    const pos = i >= 2 && state[i - 2] > 0 ? 1 : 0, prev = i >= 3 && state[i - 3] > 0 ? 1 : 0;
    ret.push(pos * (prices[i] / prices[i - 1] - 1) - Math.abs(pos - prev) * COST); expo.push(pos); ds.push(dates[i]);
  }
  return { dates: ds, ret, expo };
}

/** SDCA run from the app's backtest equity (daily equity from startIndex) and the BTC share per day. */
export function sdcaRun(dates: string[], startIndex: number, equityUsd: number[], btcShare: number[]): Run {
  return { dates: dates.slice(startIndex), ret: equityUsd.map((v, i) => (i ? v / equityUsd[i - 1] - 1 : 0)), expo: btcShare };
}

// ---------- RSPS ----------
export interface CoinSeries { sym: string; close: number[]; quote: number[] }   // aligned to the master dates, NaN = missing

/** Daily closes and quote volume from Binance for each symbol, aligned to `dates`. */
export async function loadCoins(dates: string[], syms: string[], onProgress?: (m: string) => void): Promise<CoinSeries[]> {
  const pos = new Map(dates.map((d, i) => [d, i]));
  const start = Date.parse(dates[0] + 'T00:00:00Z');
  const out: CoinSeries[] = []; let done = 0;
  await Promise.all(syms.map(async (sym) => {
    const close = new Array(dates.length).fill(NaN), quote = new Array(dates.length).fill(NaN);
    try {
      const k = await klinesAny(sym, 0, start);
      for (const x of k) { const i = pos.get(new Date(x.t).toISOString().slice(0, 10)); if (i != null) { close[i] = x.c; quote[i] = x.q; } }
      out.push({ sym, close, quote });
    } catch { /* coin not on Binance: skipped */ }
    onProgress?.(`dane RSPS ${++done}/${syms.length}`);
  }));
  return out;
}

const trend4 = (c: number[], i: number) => {
  const v = [20, 50, 100, 200].map((L) => { if (i < L) return NaN; let s = 0; for (let k = i - L + 1; k <= i; k++) s += c[k]; return c[i] > s / L ? 1 : 0; });
  return v.some(Number.isNaN) ? NaN : mean(v);
};
const finiteFrom = (a: number[], i: number, n: number) => { for (let k = i - n + 1; k <= i; k++) if (!(a[k] > 0)) return false; return true; };

/** Relative strength as in the research (strategies.rs_scores): log change of the coin/BTC ratio over 30/60/90 days
 *  divided by the coin's own 30-day annualised volatility, averaged over the three lookbacks. */
export function rsScore(ratio: number[], coinVol: number): number {
  const n = ratio.length - 1;
  if (!(coinVol > 0)) return NaN;
  return mean([30, 60, 90].map((L) => Math.log(ratio[n] / ratio[n - L]) / coinVol));
}

export interface RspsOpts { universe: number; topN: number; cap: number; parking: 'stable' | 'btc' | 'hybrid'; hybridMax: number; every?: number }

/** Weekly relative-strength rotation with the live rules: point-in-time liquidity universe, VAMS of the coin/BTC ratio
 *  (30/60/90), breadth gate 70%/60%, own trend ≥ 0.5, LTPI < 0 → all stablecoin, parking per choice when the gate is closed. */
export function rspsRun(dates: string[], btc: number[], coins: CoinSeries[], ltpi: number[], risk: number[], start: number, o: RspsOpts): Run {
  const every = o.every ?? 7;
  const n = dates.length;
  const W: number[][] = []; let cur: Record<string, number> = {}; let gate = false;
  const syms = ['BTC', ...coins.map((c) => c.sym)], col = new Map(syms.map((s, i) => [s, i]));
  for (let i = 0; i < n; i++) {
    if (i >= start && (i - start) % every === 0) {
      const bt = trend4(btc, i);
      const rows = coins.filter((c) => finiteFrom(c.close, i, 91)).map((c) => {
        const ratio: number[] = []; for (let k = i - 90; k <= i; k++) ratio.push(c.close[k] / btc[k]);
        const r50 = mean(ratio.slice(-51, -1));
        let q = 0; for (let k = i - 29; k <= i; k++) q += c.quote[k] || 0;
        const closes = c.close.slice(i - 30, i + 1);
        const vol = std(closes.slice(1).map((x, k) => Math.log(x / closes[k]))) * Math.sqrt(365);
        return { sym: c.sym, liq: q, up: ratio[ratio.length - 1] > r50, score: rsScore(ratio, vol), trend: trend4(c.close, i), vol };
      }).sort((a, b) => b.liq - a.liq).slice(0, o.universe - 1);   // BTC itself is one of the top-N by liquidity (as in the research)
      const breadth = rows.length ? rows.filter((r) => r.up).length / rows.length : 0;
      gate = gate ? breadth >= 0.6 : breadth >= 0.7;
      const w: Record<string, number> = {};
      const parkBtc = o.parking === 'btc' || (o.parking === 'hybrid' && risk[i] < o.hybridMax);   // unpicked capital follows the parking rule
      if (ltpi[i] < 0) { /* defence: all stablecoin */ }
      else if (gate && bt >= 0.5) {
        const picks = rows.filter((r) => r.score > 0 && r.trend >= 0.5).sort((a, b) => b.score - a.score).slice(0, o.topN);
        const cw = capWeights(picks.map((r) => r.score / (r.vol || 1)), o.cap).map((x) => Math.min(x, o.cap));
        picks.forEach((r, k) => (w[r.sym] = cw[k]));
        const rest = 1 - cw.reduce((a, b) => a + b, 0);
        if (rest > 1e-6 && bt > 0 && parkBtc) w.BTC = rest * bt;
      } else if (bt > 0 && parkBtc) w.BTC = bt;
      cur = w;
    }
    const row = new Array(syms.length).fill(0); for (const [s, x] of Object.entries(cur)) row[col.get(s)!] = x;
    W.push(row);
  }
  const px = (j: number, i: number) => (j === 0 ? btc[i] : coins[j - 1].close[i]);
  const ret: number[] = [], expo: number[] = [], ds: string[] = [], hs: Record<string, number>[] = [];
  for (let i = Math.max(start, 3); i < n; i++) {
    const held = W[i - 2], prev = W[i - 3];
    const h: Record<string, number> = {}; held.forEach((x, j) => { if (x) h[syms[j]] = x; }); hs.push(h);
    let r = 0, turn = 0, e = 0;
    for (let j = 0; j < syms.length; j++) {
      const a = px(j, i), b = px(j, i - 1);
      if (held[j] && a > 0 && b > 0) r += held[j] * (a / b - 1);
      turn += Math.abs(held[j] - prev[j]); e += held[j];
    }
    ret.push(r - turn * COST); expo.push(e); ds.push(dates[i]);
  }
  return { dates: ds, ret, expo, held: hs };
}

/** Two sub-accounts (SDCA / RSPS) rebalanced back to the split when SDCA's share leaves ±band. */
export function combine(a: Run, b: Run, wA = 0.6, band = 0.1, target?: (date: string) => number): Run {
  const mb = new Map(b.dates.map((d, i) => [d, i]));
  const dates: string[] = [], ret: number[] = [], expo: number[] = [];
  let va = wA, vb = 1 - wA;
  a.dates.forEach((d, i) => {
    const j = mb.get(d); if (j == null) return;
    const tot = va + vb, tg = target ? target(d) : wA;
    let cost = 0;
    if (Math.abs(va / tot - tg) > band) { cost = Math.abs(va / tot - tg) * ((a.expo[i] + b.expo[j]) / 2) * COST * 2; va = tot * tg; vb = tot * (1 - tg); }
    const t0 = va + vb;
    expo.push((va * a.expo[i] + vb * b.expo[j]) / t0);
    va *= 1 + a.ret[i]; vb *= 1 + b.ret[j];
    ret.push((va + vb) / t0 - 1 - cost); dates.push(d);
  });
  return { dates, ret, expo };
}
