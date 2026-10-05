// Portfolio performance from daily snapshots. Time-weighted return (TWR): deposits, withdrawals and
// transfers between the SDCA/RSPS portfolios are flows, so they do not count as performance.
export interface Snapshot {
  date: string;            // closed UTC candle the valuation uses
  time: number;            // when it was taken
  total: number; sdca: number; rsps: number; stable: number;
  btcPrice: number;
}
/** amount > 0 = money in. sdca/rsps split the flow between the two portfolios (they sum to amount, or ± for transfers). */
export interface Flow { time: number; amount: number; sdca: number; rsps: number; note: string; }
export interface MonthlyReport {
  month: string;           // YYYY-MM
  created: number;
  from: string; to: string;
  startValue: number; endValue: number; netFlows: number;
  twr: number; sdcaTwr: number; rspsTwr: number; btc: number;
  maxDD: number; avgExposure: number; days: number;
  trades: number; transfers: number;
  regimes: string[]; pyramidZ: number | null;
  sinceStartTwr: number;
}

type Key = 'total' | 'sdca' | 'rsps';
const flowOf = (f: Flow, key: Key) => (key === 'total' ? f.amount : f[key]);

/** Daily TWR returns between consecutive snapshots; flows are assumed to land just before the later valuation. */
export function twrReturns(snaps: Snapshot[], flows: Flow[], key: Key = 'total') {
  const out: { date: string; r: number }[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1], b = snaps[i];
    const f = flows.filter((x) => x.time > a.time && x.time <= b.time).reduce((s, x) => s + flowOf(x, key), 0);
    const r = a[key] > 0 ? (b[key] - f) / a[key] - 1 : 0;
    out.push({ date: b.date, r: Number.isFinite(r) ? r : 0 });
  }
  return out;
}

export function index(rs: { r: number }[]) {
  const idx = [1];
  for (const x of rs) idx.push(idx[idx.length - 1] * (1 + x.r));
  return idx;
}

export function maxDrawdown(idx: number[]) {
  let peak = -Infinity, dd = 0;
  for (const v of idx) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
  return dd;
}

export function stats(snaps: Snapshot[], flows: Flow[]) {
  const rs = twrReturns(snaps, flows);
  const idx = index(rs);
  const days = rs.length;
  const mean = days ? rs.reduce((s, x) => s + x.r, 0) / days : 0;
  const sd = days > 1 ? Math.sqrt(rs.reduce((s, x) => s + (x.r - mean) ** 2, 0) / (days - 1)) : 0;
  const first = snaps[0], last = snaps[snaps.length - 1];
  const peak = Math.max(...idx);
  return {
    twr: idx[idx.length - 1] - 1,
    sdcaTwr: index(twrReturns(snaps, flows, 'sdca')).at(-1)! - 1,
    rspsTwr: index(twrReturns(snaps, flows, 'rsps')).at(-1)! - 1,
    btc: first && last ? last.btcPrice / first.btcPrice - 1 : 0,
    maxDD: maxDrawdown(idx),
    currentDD: idx[idx.length - 1] / peak - 1,
    vol: sd * Math.sqrt(365),
    sharpe: sd > 0 && days >= 30 ? (mean * 365) / (sd * Math.sqrt(365)) : null,
    sortino: (() => { const dn = Math.sqrt(rs.reduce((s, x) => s + Math.min(x.r, 0) ** 2, 0) / Math.max(days, 1)); return dn > 0 && days >= 30 ? (mean * 365) / (dn * Math.sqrt(365)) : null; })(),
    omega: (() => { const g = rs.reduce((s, x) => s + Math.max(x.r, 0), 0), l = rs.reduce((s, x) => s - Math.min(x.r, 0), 0); return l > 0 && days >= 30 ? g / l : null; })(),
    days, idx,
    netFlows: flows.filter((f) => !first || f.time > first.time).reduce((s, f) => s + f.amount, 0)
  };
}

export const monthOf = (date: string) => date.slice(0, 7);

/** Report for one calendar month; uses the last snapshot of the previous month as the starting point. */
export function monthlyReport(month: string, snaps: Snapshot[], flows: Flow[], ctx: {
  history: { time: number; text: string }[]; regimes: { time: number; regime: string }[]; pyramid: { date: string; z: number }[];
}): MonthlyReport | null {
  const inMonth = snaps.filter((s) => monthOf(s.date) === month);
  if (!inMonth.length) return null;
  const before = snaps.filter((s) => s.date < `${month}-01`).at(-1);
  const seq = before ? [before, ...inMonth] : inMonth;
  const start = seq[0], end = seq[seq.length - 1];
  const fl = flows.filter((f) => f.time > start.time && f.time <= end.time);
  const st = stats(seq, fl);
  const all = stats(snaps.filter((s) => s.date <= end.date), flows);
  const t0 = start.time, t1 = end.time;
  const pz = ctx.pyramid.filter((p) => monthOf(p.date) === month && Number.isFinite(p.z));
  return {
    month, created: Date.now(), from: start.date, to: end.date,
    startValue: start.total, endValue: end.total, netFlows: fl.filter((f) => f.note !== 'transfer').reduce((s, f) => s + f.amount, 0),
    twr: st.twr, sdcaTwr: st.sdcaTwr, rspsTwr: st.rspsTwr, btc: st.btc, maxDD: st.maxDD,
    avgExposure: inMonth.reduce((s, x) => s + (x.total ? 1 - x.stable / x.total : 0), 0) / inMonth.length,
    days: inMonth.length,
    trades: ctx.history.filter((h) => h.time > t0 && h.time <= t1 && /kupno|sprzedaż/.test(h.text)).length,
    transfers: ctx.history.filter((h) => h.time > t0 && h.time <= t1 && /przeniesienie/.test(h.text)).length,
    regimes: [...new Set(ctx.regimes.filter((r) => r.time > t0 && r.time <= t1).map((r) => r.regime))],
    pyramidZ: pz.length ? pz.reduce((s, p) => s + p.z, 0) / pz.length : null,
    sinceStartTwr: all.twr
  };
}
