import { useMemo, useState } from 'react';
import { Screen, Card, Row, Seg, Switch, NumInput, Sheet, shareFile, toast } from '../components/ui';
import { Chart, CurveEditor } from '../components/Chart';
import { IcRefresh, IcInfo, IcPlus, IcTrash } from '../components/icons';
import { useBtc, refresh } from '../lib/btcStore';
import { usePersisted } from '../lib/db';
import { INDICATORS, composite, RAIL_TAUS } from '../lib/sdcaModel';
import { BANDS, DEFAULT_CURVE, backtest, curveRate, riskZone } from '../lib/quant';
import { usd as usdFull, usdShort, pct, signed, fmtDate, uid } from '../lib/format';

// whole dollars once amounts get large so stat tiles stay readable
const usd = (v: number, d = 2) => usdFull(v, Math.abs(v) >= 1e5 ? 0 : d);

export interface SdcaSettings {
  enabled: Record<string, boolean>;
  manualRisk: number | null;
  curve: number[];
  startDate: string;
  capital: number;
  cash: number;
  btcHeld: number;
  logScale: boolean;
  range: 'all' | '8y' | '4y' | '1y';
}
export const SDCA_DEFAULTS: SdcaSettings = {
  enabled: { price: true, sharpe: false, mvrv: true, manual: false },
  manualRisk: null, curve: DEFAULT_CURVE, startDate: '2015-01-01', capital: 10000, cash: 0, btcHeld: 0, logScale: false, range: 'all'
};
export interface LtpiState { mode: 'proxy' | 'manual'; manual: number; }
interface Trade { id: string; date: string; side: 'buy' | 'sell'; usd: number; price: number; }

const ZONE_COLORS = { buy: '#2fbf71', acc: '#9ccc5a', trim: '#e5ac4f', sell: '#ef6461', dim: '#888' };
const riskColor = (v: number) => ZONE_COLORS[riskZone(v).tone];

export default function Sdca() {
  const { model, status, busy } = useBtc();
  const [s, setS] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [ltpi, setLtpi] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [trades, setTrades] = usePersisted<Trade[]>('sdca.journal', []);
  const [pyrHist] = usePersisted<{ date: string; z: number; p: number; coverage: number }[]>('pyramid.history', []);
  const [view, setView] = useState<'rainbow' | 'risk' | 'curve'>('rainbow');
  const [info, setInfo] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const upd = (p: Partial<SdcaSettings>) => setS((o) => ({ ...SDCA_DEFAULTS, ...o, ...p }));
  const cfg = { ...SDCA_DEFAULTS, ...s };

  const comp = useMemo(() => (model ? composite(model, cfg.enabled, cfg.manualRisk) : null), [model, cfg.enabled, cfg.manualRisk]);
  const startIdx = useMemo(() => {
    if (!model) return 0;
    const i = model.dates.findIndex((d) => d >= cfg.startDate);
    return i < 0 ? 0 : i;
  }, [model, cfg.startDate]);
  const bt = useMemo(() => (model && comp ? backtest(model.prices, comp.risk, cfg.curve, startIdx, cfg.capital || 10000) : null), [model, comp, cfg.curve, startIdx, cfg.capital]);

  if (!model || !comp) {
    return <Screen title="SDCA" subtitle="Strategic Dollar Cost Averaging · BTC"><Card><div className="dim">{status}</div></Card></Screen>;
  }

  const n = model.dates.length;
  const last = n - 1;
  const price = model.prices[last];
  const rails = model.rails[last];
  const riskToday = comp.risk[last];
  const zToday = comp.z[last];
  const rate = curveRate(cfg.curve, riskToday);
  const zone = riskZone(riskToday);
  const priceRisk = model.risk.price[last];
  const band = BANDS.find((b) => priceRisk / 100 >= b.from && priceRisk / 100 < b.to) ?? (priceRisk < 1 ? BANDS[0] : BANDS[BANDS.length - 1]);
  const ltpiProxy = price > model.prices.slice(-200).reduce((a, b) => a + b, 0) / 200 ? 1 : -1;
  const ltpiValue = ltpi.mode === 'manual' ? ltpi.manual : ltpiProxy;

  let actionTitle = 'HOLD — brak transakcji', actionSub = `Krzywa ≈ 0% przy dzisiejszym ryzyku`, actionTone = 'dim';
  if (rate > 0.001) {
    actionTitle = cfg.cash > 0 ? `KUP ${usd(cfg.cash * rate / 100)}` : `KUP ${rate.toFixed(2)}% gotówki`;
    actionSub = cfg.cash > 0 ? `≈ ${(cfg.cash * rate / 100 / price).toFixed(6)} BTC · ${rate.toFixed(2)}% rezerwy` : 'Wpisz rezerwę gotówki, aby zobaczyć kwotę';
    actionTone = 'green';
  } else if (rate < -0.001) {
    actionTitle = cfg.btcHeld > 0 ? `SPRZEDAJ ${(cfg.btcHeld * -rate / 100).toFixed(6)} BTC` : `SPRZEDAJ ${(-rate).toFixed(2)}% BTC`;
    actionSub = cfg.btcHeld > 0 ? `≈ ${usd(cfg.btcHeld * -rate / 100 * price)}` : 'Wpisz posiadane BTC, aby zobaczyć ilość';
    actionTone = 'red';
  }

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
    <Screen title="SDCA" subtitle={<>Strategic Dollar Cost Averaging · BTC<br /><span className="faint">{status}</span></>}
      actions={<>
        <button className="icon-btn" onClick={() => setInfo(true)} aria-label="Opis"><IcInfo width={19} /></button>
        <button className="icon-btn" onClick={() => refresh()} disabled={busy} aria-label="Odśwież"><IcRefresh width={19} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} /></button>
      </>}>

      {/* ---- Today's model action ---- */}
      <Card className="hero">
        <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Dzisiejsza akcja modelu</div><span className={'pill ' + zone.tone}><span className="dot" />{zone.label}</span></div>
        <div className={'mid-number mt12 ' + actionTone} style={{ fontSize: 28 }}>{actionTitle}</div>
        <div className="dim mt8" style={{ fontSize: 14 }}>{actionSub}</div>
        <div className="hr" />
        <Row className="compact" label="Composite Risk dziś" value={pct(riskToday)} />
        <Row className="compact" label="Krzywa dziś" value={signed(rate) + '%/dzień'} />
        <Row className="compact" label="Cena BTC" value={usd(price)} />
        {pyrHist.length > 0 && Number.isFinite(pyrHist.at(-1)!.z) && <Row className="compact" label="Piramida analizy" value={<span style={{ color: pyrHist.at(-1)!.z >= 0.25 ? 'var(--green)' : pyrHist.at(-1)!.z <= -0.25 ? 'var(--red)' : 'var(--amber)' }}>{signed(pyrHist.at(-1)!.z)}σ <span className="dim">· P {Math.round(pyrHist.at(-1)!.p * 100)}% · pokrycie {Math.round(pyrHist.at(-1)!.coverage * 100)}%</span></span>} />}
        <Row className="compact" label="Rezerwa gotówki" value={<NumInput className="inline-input" value={cfg.cash} onChange={(v) => upd({ cash: v ?? 0 })} suffix="$" />} />
        <Row className="compact" label="Posiadane BTC" value={<NumInput className="inline-input" value={cfg.btcHeld} onChange={(v) => upd({ btcHeld: v ?? 0 })} />} />
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

      {view === 'curve' && bt && (
        <>
          <Card title="Krzywa akumulacji / dystrybucji">
            <div className="note-text mb12">Model oparty wyłącznie na Composite Risk. Każdego dnia wartość krzywej przy bieżącym ryzyku to % gotówki do kupienia (dodatnia) lub % BTC do sprzedania (ujemna). Przeciągnij węzły, aby zmienić kształt.</div>
            <CurveEditor curve={cfg.curve} onChange={(c) => upd({ curve: c })} current={riskToday} />
            <div className="flex mt12">
              <button className="btn small grow" onClick={() => upd({ curve: DEFAULT_CURVE })}>Przywróć domyślną</button>
              <button className="btn small grow" onClick={() => shareFile(new Blob(['risk_pct,rate_pct_per_day\n' + cfg.curve.map((v, i) => `${i * 5},${v}`).join('\n')], { type: 'text/csv' }), 'accum-dist-curve.csv')}>Eksport CSV</button>
            </div>
          </Card>
          <Card title="Backtest">
            <div className="flex">
              <div className="field grow"><label>Data startu</label><input className="input" type="date" value={cfg.startDate} min={model.dates[0]} max={model.dates[last]} onChange={(e) => upd({ startDate: e.target.value })} /></div>
              <div className="field grow"><label>Kapitał startowy, USD</label><NumInput value={cfg.capital} onChange={(v) => upd({ capital: v ?? 10000 })} /></div>
            </div>
            <div className="stat-grid">
              <Stat k="Dni backtestu" v={bt.days.toLocaleString('pl-PL')} s={`Kup ${bt.buys} / Sprzedaj ${bt.sells} / Brak ${bt.holds}`} />
              <Stat k="Pozycja BTC" v={bt.btc.toFixed(6)} s={`Śr. zakup ${usd(bt.avgBuy)}`} />
              <Stat k="Wartość portfela" v={usd(bt.value)} s="BTC + gotówka" />
              <Stat k="P/L" v={<span className={bt.pnl >= 0 ? 'green' : 'red'}>{(bt.pnl >= 0 ? '+' : '') + usd(bt.pnl)}</span>} s={pct(bt.pnlPct, 2, true)} />
              <Stat k="Śr. dzienna stopa" v={signed(bt.avgRate) + '%/d'} s={`Śr. ryzyko ${pct(bt.avgRisk)}`} />
              <Stat k="Lump sum" v={usd(bt.lump)} s={pct(bt.lumpPct, 2, true)} />
              <Stat k="Portfel vs lump" v={<span className={bt.vsLump >= 0 ? 'green' : 'red'}>{(bt.vsLump >= 0 ? '+' : '') + usd(bt.vsLump)}</span>} s={pct(bt.vsLumpPct, 2, true)} />
              <Stat k="Rezerwa gotówki" v={usd(bt.cash)} s="Zawiera sprzedaże z krzywej" />
              <Stat k="Max DD — DCA" v={<span className="red">{pct(bt.maxDD)}</span>} s="Szczyt–dołek portfela" />
              <Stat k="Max DD — Buy&Hold" v={<span className="red">{pct(bt.maxDDLump)}</span>} s="Szczyt–dołek lump sum" />
            </div>
          </Card>
          <Card>
            <div className="between mb12"><div className="eyebrow" style={{ margin: 0 }}>DCA vs Buy &amp; Hold</div><div className="flex"><span className="dim" style={{ fontSize: 13 }}>Log</span><Switch checked={cfg.logScale} onChange={(v) => upd({ logScale: v })} /></div></div>
            <Chart labels={model.dates.slice(startIdx)} log={cfg.logScale} height={240}
              shade={(i) => { const a = bt.actions[i]; return a > 0 ? 'rgba(47,191,113,.10)' : a < 0 ? 'rgba(239,100,97,.12)' : null; }}
              lines={[{ values: bt.lumpEquity, color: '#8e8e93', width: 1.1 }, { values: bt.equity, color: '#d4b483', width: 1.6 }]}
              tip={(i) => `${fmtDate(model.dates[startIdx + i])} · DCA ${usdShort(bt.equity[i])} · B&H ${usdShort(bt.lumpEquity[i])}`} />
            <div className="legend"><span><i style={{ background: '#d4b483' }} />Strategia DCA</span><span><i style={{ background: '#8e8e93' }} />Buy &amp; hold (lump dzień 1)</span></div>
          </Card>
        </>
      )}

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
              {ind.id === 'manual' && cfg.enabled.manual && <div className="flex mt8"><span className="dim" style={{ fontSize: 13 }}>Ryzyko</span><NumInput className="input" value={cfg.manualRisk} placeholder="np. 43.6" onChange={(v) => upd({ manualRisk: v == null ? null : Math.min(100, Math.max(0, v)) })} suffix="%" /></div>}
            </div>
            <Switch checked={!!cfg.enabled[ind.id]} onChange={(v) => upd({ enabled: { ...cfg.enabled, [ind.id]: v } })} />
          </div>
        ))}
      </Card>

      <div className="section-title">Poziomy pasm (na żywo)</div>
      <Card className="tight">
        <Row label="Bieżący EQM Z-score" value={signed(model.z.price[last])} />
        {BANDS.map((b) => (
          <Row key={b.label} label={<span className="flex"><i style={{ width: 14, height: 9, background: b.color, borderRadius: 2, display: 'inline-block' }} />{Math.round(b.from * 100)}–{Math.round(b.to * 100)}% · {b.label}</span>}
            value={`${usdShort(rails[RAIL_TAUS.indexOf(b.from)])}–${usdShort(rails[RAIL_TAUS.indexOf(b.to)])}`} />
        ))}
      </Card>

      <div className="section-title">LTPI — długoterminowy trend</div>
      <Card>
        <div className="between">
          <div><div className={'mid-number ' + (ltpiValue > 0 ? 'green' : ltpiValue < 0 ? 'red' : 'dim')}>{signed(ltpiValue)}</div>
            <div className="dim" style={{ fontSize: 13 }}>{ltpiValue > 0 ? 'Trend długoterminowy pozytywny' : ltpiValue < 0 ? 'Sygnał „emergency exit” — LTPI negatywne' : 'Neutralnie'}</div></div>
          <Seg value={ltpi.mode} onChange={(m) => setLtpi({ ...ltpi, mode: m })} options={[{ v: 'proxy', l: 'Proxy' }, { v: 'manual', l: 'Ręcznie' }]} />
        </div>
        {ltpi.mode === 'manual' ? (
          <div className="mt12"><input type="range" min={-1} max={1} step={0.05} value={ltpi.manual} onChange={(e) => setLtpi({ ...ltpi, manual: +e.target.value })} />
            <div className="note-text">Wpisz wartość LTPI z własnego systemu (−1 … +1). Wartość jest używana przez silnik reżimów w zakładce RSPS.</div></div>
        ) : <div className="note-text mt12">Proxy: cena powyżej 200-dniowej średniej = +1, poniżej = −1 (ta sama reguła co w backteście 2020–2026). To przybliżenie, nie oryginalny LTPI — przełącz na „Ręcznie”, aby użyć własnego.</div>}
      </Card>

      <div className="section-title">Dziennik transakcji</div>
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

      <TradeSheet open={tradeOpen} onClose={() => setTradeOpen(false)} price={price} suggested={rate > 0 && cfg.cash > 0 ? cfg.cash * rate / 100 : 0}
        onAdd={(t) => { setTrades([t, ...trades].sort((a, b) => b.date.localeCompare(a.date))); toast('Zapisano transakcję'); }} />

      <Sheet open={info} onClose={() => setInfo(false)} title="Jak działa SDCA">
        <div className="note-text" style={{ fontSize: 14.5 }}>
          <p><b className="accent">EQM Rainbow</b> — regresja kwantylowa log-ceny BTC względem log-czasu od bloku genesis, z osobnym członem krzywizny dla każdego kwantyla (asymetryczne ogony). Szyny Q1%…Q99% wyznaczają pasma: Fire sale, Accumulate, Value, Above mid, Hot, Bubble. Ryzyko ceny = pozycja ceny między szynami (0–100%).</p>
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

const Stat = ({ k, v, s }: { k: string; v: React.ReactNode; s?: string }) => <div className="stat"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;

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
