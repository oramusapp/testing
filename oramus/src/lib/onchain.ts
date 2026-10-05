// Valuation indicators computed from data the app already has (daily price + MVRV from Coin Metrics),
// so the valuation sheet needs no manual reading for them. Supply and miner issuance follow the fixed
// halving schedule (approximation: 144 blocks per day). z uses the TRW sign: + = cheap, − = expensive,
// against the indicator's own full history (research/run35.py: non-detrended ranks predicted forward
// returns better than detrended ones).
const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20', '2028-04-15'];
const DAY = 86400000;

/** BTC issued per day on a given date (subsidy × 144 blocks). */
export function dailyIssuance(date: string): number {
  let sub = 50;
  for (const h of HALVINGS) if (date >= h) sub /= 2;
  return sub * 144;
}

// Supply is exact at each halving (210,000 blocks × subsidy); between them it is interpolated linearly in time.
const ANCHORS: [string, number][] = [['2009-01-03', 0], ['2012-11-28', 10.5e6], ['2016-07-09', 15.75e6], ['2020-05-11', 18.375e6], ['2024-04-20', 19.6875e6]];

/** Approximate circulating supply on each date. */
export function supplySeries(dates: string[]): number[] {
  const t = (d: string) => Date.parse(d + 'T00:00:00Z');
  return dates.map((d) => {
    const x = t(d);
    for (let i = 1; i < ANCHORS.length; i++) {
      if (d <= ANCHORS[i][0]) {
        const [d0, s0] = ANCHORS[i - 1], [d1, s1] = ANCHORS[i];
        return s0 + (s1 - s0) * (x - t(d0)) / (t(d1) - t(d0));
      }
    }
    const [dl, sl] = ANCHORS[ANCHORS.length - 1];
    return Math.min(21e6, sl + 450 * (x - t(dl)) / DAY);
  });
}

const sma = (a: number[], n: number) => {
  const out = new Array(a.length).fill(NaN); let sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i])) { sum += a[i]; cnt++; }
    if (i >= n && Number.isFinite(a[i - n])) { sum -= a[i - n]; cnt--; }
    if (i >= n - 1 && cnt === n) out[i] = sum / n;
  }
  return out;
};
const ema = (a: number[], n: number) => { const k = 2 / (n + 1); let e = NaN; return a.map((x) => (Number.isFinite(x) ? (e = Number.isFinite(e) ? e + k * (x - e) : x) : e)); };

/** TRW-sign z of the last value vs the series' history (only finite values from 2011 on). */
function zLast(series: number[], dates: string[]): number | null {
  const xs = series.filter((x, i) => Number.isFinite(x) && dates[i] >= '2011-01-01');
  if (xs.length < 365) return null;
  const last = [...series].reverse().find(Number.isFinite);
  if (last == null) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return sd > 0 ? Math.max(-3, Math.min(3, Math.round(-(last - m) / sd * 100) / 100)) : null;
}

export interface AutoValuation { z: Record<string, number>; raw: Record<string, number>; date: string; }

/** rows: [date, price, mvrv | null] */
export function autoValuation(rows: [string, number, number | null][]): AutoValuation {
  const dates = rows.map((r) => r[0]), price = rows.map((r) => r[1]);
  const mvrv = ema(rows.map((r) => (r[2] != null && r[2] > 0 ? r[2] : NaN)), 7);
  const supply = supplySeries(dates);
  const mc = price.map((p, i) => p * supply[i]);
  const nupl = mvrv.map((m) => (Number.isFinite(m) ? 1 - 1 / m : NaN));
  // MVRV Z = (MC − RC) / std(MC), std over all history up to that day
  const mvrvz: number[] = []; let s1 = 0, s2 = 0, n = 0;
  for (let i = 0; i < mc.length; i++) {
    s1 += mc[i]; s2 += mc[i] * mc[i]; n++;
    const sd = n > 365 ? Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2)) : NaN;
    mvrvz.push(Number.isFinite(mvrv[i]) && sd > 0 ? (mc[i] - mc[i] / mvrv[i]) / sd : NaN);
  }
  const ma2y = sma(price, 730).map((m, i) => (m > 0 ? Math.log(price[i] / m) : NaN));
  const issUsd = price.map((p, i) => p * dailyIssuance(dates[i]));
  const puell = sma(issUsd, 365).map((m, i) => (m > 0 ? Math.log(issUsd[i] / m) : NaN));
  const realized = mvrv.map((m) => (Number.isFinite(m) ? Math.log(m) : NaN));     // price vs realized price
  const S: Record<string, number[]> = { mvrvz, nupl, realized, '2yma': ma2y, puell };
  const z: Record<string, number> = {}, raw: Record<string, number> = {};
  for (const [k, s] of Object.entries(S)) {
    const v = zLast(s, dates); if (v != null) z[k] = v;
    const l = [...s].reverse().find(Number.isFinite); if (l != null) raw[k] = l;
  }
  return { z, raw, date: dates[dates.length - 1] };
}

// Halving cycle clock (course slide: halving → cycle top took 778, 884 and 767 days; three cycles only).
export const HALVING_TO_TOP = [778, 884, 767];
export function halvingClock(date: string) {
  const t = Date.parse(date + 'T00:00:00Z');
  const past = HALVINGS.filter((h) => h <= date), next = HALVINGS.find((h) => h > date);
  const last = past[past.length - 1];
  return { last, next, daysSince: Math.round((t - Date.parse(last + 'T00:00:00Z')) / DAY), daysTo: next ? Math.round((Date.parse(next + 'T00:00:00Z') - t) / DAY) : NaN };
}
