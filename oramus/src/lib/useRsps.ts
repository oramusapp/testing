// Shared RSPS engine: scan, gate, regime, target weights. Used by the RSPS and Signals screens.
import { useEffect, useMemo, useState } from 'react';
import { toast } from '../components/ui';
import { usePersisted } from './db';
import { klines, lastClosedDay } from './market';
import { annVol, capWeights, ratios, linfit } from './quant';
import { leverageGate } from './pyramid';
import { usePyramid } from './pyramidStore';
import { rsScore } from './backtestAll';
import { SDCA_DEFAULTS, manualLtpiActive, type LtpiState, type SdcaSettings } from '../tabs/Sdca';
import { useBtc } from './btcStore';
import { composite, freshManual } from './sdcaModel';

// Large-cap, non-meme candidates (Binance <SYMBOL>USDT). The scanner keeps the 10 most liquid.
export const DEFAULT_TOKENS = ['ETH', 'BNB', 'XRP', 'SOL', 'ADA', 'TRX', 'LINK', 'AVAX', 'DOT', 'LTC', 'BCH', 'XLM', 'ATOM', 'NEAR', 'UNI', 'AAVE', 'ETC', 'ICP',
  'FIL', 'POL', 'ALGO', 'XTZ', 'VET', 'HBAR', 'APT', 'SUI', 'TON', 'ARB', 'OP', 'INJ', 'MANA'];
export const MEME = ['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'TRUMP', 'MEME', 'BOME', 'POPCAT'];

// Parameters chosen on 2020–2023 data, tested out of sample 2024-01…2026-10 on Binance data (research/run9–13.py).
export interface RspsSettings { tokens: string[]; universeSize: number; topN: number; cap: number; capital: number; }
export const RSPS_DEF: RspsSettings = { tokens: DEFAULT_TOKENS, universeSize: 10, topN: 3, cap: 50, capital: 10000 };
export const LOOKBACKS = [30, 60, 90];          // relative-strength ensemble
export const BREADTH_ENTER = 0.7, BREADTH_EXIT = 0.6;   // gate hysteresis
// Split with the highest Sharpe (1.52, tie 40/50%) and the better Calmar of the two (research/run8.py).
export const SPLIT_SDCA = 60;
// Optional tilt (research/run47.py): while LTPI on $TOTAL is positive the target moves to SDCA 40 / RSPS 60.
// 2020→: CAGR 51.0% → 54.2%, max drawdown −25.0% → −29.7%, Sharpe 2024→ 1.10 → 1.05.
export const SPLIT_TILT = 40;
export const splitTarget = (tilt: boolean, totalLtpi: number | undefined) => (tilt && (totalLtpi ?? 0) > 0 ? SPLIT_TILT : SPLIT_SDCA);
export interface ScanRow { sym: string; price: number; ret: number; vol: number; liq: number; ratioUp: boolean; trend: number; score: number; inUniverse?: boolean; error?: string; sharpe?: number; sortino?: number; omega?: number; corrBtc?: number; }
export interface Scan { time: number; closeDate: string; rows: ScanRow[]; breadth: number; btcTrend: number; gateOpen: boolean; gateSince?: string; }
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
  const [parking, setParking] = usePersisted<{ choice: Parking; ack?: string }>('rsps.parking', { choice: 'hybrid' });
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
      await Promise.all(s.tokens.filter((t) => !MEME.includes(t)).map(async (sym) => {
        try {
          const k = closed(await klines(sym + 'USDT', 400));
          const c = k.map((x) => x.c);
          if (c.length < 150) throw new Error('za krótka historia');
          const ratio = k.filter((x) => btcMap.has(x.t)).map((x) => x.c / btcMap.get(x.t)!);
          const r50 = ratio.slice(-51, -1).reduce((p, v) => p + v, 0) / 50;
          const vol = annVol(c, 30);
          rows.push({
            sym, price: c.at(-1)!, ret: (c.at(-1)! / c[c.length - 31] - 1) * 100, vol: vol * 100,
            liq: k.slice(-30).reduce((p, x) => p + (x.q ?? 0), 0) / 30, ratioUp: ratio.at(-1)! > r50, trend: trendOf(c),
            score: rsScore(ratio, vol),   // research definition: ratio log change / coin volatility, 30/60/90
            ...ratios(c, 365),
            corrBtc: (() => {
              const kk = k.filter((x) => btcMap.has(x.t)).slice(-91);
              const ra = kk.slice(1).map((x, i) => x.c / kk[i].c - 1), rb = kk.slice(1).map((x, i) => btcMap.get(x.t)! / btcMap.get(kk[i].t)! - 1);
              return linfit(ra, rb).r;
            })()
          });
        } catch (e) { rows.push({ sym, price: NaN, ret: NaN, vol: NaN, liq: 0, ratioUp: false, trend: 0, score: NaN, error: (e as Error).message }); }
      }));
      // point-in-time universe: the N most liquid (30-day average quote volume)
      const ok = rows.filter((r) => !r.error).sort((x, y) => y.liq - x.liq);
      ok.slice(0, s.universeSize - 1).forEach((r) => (r.inUniverse = true));   // BTC is one of the top-N (as in the research)
      const uni = ok.filter((r) => r.inUniverse);
      const br = uni.length ? uni.filter((r) => r.ratioUp).length / uni.length : NaN;
      rows.sort((x, y) => (y.inUniverse ? 1 : 0) - (x.inUniverse ? 1 : 0) || (y.score || -99) - (x.score || -99));
      // hysteresis: open at ≥ 70%, stay open until breadth falls below 60%
      const wasOpen = !!scan?.gateOpen;
      const gateOpen = Number.isFinite(br) && (wasOpen ? br >= BREADTH_EXIT : br >= BREADTH_ENTER);
      const gateSince = scan && scan.gateOpen === gateOpen && scan.gateSince ? scan.gateSince : lastClosedDay();
      setScan({ time: Date.now(), closeDate: lastClosedDay(), rows, breadth: br, btcTrend: trendOf(btc.map((x) => x.c)), gateOpen, gateSince });
      if (!silent) toast('Skan zakończony');
    } catch (e) {
      if (!silent) toast('Brak połączenia z Binance: ' + (e as Error).message);
    } finally { setBusy(false); scanInFlight = false; }
  }

  const picks = useMemo(() => {
    const uni = (scan?.rows ?? []).filter((r) => r.inUniverse && Number.isFinite(r.score));
    const sel = uni.filter((r) => r.score > 0 && r.trend >= 0.5).sort((x, y) => y.score - x.score).slice(0, s.topN);
    const w = capWeights(sel.map((r) => r.score / (r.vol / 100)), s.cap / 100).map((x) => Math.min(x, s.cap / 100));
    const shorts = uni.filter((r) => r.score < 0 && r.trend <= 0.25).sort((x, y) => x.score - y.score).slice(0, 3);
    return { sel: sel.map((r, i) => ({ sym: r.sym, w: w[i] })), shorts };
  }, [scan, s.topN, s.cap]);

  // RSPS-sleeve target weights (fractions of the RSPS part); the remainder is stablecoin
  const sleeve: { sym: string; w: number; note?: string }[] = [];
  const parkBtc = parking.choice === 'btc' || (parking.choice === 'hybrid' && Number.isFinite(sdcaRisk) && sdcaRisk < HYBRID_RISK_MAX);
  if (regime === 'rsps') {
    picks.sel.forEach((p) => sleeve.push(p));
    const rest = 1 - picks.sel.reduce((x, p) => x + p.w, 0);
    if (rest > 0.001 && btcTrend > 0 && parkBtc) sleeve.push({ sym: 'BTC', w: rest * btcTrend, note: 'reszta × trend BTC' });
  } else if (regime === 'closed' && btcTrend > 0 && (parking.choice === 'btc' || (parking.choice === 'hybrid' && Number.isFinite(sdcaRisk) && sdcaRisk < HYBRID_RISK_MAX)))
    sleeve.push({ sym: 'BTC', w: btcTrend, note: `trend ${btcTrend.toFixed(2)}${parking.choice === 'hybrid' ? ` · ryzyko ${sdcaRisk.toFixed(0)}% < ${HYBRID_RISK_MAX}%` : ''}` });
  // a decision is pending whenever the gate closed since the user last confirmed where to park
  const parkingPending = regime === 'closed' && scanFresh && parking.ack !== (scan?.gateSince ?? '');
  const confirmParking = (choice: Parking) => setParking({ choice, ack: scan?.gateSince ?? lastClosedDay() });
  // short proposal: the backtested condition (BTC trend ensemble ≤ 0.25), weakest alts in their own downtrend
  // course notes: TPI "below zero and falling → consider shorting crypto" (MTPI on $TOTAL); proposal only, never automatic
  const shortProposal = !!a && a.mtpi.state < 0 && a.mtpi.roc5 < 0 && picks.shorts.length > 0 && scanFresh;
  const prices: Record<string, number> = {};
  (scan?.rows ?? []).forEach((r) => { if (Number.isFinite(r.price)) prices[r.sym] = r.price; });
  const vols: Record<string, number> = {};
  (scan?.rows ?? []).forEach((r) => { if (Number.isFinite(r.vol)) vols[r.sym] = r.vol / 100; });
  if (a) vols.BTC = a.vol30;

  return { pyr, s, upd, scan, scanFresh, busy, runScan, breadth, btcTrend, ltpi, regime, gate, picks, sleeve, shortProposal,
    parking, parkingPending, confirmParking, log, prices, vols, sdcaRisk };
}

