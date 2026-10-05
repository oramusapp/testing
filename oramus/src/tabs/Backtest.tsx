import { useEffect, useMemo, useState } from 'react';
import { Screen, Card, Seg, toast } from '../components/ui';
import { Chart } from '../components/Chart';
import { useBtc } from '../lib/btcStore';
import { usePersisted } from '../lib/db';
import { composite, freshManual } from '../lib/sdcaModel';
import { athSellSeries, backtest } from '../lib/quant';
import { computeTpi, ltpiStateSeries, MTPI_SPEC } from '../lib/tpi';
import { PERIODS, buyHold, combine, equity, loadCoins, perf, rspsRun, sdcaRun, tpiRun, type Run } from '../lib/backtestAll';
import { HYBRID_RISK_MAX, MEME, RSPS_DEF, SPLIT_SDCA, SPLIT_TILT, type Parking, type RspsSettings } from '../lib/useRsps';
import { SDCA_DEFAULTS, type SdcaSettings } from './Sdca';
import { TPI_DEFAULTS, type TpiSettings } from '../lib/pyramidStore';
import { fmtDate } from '../lib/format';

type Mode = 'all' | 'sdca' | 'rsps' | 'tpi';
const STARTS = ['2018-01-01', '2020-01-01', '2022-01-01'];
const pc = (x: number | undefined) => (x == null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`);
const nm = (x: number | undefined) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2).replace('.', ','));
let rspsCache: { key: string; run: Run } | null = null;

/** Backtests of the whole strategy and of each part, with the settings currently chosen in the app. */
export default function Backtest({ nav }: { nav?: React.ReactNode }) {
  const { model, tpiPrices } = useBtc();
  const [mode, setMode] = usePersisted<Mode>('backtest.mode', 'all');
  const [start, setStart] = usePersisted<string>('backtest.start', '2020-01-01');
  const [sd] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [tpi0] = usePersisted<TpiSettings>('signals.tpi', TPI_DEFAULTS);
  const [rs0] = usePersisted<RspsSettings>('rsps.settings', RSPS_DEF);
  const [parking] = usePersisted<{ choice: Parking }>('rsps.parking', { choice: 'hybrid' });
  const [saved, setSaved] = usePersisted<{ key: string; run: Run } | null>('backtest.rsps', null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tilt] = usePersisted<boolean>('portfolio.tilt', false);
  const cfg = { ...SDCA_DEFAULTS, ...sd }, tpiCfg = { ...TPI_DEFAULTS, ...tpi0 }, rs = { ...RSPS_DEF, ...rs0 };
  const effStart = mode === 'all' || mode === 'rsps' ? (start < '2020-01-01' ? '2020-01-01' : start) : start;

  const base = useMemo(() => {
    if (!model) return null;
    const comp = composite(model, cfg.enabled, freshManual(cfg));
    const tp = tpiPrices ?? model.prices;
    const ltpi = ltpiStateSeries(tp, tpiCfg.ltpiSource, tpiCfg.hyst ?? 0);          // $TOTAL: tab + RSPS veto
    const ltpiBtc = ltpiStateSeries(model.prices, tpiCfg.ltpiSource, tpiCfg.hyst ?? 0);   // BTC: SDCA
    const mtpi = computeTpi(tp, MTPI_SPEC, tp.length, tpiCfg.hyst ?? 0).stateSeries;
    return { comp, ltpi, ltpiBtc, mtpi, tp };
  }, [model, tpiPrices, cfg.enabled, cfg.manualRisk, tpiCfg.ltpiSource, tpiCfg.hyst]);

  const s0 = model ? Math.max(0, model.dates.findIndex((d) => d >= effStart)) : 0;
  const runs = useMemo(() => {
    if (!model || !base) return null;
    const { comp, ltpi, ltpiBtc, mtpi } = base;
    const ath = cfg.athSell ? athSellSeries(model.prices, comp.risk).frac : undefined;
    const slow = (cfg.slowBuy ?? 1) < 1 ? { ltpi: ltpiBtc, mult: cfg.slowBuy! } : undefined;
    const bt = backtest(model.prices, comp.risk, cfg.curve, s0, 10000, cfg.safety ? ltpiBtc : undefined, ath, slow);
    return {
      sdca: sdcaRun(model.dates, s0, bt.equity, bt.btcShare),
      ltpi: tpiRun(model.dates, model.prices, ltpi, s0),
      mtpi: tpiRun(model.dates, model.prices, mtpi, s0),
      btc: buyHold(model.dates.slice(s0), model.prices.slice(s0))
    };
  }, [model, base, s0, cfg.curve, cfg.safety, cfg.athSell, cfg.slowBuy]);

  const rspsKey = model ? [model.dates.at(-1), effStart, rs.tokens.join(','), rs.universeSize, rs.topN, rs.cap, parking.choice, cfg.enabled.mvrv, tpiCfg.ltpiSource, tpiCfg.hyst].join('|') : '';
  const rspsRunRes = rspsCache?.key === rspsKey ? rspsCache.run : saved?.key === rspsKey ? saved.run : null;

  async function runRsps() {
    if (!model || !base) return;
    setBusy('Pobieranie danych…');
    try {
      const i0 = Math.max(0, model.dates.findIndex((d) => d >= '2019-01-01'));
      const dates = model.dates.slice(i0), btc = model.prices.slice(i0);
      const coins = await loadCoins(dates, rs.tokens.filter((t) => !MEME.includes(t)), (m) => setBusy(m));
      setBusy('Liczenie…');
      const st = Math.max(0, dates.findIndex((d) => d >= effStart));
      const run = rspsRun(dates, btc, coins, base.ltpiBtc.slice(i0), base.comp.risk.slice(i0), st,
        { universe: rs.universeSize, topN: rs.topN, cap: rs.cap / 100, parking: parking.choice, hybridMax: HYBRID_RISK_MAX, every: 1 });
      const lite = { dates: run.dates, ret: run.ret, expo: run.expo };
      rspsCache = { key: rspsKey, run: lite }; setSaved({ key: rspsKey, run: lite });
      toast(`RSPS: ${coins.length} tokenów z Binance`);
    } catch (e) { toast('Nie udało się pobrać danych: ' + (e as Error).message); }
    setBusy(null);
  }

  const view = useMemo(() => {
    if (!runs) return null;
    if (mode === 'sdca') return { main: [{ name: 'SDCA', run: runs.sdca, color: '#d4b483' }] };
    if (mode === 'tpi') return { main: [{ name: 'LTPI (long/stable)', run: runs.ltpi, color: '#5aa9e6' }, { name: 'MTPI (long/stable)', run: runs.mtpi, color: '#d4b483' }] };
    if (!rspsRunRes) return null;
    if (mode === 'rsps') return { main: [{ name: 'RSPS', run: rspsRunRes, color: '#d4b483' }] };
    // tilt: target decided on the previous close from LTPI on $TOTAL
    const prevLt = new Map(model!.dates.map((d, i) => [d, i > 0 ? base!.ltpi[i - 1] : 0]));
    const target = tilt ? (d: string) => ((prevLt.get(d) ?? 0) > 0 ? SPLIT_TILT : SPLIT_SDCA) / 100 : undefined;
    return { main: [{ name: tilt ? `Strategia (przechył ${SPLIT_TILT}/${100 - SPLIT_TILT})` : `Strategia ${SPLIT_SDCA}/${100 - SPLIT_SDCA}`, run: combine(runs.sdca, rspsRunRes, SPLIT_SDCA / 100, 0.1, target), color: '#d4b483' }, { name: 'SDCA', run: runs.sdca, color: '#9ccc5a' }, { name: 'RSPS', run: rspsRunRes, color: '#5aa9e6' }] };
  }, [runs, rspsRunRes, mode, tilt, model, base]);

  const needRsps = (mode === 'all' || mode === 'rsps') && !rspsRunRes;
  // recompute automatically after every daily close (new candle → new key) or settings change
  useEffect(() => { if (needRsps && model && base && !busy) void runRsps(); }, [rspsKey, mode, !!base]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = view ? view.main[0].run.dates : [];
  const btcPrices = model ? new Map(model.dates.map((d, i) => [d, model.prices[i]])) : new Map<string, number>();
  const bh: Run | null = labels.length ? buyHold(labels, labels.map((d) => btcPrices.get(d)!)) : null;


  return (
    <Screen nav={nav} title="Backtest" subtitle="Cała strategia i jej części · ustawienia jak w aplikacji">
      <Seg value={mode} onChange={setMode} options={[{ v: 'all', l: 'Całość' }, { v: 'sdca', l: 'SDCA' }, { v: 'rsps', l: 'RSPS' }, { v: 'tpi', l: 'LTPI · MTPI' }]} />
      <div className="mt12" />
      <Seg value={start} onChange={setStart} options={STARTS.map((s) => ({ v: s, l: `od ${s.slice(0, 4)}` }))} />
      {!model && <Card><div className="dim">Ładowanie danych BTC…</div></Card>}
      {model && needRsps && (
        <Card className="mt12">
          <div className="note-text">Backtest RSPS pobiera dzienne świece listy kandydatów z Binance od 2019 r. (kilkadziesiąt zapytań) i przelicza się sam po każdym zamknięciu świecy (00:00 UTC) lub zmianie ustawień.</div>
          <button className="btn primary block mt12" disabled={!!busy} onClick={() => void runRsps()}>{busy ?? 'Pobierz dane i policz RSPS'}</button>
        </Card>
      )}
      {view && bh && (
        <>
          <Card className="mt12">
            <div className="eyebrow" style={{ margin: 0 }}>Kapitał (skala log) · start {fmtDate(labels[0])}</div>
            <Chart labels={labels} log height={240}
              lines={[{ values: equity(bh.ret), color: '#8e8e93', width: 1.1 }, ...view.main.map((m, k) => ({ values: equity(m.run.ret), color: m.color, width: k === 0 ? 1.8 : 1.2 }))]}
              tip={(i) => `${fmtDate(labels[i])} · ` + view.main.map((m) => `${m.name} ${equity(m.run.ret.slice(0, i + 1)).at(-1)!.toFixed(2)}×`).join(' · ')} />
            <div className="legend">{view.main.map((m) => <span key={m.name}><i style={{ background: m.color }} />{m.name}</span>)}<span><i style={{ background: '#8e8e93' }} />BTC kup i trzymaj</span></div>
          </Card>
          {[...view.main.map((m) => ({ name: m.name, run: m.run })), { name: 'BTC kup i trzymaj', run: bh }].map((m) => (
            <Card key={m.name} className="tight">
              <div className="row"><b>{m.name}</b><span className="faint" style={{ fontSize: 12 }}>CAGR · Sharpe · Sortino · maks. DD · ekspozycja</span></div>
              {PERIODS.map((p) => {
                const r = perf(m.run, p.from && p.from > labels[0] ? p.from : (p.id === 'full' ? '' : p.from), p.to);
                return <div key={p.id} className="row compact"><span className="dim">{p.label}</span><span className="num" style={{ fontSize: 13 }}>{r ? `${pc(r.cagr)} · ${nm(r.sharpe)} · ${nm(r.sortino)} · ${pc(r.maxDD)} · ${Math.round(r.expo * 100)}%` : '—'}</span></div>;
              })}
            </Card>
          ))}
        </>
      )}
      <div className="note-text mt12">
        Bez patrzenia w przyszłość: każdy dzień używa tylko danych do zamknięcia swojej świecy (00:00 UTC) — model wyceny przeliczany co rok na danych sprzed 1 stycznia, percentyle tylko z przeszłości, TPI z wcześniejszych zamknięć; decyzja na zamknięciu, transakcja następnego dnia. Zasady jak w sygnałach: decyzja na zamknięciu dnia, transakcja następnego dnia, koszt 0,15% za stronę. SDCA: krzywa, bezpiecznik LTPI (liczone z BTC), tempo zakupów przy LTPI− i (jeśli włączona) sprzedaż przy ATH — od 100% stablecoinów w dniu startu.
        LTPI · MTPI: BTC, gdy stan TPI jest dodatni, w przeciwnym razie stablecoin. Kupowany jest BTC; $TOTAL (cały rynek) służy wyłącznie do odczytu kierunku i trendu (TPI), jak w notatkach — nie jest aktywem do kupienia. Próg stanu wg ustawień (domyślnie 0).
        RSPS: weto LTPI liczone z BTC; codzienna rotacja siły względnej wśród {rs.universeSize - 1} najpłynniejszych altów (plus BTC), bramka szerokości 70%/60%, LTPI− → stablecoin, parking: {parking.choice === 'stable' ? 'stablecoin' : parking.choice === 'btc' ? 'BTC × trend' : `hybryda (ryzyko < ${HYBRID_RISK_MAX}%)`}.
        Używa dzisiejszej listy kandydatów, więc tokeny, które zniknęły z rynku, są pominięte — wynik RSPS jest optymistyczny (błąd przeżywalności).
        Całość: {SPLIT_SDCA}% SDCA / {100 - SPLIT_SDCA}% RSPS{tilt ? ` (przechył: ${SPLIT_TILT}/${100 - SPLIT_TILT}, gdy LTPI z $TOTAL dodatnie)` : ''} z rebalansem przy odchyleniu ±10 p.p. Wyniki historyczne nie gwarantują przyszłych.
      </div>
    </Screen>
  );
}
