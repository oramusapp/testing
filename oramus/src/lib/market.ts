// Market data. BTC history (price + MVRV since 2010) ships inside the app and is
// topped up on the phone from public APIs; token candles for RSPS come from Binance.
import bundled from '../data-btc.json';
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
export async function klines(symbol: string, days = 400, startTime?: number): Promise<{ t: number; c: number }[]> {
  let last: unknown;
  for (const host of BINANCE) {
    try {
      const out: { t: number; c: number }[] = [];
      let from = startTime ?? Date.now() - days * DAY;
      for (let guard = 0; guard < 10; guard++) {
        const j = await getJSON(`${host}/api/v3/klines?symbol=${symbol}&interval=1d&limit=1000&startTime=${from}`);
        if (!Array.isArray(j) || !j.length) break;
        for (const k of j) out.push({ t: k[0], c: parseFloat(k[4]) });
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
    const k = await klines('BTCUSDT', 0, Date.parse(lastDate()) + DAY);
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
