import { useEffect, useMemo, useState } from 'react';
import { Screen, Card, Row, NumInput, Sheet, Switch, toast, Fold } from '../components/ui';
import { IcPlus, IcTrash } from '../components/icons';
import { usePersisted, load } from '../lib/db';
import { Chart } from '../components/Chart';
import { stats, monthlyReport, monthOf, type Snapshot, type Flow, type MonthlyReport } from '../lib/performance';
import { shareFile } from '../components/ui';
import { useBtc } from '../lib/btcStore';
import { composite, freshManual } from '../lib/sdcaModel';
import { athSellSeries, backtest, curveRate, minBuyRate, safetyStep, slowBuyRate } from '../lib/quant';
import { ltpiStateSeries } from '../lib/tpi';
import { PaperCard } from '../components/Paper';
import type { PaperInputs } from '../lib/paper';
import { useRsps, SPLIT_SDCA, SPLIT_TILT } from '../lib/useRsps';
import { LEV_MAX } from '../lib/pyramid';
import { SDCA_DEFAULTS, type SdcaSettings, manualLtpiActive, type LtpiState } from './Sdca';
import { usd, pct } from '../lib/format';

// Rotation rules (research/run14.py, run15.py):
//  • sleeves SDCA 60 / RSPS 40, rebalanced only when the SDCA share leaves 50–70% (±10 p.p.), checked daily
//  • SDCA ↔ stablecoin: the accumulation/distribution curve (daily)
//  • RSPS ↔ stablecoin: gate closed → user's parking choice (hybrid by default: BTC × trend while SDCA risk < 80%); LTPI < 0 → 100% stablecoin
export const BAND = 0.10;
const STABLE = 'USDT';
const MIN_TRADE_USD = 10, MIN_TRADE_FRAC = 0.01;

interface Holdings { sdca: { BTC: number; [STABLE]: number }; rsps: Record<string, number>; }
interface Portfolio { holdings: Holdings | null; history: { time: number; text: string }[]; safetyOwed?: number; }
interface Order { id: string; sleeve: 'SDCA' | 'RSPS' | 'Rebalans'; side: 'buy' | 'sell' | 'move'; sym: string; usd: number; units: number; why: string; }

export default function Signals() {
  const { model } = useBtc();
  const R = useRsps();
  const { tilt, setTilt } = R;
  const splitSdca = R.split;   // shared with the RSPS tab
  const [sd] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [pf, setPf] = usePersisted<Portfolio>('portfolio', { holdings: null, history: [] });
  const [snaps, setSnaps] = usePersisted<Snapshot[]>('portfolio.snapshots', []);
  const [flows, setFlows] = usePersisted<Flow[]>('portfolio.flows', []);
  const [reports, setReports] = usePersisted<MonthlyReport[]>('portfolio.reports', []);
  const [openReport, setOpenReport] = useState<MonthlyReport | null>(null);
  const addFlow = (f: Omit<Flow, 'time'>) => setFlows((l) => [...l, { ...f, time: Date.now() }]);
  const [amount, setAmount] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const cfg = { ...SDCA_DEFAULTS, ...sd };
  const [tpiSrc] = usePersisted<{ ltpiSource: 'ensemble' | 'sma200'; hyst?: number }>('signals.tpi', { ltpiSource: 'ensemble' });
  const ltpiSeries = useMemo(() => (model && (cfg.safety || (cfg.slowBuy ?? 1) < 1) ? ltpiStateSeries(model.prices, tpiSrc.ltpiSource ?? 'ensemble', tpiSrc.hyst ?? 0) : undefined), [model, cfg.safety, cfg.slowBuy, tpiSrc.ltpiSource, tpiSrc.hyst]);
  const owed = pf.safetyOwed ?? 0;
  const [ltpiMan] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const sdcaLtpi = manualLtpiActive(ltpiMan) ? ltpiMan.manual : (ltpiSeries?.at(-1) ?? 0);   // SDCA: LTPI on BTC

  const sdcaState = useMemo(() => {
    if (!model) return null;
    const comp = composite(model, cfg.enabled, freshManual(cfg));
    const last = model.dates.length - 1;
    const start = Math.max(0, model.dates.findIndex((d) => d >= cfg.startDate));
    const ath = athSellSeries(model.prices, comp.risk);
    const slow = ltpiSeries && (cfg.slowBuy ?? 1) < 1 ? { ltpi: ltpiSeries, mult: cfg.slowBuy! } : undefined;
    const bt = backtest(model.prices, comp.risk, cfg.curve, start, 10000, cfg.safety ? ltpiSeries : undefined, cfg.athSell ? ath.frac : undefined, slow);
    const price = model.prices[last];
    return { price, risk: comp.risk[last], rate: minBuyRate(slow ? slowBuyRate(curveRate(cfg.curve, comp.risk[last]), slow.ltpi[last] ?? 0, slow.mult) : curveRate(cfg.curve, comp.risk[last])) / 100, slowed: !!slow && (slow.ltpi[last] ?? 0) < 0, modelBtcShare: (bt.btc * price) / bt.value, date: model.dates[last], athFrac: ath.frac[last] ?? 0, athK: ath.k[last] ?? 0 };
  }, [model, cfg.enabled, cfg.manualRisk, cfg.curve, cfg.startDate, ltpiSeries, cfg.athSell, cfg.safety, cfg.slowBuy]);

  // live testing input: today's closed-candle signals (RSPS only when the scan is fresh and the signal is released)
  const paperInputs: PaperInputs | null = sdcaState && (R.scanFresh || !R.busy) ? {
    date: sdcaState.date, btcPrice: sdcaState.price, prices: R.prices, sdcaRate: sdcaState.rate, risk: sdcaState.risk, ltpi: sdcaLtpi, safety: cfg.safety,
    rspsTarget: R.scanFresh && R.signalReady ? (R.regime === 'defense' ? [] : R.sleeve.map((x) => ({ sym: x.sym, w: x.w }))) : null,
    split: splitSdca / 100
  } : null;
  const prices: Record<string, number> = { ...R.prices, [STABLE]: 1 };
  if (sdcaState) prices.BTC = sdcaState.price;
  const px = (sym: string) => prices[sym] ?? NaN;
  const target = R.sleeve;          // RSPS weights (fractions of the RSPS part); rest = stablecoin

  // ---------- initial plan from the amount ----------
  function plan(total: number): Holdings | null {
    if (!sdcaState) return null;
    const sdcaUsd = total * splitSdca / 100, rspsUsd = total - sdcaUsd;
    const btcUsd = sdcaUsd * sdcaState.modelBtcShare;
    const rsps: Record<string, number> = {};
    let used = 0;
    for (const t of target) { if (Number.isFinite(px(t.sym))) { rsps[t.sym] = (rspsUsd * t.w) / px(t.sym); used += rspsUsd * t.w; } }
    rsps[STABLE] = rspsUsd - used;
    return { sdca: { BTC: btcUsd / sdcaState.price, [STABLE]: sdcaUsd - btcUsd }, rsps };
  }

  // ---------- valuation of current holdings ----------
  const H = pf.holdings;
  const val = (sym: string, units: number) => (sym === STABLE ? units : units * px(sym));
  const sdcaVal = H ? val('BTC', H.sdca.BTC) + H.sdca[STABLE] : 0;
  const rspsVal = H ? Object.entries(H.rsps).reduce((a, [k, u]) => a + (Number.isFinite(val(k, u)) ? val(k, u) : 0), 0) : 0;
  const total = sdcaVal + rspsVal;
  const sdcaShare = total ? sdcaVal / total : 0;
  const stableVal = H ? H.sdca[STABLE] + (H.rsps[STABLE] ?? 0) : 0;
  const exposure = total ? 1 - stableVal / total : 0;
  const missingPrice = H ? Object.keys(H.rsps).filter((k) => k !== STABLE && !Number.isFinite(px(k))) : [];

  // ---------- today's orders ----------
  const orders: Order[] = [];
  if (H && sdcaState) {
    const r = sdcaState.rate;
    if (r > 1e-6 && H.sdca[STABLE] > 0) {
      const u = H.sdca[STABLE] * r;
      if (u >= MIN_TRADE_USD) orders.push({ id: 'sdca', sleeve: 'SDCA', side: 'buy', sym: 'BTC', usd: u, units: u / sdcaState.price, why: `krzywa ${(r * 100).toFixed(2)}% rezerwy przy ryzyku ${sdcaState.risk.toFixed(1)}%${sdcaState.slowed ? ` (LTPI ujemne: × ${cfg.slowBuy})` : ''}` });
    } else if (r < -1e-6 && H.sdca.BTC > 0) {
      const units = H.sdca.BTC * -r;
      if (units * sdcaState.price >= MIN_TRADE_USD) orders.push({ id: 'sdca', sleeve: 'SDCA', side: 'sell', sym: 'BTC', usd: units * sdcaState.price, units, why: `krzywa ${(r * 100).toFixed(2)}% BTC przy ryzyku ${sdcaState.risk.toFixed(1)}%` });
    }
    if (cfg.safety) {
      const st = safetyStep(sdcaState.risk, sdcaLtpi, H.sdca.BTC * sdcaState.price, H.sdca[STABLE], owed);
      if (st.kind === 'sell' && st.usd >= MIN_TRADE_USD)
        orders.push({ id: 'sdca-safety', sleeve: 'SDCA', side: 'sell', sym: 'BTC', usd: st.usd, units: st.usd / sdcaState.price, why: `bezpiecznik: LTPI ujemne przy ryzyku ${sdcaState.risk.toFixed(1)}% → 2% BTC do stablecoina` });
      else if (st.kind === 'rebuy' && st.usd >= MIN_TRADE_USD)
        orders.push({ id: 'sdca-rebuy', sleeve: 'SDCA', side: 'buy', sym: 'BTC', usd: st.usd, units: st.usd / sdcaState.price, why: `odkup po bezpieczniku: LTPI dodatnie, zostało ${usd(owed, 0)} do odkupienia` });
    }
    if (sdcaState.athFrac > 0 && H.sdca.BTC > 0) {
      const units = H.sdca.BTC * sdcaState.athFrac;
      if (units * sdcaState.price >= MIN_TRADE_USD) orders.push({ id: 'sdca-ath', sleeve: 'SDCA', side: 'sell', sym: 'BTC', usd: units * sdcaState.price, units, why: `PROPOZYCJA · nowy szczyt (ATH) przy ryzyku ${sdcaState.risk.toFixed(1)}% → ${(sdcaState.athFrac * 100).toFixed(2)}% BTC (${sdcaState.athK + 1}. w cyklu)` });
    }
    if (R.scanFresh && R.signalReady && rspsVal > 0) {
      const want: Record<string, number> = {};
      target.forEach((t) => (want[t.sym] = t.w * rspsVal));
      const syms = new Set([...Object.keys(want), ...Object.keys(H.rsps).filter((k) => k !== STABLE)]);
      for (const sym of syms) {
        const p = px(sym); if (!Number.isFinite(p)) continue;
        const have = (H.rsps[sym] ?? 0) * p, diff = (want[sym] ?? 0) - have;
        if (Math.abs(diff) < Math.max(MIN_TRADE_USD, MIN_TRADE_FRAC * rspsVal)) continue;
        orders.push({ id: 'rsps-' + sym, sleeve: 'RSPS', side: diff > 0 ? 'buy' : 'sell', sym, usd: Math.abs(diff), units: Math.abs(diff) / p,
          why: want[sym] ? `cel ${pct((want[sym] / rspsVal) * 100, 0)} części RSPS` : R.regime === 'rsps' ? 'wypadł z wyboru' : 'bramka zamknięta / LTPI' });
      }
    }
    if (total > 0 && Math.abs(sdcaShare - splitSdca / 100) > BAND) {
      const move = Math.abs(sdcaShare - splitSdca / 100) * total;
      orders.push({ id: 'rebal', sleeve: 'Rebalans', side: 'move', sym: STABLE, usd: move, units: move,
        why: `SDCA ${pct(sdcaShare * 100, 0)} poza pasmem ${splitSdca - 10}–${splitSdca + 10}%: przenieś ${usd(move, 0)} z ${sdcaShare > splitSdca / 100 ? 'SDCA do RSPS' : 'RSPS do SDCA'}` });
    }
  }

  function execute(order: Order) {
    let o = order;
    let short = false;
    if (!H) return;
    const h: Holdings = { sdca: { ...H.sdca }, rsps: { ...H.rsps } };
    if (o.sleeve === 'SDCA') {
      if (o.side === 'buy') { h.sdca.BTC += o.units; h.sdca[STABLE] -= o.usd; } else { h.sdca.BTC -= o.units; h.sdca[STABLE] += o.usd; }
    } else if (o.sleeve === 'RSPS') {
      const sign = o.side === 'buy' ? 1 : -1;
      h.rsps[o.sym] = Math.max(0, (h.rsps[o.sym] ?? 0) + sign * o.units);
      h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) - sign * o.usd;
      if (h.rsps[o.sym] < 1e-12) delete h.rsps[o.sym];
    } else {
      // move stablecoins from the overweight portfolio to the other one; never sell silently
      const fromSdca = sdcaShare > splitSdca / 100;
      const avail = fromSdca ? h.sdca[STABLE] : (h.rsps[STABLE] ?? 0);
      const moved = Math.min(avail, o.usd);
      if (fromSdca) { h.sdca[STABLE] -= moved; h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) + moved; }
      else { h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) - moved; h.sdca[STABLE] += moved; }
      if (moved < o.usd - 1) short = true, toast(`Przeniesiono ${usd(moved, 0)}. Brakuje ${usd(o.usd - moved, 0)} stablecoinów w portfelu ${fromSdca ? 'SDCA' : 'RSPS'} — sprzedaj tam część pozycji i przenieś resztę.`);
      o = { ...o, usd: moved };
      if (moved > 0) addFlow({ amount: 0, sdca: fromSdca ? -moved : moved, rsps: fromSdca ? moved : -moved, note: 'transfer' });
    }
    let nOwed = owed;
    if (o.id === 'sdca-safety') nOwed += o.usd;
    else if (o.id === 'sdca-rebuy' || (o.sleeve === 'SDCA' && o.side === 'buy')) nOwed = Math.max(0, nOwed - o.usd);
    else if ((o.id === 'sdca' || o.id === 'sdca-ath') && o.side === 'sell') nOwed *= H.sdca.BTC > 0 ? Math.max(0, 1 - o.units / H.sdca.BTC) : 0;
    if (nOwed < MIN_TRADE_USD) nOwed = 0;
    setPf({ holdings: h, safetyOwed: nOwed, history: [{ time: Date.now(), text: `${o.sleeve}: ${o.side === 'buy' ? 'kupno' : o.side === 'sell' ? 'sprzedaż' : 'przeniesienie'} ${o.sym} ${usd(o.usd, 0)}` }, ...pf.history].slice(0, 200) });
    if (!short) toast('Zapisano wykonanie');
  }

  // conservative (fully correlated) portfolio volatility estimate for the exposure proposal
  const volEst = H && total ? (val('BTC', H.sdca.BTC) * (R.vols.BTC ?? 0) + Object.entries(H.rsps).reduce((a, [k, u]) => a + (k === STABLE ? 0 : (val(k, u) || 0) * (R.vols[k] ?? R.vols.BTC ?? 0)), 0)) / total : 0;

  // ---------- performance: one snapshot per closed daily candle ----------
  const pricesReady = !!H && !!sdcaState && missingPrice.length === 0;
  useEffect(() => {
    if (!H || !sdcaState || !pricesReady) return;
    if (snaps.length && snaps[snaps.length - 1].date >= sdcaState.date) return;
    setSnaps([...snaps, { date: sdcaState.date, time: Date.now(), total, sdca: sdcaVal, rsps: rspsVal, stable: stableVal, btcPrice: sdcaState.price }]);
  }, [sdcaState?.date, pricesReady, !!H]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- monthly reports: generated once a month has closed ----------
  useEffect(() => {
    if (snaps.length < 2) return;
    const cur = monthOf(snaps[snaps.length - 1].date);
    const months = [...new Set(snaps.map((x) => monthOf(x.date)))].filter((m) => m < cur && !reports.some((r) => r.month === m));
    if (!months.length) return;
    const ctx = { history: pf.history, regimes: load<{ time: number; regime: string }[]>('rsps.log', []), pyramid: load<{ date: string; z: number }[]>('pyramid.history', []) };
    const fresh = months.map((m) => monthlyReport(m, snaps, flows, ctx)).filter((x): x is MonthlyReport => !!x);
    if (fresh.length) { setReports([...fresh, ...reports].sort((a, b) => b.month.localeCompare(a.month))); toast(`Nowy raport miesięczny: ${fresh.map((r) => r.month).join(', ')}`); }
  }, [snaps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const perf = snaps.length >= 2 ? stats(snaps, flows) : null;
  const liveMonth = snaps.length >= 2 ? monthlyReport(monthOf(snaps[snaps.length - 1].date), snaps, flows, { history: pf.history, regimes: load('rsps.log', []), pyramid: load('pyramid.history', []) }) : null;

  if (!H) {
    const p = amount && amount > 0 ? plan(amount) : null;
    return (
      <Screen title="Portfel" subtitle="Rozpisanie kapitału, codzienne zlecenia i rotacja">
        <Card className="hero">
          <div className="eyebrow">Kwota na kryptowaluty</div>
          <NumInput value={amount} onChange={setAmount} placeholder="np. 10000" suffix="USD" />
          <div className="note-text mt8">System podzieli kwotę na dwa oddzielne portfele — SDCA {splitSdca}% i RSPS {100 - splitSdca}% — i rozpisze je według dzisiejszego stanu modeli (zamknięcie {sdcaState?.date ?? '—'}).</div>
        </Card>
        {p && <PlanTable h={p} px={px} />}
        {p && <button className="btn primary block" onClick={() => {
          setPf({ holdings: p, history: [{ time: Date.now(), text: `Start: ${usd(amount!, 0)}` }] });
          setFlows([]); setReports([]);
          const sv = val('BTC', p.sdca.BTC) + p.sdca[STABLE], rv = Object.entries(p.rsps).reduce((a, [k, u]) => a + (val(k, u) || 0), 0);
          setSnaps(sdcaState ? [{ date: sdcaState.date, time: Date.now(), total: sv + rv, sdca: sv, rsps: rv, stable: p.sdca[STABLE] + (p.rsps[STABLE] ?? 0), btcPrice: sdcaState.price }] : []);
          toast('Portfele utworzone — start śledzenia wyników');
        }}>Kupiłem według planu — utwórz oba portfele</button>}
        {!R.scanFresh && <div className="warn-box mt12">Skan RSPS nieaktualny — otwórz Strategia → RSPS lub poczekaj na skan, aby plan RSPS był aktualny.</div>}
        <Fold id="pf.paper" title="Live testing" hint="Wirtualny portfel od startu wykonuje sygnały · statystyki, tygodnie, miesiące" defaultOpen>
          <PaperCard inputs={paperInputs} />
        </Fold>
      </Screen>
    );
  }

  const sdcaOrders = orders.filter((o) => o.sleeve === 'SDCA');
  const rspsOrders = orders.filter((o) => o.sleeve === 'RSPS');
  const transfer = orders.find((o) => o.sleeve === 'Rebalans');
  const OrderList = ({ list, empty }: { list: Order[]; empty: string }) => (
    <>
      {list.length === 0 && <div className="note-text" style={{ padding: '10px 16px' }}>{empty}</div>}
      {list.map((o) => (
        <div key={o.id} className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div><span className={o.side === 'buy' ? 'green' : 'red'}>{o.side === 'buy' ? 'KUP' : 'SPRZEDAJ'}</span> <b>{o.sym}</b> <span className="num">{usd(o.usd, 0)}</span> <span className="dim num">≈ {o.units.toPrecision(5)}</span></div>
            <div className="faint" style={{ fontSize: 12 }}>{o.why}</div>
          </div>
          <button className="btn small" onClick={() => execute(o)}>Wykonano</button>
        </div>
      ))}
    </>
  );
  const Holding = ({ sym, units }: { sym: string; units: number }) => (
    <Row className="compact" label={<span style={{ paddingLeft: 16 }}>{sym}</span>} value={<span className="num" style={{ paddingRight: 16 }}>{sym === STABLE ? usd(units, 0) : `${units.toPrecision(6)} · ${usd(val(sym, units), 0)}`}</span>} />
  );

  return (
    <Screen title="Portfel" subtitle={`Codziennie po zamknięciu 00:00 UTC · dane ${sdcaState?.date ?? '—'}`}>
      <Card className="hero">
        <div className="eyebrow">Kapitał na kryptowaluty</div>
        <div className="big-number">{usd(total, 0)}</div>
        <div className="stat-grid mt12">
          <div className="stat"><div className="k">SDCA / RSPS</div><div className="v">{pct(sdcaShare * 100, 0)} / {pct((1 - sdcaShare) * 100, 0)}</div><div className="s">cel {splitSdca}/{100 - splitSdca} · pasmo 50–70%</div></div>
          <div className="stat"><div className="k">Ekspozycja na rynek</div><div className="v">{pct(exposure * 100, 0)}</div><div className="s">stablecoin {usd(stableVal, 0)}</div></div>
        </div>
        {missingPrice.length > 0 && <div className="warn-box mt12" style={{ marginBottom: 0 }}>Brak ceny dla: {missingPrice.join(', ')} (poza skanerem). Wartość pominięta.</div>}
        <div className="flex mt12"><button className="btn small grow" onClick={() => setFlowOpen(true)}>Wpłata / wypłata</button><button className="btn small grow" onClick={() => setEditOpen(true)}>Edytuj stany</button></div>
      </Card>


      <div className="section-title">Wyniki portfela · od {snaps[0]?.date ?? '—'}</div>
      <Card>
        {!perf && <div className="note-text">Wyniki pojawią się po pierwszym zamknięciu dnia od startu (codziennie 00:00 UTC).</div>}
        {perf && (
          <>
            <div className="stat-grid">
              <Stat k="Wynik (TWR)" v={<span className={perf.twr >= 0 ? 'green' : 'red'}>{pct(perf.twr * 100, 1, true)}</span>} s={`BTC: ${pct(perf.btc * 100, 1, true)}`} />
              <Stat k="SDCA / RSPS" v={`${pct(perf.sdcaTwr * 100, 1, true)} / ${pct(perf.rspsTwr * 100, 1, true)}`} s="TWR każdego portfela" />
              <Stat k="Maks. obsunięcie" v={<span className="red">{pct(perf.maxDD * 100, 1)}</span>} s={`obecnie ${pct(perf.currentDD * 100, 1)}`} />
              <Stat k="Zmienność / Sharpe" v={`${pct(perf.vol * 100, 0)} / ${perf.sharpe == null ? '—' : perf.sharpe.toFixed(2)}`} s={perf.sharpe == null ? 'Sharpe od 30 dni danych' : 'roczne'} />
              <Stat k="Sortino / Omega" v={`${perf.sortino == null ? '—' : perf.sortino.toFixed(2)} / ${perf.omega == null ? '—' : perf.omega.toFixed(2)}`} s="Sortino karze tylko spadki; Omega = suma zysków / suma strat" />
            </div>
            <div className="mt12" />
            <Chart labels={snaps.map((x) => x.date)} height={180}
              lines={[{ values: snaps.map((x) => x.btcPrice / snaps[0].btcPrice), color: '#8e8e93', width: 1.2 }, { values: perf.idx, color: '#d4b483', width: 1.8 }]}
              fmtLeft={(v) => ((v - 1) * 100).toFixed(0) + '%'}
              tip={(i) => `${snaps[i].date} · portfel ${pct((perf.idx[i] - 1) * 100, 1, true)} · BTC ${pct((snaps[i].btcPrice / snaps[0].btcPrice - 1) * 100, 1, true)} · ${usd(snaps[i].total, 0)}`} />
            <div className="legend"><span><i style={{ background: '#d4b483' }} />Portfel (TWR)</span><span><i style={{ background: '#8e8e93' }} />BTC kup i trzymaj</span></div>
            <div className="note-text mt8">{perf.days} dni z danymi · wpłaty netto {usd(perf.netFlows, 0)}. TWR pomija wpłaty, wypłaty i przeniesienia między portfelami. Dni bez otwarcia aplikacji są łączone w jeden okres.</div>
          </>
        )}
      </Card>

      <div className="section-title">Raporty miesięczne</div>
      <Card className="tight">
        {liveMonth && <div className="list-item" onClick={() => setOpenReport(liveMonth)}><div className="grow"><b>{liveMonth.month}</b> <span className="pill gold">w toku</span><div className="faint" style={{ fontSize: 12 }}>do {liveMonth.to}</div></div><span className={'num ' + (liveMonth.twr >= 0 ? 'green' : 'red')}>{pct(liveMonth.twr * 100, 1, true)}</span></div>}
        {reports.map((r) => <div key={r.month} className="list-item" onClick={() => setOpenReport(r)}><div className="grow"><b>{r.month}</b><div className="faint" style={{ fontSize: 12 }}>{r.from} → {r.to} · BTC {pct(r.btc * 100, 1, true)}</div></div><span className={'num ' + (r.twr >= 0 ? 'green' : 'red')}>{pct(r.twr * 100, 1, true)}</span></div>)}
        {!liveMonth && reports.length === 0 && <div className="note-text" style={{ padding: 16 }}>Pierwszy raport powstanie po zakończeniu miesiąca. Raporty zapisują się automatycznie.</div>}
      </Card>

      {transfer ? (
        <Card>
          <div className="between"><b className="accent">Przeniesienie między portfelami</b><span className="pill trim">poza pasmem</span></div>
          <div className="note-text mt8">{transfer.why}. Przenoszone są stablecoiny; jeśli w portfelu źródłowym ich brakuje, najpierw sprzedaj tam część pozycji.</div>
          <button className="btn primary block mt12" onClick={() => execute(transfer)}>Przenieś {usd(transfer.usd, 0)} {sdcaShare > splitSdca / 100 ? 'SDCA → RSPS' : 'RSPS → SDCA'}</button>
        </Card>
      ) : <div className="note-text center mb12">Portfele w paśmie 50–70% — brak przeniesienia między nimi.</div>}

      {R.parkingPending && (
        <Card>
          <div className="between"><b>Decyzja: bramka RSPS zamknięta</b><span className="pill trim">wymaga decyzji</span></div>
          <div className="note-text mt8">Gdzie trzymać portfel RSPS? Domyślnie stablecoin. Backtest 2020–10.2026: stablecoin — CAGR 54%, obsunięcie −26%; BTC × trend — CAGR 73%, obsunięcie −32%.</div>
          <div className="flex mt12">
            <button className="btn small primary grow" onClick={() => R.confirmParking('stable')}>Stablecoin</button>
            <button className="btn small grow" onClick={() => R.confirmParking('btc')}>BTC × trend</button>
          </div>
        </Card>
      )}

      <div className="section-title">Portfel SDCA · {usd(sdcaVal, 0)} · {pct(sdcaShare * 100, 0)}</div>
      <Card className="tight">
        <Holding sym="BTC" units={H.sdca.BTC} />
        <Holding sym={STABLE} units={H.sdca[STABLE]} />
        <div className="hr" style={{ margin: '4px 0' }} />
        <div className="eyebrow" style={{ padding: '6px 16px 0', margin: 0 }}>Dzisiejsze wskazówki</div>
        <OrderList list={sdcaOrders} empty={sdcaState ? `Krzywa ≈ 0% przy ryzyku ${sdcaState.risk.toFixed(1)}% — bez transakcji.` : 'Ładowanie modelu…'} />
      </Card>

      <div className="section-title">Portfel RSPS · {usd(rspsVal, 0)} · {pct((1 - sdcaShare) * 100, 0)}</div>
      <Card className="tight">
        {Object.entries(H.rsps).map(([k, u]) => <Holding key={k} sym={k} units={u} />)}
        <div className="hr" style={{ margin: '4px 0' }} />
        <div className="eyebrow" style={{ padding: '6px 16px 0', margin: 0 }}>Dzisiejsze wskazówki · {R.regime === 'rsps' ? 'RSPS aktywny' : R.regime === 'defense' ? 'LTPI < 0' : 'bramka zamknięta'}</div>
        <OrderList list={rspsOrders} empty={R.scanFresh ? 'Portfel zgodny z sygnałem.' : 'Skan RSPS nieaktualny — wskazówki po skanie.'} />
      </Card>

      {(R.gate.allowed || R.shortProposal || volEst > 0.6) && <div className="section-title">Propozycje (poza portfelami)</div>}
      {R.gate.allowed && <Card><b className="green">Dźwignia {LEV_MAX}× na BTC</b><div className="note-text mt8">Spełnione wszystkie 10 warunków. Tylko propozycja.</div></Card>}
      {R.shortProposal && <Card><b className="red">Short altów: {R.picks.shorts.map((r) => r.sym).join(', ')}</b><div className="note-text mt8">MTPI ($TOTAL) poniżej zera i spada — wg notatek „rozważ short”. 15–30% portfela RSPS jako zabezpieczenie (kontrakty perpetual). Tylko propozycja.</div></Card>}
      {volEst > 0.6 && <Card><b className="amber">Zmienność portfela ≈ {pct(volEst * 100, 0)} rocznie</b><div className="note-text mt8">Szacunek ostrożny (pełna korelacja). Propozycja: ekspozycja ok. {pct(Math.min(1, 0.6 / volEst) * exposure * 100, 0)}, reszta w stablecoinach. W backteście limit zmienności nie poprawiał istotnie wyników.</div></Card>}

      <Card className="tight">
        <div className="row"><div className="grow"><div>Więcej RSPS, gdy rynek w trendzie</div><div className="faint" style={{ fontSize: 12 }}>LTPI z $TOTAL dodatnie → cel SDCA {SPLIT_TILT}% / RSPS {100 - SPLIT_TILT}% (zamiast {SPLIT_SDCA}/{100 - SPLIT_SDCA}) · teraz cel {splitSdca}/{100 - splitSdca}</div></div><Switch checked={tilt} onChange={setTilt} /></div>
        <div className="note-text" style={{ padding: '0 14px 12px' }}>Backtest od 2020 przy parkingu BTC × trend (research/run48.py): CAGR 59,6% → 66,7%, maks. obsunięcie −28,0% → −29,3%, Sharpe od 2024 1,05 → 1,00. Wyższy zwrot kosztem nieco większego ryzyka.</div>
      </Card>
      <Fold id="pf.paper" title="Live testing" hint="Wirtualny portfel od startu wykonuje sygnały · statystyki, tygodnie, miesiące" defaultOpen>
        <PaperCard inputs={paperInputs} />
      </Fold>
      <Fold id="pf.rules" title="Zasady i historia operacji">
      <div className="section-title">Zasady</div>
      <Card>
        <ol className="step-list">
          <li><b>Dwa oddzielne portfele.</b> SDCA i RSPS mają własne stablecoiny i kryptowaluty; wskazówki dotyczą tylko ich własnych środków.</li>
          <li><b>Przeniesienie</b> między portfelami tylko gdy udział SDCA wyjdzie poza 50–70% (±10 p.p.) i po Twoim kliknięciu „Przenieś”.</li>
          <li><b>SDCA ↔ stablecoin:</b> krzywa akumulacji/dystrybucji, codziennie.</li>
          <li><b>RSPS ↔ stablecoin:</b> bramka otwarta → tokeny + BTC × trend; zamknięta → Twój wybór (domyślnie stablecoin); LTPI &lt; 0 → 100% stablecoin.</li>
        </ol>
      </Card>

      {pf.history.length > 0 && <><div className="section-title">Historia</div><Card className="tight">{pf.history.slice(0, 15).map((h, i) => <Row key={i} label={h.text} value={<span className="dim">{new Date(h.time).toLocaleDateString('pl-PL')}</span>} />)}</Card></>}
      </Fold>

      <button className="btn danger block mt12" onClick={() => { if (confirm('Usunąć zapisane portfele, wyniki i raporty i zacząć od nowa?')) { setPf({ holdings: null, history: [] }); setSnaps([]); setFlows([]); setReports([]); } }}>Zacznij od nowa</button>

      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} h={H} onSave={(h, asFlow) => {
        if (asFlow) {
          const sv = val('BTC', h.sdca.BTC) + h.sdca[STABLE], rv = Object.entries(h.rsps).reduce((a, [k, u]) => a + (val(k, u) || 0), 0);
          const ds = sv - sdcaVal, dr = rv - rspsVal;
          if (Math.abs(ds) + Math.abs(dr) > 0.01) addFlow({ amount: ds + dr, sdca: ds, rsps: dr, note: 'edit' });
        }
        setPf({ ...pf, holdings: h, history: [{ time: Date.now(), text: asFlow ? 'Korekta stanów (wpłata/wypłata)' : 'Korekta stanów (wynik)' }, ...pf.history] });
      }} />
      <FlowSheet split={splitSdca} open={flowOpen} onClose={() => setFlowOpen(false)} onSave={(amt, target) => {
        const h: Holdings = { sdca: { ...H.sdca }, rsps: { ...H.rsps } };
        const toS = target === 'split' ? amt * splitSdca / 100 : target === 'sdca' ? amt : 0;
        h.sdca[STABLE] += toS; h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) + (amt - toS);
        if (h.sdca[STABLE] < -1e-9 || (h.rsps[STABLE] ?? 0) < -1e-9) { toast('Za mało stablecoinów w portfelu — najpierw sprzedaj część pozycji'); return; }
        setPf({ ...pf, holdings: h, history: [{ time: Date.now(), text: `${amt >= 0 ? 'Wpłata' : 'Wypłata'} ${usd(Math.abs(amt), 0)} (${target === 'split' ? `${splitSdca}/${100 - splitSdca}` : target.toUpperCase()})` }, ...pf.history] });
        addFlow({ amount: amt, sdca: toS, rsps: amt - toS, note: amt >= 0 ? 'deposit' : 'withdrawal' });
      }} />
      <ReportSheet r={openReport} onClose={() => setOpenReport(null)} />
    </Screen>
  );
}

const Stat = ({ k, v, s }: { k: string; v: React.ReactNode; s?: string }) => <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;

const REGIME_PL: Record<string, string> = { rsps: 'RSPS aktywny', closed: 'bramka zamknięta', btc: 'BTC × trend', defense: 'ochrona (LTPI < 0)' };
function reportText(r: MonthlyReport) {
  const p = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
  return [
    `Oramus — raport ${r.month} (${r.from} → ${r.to})`,
    `Wartość: ${usd(r.startValue, 0)} → ${usd(r.endValue, 0)} · wpłaty netto ${usd(r.netFlows, 0)}`,
    `Wynik (TWR): ${p(r.twr)} · SDCA ${p(r.sdcaTwr)} · RSPS ${p(r.rspsTwr)} · BTC ${p(r.btc)}`,
    `Maks. obsunięcie w miesiącu: ${(r.maxDD * 100).toFixed(2)}% · średnia ekspozycja ${(r.avgExposure * 100).toFixed(0)}%`,
    `Transakcje: ${r.trades} · przeniesienia: ${r.transfers} · dni z danymi: ${r.days}`,
    `Reżimy RSPS: ${r.regimes.length ? r.regimes.map((x) => REGIME_PL[x] ?? x).join(', ') : 'bez zmian'} · piramida śr. ${r.pyramidZ == null ? '—' : (r.pyramidZ >= 0 ? '+' : '') + r.pyramidZ.toFixed(2) + 'σ'}`,
    `Od startu (TWR): ${p(r.sinceStartTwr)}`,
    '© @thenotoriousg · narzędzie analityczne, nie porada inwestycyjna'
  ].join('\n');
}

function ReportSheet({ r, onClose }: { r: MonthlyReport | null; onClose: () => void }) {
  if (!r) return null;
  const P = (x: number) => <span className={x >= 0 ? 'green' : 'red'}>{pct(x * 100, 2, true)}</span>;
  return (
    <Sheet open={!!r} onClose={onClose} title={`Raport ${r.month}`} right={<button className="text-btn" onClick={() => shareFile(new Blob([reportText(r)], { type: 'text/plain' }), `oramus-raport-${r.month}.txt`)}>Udostępnij</button>}>
      <Card className="tight">
        <Row label="Okres" value={`${r.from} → ${r.to}`} />
        <Row label="Wartość" value={`${usd(r.startValue, 0)} → ${usd(r.endValue, 0)}`} />
        <Row label="Wpłaty netto" value={usd(r.netFlows, 0)} />
        <Row label={<b>Wynik (TWR)</b>} value={P(r.twr)} />
        <Row label="Portfel SDCA" value={P(r.sdcaTwr)} />
        <Row label="Portfel RSPS" value={P(r.rspsTwr)} />
        <Row label="BTC kup i trzymaj" value={P(r.btc)} />
        <Row label="Maks. obsunięcie" value={<span className="red">{pct(r.maxDD * 100, 2)}</span>} />
        <Row label="Średnia ekspozycja" value={pct(r.avgExposure * 100, 0)} />
        <Row label="Transakcje / przeniesienia" value={`${r.trades} / ${r.transfers}`} />
        <Row label="Reżimy RSPS" value={r.regimes.length ? r.regimes.map((x) => REGIME_PL[x] ?? x).join(', ') : 'bez zmian'} />
        <Row label="Piramida (średnio)" value={r.pyramidZ == null ? '—' : `${r.pyramidZ >= 0 ? '+' : ''}${r.pyramidZ.toFixed(2)}σ`} />
        <Row label="Od startu (TWR)" value={P(r.sinceStartTwr)} />
      </Card>
    </Sheet>
  );
}

function PlanTable({ h, px }: { h: Holdings; px: (s: string) => number }) {
  const rows: [string, string, number, number][] = [];
  rows.push(['SDCA', 'BTC', h.sdca.BTC * px('BTC'), h.sdca.BTC], ['SDCA', STABLE, h.sdca[STABLE], h.sdca[STABLE]]);
  Object.entries(h.rsps).forEach(([k, u]) => rows.push(['RSPS', k, k === STABLE ? u : u * px(k), u]));
  const tot = rows.reduce((a, r) => a + r[2], 0);
  return (
    <Card className="tight">
      <table className="data">
        <thead><tr><th style={{ paddingLeft: 16 }}>Część</th><th>Aktywo</th><th>%</th><th>USD</th><th style={{ paddingRight: 16 }}>Ilość</th></tr></thead>
        <tbody>{rows.filter((r) => r[2] > 0.5).map((r) => <tr key={r[0] + r[1]}><td style={{ paddingLeft: 16 }}>{r[0]}</td><td><b>{r[1]}</b></td><td>{pct((r[2] / tot) * 100, 1)}</td><td>{usd(r[2], 0)}</td><td style={{ paddingRight: 16 }}>{r[1] === STABLE ? '—' : r[3].toPrecision(5)}</td></tr>)}</tbody>
      </table>
      <div className="note-text" style={{ padding: '8px 16px 14px' }}>SDCA wchodzi w bieżący stan modelu (udział BTC jak w backteście SDCA). RSPS według dzisiejszego sygnału; reszta w stablecoinach.</div>
    </Card>
  );
}

function EditSheet({ open, onClose, h, onSave }: { open: boolean; onClose: () => void; h: Holdings; onSave: (h: Holdings, asFlow: boolean) => void }) {
  const [d, setD] = useState<Holdings>(h);
  const [asFlow, setAsFlow] = useState(true);
  const [sym, setSym] = useState('');
  if (!open) return null;
  const setR = (k: string, v: number | null) => setD({ ...d, rsps: { ...d.rsps, [k]: v ?? 0 } });
  return (
    <Sheet open={open} onClose={onClose} title="Stany portfela" right={<button className="text-btn" onClick={() => { onSave(d, asFlow); onClose(); toast('Zapisano'); }}>Zapisz</button>}>
      <Card className="tight"><div className="row"><div className="grow"><div>Zmiana wartości to wpłata/wypłata</div><div className="faint" style={{ fontSize: 12 }}>Wyłącz, jeśli poprawiasz błąd zapisu i różnica ma się liczyć do wyniku</div></div><Switch checked={asFlow} onChange={setAsFlow} /></div></Card>
      <div className="section-title">SDCA</div>
      <Card className="tight">
        <Row label="BTC (ilość)" value={<NumInput className="inline-input" value={d.sdca.BTC} onChange={(v) => setD({ ...d, sdca: { ...d.sdca, BTC: v ?? 0 } })} />} />
        <Row label={`${STABLE} (USD)`} value={<NumInput className="inline-input" value={d.sdca[STABLE]} onChange={(v) => setD({ ...d, sdca: { ...d.sdca, [STABLE]: v ?? 0 } })} />} />
      </Card>
      <div className="section-title">RSPS</div>
      <Card className="tight">
        {Object.entries(d.rsps).map(([k, u]) => (
          <div key={k} className="row"><span>{k}{k === STABLE ? ' (USD)' : ''}</span><span className="flex"><NumInput className="inline-input" value={u} onChange={(v) => setR(k, v)} />
            {k !== STABLE && <button className="icon-btn plain" onClick={() => { const r = { ...d.rsps }; delete r[k]; setD({ ...d, rsps: r }); }}><IcTrash width={17} /></button>}</span></div>
        ))}
        <div className="flex" style={{ padding: 12 }}><input className="input" placeholder="Dodaj token, np. ETH" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} autoCapitalize="characters" />
          <button className="btn primary" onClick={() => { if (sym) { setR(sym, d.rsps[sym] ?? 0); setSym(''); } }}><IcPlus width={18} /></button></div>
      </Card>
      <div className="note-text">Wpisz ilości z giełdy/portfela. Po zapisaniu system przeliczy zlecenia rotacji.</div>
    </Sheet>
  );
}

function FlowSheet({ split: splitSdca, open, onClose, onSave }: { split: number; open: boolean; onClose: () => void; onSave: (amt: number, target: 'split' | 'sdca' | 'rsps') => void }) {
  const [amt, setAmt] = useState<number | null>(null);
  const [side, setSide] = useState<'in' | 'out'>('in');
  const [target, setTarget] = useState<'split' | 'sdca' | 'rsps'>('split');
  return (
    <Sheet open={open} onClose={onClose} title="Wpłata / wypłata">
      <div className="flex mb12">
        <button className="btn small grow" style={side === 'in' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setSide('in')}>Wpłata</button>
        <button className="btn small grow" style={side === 'out' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setSide('out')}>Wypłata</button>
      </div>
      <div className="field"><label>Kwota (USD)</label><NumInput value={amt} onChange={setAmt} /></div>
      <div className="flex mb12">
        {([['split', `Oba (${splitSdca}/${100 - splitSdca})`], ['sdca', 'SDCA'], ['rsps', 'RSPS']] as const).map(([k, l]) => (
          <button key={k} className="btn small grow" style={target === k ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setTarget(k)}>{l}</button>
        ))}
      </div>
      <div className="note-text mb12">Kwota trafia do stablecoinów wybranego portfela (wypłata z nich znika). Wskazówki kupna pojawią się według sygnałów.</div>
      <button className="btn primary block" onClick={() => { if (amt && amt > 0) { onSave(side === 'in' ? amt : -amt, target); setAmt(null); onClose(); } }}>Zapisz</button>
    </Sheet>
  );
}
