// Live testing ("paper portfolio"): from the moment the user presses Start, a virtual portfolio follows the app's signals
// after every daily close (00:00 UTC) — SDCA curve with the LTPI safety, RSPS target weights, sleeve rebalance with the
// split target — at closing prices with 0.15% cost per side. Nothing is executed on any exchange.
import { safetyStep } from './quant';

export const PAPER_COST = 0.0015;
export interface PaperPoint { date: string; value: number; btc: number; expo: number; sdca: number; rsps: number }
export interface PaperState {
  start: string; startValue: number; lastDate: string;
  sdca: { btc: number; usd: number; owed: number };
  rsps: { units: Record<string, number>; usd: number };
  lastPx: Record<string, number>;
  points: PaperPoint[];
  log: { date: string; text: string }[];
}
export interface PaperInputs {
  date: string; btcPrice: number; prices: Record<string, number>;
  sdcaRate: number;            // fraction per day: + buy share of SDCA stablecoins, − sell share of SDCA BTC
  risk: number; ltpi: number; safety: boolean;
  rspsTarget: { sym: string; w: number }[] | null;   // null = RSPS signal unavailable today → keep holdings
  split: number;               // SDCA target share (0..1)
}

const val = (s: PaperState, px: Record<string, number>, btc: number) => {
  const rs = Object.entries(s.rsps.units).reduce((a, [k, u]) => a + u * (k === 'BTC' ? btc : px[k] ?? s.lastPx[k] ?? 0), 0);
  return { sdca: s.sdca.btc * btc + s.sdca.usd, rsps: rs + s.rsps.usd, rsCoins: rs };
};

export function startPaper(date: string, amount: number, btcPrice: number, split: number): PaperState {
  return {
    start: date, startValue: amount, lastDate: '',
    sdca: { btc: 0, usd: amount * split, owed: 0 }, rsps: { units: {}, usd: amount * (1 - split) },
    lastPx: { BTC: btcPrice }, points: [], log: [{ date, text: `Start live testingu: ${Math.round(amount)} $ (SDCA ${Math.round(split * 100)}% / RSPS ${Math.round(100 - split * 100)}%, 100% stablecoin)` }]
  };
}

/** One daily step on the latest closed candle (idempotent per date). */
export function stepPaper(s0: PaperState, x: PaperInputs): PaperState {
  if (x.date <= s0.lastDate) return s0;
  const s: PaperState = JSON.parse(JSON.stringify(s0));
  const p = x.btcPrice, notes: string[] = [];
  const px: Record<string, number> = { ...s.lastPx, ...x.prices, BTC: p };
  // SDCA: curve (a share of what is left), then the LTPI safety / rebuy
  if (x.sdcaRate > 1e-6 && s.sdca.usd > 1) {
    const amt = s.sdca.usd * Math.min(x.sdcaRate, 1); s.sdca.usd -= amt; s.sdca.btc += (amt * (1 - PAPER_COST)) / p; s.sdca.owed = Math.max(0, s.sdca.owed - amt);
    notes.push(`SDCA kupno ${amt.toFixed(0)} $`);
  } else if (x.sdcaRate < -1e-6 && s.sdca.btc > 0) {
    const q = s.sdca.btc * Math.min(-x.sdcaRate, 1); s.sdca.btc -= q; s.sdca.usd += q * p * (1 - PAPER_COST);
    notes.push(`SDCA sprzedaż ${(q * p).toFixed(0)} $`);
  }
  if (x.safety) {
    const st = safetyStep(x.risk, x.ltpi, s.sdca.btc * p, s.sdca.usd, s.sdca.owed);
    if (st.kind === 'sell' && st.usd > 1) { s.sdca.btc -= st.usd / p; s.sdca.usd += st.usd * (1 - PAPER_COST); s.sdca.owed += st.usd; notes.push(`bezpiecznik: sprzedaż ${st.usd.toFixed(0)} $`); }
    else if (st.kind === 'rebuy' && st.usd > 1) { s.sdca.usd -= st.usd; s.sdca.btc += (st.usd * (1 - PAPER_COST)) / p; s.sdca.owed -= st.usd; notes.push(`odkup ${st.usd.toFixed(0)} $`); }
  }
  // RSPS: move to today's target weights (only when the signal is available)
  if (x.rspsTarget) {
    const v = val(s, px, p).rsps;
    const want: Record<string, number> = {};
    for (const t of x.rspsTarget) if (px[t.sym] > 0) want[t.sym] = (t.w * v) / px[t.sym];
    let turn = 0;
    for (const k of new Set([...Object.keys(want), ...Object.keys(s.rsps.units)])) turn += Math.abs((want[k] ?? 0) - (s.rsps.units[k] ?? 0)) * (px[k] ?? 0);
    if (turn > Math.max(10, v * 0.01)) {
      const coins = Object.entries(want).reduce((a, [k, u]) => a + u * px[k], 0);
      s.rsps.units = want; s.rsps.usd = v - coins - turn * PAPER_COST;
      notes.push(`RSPS → ${x.rspsTarget.length ? x.rspsTarget.map((t) => `${t.sym} ${Math.round(t.w * 100)}%`).join(', ') : 'stablecoin'}`);
    }
  }
  // sleeve rebalance when SDCA leaves target ±10 pp
  let v = val(s, px, p); let tot = v.sdca + v.rsps;
  if (tot > 0 && Math.abs(v.sdca / tot - x.split) > 0.1) {
    let amt = Math.abs(v.sdca / tot - x.split) * tot;
    if (v.sdca / tot > x.split) {
      const fromUsd = Math.min(amt, s.sdca.usd); s.sdca.usd -= fromUsd; let rest = amt - fromUsd;
      if (rest > 0) { const q = Math.min(s.sdca.btc, rest / p); s.sdca.btc -= q; rest = q * p * (1 - PAPER_COST); } else rest = 0;
      s.rsps.usd += fromUsd + rest;
    } else {
      const fromUsd = Math.min(amt, s.rsps.usd); s.rsps.usd -= fromUsd; let rest = amt - fromUsd, got = 0;
      if (rest > 0 && v.rsCoins > 0) { const f = Math.min(1, rest / v.rsCoins); for (const k of Object.keys(s.rsps.units)) { got += s.rsps.units[k] * f * (px[k] ?? 0) * (1 - PAPER_COST); s.rsps.units[k] *= 1 - f; } }
      s.sdca.usd += fromUsd + got;
    }
    notes.push(`rebalans ${amt.toFixed(0)} $ (cel SDCA ${Math.round(x.split * 100)}%)`);
    v = val(s, px, p); tot = v.sdca + v.rsps;
  }
  s.lastPx = px; s.lastDate = x.date;
  const coinsVal = s.sdca.btc * p + v.rsCoins;
  s.points.push({ date: x.date, value: tot, btc: p, expo: tot > 0 ? coinsVal / tot : 0, sdca: v.sdca, rsps: v.rsps });
  s.log = [{ date: x.date, text: notes.length ? notes.join(' · ') : 'bez zmian' }, ...s.log].slice(0, 400);
  return s;
}

const DAY = 86400000;
const days = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY));

export interface PaperStats { value: number; ret: number; btcRet: number; cagr: number; sharpe: number; sortino: number; maxDD: number; expo: number; days: number }
/** Statistics from the recorded daily points (gaps when the app was closed are treated as one longer period). */
export function paperStats(s: PaperState): PaperStats | null {
  const pts = [{ date: s.start, value: s.startValue, btc: s.lastPx.BTC && s.points.length ? s.points[0].btc : 0 }, ...s.points];
  if (s.points.length < 1) return null;
  const rets: number[] = [], gaps: number[] = [];
  let peak = s.startValue, dd = 0;
  for (let i = 1; i < pts.length; i++) { rets.push(pts[i].value / pts[i - 1].value - 1); gaps.push(days(pts[i - 1].date, pts[i].date)); peak = Math.max(peak, pts[i].value); dd = Math.min(dd, pts[i].value / peak - 1); }
  const last = s.points[s.points.length - 1], n = days(s.start, last.date);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(rets.length - 1, 1));
  const down = Math.sqrt(rets.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / Math.max(rets.length - 1, 1));
  const per = 365 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const ret = last.value / s.startValue - 1;
  return {
    value: last.value, ret, btcRet: s.points[0].btc > 0 ? last.btc / s.points[0].btc - 1 : NaN,
    cagr: n >= 30 ? (1 + ret) ** (365 / n) - 1 : NaN, sharpe: sd > 0 && rets.length > 5 ? (m / sd) * Math.sqrt(per) : NaN,
    sortino: down > 0 && rets.length > 5 ? (m / down) * Math.sqrt(per) : NaN, maxDD: dd,
    expo: s.points.reduce((a, b) => a + b.expo, 0) / s.points.length, days: n
  };
}

/** Weekly (ISO week, Monday start) or monthly summary rows, newest first. */
export function paperSummary(s: PaperState, by: 'week' | 'month') {
  const key = (d: string) => {
    if (by === 'month') return d.slice(0, 7);
    const t = new Date(d + 'T00:00:00Z'); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd); return t.toISOString().slice(0, 10);
  };
  const groups = new Map<string, PaperPoint[]>();
  for (const p of s.points) { const k = key(p.date); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }
  const rows: { period: string; ret: number; btcRet: number; value: number; actions: number }[] = [];
  let prevV = s.startValue, prevB = s.points[0]?.btc ?? NaN;
  for (const [k, ps] of groups) {
    const end = ps[ps.length - 1];
    const actions = s.log.filter((l) => key(l.date) === k && l.text !== 'bez zmian').length;
    rows.push({ period: k, ret: end.value / prevV - 1, btcRet: end.btc / prevB - 1, value: end.value, actions });
    prevV = end.value; prevB = end.btc;
  }
  return rows.reverse();
}
