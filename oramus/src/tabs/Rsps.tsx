import { useEffect, useMemo, useState } from 'react';
import { Screen, Card, Row, Seg, Switch, NumInput, Sheet, toast } from '../components/ui';
import { IcInfo, IcRefresh, IcShield, IcBolt, IcLayers, IcX, IcPlus } from '../components/icons';
import { useBtc } from '../lib/btcStore';
import { usePersisted } from '../lib/db';
import { klines } from '../lib/market';
import { isTrending, kellyLeverage, practicalLeverage, tpiProxy, vams, annVol, ratioTrend, capWeights } from '../lib/quant';
import { pct, signed, usd } from '../lib/format';
import type { LtpiState } from './Sdca';

export const DEFAULT_TOKENS = ['ETH', 'SOL', 'SUI', 'BNB', 'XRP', 'DOGE', 'AVAX', 'LINK', 'TON', 'NEAR', 'APT', 'INJ', 'RENDER', 'FET', 'PEPE', 'WIF', 'TAO'];

interface RspsSettings {
  mtpiMode: 'proxy' | 'manual'; mtpiManual: number;
  adfMode: 'auto' | 'manual'; adfManual: boolean; adfWindow: number;
  confMode: 'manual' | 'proxy'; confManual: number; threshold: number;
  optMode: 'manual' | 'kelly'; optimal: Record<string, number>;
  tokens: string[]; lookback: number; topN: number; cap: number; capital: number;
}
const DEF: RspsSettings = {
  mtpiMode: 'proxy', mtpiManual: 0, adfMode: 'auto', adfManual: false, adfWindow: 90,
  confMode: 'manual', confManual: 50, threshold: 70,
  optMode: 'manual', optimal: { BTC: 4, ETH: 2.5, SOL: 2.5 },
  tokens: DEFAULT_TOKENS, lookback: 30, topN: 4, cap: 50, capital: 10000
};
interface ScanRow { sym: string; price: number; ret: number; vol: number; vams: number; ratioTrend: number; ratioVams: number; selected?: boolean; weight?: number; error?: string; }
interface Scan { time: number; rows: ScanRow[]; btcTrend: boolean; kelly: Record<string, number>; }
interface LogEntry { time: number; regime: string; }

const REGIMES = {
  defense: { title: 'Ochrona kapitału', tone: 'red', icon: IcShield, desc: 'LTPI negatywne — SDCA daje sygnał „emergency exit”. Bez RSPS i bez dźwigni.' },
  rsps: { title: 'RSPS aktywny', tone: 'accent', icon: IcLayers, desc: 'Confidence score ≥ próg — kapitał SDCA rotuje do wyselekcjonowanych tokenów (inception SDCA ⊃ RSPS).' },
  lev: { title: 'Enhanced SDCA + dźwignia BTC', tone: 'green', icon: IcBolt, desc: 'Trend (ADF) i MTPI w górę — dozwolona praktyczna dźwignia na BTC (≈ ½ optymalnej).' },
  spot: { title: 'Enhanced SDCA (spot)', tone: 'dim', icon: IcShield, desc: 'Brak warunków dla RSPS i dźwigni — pozycja BTC spot według SDCA.' }
} as const;
type RegimeId = keyof typeof REGIMES;

export default function Rsps() {
  const { model } = useBtc();
  const [s0, setS] = usePersisted<RspsSettings>('rsps.settings', DEF);
  const s = { ...DEF, ...s0 };
  const upd = (p: Partial<RspsSettings>) => setS((o) => ({ ...DEF, ...o, ...p }));
  const [ltpi] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [scan, setScan] = usePersisted<Scan | null>('rsps.scan', null);
  const [log, setLog] = usePersisted<LogEntry[]>('rsps.log', []);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [tokOpen, setTokOpen] = useState(false);

  const prices = model?.prices ?? [];
  const ltpiVal = model ? (ltpi.mode === 'manual' ? ltpi.manual : tpiProxy(prices, 'long')) : 0;
  const mtpiVal = s.mtpiMode === 'manual' ? s.mtpiManual : prices.length ? tpiProxy(prices, 'medium') : 0;
  const adf = useMemo(() => (prices.length ? isTrending(prices, s.adfWindow) : null), [prices, s.adfWindow]);
  const trending = s.adfMode === 'manual' ? s.adfManual : !!adf?.trending;

  const confProxy = useMemo(() => {
    if (!scan?.rows.length) return NaN;
    const ok = scan.rows.filter((r) => !r.error);
    if (!ok.length) return NaN;
    const breadthRatio = ok.filter((r) => r.ratioTrend > 0).length / ok.length;
    const breadthAbs = ok.filter((r) => r.vams > 0).length / ok.length;
    return 100 * (0.5 * breadthRatio + 0.3 * breadthAbs + 0.2 * (scan.btcTrend ? 1 : 0));
  }, [scan]);
  const conf = s.confMode === 'manual' ? s.confManual : confProxy;

  const regime: RegimeId = ltpiVal < 0 ? 'defense' : conf >= s.threshold ? 'rsps' : mtpiVal > 0 && trending ? 'lev' : 'spot';
  const R = REGIMES[regime];

  useEffect(() => {
    if (!model) return;
    if (log[0]?.regime !== regime) setLog([{ time: Date.now(), regime }, ...log].slice(0, 100));
  }, [regime, model]); // eslint-disable-line react-hooks/exhaustive-deps

  const optimal = (sym: string) => (s.optMode === 'kelly' && scan?.kelly[sym] != null ? scan.kelly[sym] : s.optimal[sym]);
  const levAllowed = trending && mtpiVal > 0 && ltpiVal >= 0;
  const btcLev = regime === 'lev' ? practicalLeverage(optimal('BTC')) : 1;

  const selection = useMemo(() => select(scan?.rows ?? [], s.topN, s.cap / 100), [scan, s.topN, s.cap]);

  async function runScan() {
    setBusy(true);
    try {
      const btc = await klines('BTCUSDT', 400);
      const btcMap = new Map(btc.map((k) => [k.t, k.c]));
      const btcCloses = btc.map((k) => k.c);
      const rows: ScanRow[] = [];
      const kelly: Record<string, number> = { BTC: kellyLeverage(btcCloses) };
      await Promise.all(s.tokens.map(async (sym) => {
        try {
          const k = await klines(sym + 'USDT', 400);
          const closes = k.map((x) => x.c);
          const ratio = k.filter((x) => btcMap.has(x.t)).map((x) => x.c / btcMap.get(x.t)!);
          if (closes.length < 60) throw new Error('za mało historii');
          if (sym === 'ETH' || sym === 'SOL') kelly[sym] = kellyLeverage(closes);
          rows.push({
            sym, price: closes[closes.length - 1],
            ret: (closes[closes.length - 1] / closes[closes.length - 1 - s.lookback] - 1) * 100,
            vol: annVol(closes, 30) * 100, vams: vams(closes, s.lookback), ratioTrend: ratioTrend(ratio), ratioVams: vams(ratio, s.lookback)
          });
        } catch (e) { rows.push({ sym, price: NaN, ret: NaN, vol: NaN, vams: NaN, ratioTrend: 0, ratioVams: NaN, error: (e as Error).message }); }
      }));
      rows.sort((a, b) => (b.ratioVams || -99) - (a.ratioVams || -99));
      setScan({ time: Date.now(), rows, btcTrend: isTrending(btcCloses, s.adfWindow).trending && tpiProxy(btcCloses, 'medium') > 0, kelly });
      toast('Skan zakończony');
    } catch (e) {
      toast('Brak połączenia z Binance: ' + (e as Error).message);
    } finally { setBusy(false); }
  }

  const alloc = regime === 'rsps' ? selection.weights : regime === 'defense' ? [] : [{ sym: 'BTC', w: 1 }];

  return (
    <Screen title="RSPS" subtitle="Relative Strength Portfolio System · inception SDCA ⊃ RSPS"
      actions={<>
        <button className="icon-btn" onClick={() => setInfo(true)}><IcInfo width={19} /></button>
        <button className="icon-btn" onClick={runScan} disabled={busy}><IcRefresh width={19} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} /></button>
      </>}>

      <Card className="hero">
        <div className="eyebrow">Bieżący reżim strategii</div>
        <div className="flex" style={{ alignItems: 'flex-start' }}>
          <div className="regime" style={{ padding: 0 }}>
            <div className="ico" style={{ background: `var(--${R.tone === 'accent' ? 'accent' : R.tone}-soft, var(--surface-3))`, color: `var(--${R.tone === 'dim' ? 'dim' : R.tone})` }}><R.icon width={20} /></div>
          </div>
          <div className="grow">
            <div className={'mid-number ' + R.tone} style={{ fontSize: 24 }}>{R.title}</div>
            <div className="dim mt8" style={{ fontSize: 14 }}>{R.desc}</div>
          </div>
        </div>
        <div className="hr" />
        <div className="stat-grid">
          <div className="stat"><div className="k">Ekspozycja BTC</div><div className="v">{regime === 'defense' ? '—' : regime === 'rsps' ? '1.0×' : btcLev.toFixed(1) + '×'}</div><div className="s">{regime === 'lev' ? 'praktyczna dźwignia' : 'bez dźwigni'}</div></div>
          <div className="stat"><div className="k">Confidence</div><div className="v">{Number.isFinite(conf) ? conf.toFixed(0) : '—'}<span className="dim" style={{ fontSize: 13 }}> / próg {s.threshold}</span></div><div className="s">{s.confMode === 'manual' ? 'wartość ręczna' : 'proxy ze skanu'}</div></div>
        </div>
      </Card>

      <div className="section-title">Warunki decyzji</div>
      <Card>
        <ol className="step-list">
          <li className={ltpiVal >= 0 ? 'pass' : 'fail'}>LTPI ≥ 0 (SDCA bez sygnału wyjścia) <span className="dim num">· {signed(ltpiVal)}</span></li>
          <li className={conf >= s.threshold ? 'pass' : 'fail'}>RSPS confidence ≥ próg <span className="dim num">· {Number.isFinite(conf) ? conf.toFixed(0) : '—'} / {s.threshold}</span></li>
          <li className={mtpiVal > 0 ? 'pass' : 'fail'}>MTPI w stanie bullish („Up”) <span className="dim num">· {signed(mtpiVal)}</span></li>
          <li className={trending ? 'pass' : 'fail'}>ADF: rynek w trendzie (nie w konsolidacji) <span className="dim num">· {adf && s.adfMode === 'auto' ? `t=${adf.stat.toFixed(2)} vs ${adf.crit}` : 'ręcznie'}</span></li>
        </ol>
        <div className="note-text mt8">Kolejność: 1 ✕ → ochrona kapitału · 1 ✓ 2 ✓ → RSPS · 3 ✓ 4 ✓ → dźwignia BTC · w pozostałych przypadkach SDCA spot.</div>
      </Card>

      <div className="section-title">Sygnały wejściowe</div>
      <Card className="tight">
        <div className="row"><div className="grow"><div>MTPI</div><div className="faint" style={{ fontSize: 12 }}>{s.mtpiMode === 'proxy' ? 'Proxy: EMA20/50, ROC30, SMA100' : 'Wartość z własnego systemu'}</div></div>
          <Seg value={s.mtpiMode} onChange={(v) => upd({ mtpiMode: v })} options={[{ v: 'proxy', l: 'Proxy' }, { v: 'manual', l: 'Ręcznie' }]} /></div>
        {s.mtpiMode === 'manual' && <div className="row"><input type="range" min={-1} max={1} step={0.05} value={s.mtpiManual} onChange={(e) => upd({ mtpiManual: +e.target.value })} /><span className="num" style={{ minWidth: 48, textAlign: 'right' }}>{signed(s.mtpiManual)}</span></div>}
        <div className="row"><div className="grow"><div>ADF — trend</div><div className="faint" style={{ fontSize: 12 }}>Test Dickeya-Fullera na log-cenie BTC, okno {s.adfWindow} dni, 5%</div></div>
          <Seg value={s.adfMode} onChange={(v) => upd({ adfMode: v })} options={[{ v: 'auto', l: 'Auto' }, { v: 'manual', l: 'Ręcznie' }]} /></div>
        {s.adfMode === 'manual'
          ? <div className="row"><span>Trending</span><Switch checked={s.adfManual} onChange={(v) => upd({ adfManual: v })} /></div>
          : <div className="row"><span>Okno ADF (dni)</span><Seg value={String(s.adfWindow)} onChange={(v) => upd({ adfWindow: +v })} options={[{ v: '60', l: '60' }, { v: '90', l: '90' }, { v: '120', l: '120' }, { v: '180', l: '180' }]} /></div>}
        <div className="row"><div className="grow"><div>RSPS confidence score</div><div className="faint" style={{ fontSize: 12 }}>{s.confMode === 'manual' ? 'Wpisz wartość z analizy (0–100)' : 'Proxy: szerokość trendów ratio + VAMS + trend BTC'}</div></div>
          <Seg value={s.confMode} onChange={(v) => upd({ confMode: v })} options={[{ v: 'manual', l: 'Ręcznie' }, { v: 'proxy', l: 'Proxy' }]} /></div>
        {s.confMode === 'manual' && <div className="row"><input type="range" min={0} max={100} step={1} value={s.confManual} onChange={(e) => upd({ confManual: +e.target.value })} /><span className="num" style={{ minWidth: 40, textAlign: 'right' }}>{s.confManual}</span></div>}
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="between"><span>Próg wejścia RSPS</span><span className="num accent">{s.threshold}</span></div>
          <input type="range" min={10} max={95} step={1} value={s.threshold} onChange={(e) => upd({ threshold: +e.target.value })} />
          <div className="between faint" style={{ fontSize: 11.5 }}><span>Liberalny</span><span>Restrykcyjny</span></div>
        </div>
      </Card>

      <div className="section-title">Dźwignia</div>
      <Card className="tight">
        <div className="row"><div className="grow"><div>Źródło „optymalnej” dźwigni</div><div className="faint" style={{ fontSize: 12 }}>Kelly = μ/σ² z 365 dni (po skanie)</div></div>
          <Seg value={s.optMode} onChange={(v) => upd({ optMode: v })} options={[{ v: 'manual', l: 'Ręcznie' }, { v: 'kelly', l: 'Kelly' }]} /></div>
        <table className="data" style={{ margin: '4px 0' }}>
          <thead><tr><th style={{ paddingLeft: 16 }}>Aktywo</th><th>Optymalna</th><th>Praktyczna</th><th style={{ paddingRight: 16 }}>Teraz</th></tr></thead>
          <tbody>
            {['BTC', 'ETH', 'SOL'].map((a) => {
              const o = optimal(a), p = practicalLeverage(o);
              return <tr key={a}><td style={{ paddingLeft: 16 }}><b>{a}</b></td>
                <td>{s.optMode === 'manual' ? <NumInput className="inline-input" value={s.optimal[a]} onChange={(v) => upd({ optimal: { ...s.optimal, [a]: v ?? 1 } })} suffix="×" /> : Number.isFinite(o) ? o.toFixed(2) + '×' : '—'}</td>
                <td>{p}×</td><td style={{ paddingRight: 16 }} className={levAllowed && p > 1 && regime === 'lev' ? 'green' : 'dim'}>{regime === 'lev' && levAllowed && a === 'BTC' ? p : 1}×</td></tr>;
            })}
          </tbody>
        </table>
        <div className="note-text" style={{ padding: '4px 16px 14px' }}>Praktyczna dźwignia ≈ ½ optymalnej (teoria perspektywy i użyteczność inwestora): 2–3× → 1× (ETH, SOL), 4× → maks. 2× (BTC). Dźwignia tylko gdy jednocześnie „trending” (ADF) i „up” (MTPI), nigdy w konsolidacji.</div>
      </Card>

      <div className="section-title">Skaner tokenów (lista probacyjna)</div>
      <Card className="tight">
        <div className="row"><span>Tokeny na liście</span><button className="text-btn" onClick={() => setTokOpen(true)}>{s.tokens.length} · Edytuj</button></div>
        <div className="row"><span>Lookback momentum</span><Seg value={String(s.lookback)} onChange={(v) => upd({ lookback: +v })} options={[{ v: '14', l: '14d' }, { v: '30', l: '30d' }, { v: '60', l: '60d' }, { v: '90', l: '90d' }]} /></div>
        <div className="row"><span>Maks. pozycji</span><Seg value={String(s.topN)} onChange={(v) => upd({ topN: +v })} options={[{ v: '2', l: '2' }, { v: '3', l: '3' }, { v: '4', l: '4' }, { v: '6', l: '6' }]} /></div>
        <div className="row"><span>Limit na token</span><Seg value={String(s.cap)} onChange={(v) => upd({ cap: +v })} options={[{ v: '25', l: '25%' }, { v: '35', l: '35%' }, { v: '50', l: '50%' }]} /></div>
        {!scan && <div style={{ padding: 16 }}><button className="btn primary block" onClick={runScan} disabled={busy}>{busy ? 'Skanowanie…' : 'Skanuj rynek (Binance)'}</button></div>}
        {scan && (
          <>
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th style={{ paddingLeft: 16 }}>Token</th><th>Ratio</th><th>VAMS/BTC</th><th>VAMS</th><th>{s.lookback}d</th><th>Vol</th><th style={{ paddingRight: 16 }}>Waga</th></tr></thead>
                <tbody>
                  {scan.rows.map((r) => {
                    const w = selection.weights.find((x) => x.sym === r.sym)?.w;
                    return (
                      <tr key={r.sym} style={w ? { background: 'var(--accent-soft)' } : undefined}>
                        <td style={{ paddingLeft: 16 }}><b>{r.sym}</b>{r.error && <div className="red" style={{ fontSize: 11 }}>{r.error}</div>}</td>
                        <td className={r.ratioTrend > 0 ? 'green' : r.ratioTrend < 0 ? 'red' : 'dim'}>{r.ratioTrend > 0 ? '▲' : r.ratioTrend < 0 ? '▼' : '—'}</td>
                        <td>{signed(r.ratioVams)}</td><td>{signed(r.vams)}</td>
                        <td className={r.ret >= 0 ? 'green' : 'red'}>{pct(r.ret, 0, true)}</td><td className="dim">{pct(r.vol, 0)}</td>
                        <td style={{ paddingRight: 16 }} className="accent">{w ? pct(w * 100, 0) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="note-text" style={{ padding: '10px 16px 14px' }}>Skan: {new Date(scan.time).toLocaleString('pl-PL')} · Wybór: ratio vs BTC w trendzie wzrostowym, VAMS &gt; 0 i VAMS ratio &gt; 0; ranking wg VAMS ratio; wagi proporcjonalne do siły, limit {s.cap}% na token, reszta w BTC.</div>
          </>
        )}
      </Card>

      <div className="section-title">Alokacja docelowa</div>
      <Card>
        <div className="between mb12"><span className="dim">Kapitał strategii</span><NumInput className="inline-input" value={s.capital} onChange={(v) => upd({ capital: v ?? 0 })} suffix="$" /></div>
        {regime === 'defense' && <div className="note-text">LTPI negatywne — brak nowych pozycji. Postępuj według sygnału wyjścia SDCA.</div>}
        {alloc.map((a) => (
          <div key={a.sym} className="mb12">
            <div className="between"><b>{a.sym}{a.sym === 'BTC' && regime === 'lev' ? ` · ${btcLev}×` : ''}</b><span className="num">{pct(a.w * 100, 0)} · {usd(a.w * s.capital, 0)}{a.sym === 'BTC' && regime === 'lev' && btcLev > 1 ? <span className="dim"> (ekspozycja {usd(a.w * s.capital * btcLev, 0)})</span> : null}</span></div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, marginTop: 6 }}><div style={{ width: a.w * 100 + '%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} /></div>
          </div>
        ))}
        {regime === 'rsps' && !scan && <div className="note-text">Uruchom skan, aby wyznaczyć tokeny.</div>}
      </Card>

      {scan && selection.shorts.length > 0 && (
        <>
          <div className="section-title">Kandydaci short (beta)</div>
          <Card className="tight">
            {selection.shorts.map((r) => <Row key={r.sym} label={<b>{r.sym}</b>} value={<span className="red num">VAMS/BTC {signed(r.ratioVams)}</span>} />)}
            <div className="note-text" style={{ padding: '4px 16px 14px' }}>Najsłabsze ratio z ujemnym trendem i VAMS. Tylko informacyjnie — moduł short-only autora nie jest publicznie opisany.</div>
          </Card>
        </>
      )}

      <div className="section-title">Założenia, które mogą przestać działać</div>
      <Card>
        <ul className="note-text" style={{ margin: 0, paddingLeft: 18 }}>
          <li>LTPI daje skuteczne sygnały wejścia i wyjścia w długim terminie.</li>
          <li>Reżimy rynkowe są niestabilne — alfa tej analizy może wygasać.</li>
          <li>Metody RSPS mogą już nie działać — portfel zostaje w stanie „enhanced SDCA”, dopóki nie pojawi się nowa metoda o wysokiej alfie.</li>
          <li>Selection bias: dłuższa lista probacyjna rozcieńcza efekt wyboru tokenów z perspektywy czasu.</li>
        </ul>
      </Card>

      <div className="section-title">Historia reżimów</div>
      <Card className="tight">
        {log.length === 0 && <div className="empty">Brak zmian</div>}
        {log.slice(0, 20).map((l, i) => <Row key={i} label={REGIMES[l.regime as RegimeId]?.title ?? l.regime} value={<span className="dim">{new Date(l.time).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>} />)}
      </Card>

      <TokenSheet open={tokOpen} onClose={() => setTokOpen(false)} tokens={s.tokens} onChange={(t) => upd({ tokens: t })} />

      <Sheet open={info} onClose={() => setInfo(false)} title="Strategia RSPS">
        <div className="note-text" style={{ fontSize: 14.5 }}>
          <p><b className="accent">Inception SDCA ⊃ RSPS.</b> Rdzeniem jest długoterminowe SDCA z sygnałem awaryjnego wyjścia (LTPI). Wejście w RSPS jest mocno ograniczone przez confidence score; jeśli RSPS przestanie działać, strategia dopuszcza dźwignię na BTC przy wysokim prawdopodobieństwie trwałego trendu wzrostowego.</p>
          <p><b className="accent">Dźwignia.</b> Praktyczna ≈ ½ „optymalnej”: SOL/ETH (2–3×) → bez dźwigni, BTC (4×) → maks. 2×. Tylko w okresach jednocześnie „trending” (ADF) i „up” (MTPI); w konsolidacji opłaty i volatility decay działają przeciwko pozycji.</p>
          <p><b className="accent">Confidence score</b> wskazuje, czy podążać za RSPS; próg można ustawić liberalnie lub restrykcyjnie.</p>
          <p><b className="accent">Nowy wariant RSPS.</b> Lista probacyjna 17 tokenów wybieranych dynamicznie; tokeny o wyższej zmienności (np. SUI) mogą stanowić do 50% portfela przy zachowaniu kontroli zmienności (VAMS). Długa lista rozcieńcza selection bias — słabe tokeny kosztują głównie utraconą okazję, a ryzyko nie rośnie istotnie.</p>
          <p className="faint">Skaner, proxy MTPI/LTPI/confidence i Kelly to przybliżenia zbudowane na publicznych danych — nie oryginalne wskaźniki autora. Narzędzie analityczne, nie porada inwestycyjna.</p>
        </div>
      </Sheet>
    </Screen>
  );
}

function select(rows: ScanRow[], topN: number, cap: number) {
  const ok = rows.filter((r) => !r.error && Number.isFinite(r.ratioVams));
  const picks = ok.filter((r) => r.ratioTrend > 0 && r.vams > 0 && r.ratioVams > 0).sort((a, b) => b.ratioVams - a.ratioVams).slice(0, topN);
  let weights: { sym: string; w: number }[] = [];
  if (picks.length) {
    const raw = capWeights(picks.map((p) => p.ratioVams), cap);
    // if the cap can't be satisfied with few picks, the remainder sits in BTC
    const capped = raw.map((w) => Math.min(w, cap));
    const rest = 1 - capped.reduce((a, b) => a + b, 0);
    weights = picks.map((p, i) => ({ sym: p.sym, w: capped[i] }));
    if (rest > 0.001) weights.push({ sym: 'BTC', w: rest });
  } else weights = [{ sym: 'BTC', w: 1 }];
  const shorts = ok.filter((r) => r.ratioTrend < 0 && r.vams < 0 && r.ratioVams < 0).sort((a, b) => a.ratioVams - b.ratioVams).slice(0, 3);
  return { weights, shorts };
}

function TokenSheet({ open, onClose, tokens, onChange }: { open: boolean; onClose: () => void; tokens: string[]; onChange: (t: string[]) => void }) {
  const [txt, setTxt] = useState('');
  const add = () => {
    const sym = txt.trim().toUpperCase().replace(/USDT$/, '');
    if (!sym) return;
    if (!tokens.includes(sym)) onChange([...tokens, sym]);
    setTxt('');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Lista probacyjna" right={<button className="text-btn" onClick={() => onChange(DEFAULT_TOKENS)}>Reset</button>}>
      <div className="flex mb12"><input className="input" placeholder="Symbol, np. ARB" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} autoCapitalize="characters" /><button className="btn primary" onClick={add}><IcPlus width={18} /></button></div>
      <Card className="tight">
        {tokens.map((t) => <div key={t} className="row"><b>{t}</b><button className="icon-btn plain" onClick={() => onChange(tokens.filter((x) => x !== t))}><IcX width={18} /></button></div>)}
      </Card>
      <div className="note-text">Pary {'<SYMBOL>'}USDT z Binance. Możesz celowo dodać słabe tokeny — system selekcji ma je odrzucać.</div>
    </Sheet>
  );
}
