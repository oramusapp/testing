// Market data. BTC history (price + MVRV since 2010) ships inside the app and is
// topped up on the phone from public APIs; token candles for RSPS come from Binance.
import bundled from '../data-btc.json';
import bundledTotal from '../data-total.json';
import { get, set, createStore } from 'idb-keyval';

export type Row = [date: string, price: number, mvrv: number | null];
const cacheStore = createStore('oramus-cache', 'cache');
const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

async function getJSON(url: string, timeout = 15000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(id); }
}

const BINANCE = ['https://api.binance.com', 'https://data-api.binance.vision'];

/** Daily closes from Binance for `symbol` (e.g. BTCUSDT), oldest first. */
export async function klines(symbol: string, days = 400, startTime?: number): Promise<{ t: number; c: number; q: number }[]> {
  let last: unknown;
  for (const host of BINANCE) {
    try {
      const out: { t: number; c: number; q: number }[] = [];
      let from = startTime ?? Date.now() - days * DAY;
      for (let guard = 0; guard < 10; guard++) {
        const j = await getJSON(`${host}/api/v3/klines?symbol=${symbol}&interval=1d&limit=1000&startTime=${from}`);
        if (!Array.isArray(j) || !j.length) break;
        for (const k of j) out.push({ t: k[0], c: parseFloat(k[4]), q: parseFloat(k[7]) });
        if (j.length < 1000) break;
        from = j[j.length - 1][0] + DAY;
      }
      return out;
    } catch (e) { last = e; }
  }
  throw last ?? new Error('Brak danych');
}

export async function ticker(symbols: string[]) {
  for (const host of BINANCE) {
    try {
      const j = await getJSON(`${host}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
      return Object.fromEntries((j as any[]).map((x) => [x.symbol, { price: +x.lastPrice, change: +x.priceChangePercent }]));
    } catch { /* try next */ }
  }
  return {} as Record<string, { price: number; change: number }>;
}

export interface BtcHistory { rows: Row[]; updated: number; source: string; }

export async function loadBtcHistory(): Promise<BtcHistory> {
  const cached = await get<BtcHistory>('btc', cacheStore);
  const base = (bundled as unknown as { rows: Row[] }).rows;
  if (cached && cached.rows.length >= base.length) return cached;
  return { rows: base, updated: 0, source: 'wbudowane (Coin Metrics)' };
}

/**
 * Tops up the history: Coin Metrics community API (price + MVRV) first, then Binance
 * closes for any days still missing (MVRV carried forward and flagged as stale).
 */
export async function refreshBtcHistory(h: BtcHistory, onProgress?: (msg: string) => void): Promise<BtcHistory> {
  const rows = [...h.rows];
  const lastDate = () => rows[rows.length - 1][0];
  const sources: string[] = [];
  try {
    onProgress?.('Coin Metrics…');
    const start = iso(Date.parse(lastDate()) - 7 * DAY);
    const j = await getJSON(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD,CapMVRVCur&frequency=1d&page_size=10000&start_time=${start}`);
    for (const d of j.data ?? []) {
      const date = String(d.time).slice(0, 10);
      const p = parseFloat(d.PriceUSD), m = d.CapMVRVCur != null ? parseFloat(d.CapMVRVCur) : null;
      if (!(p > 0)) continue;
      const i = rows.findIndex((r) => r[0] === date);
      if (i >= 0) rows[i] = [date, p, m ?? rows[i][2]];
      else if (date > lastDate()) rows.push([date, p, m]);
    }
    sources.push('Coin Metrics');
  } catch { /* fall through */ }
  try {
    onProgress?.('Binance…');
    // only fully closed daily candles (00:00 UTC close) — the running day is excluded
    const k = (await klines('BTCUSDT', 0, Date.parse(lastDate()) + DAY)).filter((c) => c.t + DAY <= Date.now());
    for (const c of k) {
      const date = iso(c.t);
      if (date > lastDate()) rows.push([date, c.c, null]);
      else if (date === lastDate() && rows[rows.length - 1][2] == null) rows[rows.length - 1] = [date, c.c, null];
    }
    if (k.length) sources.push('Binance');
  } catch { /* offline */ }
  const out = { rows, updated: Date.now(), source: sources.join(' + ') || h.source };
  if (sources.length) await set('btc', out, cacheStore);
  return out;
}

// ---------- $TOTAL (whole crypto market cap) — the TPI input according to the course notes ----------
export interface TotalHistory { rows: [string, number][]; updated: number; source: string; approxFrom?: string }
const TB = bundledTotal as unknown as { assets: string[]; lastCaps: Record<string, number>; rows: [string, number][] };
const STABLES = ['usdt', 'usdc', 'dai'];

export async function loadTotalHistory(): Promise<TotalHistory> {
  const cached = await get<TotalHistory>('total', cacheStore);
  if (cached && cached.rows.length >= TB.rows.length) return cached;
  return { rows: TB.rows, updated: 0, source: 'wbudowane (Coin Metrics)' };
}

/** Appends new days as cap-weighted, chain-linked returns of the same assets (Coin Metrics); days Coin Metrics has not
 *  published yet are estimated from Binance closes weighted by the last known caps (stablecoins = 0% change). */
export async function refreshTotalHistory(h: TotalHistory): Promise<TotalHistory> {
  const rows = [...h.rows];
  const last = () => rows[rows.length - 1];
  let approxFrom = h.approxFrom;
  if (approxFrom) { const i = rows.findIndex((r) => r[0] >= approxFrom!); if (i > 0) rows.splice(i); approxFrom = undefined; }   // re-derive estimated days
  const sources: string[] = [];
  let weights: Record<string, number> = { ...TB.lastCaps };
  try {
    const start = iso(Date.parse(last()[0]) - 3 * DAY);
    const j = await getJSON(`https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=${TB.assets.join(',')}&metrics=CapMrktCurUSD&frequency=1d&page_size=10000&start_time=${start}`);
    const byDate = new Map<string, Record<string, number>>();
    for (const d of j.data ?? []) {
      const date = String(d.time).slice(0, 10), v = parseFloat(d.CapMrktCurUSD);
      if (!(v > 0)) continue;
      if (!byDate.has(date)) byDate.set(date, {});
      byDate.get(date)![d.asset] = v;
    }
    const dates = [...byDate.keys()].sort();
    for (let k = 1; k < dates.length; k++) {
      if (dates[k] <= last()[0]) continue;
      if (dates[k - 1] !== last()[0]) break;            // need the previous day to chain
      const a = byDate.get(dates[k - 1])!, b = byDate.get(dates[k])!;
      let w = 0, wr = 0;
      for (const x of Object.keys(a)) if (b[x] > 0) { const r = b[x] / a[x] - 1; if (Math.abs(r) < 3) { w += a[x]; wr += a[x] * r; } }
      if (w > 0) { rows.push([dates[k], last()[1] * (1 + wr / w)]); weights = b; }
    }
    sources.push('Coin Metrics');
  } catch { /* fall through */ }
  try {
    const from = Date.parse(last()[0]);
    const syms = Object.keys(weights).filter((a) => !STABLES.includes(a));
    const series = await Promise.all(syms.map(async (a) => {
      try { return [a, (await klines(a.toUpperCase() + 'USDT', 0, from)).filter((c) => c.t + DAY <= Date.now())] as const; } catch { return [a, []] as const; }
    }));
    const px = new Map<string, Map<string, number>>(series.map(([a, k]) => [a, new Map(k.map((c) => [iso(c.t), c.c]))]));
    const stableW = STABLES.reduce((s, a) => s + (weights[a] ?? 0), 0);
    let added = false;
    for (let t = from + DAY; t + DAY <= Date.now(); t += DAY) {
      const d = iso(t), p = iso(t - DAY);
      let w = stableW, wr = 0;
      for (const a of syms) { const x = px.get(a)?.get(d), y = px.get(a)?.get(p); if (x && y) { w += weights[a]; wr += weights[a] * (x / y - 1); } }
      if (w <= stableW) break;
      if (!approxFrom) approxFrom = d;
      rows.push([d, last()[1] * (1 + wr / w)]); added = true;
    }
    if (added) sources.push('Binance (szacunek)');
  } catch { /* offline */ }
  const out: TotalHistory = { rows, updated: Date.now(), source: sources.join(' + ') || h.source, approxFrom };
  if (sources.length) await set('total', out, cacheStore);
  return out;
}

/** $TOTAL aligned to the BTC dates (carried forward; after its last day it follows BTC so the TPI is never blank). */
export function alignTotal(dates: string[], btc: number[], t: TotalHistory | null): number[] {
  if (!t) return btc;
  const m = new Map(t.rows);
  const out: number[] = []; let lastV = NaN, lastB = NaN;
  dates.forEach((d, i) => {
    const v = m.get(d);
    if (v != null) { lastV = v; lastB = btc[i]; out.push(v); }
    else if (Number.isFinite(lastV)) out.push(lastV * (btc[i] / lastB));
    else out.push(btc[i] * (t.rows[0][1] / btc[0]));
  });
  return out;
}

/** Crypto Fear & Greed index (alternative.me), 0 = extreme fear … 100 = extreme greed. */
export async function fearGreed(): Promise<{ value: number; label: string; time: number; mu: number; sd: number; n: number; hist: [string, number][] } | null> {
  try {
    // full history (limit=0) so the reading can be standardised against its own distribution
    const j = await getJSON('https://api.alternative.me/fng/?limit=0');
    const all = (j?.data ?? []).map((d: { value: string }) => +d.value).filter(Number.isFinite) as number[];
    const d = j?.data?.[0];
    if (!d || all.length < 30) return null;
    const mu = all.reduce((a, b) => a + b, 0) / all.length;
    const sd = Math.sqrt(all.reduce((a, b) => a + (b - mu) ** 2, 0) / (all.length - 1));
    const hist = (j.data as { value: string; timestamp: string }[]).map((x) => [new Date(+x.timestamp * 1000).toISOString().slice(0, 10), +x.value] as [string, number]).filter((x) => Number.isFinite(x[1])).reverse();
    return { value: +d.value, label: d.value_classification, time: +d.timestamp * 1000, mu, sd, n: all.length, hist };
  } catch { return null; }
}

/** Latest closed daily candle date (UTC) — the candle that closed at the last 00:00 UTC. */
export const lastClosedDay = (now = Date.now()) => new Date(Math.floor(now / DAY) * DAY - DAY).toISOString().slice(0, 10);
export const msToNextUtcClose = (now = Date.now()) => (Math.floor(now / DAY) + 1) * DAY - now;
