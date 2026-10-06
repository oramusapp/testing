import { useMemo, useState } from 'react';
import { Screen, Card, Row, Seg, Switch, NumInput, Sheet, Fold, shareFile, toast } from '../components/ui';
import { Chart, CurveEditor } from '../components/Chart';
import { IcRefresh, IcInfo, IcPlus, IcTrash } from '../components/icons';
import { useBtc, refresh } from '../lib/btcStore';
import { freshToday, lastClosedDay } from '../lib/market';
import { askNotify, notifyPermission } from '../lib/notify';
import { usePersisted } from '../lib/db';
import type { Flow } from '../lib/performance';
import { INDICATORS, composite, freshManual, RAIL_TAUS } from '../lib/sdcaModel';
import { ATH_BACKTEST, ATH_SELL, MIN_BUY_PCT, BANDS, DEFAULT_CURVE, SAFETY, SLOW_BUY_OPTIONS, athSellSeries, slowBuyRate, curveRate, belowProbableRange, probableRangeRate, PR_MULT, riskZone, safetyStep } from '../lib/quant';
import { ltpiStateSeries } from '../lib/tpi';
import { ValuationCard, AccumulationCalc } from '../components/Valuation';
import { ConeCard } from '../components/Cone';
import { autoValuation, halvingClock, HALVING_TO_TOP } from '../lib/onchain';
import { usd as usdFull, usdShort, pct, signed, fmtDate, uid } from '../lib/format';

// whole dollars once amounts get large so stat tiles stay readable
const usd = (v: number, d = 2) => usdFull(v, Math.abs(v) >= 1e5 ? 0 : d);

export interface SdcaSettings {
  enabled: Record<string, boolean>;
  manualRisk: number | null;
  manualUpdated?: number;
  curve: number[];
  startDate: string;
  capital: number;
  cash: number;
  btcHeld: number;
  logScale: boolean;
  range: 'all' | '8y' | '4y' | '1y';
  safety: boolean;
  athSell?: boolean;
  slowBuy?: number;
}
export const SDCA_DEFAULTS: SdcaSettings = {
  enabled: { price: true, sharpe: false, mvrv: true, manual: false },
  manualRisk: null, curve: DEFAULT_CURVE, startDate: '2015-01-01', capital: 10000, cash: 0, btcHeld: 0, logScale: false, range: 'all', safety: true, athSell: false, slowBuy: 0.25
};
export interface LtpiState { mode: 'proxy' | 'manual'; manual: number; updated?: number; }
/** Manual LTPI counts only until the next daily close (00:00 UTC); afterwards the automatic LTPI applies again. */
export const manualLtpiActive = (s: LtpiState) => s.mode === 'manual' && freshToday(s.updated);
interface Trade { id: string; date: string; side: 'buy' | 'sell'; usd: number; price: number; }

const ZONE_COLORS = { buy: '#2fbf71', acc: '#9ccc5a', trim: '#e5ac4f', sell: '#ef6461', dim: '#888' };
const riskColor = (v: number) => ZONE_COLORS[riskZone(v).tone];

export default function Sdca({ nav }: { nav?: React.ReactNode }) {
  const { model, status, busy, history } = useBtc();
  const autoRes = useMemo(() => (history ? autoValuation(history.rows as [string, number, number | null][]) : undefined), [history]);
  const autoVal = autoRes?.z;
  const [s, setS] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [ltpi] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [trades, setTrades] = usePersisted<Trade[]>('sdca.journal', []);
  const [pyrHist] = usePersisted<{ date: string; z: number; p: number; coverage: number }[]>('pyramid.history', []);
  const [view, setView] = useState<'rainbow' | 'risk' | 'curve'>('rainbow');
  const [info, setInfo] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [athNotify, setAthNotify] = usePersisted<boolean>('notify.ath', true);
  const upd = (p: Partial<SdcaSettings>) => setS((o) => ({ ...SDCA_DEFAULTS, ...o, ...p }));
  const cfg = { ...SDCA_DEFAULTS, ...s };
  // one SDCA reserve for the whole app: the SDCA portfolio (Portfel) when it exists, otherwise these fields
  const [pf, setPf] = usePersisted<{ holdings: { sdca: { BTC: number; USDT: number }; rsps: Record<string, number> } | null; history: { time: number; text: string }[]; safetyOwed?: number }>('portfolio', { holdings: null, history: [] });
  const [, setFlows] = usePersisted<Flow[]>('portfolio.flows', []);
  const Hs = pf.holdings?.sdca;
  const cash = Hs ? Hs.USDT : cfg.cash, btcHeld = Hs ? Hs.BTC : cfg.btcHeld;
  const setCash = (v: number) => {
    if (pf.holdings && Hs) {   // an edit here is a deposit / withdrawal of the SDCA portfolio, recorded so returns stay correct
      const diff = v - Hs.USDT;
      setPf({ ...pf, holdings: { ...pf.holdings, sdca: { ...Hs, USDT: v } } });
      if (Math.abs(diff) > 0.005) setFlows((f) => [...f, { time: Date.now(), amount: diff, sdca: diff, rsps: 0, note: 'rezerwa SDCA (zakładka SDCA)' }]);
    }
    upd({ cash: v });
  };
  const setBtcHeld = (v: number) => {
    if (pf.holdings && Hs) {
      const diff = (v - Hs.BTC) * (model?.prices.at(-1) ?? 0);
      setPf({ ...pf, holdings: { ...pf.holdings, sdca: { ...Hs, BTC: v } } });
      if (Math.abs(diff) > 0.005) setFlows((f) => [...f, { time: Date.now(), amount: diff, sdca: diff, rsps: 0, note: 'BTC w SDCA (zakładka SDCA)' }]);
    }
    upd({ btcHeld: v });
  };

  const comp = useMemo(() => (model ? composite(model, cfg.enabled, freshManual(cfg)) : null), [model, cfg.enabled, cfg.manualRisk]);
  const [tpiCfg0] = usePersisted<{ ltpiSource: 'ensemble' | 'sma200'; hyst?: number }>('signals.tpi', { ltpiSource: 'ensemble' });
  const tpiCfg = { ltpiSource: tpiCfg0.ltpiSource ?? 'ensemble', hyst: tpiCfg0.hyst ?? 0 };
  const ltpiSeries = useMemo(() => {
    if (!model) return null;
    // SDCA uses LTPI computed on BTC (the asset it trades; research/run44–45); the LTPI · MTPI tab and RSPS use $TOTAL
    const s0 = ltpiStateSeries(model.prices, tpiCfg.ltpiSource, tpiCfg.hyst);
    if (manualLtpiActive(ltpi)) s0[s0.length - 1] = ltpi.manual;     // manual LTPI applies to today only
    return s0;
  }, [model, tpiCfg.ltpiSource, tpiCfg.hyst, ltpi.mode, ltpi.manual]);
  const ath = useMemo(() => (model && comp ? athSellSeries(model.prices, comp.risk) : null), [model, comp]);

  if (!model || !comp) {
    return <Screen nav={nav} title="SDCA" subtitle="Strategic Dollar Cost Averaging · BTC"><Card><div className="dim">{status}</div></Card></Screen>;
  }

  const n = model.dates.length;
  const last = n - 1;
  const price = model.prices[last];
  const rails = model.rails[last];
  const riskToday = comp.risk[last];
  const zToday = comp.z[last];
  const rateCurve = curveRate(cfg.curve, riskToday);
  const zone = riskZone(riskToday);
  const priceRisk = model.risk.price[last];
  const band = BANDS.find((b) => priceRisk / 100 >= b.from && priceRisk / 100 < b.to) ?? (priceRisk < 1 ? BANDS[0] : BANDS[BANDS.length - 1]);
  const ltpiProxy = ltpiSeries?.at(-1) ?? 0;   // LTPI on BTC (ensemble or SMA 200, per settings)
  const ltpiValue = manualLtpiActive(ltpi) ? ltpi.manual : ltpiProxy;
  const rateSlow = slowBuyRate(rateCurve, ltpiValue, cfg.slowBuy ?? 1);
  const slowed = rateSlow !== rateCurve;
  const prBelow = belowProbableRange(model.prices, last);   // close below 20-day mean − 1.5σ → buy × 2
  const rate = probableRangeRate(rateSlow, prBelow);
  const prNote = prBelow && rate > 0 ? ` · cena pod Probable Range: × ${PR_MULT}` : '';

  let actionTitle = 'HOLD — brak transakcji', actionSub = `Krzywa ≈ 0% przy dzisiejszym ryzyku`, actionTone = 'dim';
  if (rate > 0.001 && rate <= MIN_BUY_PCT) {
    actionTitle = `HOLD (${rate.toFixed(2).replace('.', ',')}% gotówki)`;
    actionSub = `Zakup dopiero przy > ${MIN_BUY_PCT}% rezerwy dziennie` + (slowed ? ` · LTPI ujemne: krzywa ${rateCurve.toFixed(2)}% × ${String(cfg.slowBuy).replace('.', ',')}` : '') + prNote;
  } else if (rate > 0.001) {
    actionTitle = cash > 0 ? `KUP ${usd(cash * rate / 100)}` : `KUP ${rate.toFixed(2)}% gotówki`;
    actionSub = (cash > 0 ? `≈ ${(cash * rate / 100 / price).toFixed(6)} BTC · ${rate.toFixed(2)}% rezerwy` : 'Wpisz rezerwę gotówki, aby zobaczyć kwotę') + (slowed ? ` · LTPI ujemne: krzywa ${rateCurve.toFixed(2)}% × ${String(cfg.slowBuy).replace('.', ',')}` : '') + prNote;
    actionTone = 'green';
  } else if (rate < -0.001) {
    actionTitle = btcHeld > 0 ? `SPRZEDAJ ${(btcHeld * -rate / 100).toFixed(6)} BTC` : `SPRZEDAJ ${(-rate).toFixed(2)}% BTC`;
    actionSub = btcHeld > 0 ? `≈ ${usd(btcHeld * -rate / 100 * price)}` : 'Wpisz posiadane BTC, aby zobaczyć ilość';
    actionTone = 'red';
  }
  // SDCA safety: LTPI < 0 while valuation risk ≥ 70% → sell 2% of BTC per day to stablecoin
  const safetyOn = cfg.safety && ltpiValue < 0 && riskToday >= SAFETY.riskMin;
  if (safetyOn) {
    const st = safetyStep(riskToday, ltpiValue, (btcHeld || 1) * price, cash, 0);
    const extra = st.kind === 'sell' ? st.usd / price : 0;
    const curveSell = rate < -0.001 ? (btcHeld || 0) * -rate / 100 : 0;
    actionTitle = btcHeld > 0 ? `SPRZEDAJ ${(curveSell + extra).toFixed(6)} BTC` : `SPRZEDAJ ${(SAFETY.sellRate * 100 + Math.max(0, -rate)).toFixed(2)}% BTC`;
    actionSub = `Bezpiecznik: LTPI ujemne przy ryzyku ${riskToday.toFixed(1)}% ≥ ${SAFETY.riskMin}% → ${SAFETY.sellRate * 100}% BTC dziennie do stablecoina` + (rate < -0.001 ? ' (razem z krzywą)' : '');
    actionTone = 'red';
  }

  // ATH-day sale proposal: new all-time-high close while risk ≥ 70% (shown, never executed automatically)
  const athFrac = ath?.frac[last] ?? 0, athK = ath?.k[last] ?? 0;
  const athOn = athFrac > 0;

  // visible range for charts
  const span = { all: n, '8y': 365 * 8, '4y': 365 * 4, '1y': 365 }[cfg.range];
  const from = Math.max(0, n - span);
  const sl = <T,>(a: T[]) => a.slice(from);
  const labels = sl(model.dates);

  // journal stats
  const bought = trades.filter((t) => t.side === 'buy');
  const btcNet = trades.reduce((a, t) => a + (t.side === 'buy' ? 1 : -1) * t.usd / t.price, 0);
  const invested = bought.reduce((a, t) => a + t.usd, 0);
  const avgCost = bought.length ? invested / bought.reduce((a, t) => a + t.usd / t.price, 0) : NaN;

  return (
    <Screen nav={nav} title="SDCA" subtitle={<>Strategic Dollar Cost Averaging · BTC<br /><span className="faint">{status}</span></>}
      actions={<>
        <button className="icon-btn" onClick={() => setInfo(true)} aria-label="Opis"><IcInfo width={19} /></button>
        <button className="icon-btn" onClick={() => refresh()} disabled={busy} aria-label="Odśwież"><IcRefresh width={19} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} /></button>
      </>}>

      {/* ---- Today's model action ---- */}
      {model.dates[last] < lastClosedDay() && !busy && <div className="warn-box">Dane nieaktualne: ostatnia świeca w modelu to {model.dates[last]}, a ostatnia zamknięta to {lastClosedDay()}. Akcja poniżej dotyczy starszego dnia — sprawdź internet albo odśwież.</div>}
      <Card className="hero">
        <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Dzisiejsza akcja modelu</div><span className={'pill ' + zone.tone}><span className="dot" />{zone.label}</span></div>
        <div className={'mid-number mt12 ' + actionTone} style={{ fontSize: 28 }}>{actionTitle}</div>
        <div className="dim mt8" style={{ fontSize: 14 }}>{actionSub}</div>
        <div className="hr" />
        <Row className="compact" label="Composite Risk dziś" value={pct(riskToday)} />
        <Row className="compact" label="Wycena z (TRW)" value={<span style={{ color: zToday >= 1.5 ? 'var(--green)' : zToday <= -1.5 ? 'var(--red)' : undefined }}>{signed(zToday)}σ <span className="dim">· + = tanio</span></span>} />
        <Row className="compact" label="Krzywa dziś" value={signed(rate) + '%/dzień' + (slowed ? ` (pełna ${signed(rateCurve)}%, LTPI −)` : '')} />
        <Row className="compact" label="Bezpiecznik LTPI (BTC)" value={<span className={safetyOn ? 'red' : 'dim'}>{!cfg.safety ? 'wyłączony' : safetyOn ? 'aktywny — sprzedaż' : ltpiValue > 0 ? 'nieaktywny · LTPI +' : `czuwa (ryzyko ≥ ${SAFETY.riskMin}% i LTPI < 0)`}</span>} />
        {athOn && <div className="note-text mt8" style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 10 }}><b>Propozycja · nowy szczyt (ATH):</b> sprzedaj {btcHeld > 0 ? `${(btcHeld * athFrac).toFixed(6)} BTC` : `${(athFrac * 100).toFixed(2)}% BTC`} ({athK + 1}. sprzedaż w cyklu, ryzyko {riskToday.toFixed(1)}%). {ATH_BACKTEST}</div>}
        <Row className="compact" label="Cena BTC" value={usd(price)} />
        {pyrHist.length > 0 && Number.isFinite(pyrHist.at(-1)!.z) && <Row className="compact" label="Piramida analizy" value={<span style={{ color: pyrHist.at(-1)!.z >= 0.25 ? 'var(--green)' : pyrHist.at(-1)!.z <= -0.25 ? 'var(--red)' : 'var(--amber)' }}>{signed(pyrHist.at(-1)!.z)}σ <span className="dim">· P {Math.round(pyrHist.at(-1)!.p * 100)}% · pokrycie {Math.round(pyrHist.at(-1)!.coverage * 100)}%</span></span>} />}
        <Row className="compact" label="Rezerwa gotówki" value={<NumInput className="inline-input" value={cash} onChange={(v) => setCash(v ?? 0)} suffix="$" />} />
        <Row className="compact" label="Posiadane BTC" value={<NumInput className="inline-input" value={btcHeld} onChange={(v) => setBtcHeld(v ?? 0)} />} />
      </Card>


      {/* ---- charts ---- */}
      <Seg value={view} onChange={setView} options={[{ v: 'rainbow', l: 'EQM Rainbow' }, { v: 'risk', l: 'Composite Risk' }, { v: 'curve', l: 'Accum/Dist' }]} />
      <div className="mt12" />
      {view !== 'curve' && (
        <Card>
          <div className="between mb12">
            <div className="eyebrow" style={{ margin: 0 }}>{view === 'rainbow' ? 'Asymmetric Tail Curvature Rainbow' : 'Composite Risk'}</div>
          </div>
          {view === 'rainbow' ? (
            <>
              <Chart labels={labels} log height={260}
                bands={BANDS.map((b) => ({ lo: sl(model.rails.map((r) => r[RAIL_TAUS.indexOf(b.from)])), hi: sl(model.rails.map((r) => r[RAIL_TAUS.indexOf(b.to)])), color: b.color + 'cc' }))}
                lines={[
                  { values: sl(model.rails.map((r) => r[3])), color: 'rgba(255,255,255,.55)', width: 1, dash: [4, 3] },
                  { values: sl(model.prices), color: getText(), width: 1.4 }
                ]}
                markers={[{ i: n - 1 - from, value: price, color: '#d4b483' }]}
                tip={(i) => `${fmtDate(labels[i])} · ${usdShort(model.prices[from + i])} · ryzyko ${pct(model.risk.price[from + i])}`} />
              <div className="legend">{BANDS.map((b) => <span key={b.label}><i style={{ background: b.color }} />{Math.round(b.from * 100)}–{Math.round(b.to * 100)}% {b.label}</span>)}</div>
            </>
          ) : (
            <>
              <Chart labels={labels} log height={260}
                right={{ min: 0, max: 100, zones: [
                  { from: 0, to: 25, color: 'rgba(47,191,113,.07)' }, { from: 25, to: 50, color: 'rgba(156,204,90,.05)' },
                  { from: 50, to: 75, color: 'rgba(229,172,79,.06)' }, { from: 75, to: 100, color: 'rgba(239,100,97,.08)' }] }}
                lines={[
                  { values: sl(model.prices), color: getText(), width: 1.1 },
                  { values: sl(comp.risk), color: (v) => riskColor(v), width: 1.6, axis: 'right' }
                ]}
                tip={(i) => `${fmtDate(labels[i])} · ryzyko ${pct(comp.risk[from + i])} · z ${signed(comp.z[from + i])}`} />
              <div className="legend">
                <span><i style={{ background: ZONE_COLORS.buy }} />0–25% Buy zone</span><span><i style={{ background: ZONE_COLORS.acc }} />25–50% Accumulate</span>
                <span><i style={{ background: ZONE_COLORS.trim }} />50–75% Trim</span><span><i style={{ background: ZONE_COLORS.sell }} />75–100% Sell zone</span>
              </div>
            </>
          )}
          <div className="mt12"><Seg value={cfg.range} onChange={(r) => upd({ range: r })} options={[{ v: '1y', l: '1R' }, { v: '4y', l: '4L' }, { v: '8y', l: '8L' }, { v: 'all', l: 'Max' }]} /></div>
        </Card>
      )}

      {view === 'curve' && (
        <>
          <Card title="Krzywa akumulacji / dystrybucji">
            <div className="note-text mb12">Model oparty wyłącznie na Composite Risk. Każdego dnia wartość krzywej przy bieżącym ryzyku to % gotówki do kupienia (dodatnia) lub % BTC do sprzedania (ujemna). Przeciągnij węzły, aby zmienić kształt.</div>
            <CurveEditor curve={cfg.curve} onChange={(c) => upd({ curve: c })} current={riskToday} />
            <div className="flex mt12">
              <button className="btn small grow" onClick={() => upd({ curve: DEFAULT_CURVE })}>Przywróć domyślną</button>
              <button className="btn small grow" onClick={() => shareFile(new Blob(['risk_pct,rate_pct_per_day\n' + cfg.curve.map((v, i) => `${i * 5},${v}`).join('\n')], { type: 'text/csv' }), 'accum-dist-curve.csv')}>Eksport CSV</button>
            </div>
          </Card>
          <div className="note-text">Wynik tej krzywej (z bezpiecznikiem i pozostałymi zasadami) zobaczysz w podzakładce Backtest.</div>
        </>
      )}

      <Fold id="sdca.rules" title="Zasady SDCA" hint={`Bezpiecznik ${cfg.safety ? 'wł.' : 'wył.'} · zakupy przy LTPI− × ${String(cfg.slowBuy ?? 1).replace('.', ',')} · propozycja ATH ${athNotify ? 'wł.' : 'wył.'}`}>
      <Card className="tight">
        <div className="row"><div className="grow"><div>Bezpiecznik LTPI</div><div className="faint" style={{ fontSize: 12 }}>Ochrona części bezpieczniejszej portfela</div></div><Switch checked={cfg.safety} onChange={(v) => upd({ safety: v })} /></div>
        <div className="note-text" style={{ padding: '0 14px 12px' }}>Gdy LTPI jest ujemne, a ryzyko wyceny ≥ {SAFETY.riskMin}%, SDCA sprzedaje {SAFETY.sellRate * 100}% BTC dziennie do stablecoina. Gdy LTPI wróci na plus, te stablecoiny są odkupywane w BTC (po {SAFETY.rebuyRate * 100}% dziennie; zakładka Portfel pilnuje kwoty). Krzywa akumulacji działa bez zmian. Backtest od 2020: wynik 2020–2023 bez zmian, 2024–2026 obsunięcie portfela −31,5% → −27,3% przy tym samym CAGR.</div>
      </Card>

      <Card className="tight">
        <div className="row"><div className="grow"><div>Tempo zakupów przy ujemnym LTPI</div><div className="faint" style={{ fontSize: 12 }}>Mnożnik dziennego % kupowanego z pozostałych stablecoinów</div></div>
          <select className="input" style={{ width: 90 }} value={cfg.slowBuy ?? 1} onChange={(e) => upd({ slowBuy: +e.target.value })}>
            {SLOW_BUY_OPTIONS.map((m) => <option key={m} value={m}>× {String(m).replace('.', ',')}</option>)}
          </select></div>
        <div className="note-text" style={{ padding: '0 14px 12px' }}>Co dzień kupowany jest % pozostałych stablecoinów według wyceny (krzywa). Gdy LTPI jest ujemne, ten % jest mnożony przez wybraną wartość; gdy LTPI wróci na plus, działa pełna krzywa i reszta rezerwy wchodzi szybciej (zgodnie z lekcją: zbyt wolno lepiej niż zbyt szybko, LSI przy pozytywnym trendzie). Test na 27 kwartalnych datach startu 2018–2024 dla × 0,25: mniejsze obsunięcie przy każdym starcie (najgorsze −59% → −43%), Sharpe lepszy w około połowie, mediana CAGR 43,7% → 40,1%. Start od 2020: CAGR 57,6% → 43,6%. × 1 = bez zmiany.</div>
      </Card>
      <Card className="tight">
        <div className="row"><div className="grow"><div>Propozycja sprzedaży przy nowym szczycie (ATH)</div><div className="faint" style={{ fontSize: 12 }}>Powiadomienie w dniu ATH przy ryzyku ≥ {ATH_SELL.riskMin}%</div></div><Switch checked={athNotify} onChange={(v) => { setAthNotify(v); if (v && notifyPermission() === 'default') void askNotify(); }} /></div>
        {athNotify && notifyPermission() !== 'granted' && <div style={{ padding: '0 14px 8px' }}><button className="btn small" onClick={() => void askNotify().then((ok) => toast(ok ? 'Powiadomienia włączone' : 'Brak zgody — propozycja pokaże się w aplikacji'))}>Zezwól na powiadomienia systemowe</button></div>}
        <div className="row"><div className="grow"><div>Uwzględnij w backteście modelu</div><div className="faint" style={{ fontSize: 12 }}>Tylko symulacja; zlecenie zawsze potwierdzasz sam</div></div><Switch checked={!!cfg.athSell} onChange={(v) => upd({ athSell: v })} /></div>
        <div className="note-text" style={{ padding: '0 14px 12px' }}>W każdy dzień zamknięcia powyżej dotychczasowego szczytu, gdy ryzyko wyceny ≥ {ATH_SELL.riskMin}%, aplikacja proponuje sprzedaż {ATH_SELL.unit * 100}% BTC × {String(ATH_SELL.growth).replace('.', ',')}^k z części SDCA (k = liczba takich sprzedaży w cyklu, harmonogram „×1,1” ze slajdu; licznik zeruje się po spadku {ATH_SELL.reset * 100}% od szczytu). {ATH_BACKTEST} Powiadomienie pojawia się przy otwarciu aplikacji (iPhone: tylko aplikacja dodana do ekranu początkowego, iOS 16.4+).</div>
      </Card>

      </Fold>
      <Fold id="sdca.valuation" title="Wycena on-chain i narzędzia" hint="Arkusz z-score (część liczona automatycznie), tempo akumulacji, stożek wyników">
      <ValuationCard auto={autoVal} mvrvAsOf={autoRes?.mvrvAsOf ?? null} lastDate={autoRes?.date} onUse={(r) => upd({ manualRisk: r, manualUpdated: Date.now(), enabled: { ...cfg.enabled, manual: true } })} />
      <AccumulationCalc cash={cash} />

      <div className="section-title">Poziomy pasm (na żywo)</div>
      <Card className="tight">
        <Row label="Bieżący EQM Z-score" value={signed(model.z.price[last])} />
        {BANDS.map((b) => (
          <Row key={b.label} label={<span className="flex"><i style={{ width: 14, height: 9, background: b.color, borderRadius: 2, display: 'inline-block' }} />{Math.round(b.from * 100)}–{Math.round(b.to * 100)}% · {b.label}</span>}
            value={`${usdShort(rails[RAIL_TAUS.indexOf(b.from)])}–${usdShort(rails[RAIL_TAUS.indexOf(b.to)])}`} />
        ))}
      </Card>

      {ltpiSeries && <ConeCard dates={model.dates} prices={model.prices} risk={comp.risk} ltpi={ltpiSeries} />}
      </Fold>
      <Fold id="sdca.model" title="Szczegóły modelu" hint="Szyny wyceny, wskaźniki Composite Risk, poziomy pasm">
      {/* ---- valuation stats ---- */}
      <div className="section-title">Wycena</div>
      <Card className="tight">
        <Row label={<b>Cena</b>} value={usdShort(price)} />
        <Row label="Composite Median (Q50%)" value={usdShort(rails[3])} />
        <Row label="Szyna Q1%" value={usdShort(rails[0])} />
        <Row label="Szyna Q99%" value={usdShort(rails[6])} />
        <Row label="Ryzyko ceny (EQM)" value={pct(priceRisk)} />
        <Row label="Composite Risk" value={<span style={{ color: riskColor(riskToday) }}>{pct(riskToday)}</span>} />
        <Row label="EQM Z-score" value={signed(model.z.price[last])} />
        <Row label="Composite Z-score" value={signed(zToday)} />
        <Row label="Bieżące pasmo" value={`${Math.round(band.from * 100)}–${Math.round(band.to * 100)}% · ${band.label}`} />
        {(() => { const hc = halvingClock(model.dates[last]); return <Row label="Zegar halvingu" value={`${hc.daysSince} dni od ${fmtDate(hc.last)} · szczyty były ${Math.min(...HALVING_TO_TOP)}–${Math.max(...HALVING_TO_TOP)} dni po halvingu (3 cykle)`} />; })()}
      </Card>

      <div className="section-title">Wskaźniki</div>
      <Card className="tight">
        <div className="note-text" style={{ padding: '12px 16px 4px' }}>Włączone wskaźniki mają równą wagę w Composite Risk / Z-score, który steruje wykresem ryzyka i backtestem krzywej.</div>
        {INDICATORS.map((ind) => (
          <div key={ind.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div>{ind.name}</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{ind.note}</div>
              {ind.id !== 'manual' && <div className="dim num" style={{ fontSize: 12.5, marginTop: 4 }}>Ryzyko {pct(model.risk[ind.id][last])} · z {signed(model.z[ind.id][last])}{ind.id === 'mvrv' && model.mvrvStaleFrom ? ` · MVRV z ${model.mvrvStaleFrom} (przeniesione)` : ''}</div>}
              {ind.id === 'manual' && cfg.enabled.manual && <div className="flex mt8"><span className="dim" style={{ fontSize: 13 }}>Ryzyko</span><NumInput className="input" value={cfg.manualRisk} placeholder="np. 43.6" onChange={(v) => upd({ manualUpdated: Date.now(), manualRisk: v == null ? null : Math.min(100, Math.max(0, v)) })} suffix="%" /></div>}
            </div>
            <Switch checked={!!cfg.enabled[ind.id]} onChange={(v) => upd({ enabled: { ...cfg.enabled, [ind.id]: v } })} />
          </div>
        ))}
      </Card>

      </Fold>
      <Fold id="sdca.journal" title="Dziennik transakcji" hint={`${trades.length} wpisów`}>
      <Card className="tight">
        <Row label="BTC netto" value={btcNet.toFixed(6)} />
        <Row label="Zainwestowano" value={usd(invested)} />
        <Row label="Średni koszt" value={usd(avgCost)} />
        <Row label="Niezrealizowany P/L" value={Number.isFinite(avgCost) ? <span className={price >= avgCost ? 'green' : 'red'}>{pct((price / avgCost - 1) * 100, 1, true)}</span> : '—'} />
        {trades.slice(0, 30).map((t) => (
          <div key={t.id} className="row">
            <div><span className={t.side === 'buy' ? 'green' : 'red'}>{t.side === 'buy' ? 'Kupno' : 'Sprzedaż'}</span> <span className="dim">· {fmtDate(t.date)}</span><div className="faint num" style={{ fontSize: 12 }}>{(t.usd / t.price).toFixed(6)} BTC @ {usd(t.price, 0)}</div></div>
            <div className="flex"><span className="num">{usd(t.usd)}</span><button className="icon-btn plain" onClick={() => setTrades(trades.filter((x) => x.id !== t.id))}><IcTrash width={18} /></button></div>
          </div>
        ))}
        <div style={{ padding: 12 }}><button className="btn block" onClick={() => setTradeOpen(true)}><IcPlus width={18} />Dodaj transakcję</button></div>
      </Card>

      </Fold>

      <TradeSheet open={tradeOpen} onClose={() => setTradeOpen(false)} price={price} suggested={rate > 0 && cash > 0 ? cash * rate / 100 : 0}
        onAdd={(t) => { setTrades([t, ...trades].sort((a, b) => b.date.localeCompare(a.date))); toast('Zapisano transakcję'); }} />

      <Sheet open={info} onClose={() => setInfo(false)} title="Jak działa SDCA">
        <div className="note-text" style={{ fontSize: 14.5 }}>
          <p><b className="accent">EQM Rainbow</b> — regresja kwantylowa log-ceny BTC względem log-czasu od bloku genesis, z osobnym członem krzywizny dla każdego kwantyla (asymetryczne ogony). Szyny Q1%…Q99% wyznaczają pasma: Fire sale, Accumulate, Value, Above mid, Hot, Bubble. Ryzyko ceny = pozycja ceny między szynami (0–100%). Bez patrzenia w przyszłość: szyny przeliczane są co rok wyłącznie na danych sprzed 1 stycznia, a dzisiejsza wartość używa ceny z ostatniego zamknięcia świecy (00:00 UTC); percentyle MVRV i Sharpe liczone są tylko z wcześniejszych dni. Wycena zaczyna się w 2013 r. (pierwszy model na danych 2010–2012).</p>
          <p><b className="accent">Composite Risk</b> — średnia ryzyk włączonych wskaźników (równe wagi). Niskie ryzyko = taniej / bardziej opłaca się kupować; wysokie = drogo.</p>
          <p><b className="accent">Krzywa Accum/Dist</b> — dla bieżącego ryzyka daje % gotówki kupowany dziennie (dodatni) albo % BTC sprzedawany dziennie (ujemny). Backtest symuluje to dzień po dniu i porównuje z buy &amp; hold.</p>
          <p><b className="accent">Dane</b> — historia od 2010 r. (Coin Metrics: cena, MVRV) wbudowana w aplikację, aktualizowana z Coin Metrics i Binance. Model jest rekonstrukcją metodologii strony sygnałów; wartości mogą się nieznacznie różnić od oryginału.</p>
          <p className="faint">To narzędzie analityczne, nie porada inwestycyjna.</p>
        </div>
      </Sheet>
    </Screen>
  );
}

function getText() { return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff'; }


function TradeSheet({ open, onClose, price, suggested, onAdd }: { open: boolean; onClose: () => void; price: number; suggested: number; onAdd: (t: Trade) => void }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Sheet open={open} onClose={onClose} title="Nowa transakcja">
      <Seg value={side} onChange={setSide} options={[{ v: 'buy', l: 'Kupno' }, { v: 'sell', l: 'Sprzedaż' }]} />
      <div className="field mt12"><label>Kwota USD</label><NumInput value={amount ?? (suggested ? +suggested.toFixed(2) : null)} onChange={setAmount} placeholder="0" /></div>
      <div className="field"><label>Cena BTC</label><NumInput value={p ?? +price.toFixed(2)} onChange={setP} /></div>
      <div className="field"><label>Data</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <button className="btn primary block mt8" onClick={() => {
        const a = amount ?? suggested, pr = p ?? price;
        if (!(a > 0) || !(pr > 0)) return toast('Podaj kwotę i cenę');
        onAdd({ id: uid(), date, side, usd: a, price: pr }); setAmount(null); setP(null); onClose();
      }}>Zapisz</button>
    </Sheet>
  );
}
