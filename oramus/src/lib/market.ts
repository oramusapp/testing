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

/** Daily candles from Hyperliquid's public info API (coin name without the quote, e.g. HYPE). q = base volume × close. */
export async function hyperliquidKlines(coin: string, startTime: number): Promise<{ t: number; c: number; q: number }[]> {
  const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: '1d', startTime, endTime: Date.now() } }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { t: number; c: string; v: string }[];
    return j.map((k) => ({ t: k.t, c: parseFloat(k.c), q: parseFloat(k.v) * parseFloat(k.c) })).filter((k) => k.c > 0);
  } finally { clearTimeout(id); }
}

/** Coins whose Binance spot history is too short: earlier days come from Hyperliquid (Binance days take priority). */
// Hyperliquid history before (or instead of) a Binance listing. HL_ONLY: no Binance spot pair, or the Binance symbol is a
// different / delisted asset (LIT = Litentry on Binance, XMR delisted 2024) — always Hyperliquid perps.
export const HL_FALLBACK = ['HYPE', 'PUMP', 'XPL', 'WLFI', 'ASTER'];
export const HL_ONLY = ['FARTCOIN', 'MON', 'LIT', 'AERO', 'XMR'];
export async function klinesAny(sym: string, days = 400, startTime?: number, hl = HL_FALLBACK.includes(sym)): Promise<{ t: number; c: number; q: number }[]> {
  const from = startTime ?? Date.now() - days * DAY;
  if (HL_ONLY.includes(sym)) return hyperliquidKlines(sym, from);
  let bin: { t: number; c: number; q: number }[] = [];
  try { bin = await klines(sym + 'USDT', days, startTime); } catch (e) { if (!hl) throw e; }
  if (!hl || (bin.length && bin[0].t <= from + 2 * DAY)) return bin;
  try {
    const hl = await hyperliquidKlines(sym, from);
    const have = new Set(bin.map((k) => k.t));
    return [...hl.filter((k) => !have.has(k.t) && (!bin.length || k.t < bin[0].t)), ...bin].sort((a, b) => a.t - b.t);
  } catch { return bin; }
}

/** Hyperliquid perps: listed coins with their 24 h notional volume (USD). Used for the small-token short-list rule. */
export async function hlPerps(): Promise<Map<string, { vol: number; delisted: boolean }>> {
  const ctl = new AbortController(); const id = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ type: 'metaAndAssetCtxs' }) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const [meta, ctxs] = await r.json() as [{ universe: { name: string; isDelisted?: boolean }[] }, { dayNtlVlm?: string }[]];
    return new Map(meta.universe.map((u, i) => [u.name.toUpperCase(), { vol: parseFloat(ctxs[i]?.dayNtlVlm ?? '0') || 0, delisted: !!u.isDelisted }]));
  } finally { clearTimeout(id); }
}

/** Bybit USDT markets (spot + linear perps) that are trading. Cached; when Bybit does not answer the last list is used for
 *  up to 7 days, otherwise null (unknown). */
export async function bybitListing(): Promise<Set<string> | null> {
  const get1 = async (cat: string) => {
    const j = await getJSON(`https://api.bybit.com/v5/market/instruments-info?category=${cat}&limit=1000`, 15000);
    return ((j?.result?.list ?? []) as { baseCoin: string; quoteCoin: string; status: string }[]).filter((x) => x.quoteCoin === 'USDT' && x.status === 'Trading').map((x) => x.baseCoin.toUpperCase());
  };
  try {
    const syms = [...new Set([...(await get1('spot')), ...(await get1('linear'))])];
    if (syms.length > 50) { await set('bybit.list', { time: Date.now(), syms }, cacheStore); return new Set(syms); }
  } catch { /* fall back to the cache */ }
  const c = await get<{ time: number; syms: string[] }>('bybit.list', cacheStore);
  return c && Date.now() - c.time < 7 * DAY ? new Set(c.syms) : null;
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
  const out = { rows, updated: sources.length ? Date.now() : h.updated, source: sources.join(' + ') || h.source };   // updated stays old when nothing answered → 'offline' label
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

// ---------- $TOTAL from TradingView (CRYPTOCAP:TOTAL) ----------
// TradingView has no public data API, so the official series comes from the user's own CSV export of the 1D chart
// ("Export chart data", paid plans). After the last exported day the series is extended with the daily changes of the
// built-in index until the next import (marked in the UI).
export interface TvTotal { rows: [string, number][]; imported: number; file: string }
export async function loadTvTotal(): Promise<TvTotal | null> { return (await get<TvTotal>('total.tv', cacheStore)) ?? null; }
export async function saveTvTotal(t: TvTotal | null) { await set('total.tv', t, cacheStore); }
/** Parses a TradingView CSV export: needs a time column (unix seconds or a date) and a close column; daily bars. */
export function parseTvCsv(text: string): [string, number][] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('pusty plik');
  const head = lines[0].split(',').map((x) => x.trim().replace(/"/g, '').toLowerCase());
  const ti = head.indexOf('time'), ci = head.indexOf('close');
  if (ti < 0 || ci < 0) throw new Error('brak kolumn „time” i „close” — to nie jest eksport z TradingView');
  const out = new Map<string, number>();
  for (const l of lines.slice(1)) {
    const c = l.split(','); const t = c[ti]?.replace(/"/g, '').trim(); const v = parseFloat(c[ci]);
    if (!t || !(v > 0)) continue;
    const d = /^\d+$/.test(t) ? new Date(+t * 1000) : new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    out.set(d.toISOString().slice(0, 10), v);
  }
  const rows = [...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (rows.length < 300) throw new Error(`za mało świec dziennych (${rows.length}) — wyeksportuj wykres 1D z dłuższą historią`);
  const gaps = rows.slice(1).filter((r, i) => Date.parse(r[0]) - Date.parse(rows[i][0]) > 3 * 86400000).length;
  if (gaps > 5) throw new Error('to nie wygląda na interwał 1D (duże przerwy między świecami)');
  return rows;
}
// ---------- daily snapshot of the official total market cap (free, keyless) ----------
// No free source serves the full daily history, so after every 00:00 UTC close the app records the current value
// (CoinGecko /global, fallbacks CoinMarketCap keyless, CoinPaprika, CoinLore). A snapshot taken h hours after the close
// stands for that close; late ones (h > SNAP_ON_TIME_H) are kept but left out of the comparison with the index.
export interface TotalSnap { date: string; value: number; at: number; lagH: number; source: string }
export const SNAP_ON_TIME_H = 3;
const SNAP_SOURCES: { name: string; url: string; pick: (j: any) => number }[] = [   // eslint-disable-line @typescript-eslint/no-explicit-any
  { name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/global', pick: (j) => j?.data?.total_market_cap?.usd },
  { name: 'CoinMarketCap', url: 'https://pro-api.coinmarketcap.com/public-api/v1/global-metrics/quotes/latest', pick: (j) => j?.data?.quote?.USD?.total_market_cap },
  { name: 'CoinPaprika', url: 'https://api.coinpaprika.com/v1/global', pick: (j) => j?.market_cap_usd },
  { name: 'CoinLore', url: 'https://api.coinlore.net/api/global/', pick: (j) => +j?.[0]?.total_mcap }
];
export async function loadTotalSnaps(): Promise<TotalSnap[]> { return (await get<TotalSnap[]>('total.snaps', cacheStore)) ?? []; }
/** Records today's snapshot for the last closed day once (keeps the earliest one after the close). */
export async function snapshotTotal(now = Date.now()): Promise<TotalSnap[]> {
  const snaps = await loadTotalSnaps();
  const date = lastClosedDay(now);
  if (snaps.some((x) => x.date === date)) return snaps;
  for (const src of SNAP_SOURCES) {
    try {
      const v = src.pick(await getJSON(src.url, 10000));
      if (!(v > 1e11)) continue;   // sanity: total market cap is far above $100B
      const closeT = Date.parse(date + 'T00:00:00Z') + DAY;
      const out = [...snaps, { date, value: v, at: now, lagH: Math.round(((now - closeT) / 3600000) * 10) / 10, source: src.name }].slice(-3000);
      await set('total.snaps', out, cacheStore);
      return out;
    } catch { /* next source */ }
  }
  return snaps;
}
/** Agreement between the official snapshots and the index used by the TPIs: daily log changes on consecutive on-time days
 *  from the same source. */
export function snapAgreement(snaps: TotalSnap[], index: TotalHistory | null) {
  const im = new Map(index?.rows ?? []);
  const ok = snaps.filter((x) => x.lagH <= SNAP_ON_TIME_H).sort((a, b) => (a.date < b.date ? -1 : 1));
  const a: number[] = [], b: number[] = [];
  for (let i = 1; i < ok.length; i++) {
    const p = ok[i - 1], c = ok[i];
    if (c.source !== p.source || Date.parse(c.date) - Date.parse(p.date) !== DAY) continue;
    const i0 = im.get(p.date), i1 = im.get(c.date);
    if (!i0 || !i1) continue;
    a.push(Math.log(c.value / p.value)); b.push(Math.log(i1 / i0));
  }
  const n = a.length;
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  let corr = NaN, mad = NaN;
  if (n >= 2) {
    const ma = mean(a), mb = mean(b);
    const cov = a.reduce((s, v, k) => s + (v - ma) * (b[k] - mb), 0), va = a.reduce((s, v) => s + (v - ma) ** 2, 0), vb = b.reduce((s, v) => s + (v - mb) ** 2, 0);
    corr = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
    mad = mean(a.map((v, k) => Math.abs(v - b[k])));
  }
  const last = ok.at(-1); const il = last ? im.get(last.date) : undefined;
  return { n, corr, mad, onTime: ok.length, total: snaps.length, levelRatio: last && il ? last.value / il : NaN, last };
}

/** TradingView rows where they exist; before them and after them the built-in index, chain-linked to the TV level. */
export function mergeTvTotal(own: TotalHistory | null, tv: TvTotal | null): TotalHistory | null {
  if (!tv || !tv.rows.length) return own;
  const om = new Map(own?.rows ?? []);
  const first = tv.rows[0], last = tv.rows[tv.rows.length - 1];
  const before = (own?.rows ?? []).filter(([d]) => d < first[0]);
  const k0 = om.get(first[0]); const pre: [string, number][] = k0 ? before.map(([d, v]) => [d, v * (first[1] / k0)]) : [];
  const k1 = om.get(last[0]); const post: [string, number][] = k1 ? (own?.rows ?? []).filter(([d]) => d > last[0]).map(([d, v]) => [d, v * (last[1] / k1)]) : [];
  return { rows: [...pre, ...tv.rows, ...post], updated: own?.updated ?? 0, source: `TradingView CRYPTOCAP:TOTAL (import do ${last[0]})` + (post.length ? ` + własny indeks od ${post[0][0]}` : ''), approxFrom: post.length ? post[0][0] : undefined };
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
/** Start of the current UTC day = time of the latest daily candle close. Manual entries are valid only after it. */
export const lastCloseTime = (now = Date.now()) => Math.floor(now / DAY) * DAY;
/** True when a manual entry was made after the latest 00:00 UTC close (entries reset at every close). */
export const freshToday = (t?: number | null, now = Date.now()) => t != null && t >= lastCloseTime(now);
export const lastClosedDay = (now = Date.now()) => new Date(Math.floor(now / DAY) * DAY - DAY).toISOString().slice(0, 10);
export const msToNextUtcClose = (now = Date.now()) => (Math.floor(now / DAY) + 1) * DAY - now;
