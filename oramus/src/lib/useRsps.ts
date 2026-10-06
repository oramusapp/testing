// Shared RSPS engine: scan, gate, regime, target weights. Used by the RSPS and Signals screens.
import { useEffect, useMemo, useState } from 'react';
import { toast } from '../components/ui';
import { usePersisted } from './db';
import { klines, klinesAny, lastClosedDay, hlPerps } from './market';
import { annVol, capWeights, ratios, linfit, vams3 } from './quant';
import { leverageGate, PILLARS, isFresh } from './pyramid';
import { usePyramid } from './pyramidStore';
import { rsScore, RS_LOOKBACKS } from './backtestAll';
import { SDCA_DEFAULTS, manualLtpiActive, type LtpiState, type SdcaSettings } from '../tabs/Sdca';
import { useBtc } from './btcStore';
import { composite, freshManual } from './sdcaModel';

// RSPS candidates = the course's RSPS token list (2.35.0; user's screenshot, execution on Hyperliquid). research/run70.py:
// against the app's former list restricted to coins tradable on Hyperliquid (≥ $10M/day), portfolio 2020–23 Sharpe
// 1.87 → 1.92, CAGR 85.0 → 85.9%, max DD −31.1 → −31.7%; 2024→ 1.38 → 1.42. The scanner keeps the 10 most liquid.
export const DEFAULT_TOKENS = ['ETH', 'SOL', 'AVAX', 'BNB', 'LTC', 'DOGE', 'SUI', 'PEPE', 'CRV', 'LINK', 'XRP', 'APT', 'AAVE', 'WLD', 'TRX', 'SHIB', 'UNI', 'DOT', 'ADA', 'PENDLE', 'NEAR', 'ONDO', 'TAO', 'ENA', 'HYPE', 'FARTCOIN', 'PUMP', 'XPL', 'WLFI', 'ASTER', 'ZEC', 'MON', 'AERO', 'LIT', 'XMR'];
/** Fixed coins (user's choice): always candidates, ranked by strength like every other coin, no priority. The rest are
 *  the most liquid tokens (point in time). Tiers from the notes (large vs small caps as groups) lowered the honest,
 *  point-in-time result (research/run57–58.py), so they are not used; adding these coins to the pool is neutral (run58). */
export const CORE = ['ETH', 'SOL', 'XRP', 'SUI', 'HYPE'];
/** Small-token short-list (course rule): a token qualifies while it has a perps market on Hyperliquid with ≥ $10M daily
 *  volume; it competes on strength like every candidate, with at most 10% of the RSPS part. Not in the backtest — there is
 *  no point-in-time history of such a hand-made list, so its effect cannot be measured honestly. */
export const SMALL_MIN_VOL = 10e6, SMALL_CAP = 0.10;
// memes outside the course list stay blocked; DOGE, SHIB, PEPE, FARTCOIN and PUMP are on the course list (run70: with them 2020–23 Sharpe 1.92 vs 1.94 without, CAGR 85.9 vs 82.0%)
export const MEME = ['WIF', 'BONK', 'FLOKI', 'TRUMP', 'MEME', 'BOME', 'POPCAT'];

// Parameters chosen on 2020–2023 data, tested out of sample 2024-01…2026-10 on Binance data (research/run9–13.py).
/** reserve: where the RSPS share that is not in coins sits — stablecoin, tokenized gold (PAXG) or PAXG only while gold trends up. */
export type Reserve = 'stable' | 'gold' | 'goldTrend' | 'hierarchy';
export interface RspsSettings { small?: string[]; tokens: string[]; universeSize: number; topN: number; cap: number; capital: number; reserve?: Reserve; }
export const RSPS_DEF: RspsSettings = { tokens: DEFAULT_TOKENS, universeSize: 10, topN: 3, cap: 50, capital: 10000, reserve: 'hierarchy' };
export const GOLD = 'PAXG';
/** "Strong gold" for the reserve hierarchy: own 4-SMA trend ≥ 0.5 (and, if GOLD_VS_BTC, stronger than BTC on the PAXG/BTC ratio). */
export const GOLD_VS_BTC = 'mom' as 'none' | 'ratio' | 'mom';   // research/run50.py: trend alone pushed BTC out and lowered returns
export const goldIsStrong = (g: { trend: number; ratioUp?: boolean; ratioMom?: boolean }) =>
  g.trend >= 0.5 && (GOLD_VS_BTC === 'none' || (GOLD_VS_BTC === 'ratio' ? !!g.ratioUp : !!g.ratioMom));
export const LOOKBACKS = RS_LOOKBACKS;          // relative-strength ensemble
export const BREADTH_ENTER = 0.7, BREADTH_EXIT = 0.6;   // gate hysteresis
// Split with the highest Sharpe (1.52, tie 40/50%) and the better Calmar of the two (research/run8.py).
export const SPLIT_SDCA = 60;
// Tilt (research/run47–48.py, on by default since 2.16.0): while LTPI on $TOTAL is positive the target moves to SDCA 40 / RSPS 60.
// 2020→: CAGR 51.0% → 54.2%, max drawdown −25.0% → −29.7%, Sharpe 2024→ 1.10 → 1.05.
export const SPLIT_TILT = 40;
export const splitTarget = (tilt: boolean, totalLtpi: number | undefined) => (tilt && (totalLtpi ?? 0) > 0 ? SPLIT_TILT : SPLIT_SDCA);
export interface ScanRow { small?: boolean; hlVol?: number; core?: boolean; sym: string; price: number; ret: number; vol: number; liq: number; ratioUp: boolean; trend: number; score: number; inUniverse?: boolean; error?: string; bench?: boolean; sharpe?: number; sortino?: number; omega?: number; corrBtc?: number; }
export interface Scan { time: number; closeDate: string; rows: ScanRow[]; breadth: number; btcTrend: number; gateOpen: boolean; gateSince?: string; gold?: { price: number; trend: number; ratioUp?: boolean; ratioMom?: boolean } }
interface LogEntry { time: number; regime: string; lev?: number; }

export type RegimeId = 'defense' | 'rsps' | 'closed';
export type Parking = 'stable' | 'btc' | 'hybrid';
// Hybrid parking (research/run39.py): BTC × trend while SDCA valuation risk < 80%, stablecoin above.
// Portfolio 2020→: CAGR 54.4% (stablecoin) → 67.2%, max drawdown −24.2% (same), 2024→ Sharpe 0.94 → 1.07.
export const HYBRID_RISK_MAX = 80;

const trendOf = (c: number[]) => {
  const n = c.length - 1;
  return [20, 50, 100, 200].map((L) => (n >= L && c[n] > c.slice(n - L + 1).reduce((a, b) => a + b, 0) / L ? 1 : 0) as number).reduce((a, b) => a + b, 0) / 4;
};

let scanInFlight = false;

export function useRsps() {
  const pyr = usePyramid();
  const { model: btcModel } = useBtc();
  const [sdcaCfg] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const sdcaRisk = useMemo(() => {
    if (!btcModel) return NaN;
    const c = { ...SDCA_DEFAULTS, ...sdcaCfg };
    return composite(btcModel, c.enabled, freshManual(c)).risk.at(-1) ?? NaN;
  }, [btcModel, sdcaCfg]);
  // one SDCA/RSPS split for the whole app: 60/40, or 40/60 while LTPI on $TOTAL is positive and the tilt is on
  const [tilt, setTilt] = usePersisted<boolean>('portfolio.tilt', true);
  const split = splitTarget(tilt, pyr.auto?.ltpi);
  const [parking, setParking] = usePersisted<{ choice: Parking; ack?: string }>('rsps.parking', { choice: 'btc' });
  const [s0, setS] = usePersisted<RspsSettings>('rsps.settings', RSPS_DEF);
  const s = { ...RSPS_DEF, ...s0 };
  const upd = (p: Partial<RspsSettings>) => setS((o) => ({ ...RSPS_DEF, ...o, ...p }));
  const [ltpiManual] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [scan, setScan] = usePersisted<Scan | null>('rsps.scan2', null);
  const [log, setLog] = usePersisted<LogEntry[]>('rsps.log', []);
  const [busy, setBusy] = useState(false);
  const a = pyr.auto;

  // RSPS veto uses LTPI on BTC (research/run45: RSPS OOS Sharpe 0.88 vs 0.61–0.69 with $TOTAL); the LTPI · MTPI tab shows $TOTAL
  const ltpi = manualLtpiActive(ltpiManual) ? ltpiManual.manual : a?.ltpiBtc ?? 0;
  const scanFresh = !!scan && scan.closeDate >= lastClosedDay();
  const breadth = scan?.breadth ?? NaN;
  // BTC sizing: 4-average trend (backtested default) or, if chosen, the 10-signal MTPI mapped to 0…1
  const btcTrend = a ? (pyr.tpiCfg.mtpiSizing === 'ensemble' ? (a.mtpi.value + 1) / 2 : a.trendEnsemble) : (scan?.btcTrend ?? 0);
  const rspsActive = scanFresh && !!scan?.gateOpen && btcTrend >= 0.5 && ltpi >= 0;

  const gate = leverageGate({
    trendEnsemble: a?.trendEnsemble ?? 0, adfTrending: !!a?.adfTrending, ltpi, sdcaRisk: a?.sdcaRisk ?? 100,
    volBelowMedian: !!a?.volBelowMedian, persistDays: a?.persistDays ?? 0, rspsActive, pyramid: pyr.comp, state: pyr.state
  });
  // LTPI < 0 → whole RSPS part in stablecoins (backtested: research/run15.py lowers IS drawdown −33% → −21%)
  const regime: RegimeId = ltpi < 0 ? 'defense' : rspsActive ? 'rsps' : 'closed';

  useEffect(() => {
    if (!a) return;
    if (log[0]?.regime !== regime) setLog([{ time: Date.now(), regime }, ...log].slice(0, 200));
  }, [regime, a?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // automatic scan after each daily close (when the app is open)
  useEffect(() => { if (!busy && !scanFresh) void runScan(true); }, [a?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runScan(silent = false) {
    if (scanInFlight) return;
    scanInFlight = true;
    setBusy(true);
    try {
      const closed = (k: { t: number; c: number; q?: number }[]) => k.filter((x) => x.t + 86400000 <= Date.now());
      const btc = closed(await klines('BTCUSDT', 400));
      const btcMap = new Map(btc.map((k) => [k.t, k.c]));
      const rows: ScanRow[] = [];
      const smallList = (s.small ?? []).map((x) => x.toUpperCase()).filter((x) => !CORE.includes(x) && !s.tokens.includes(x));
      let perps: Map<string, { vol: number; delisted: boolean }> | null = null;
      if (smallList.length) { try { perps = await hlPerps(); } catch { perps = null; } }
      await Promise.all([...new Set([...CORE, ...s.tokens, ...smallList])].filter((t) => !MEME.includes(t)).map(async (sym) => {
        const isSmall = smallList.includes(sym);
        const hp = perps?.get(sym);
        try {
          if (isSmall) {
            if (!perps) throw new Error('brak danych z Hyperliquid');
            if (!hp || hp.delisted) throw new Error('brak perpów na Hyperliquid');
            if (hp.vol < SMALL_MIN_VOL) throw new Error(`wolumen ${(hp.vol / 1e6).toFixed(1)} mln $ < 10 mln $`);
          }
          const k = closed(await klinesAny(sym, 400, undefined, isSmall || undefined));
          const c = k.map((x) => x.c);
          if (c.length < (isSmall ? 91 : 150)) throw new Error('za krótka historia');
          const ratio = k.filter((x) => btcMap.has(x.t)).map((x) => x.c / btcMap.get(x.t)!);
          const r50 = ratio.slice(-51, -1).reduce((p, v) => p + v, 0) / 50;
          const vol = annVol(c, 30);
          rows.push({
            small: isSmall || undefined, hlVol: hp?.vol, core: CORE.includes(sym), sym, price: c.at(-1)!, ret: (c.at(-1)! / c[c.length - 31] - 1) * 100, vol: vol * 100,
            liq: k.slice(-30).reduce((p, x) => p + (x.q ?? 0), 0) / 30, ratioUp: ratio.at(-1)! > r50, trend: trendOf(c),
            score: rsScore(ratio, vol),   // research definition: ratio log change / coin volatility, 14/28/56
            ...ratios(c, 365),
            corrBtc: (() => {
              const kk = k.filter((x) => btcMap.has(x.t)).slice(-91);
              const ra = kk.slice(1).map((x, i) => x.c / kk[i].c - 1), rb = kk.slice(1).map((x, i) => btcMap.get(x.t)! / btcMap.get(kk[i].t)! - 1);
              return linfit(ra, rb).r;
            })()
          });
        } catch (e) { rows.push({ small: isSmall || undefined, hlVol: hp?.vol, sym, price: NaN, ret: NaN, vol: NaN, liq: 0, ratioUp: false, trend: 0, score: NaN, error: (e as Error).message }); }
      }));
      // point-in-time universe: the N most liquid (30-day average quote volume)
      const ok = rows.filter((r) => !r.error && !r.small).sort((x, y) => y.liq - x.liq);   // short-list does not take top-N places
      ok.slice(0, s.universeSize - 1).forEach((r) => (r.inUniverse = true));   // BTC is one of the top-N (as in the research)
      const uni = ok.filter((r) => r.inUniverse);
      ok.filter((r) => r.core).forEach((r) => (r.inUniverse = true));   // fixed coins are always candidates (no priority)
      rows.filter((r) => r.small && !r.error).forEach((r) => (r.inUniverse = true));   // qualifying short-list tokens
      const br = uni.length ? uni.filter((r) => r.ratioUp).length / uni.length : NaN;
      rows.sort((x, y) => (y.inUniverse ? 1 : 0) - (x.inUniverse ? 1 : 0) || (y.score || -99) - (x.score || -99));
      // hysteresis: open at ≥ 70%, stay open until breadth falls below 60%
      const wasOpen = !!scan?.gateOpen;
      const gateOpen = Number.isFinite(br) && (wasOpen ? br >= BREADTH_EXIT : br >= BREADTH_ENTER);
      const gateSince = scan && scan.gateOpen === gateOpen && scan.gateSince ? scan.gateSince : lastClosedDay();
      // BTC as the reference row: RSPS ranks alts by strength against BTC (BTC = 0); BTC itself is held via the
      // unpicked part and the BTC × trend parking, so it is part of the RSPS allocation even though it is not a candidate
      const bc = btc.map((x) => x.c);
      if (bc.length > 150) rows.unshift({ sym: 'BTC', price: bc.at(-1)!, ret: (bc.at(-1)! / bc[bc.length - 31] - 1) * 100, vol: annVol(bc, 30) * 100, liq: 0, ratioUp: false, trend: trendOf(bc), score: 0, inUniverse: true, bench: true, ...ratios(bc, 365), corrBtc: 1 });
      let gold: Scan['gold'];
      try {
        const gkl = closed(await klines(GOLD + 'USDT', 400)); const gk = gkl.map((x) => x.c);
        if (gk.length > 200) {
          const lr = gkl.filter((x) => btcMap.has(x.t)).map((x) => Math.log(x.c / btcMap.get(x.t)!));
          const n = lr.length - 1, m50 = lr.slice(-51, -1).reduce((a, b) => a + b, 0) / 50;
          gold = { price: gk.at(-1)!, trend: trendOf(gk), ratioUp: lr[n] > m50, ratioMom: n > 90 && ([30, 60, 90].reduce((a, L) => a + lr[n] - lr[n - L], 0) / 3) > 0 };
        }
      } catch { /* gold optional */ }
      setScan({ time: Date.now(), closeDate: lastClosedDay(), rows, breadth: br, btcTrend: trendOf(bc), gateOpen, gateSince, gold });
      if (!silent) toast('Skan zakończony');
    } catch (e) {
      if (!silent) toast('Brak połączenia z Binance: ' + (e as Error).message);
    } finally { setBusy(false); scanInFlight = false; }
  }

  const picks = useMemo(() => {
    const uni = (scan?.rows ?? []).filter((r) => r.inUniverse && !r.bench && Number.isFinite(r.score));
    const sel = uni.filter((r) => r.score > 0 && r.trend >= 0.5).sort((x, y) => y.score - x.score).slice(0, s.topN);
    // short-list tokens are capped at 10%; what the cap cuts stays unallocated and goes to the reserve (gold / BTC / stable)
    const w = capWeights(sel.map((r) => r.score / (r.vol / 100)), s.cap / 100).map((x, i) => Math.min(x, s.cap / 100, sel[i].small ? SMALL_CAP : 1));
    const shorts = uni.filter((r) => r.score < 0 && r.trend <= 0.25).sort((x, y) => x.score - y.score).slice(0, 3);
    return { sel: sel.map((r, i) => ({ sym: r.sym, w: w[i] })), shorts };
  }, [scan, s.topN, s.cap]);

  // RSPS-sleeve target weights (fractions of the RSPS part); the remainder is stablecoin
  // the RSPS signal is released only after today's manual inputs are filled in (they reset at every 00:00 UTC close)
  const manualMissing = PILLARS.filter((p) => !p.auto && !isFresh(pyr.state[p.id])).map((p) => p.name);
  const signalReady = manualMissing.length === 0;
  const sleeve: { sym: string; w: number; note?: string }[] = [];
  const btcSize = vams3(btcTrend);   // three-state BTC sizing 0 / 50 / 100% (research/run51.py)
  const parkBtc = parking.choice === 'btc' || (parking.choice === 'hybrid' && Number.isFinite(sdcaRisk) && sdcaRisk < HYBRID_RISK_MAX);
  if (regime === 'rsps') {
    picks.sel.forEach((p) => sleeve.push(p));
    const rest = 1 - picks.sel.reduce((x, p) => x + p.w, 0);
    if (rest > 0.001 && btcSize > 0 && parkBtc) sleeve.push({ sym: 'BTC', w: rest * btcSize, note: `reszta × VAMS BTC ${Math.round(btcSize * 100)}%` });
  } else if (regime === 'closed' && btcSize > 0 && (parking.choice === 'btc' || (parking.choice === 'hybrid' && Number.isFinite(sdcaRisk) && sdcaRisk < HYBRID_RISK_MAX)))
    sleeve.push({ sym: 'BTC', w: btcSize, note: `VAMS ${Math.round(btcSize * 100)}% (trend ${btcTrend.toFixed(2)})${parking.choice === 'hybrid' ? ` · ryzyko ${sdcaRisk.toFixed(0)}% < ${HYBRID_RISK_MAX}%` : ''}` });
  // reserve in tokenized gold instead of stablecoin (research/run49.py)
  const reserve = s.reserve ?? 'stable';
  const goldStrong = !!scan?.gold && goldIsStrong(scan.gold);
  if (reserve === 'hierarchy' && goldStrong) {
    // hierarchy (research/run50.py): strong gold takes the reserve first (instead of BTC × trend), then BTC, then stablecoin
    const picked = regime === 'rsps' ? picks.sel.reduce((x, p) => x + p.w, 0) : 0;
    for (let k = sleeve.length - 1; k >= 0; k--) if (sleeve[k].sym === 'BTC') sleeve.splice(k, 1);
    if (1 - picked > 0.001) sleeve.push({ sym: GOLD, w: 1 - picked, note: 'złoto silne → przed BTC' });
  } else {
    const goldOn = !!scan?.gold && (reserve === 'gold' || (reserve === 'goldTrend' && scan.gold.trend >= 0.5));
    const stableShare = 1 - sleeve.reduce((x, p) => x + p.w, 0);
    if (goldOn && stableShare > 0.001) sleeve.push({ sym: GOLD, w: stableShare, note: reserve === 'goldTrend' ? `złoto w trendzie (${scan!.gold!.trend.toFixed(2)})` : 'złoto zamiast stablecoina' });
  }
  // a decision is pending whenever the gate closed since the user last confirmed where to park
  const parkingPending = regime === 'closed' && scanFresh && parking.ack !== (scan?.gateSince ?? '');
  const confirmParking = (choice: Parking) => setParking({ choice, ack: scan?.gateSince ?? lastClosedDay() });
  // short proposal: the backtested condition (BTC trend ensemble ≤ 0.25), weakest alts in their own downtrend
  // course notes: TPI "below zero and falling → consider shorting crypto" (MTPI on $TOTAL); proposal only, never automatic
  const shortProposal = !!a && a.mtpi.state < 0 && a.mtpi.roc5 < 0 && picks.shorts.length > 0 && scanFresh;
  const prices: Record<string, number> = {};
  (scan?.rows ?? []).forEach((r) => { if (Number.isFinite(r.price)) prices[r.sym] = r.price; });
  if (scan?.gold) prices[GOLD] = scan.gold.price;
  const vols: Record<string, number> = {};
  (scan?.rows ?? []).forEach((r) => { if (Number.isFinite(r.vol)) vols[r.sym] = r.vol / 100; });
  if (a) vols.BTC = a.vol30;

  return { pyr, s, upd, scan, scanFresh, busy, runScan, breadth, btcTrend, ltpi, regime, gate, picks, sleeve, shortProposal, signalReady, manualMissing, split, tilt, setTilt,
    parking, parkingPending, confirmParking, log, prices, vols, sdcaRisk };
}

