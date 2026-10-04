import { useEffect, useMemo, useState } from 'react';
import { Screen, Card, Row, Seg, NumInput, Sheet, toast } from '../components/ui';
import { IcInfo, IcRefresh, IcShield, IcBolt, IcLayers, IcX, IcPlus } from '../components/icons';
import { PyramidCard } from '../components/Pyramid';
import { usePersisted } from '../lib/db';
import { klines, lastClosedDay } from '../lib/market';
import { vams, annVol, capWeights } from '../lib/quant';
import { leverageGate, LEV_MAX } from '../lib/pyramid';
import { usePyramid } from '../lib/pyramidStore';
import { pct, signed, usd } from '../lib/format';
import type { LtpiState } from './Sdca';

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
interface ScanRow { sym: string; price: number; ret: number; vol: number; liq: number; ratioUp: boolean; trend: number; score: number; inUniverse?: boolean; error?: string; }
interface Scan { time: number; closeDate: string; rows: ScanRow[]; breadth: number; btcTrend: number; gateOpen: boolean; }
interface LogEntry { time: number; regime: string; lev?: number; }

const REGIMES = {
  defense: { title: 'Ochrona kapitału', tone: 'red', icon: IcShield, desc: 'LTPI ujemne: sygnał wyjścia z SDCA. Bez RSPS, bez dźwigni.' },
  rsps: { title: 'RSPS aktywny', tone: 'accent', icon: IcLayers, desc: 'Szerokość rynku ≥ próg: część RSPS rotuje do najsilniejszych tokenów względem BTC.' },
  btc: { title: 'BTC skalowany trendem', tone: 'dim', icon: IcShield, desc: 'RSPS nieaktywny: część RSPS trzyma BTC proporcjonalnie do siły trendu.' }
} as const;
type RegimeId = keyof typeof REGIMES;

const trendOf = (c: number[]) => {
  const n = c.length - 1;
  return [20, 50, 100, 200].map((L) => (n >= L && c[n] > c.slice(n - L + 1).reduce((a, b) => a + b, 0) / L ? 1 : 0) as number).reduce((a, b) => a + b, 0) / 4;
};

export default function Rsps() {
  const pyr = usePyramid();
  const [s0, setS] = usePersisted<RspsSettings>('rsps.settings', RSPS_DEF);
  const s = { ...RSPS_DEF, ...s0 };
  const upd = (p: Partial<RspsSettings>) => setS((o) => ({ ...RSPS_DEF, ...o, ...p }));
  const [ltpiManual] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [scan, setScan] = usePersisted<Scan | null>('rsps.scan2', null);
  const [log, setLog] = usePersisted<LogEntry[]>('rsps.log', []);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [tokOpen, setTokOpen] = useState(false);
  const [levOpen, setLevOpen] = useState(false);
  const a = pyr.auto;

  const ltpi = ltpiManual.mode === 'manual' ? ltpiManual.manual : a?.ltpi ?? 0;
  const scanFresh = !!scan && scan.closeDate >= lastClosedDay();
  const breadth = scan?.breadth ?? NaN;
  const btcTrend = a?.trendEnsemble ?? scan?.btcTrend ?? 0;
  const rspsActive = scanFresh && !!scan?.gateOpen && btcTrend >= 0.5 && ltpi >= 0;

  const gate = leverageGate({
    trendEnsemble: a?.trendEnsemble ?? 0, adfTrending: !!a?.adfTrending, ltpi, sdcaRisk: a?.sdcaRisk ?? 100,
    volBelowMedian: !!a?.volBelowMedian, persistDays: a?.persistDays ?? 0, rspsActive, pyramid: pyr.comp, state: pyr.state
  });
  const regime: RegimeId = ltpi < 0 ? 'defense' : rspsActive ? 'rsps' : 'btc';
  const R = REGIMES[regime];

  useEffect(() => {
    if (!a) return;
    if (log[0]?.regime !== regime) setLog([{ time: Date.now(), regime }, ...log].slice(0, 200));
  }, [regime, a?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // automatic scan after each daily close (when the app is open)
  useEffect(() => { if (!busy && !scanFresh) void runScan(true); }, [a?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runScan(silent = false) {
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
            score: LOOKBACKS.map((L) => vams(ratio, L, 30)).reduce((p, v) => p + v, 0) / LOOKBACKS.length
          });
        } catch (e) { rows.push({ sym, price: NaN, ret: NaN, vol: NaN, liq: 0, ratioUp: false, trend: 0, score: NaN, error: (e as Error).message }); }
      }));
      // point-in-time universe: the N most liquid (30-day average quote volume)
      const ok = rows.filter((r) => !r.error).sort((x, y) => y.liq - x.liq);
      ok.slice(0, s.universeSize).forEach((r) => (r.inUniverse = true));
      const uni = ok.filter((r) => r.inUniverse);
      const br = uni.length ? uni.filter((r) => r.ratioUp).length / uni.length : NaN;
      rows.sort((x, y) => (y.inUniverse ? 1 : 0) - (x.inUniverse ? 1 : 0) || (y.score || -99) - (x.score || -99));
      // hysteresis: open at ≥ 70%, stay open until breadth falls below 60%
      const wasOpen = !!scan?.gateOpen;
      const gateOpen = Number.isFinite(br) && (wasOpen ? br >= BREADTH_EXIT : br >= BREADTH_ENTER);
      setScan({ time: Date.now(), closeDate: lastClosedDay(), rows, breadth: br, btcTrend: trendOf(btc.map((x) => x.c)), gateOpen });
      if (!silent) toast('Skan zakończony');
    } catch (e) {
      if (!silent) toast('Brak połączenia z Binance: ' + (e as Error).message);
    } finally { setBusy(false); }
  }

  const picks = useMemo(() => {
    const uni = (scan?.rows ?? []).filter((r) => r.inUniverse && Number.isFinite(r.score));
    const sel = uni.filter((r) => r.score > 0 && r.trend >= 0.5).sort((x, y) => y.score - x.score).slice(0, s.topN);
    const w = capWeights(sel.map((r) => r.score / (r.vol / 100)), s.cap / 100).map((x) => Math.min(x, s.cap / 100));
    const shorts = uni.filter((r) => r.score < 0 && r.trend <= 0.25).sort((x, y) => x.score - y.score).slice(0, 3);
    return { sel: sel.map((r, i) => ({ sym: r.sym, w: w[i] })), shorts };
  }, [scan, s.topN, s.cap]);

  // RSPS-sleeve allocation (fraction of the RSPS part of the capital)
  const sleeve: { sym: string; w: number; note?: string }[] = [];
  if (regime === 'rsps') {
    picks.sel.forEach((p) => sleeve.push(p));
    const rest = 1 - picks.sel.reduce((x, p) => x + p.w, 0);
    if (rest > 0.001) sleeve.push({ sym: 'BTC', w: rest * btcTrend, note: 'reszta × trend BTC' });
  } else if (regime === 'btc') sleeve.push({ sym: 'BTC', w: btcTrend, note: `trend ${btcTrend.toFixed(2)}` });
  // short proposal: the backtested condition (BTC trend ensemble ≤ 0.25), weakest alts in their own downtrend
  const shortProposal = btcTrend <= 0.25 && picks.shorts.length > 0 && scanFresh;
  const rspsCap = s.capital * (1 - SPLIT_SDCA / 100), sdcaCap = s.capital * SPLIT_SDCA / 100;

  return (
    <Screen title="RSPS" subtitle="Inception SDCA ⊃ RSPS · piramida analizy · ścisła dźwignia"
      actions={<>
        <button className="icon-btn" onClick={() => setInfo(true)}><IcInfo width={19} /></button>
        <button className="icon-btn" onClick={() => runScan()} disabled={busy}><IcRefresh width={19} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} /></button>
      </>}>

      <Card className="hero">
        <div className="eyebrow">Bieżący reżim</div>
        <div className="flex" style={{ alignItems: 'flex-start' }}>
          <div className="regime" style={{ padding: 0 }}>
            <div className="ico" style={{ background: R.tone === 'dim' ? 'var(--surface-3)' : `var(--${R.tone}-soft)`, color: `var(--${R.tone})` }}><R.icon width={20} /></div>
          </div>
          <div className="grow">
            <div className={'mid-number ' + R.tone} style={{ fontSize: 24 }}>{R.title}</div>
            <div className="dim mt8" style={{ fontSize: 14 }}>{R.desc}</div>
          </div>
        </div>
        <div className="hr" />
        <div className="stat-grid">
          <div className="stat"><div className="k">Szerokość rynku</div><div className="v">{Number.isFinite(breadth) ? pct(breadth * 100, 0) : '—'}<span className="dim" style={{ fontSize: 13 }}> {scan?.gateOpen ? '· otwarta' : '· zamknięta'}</span></div><div className="s">{scanFresh ? `wejście ≥ 70%, wyjście < 60%` : 'skan nieaktualny'}</div></div>
          <div className="stat" onClick={() => setLevOpen(true)} style={{ cursor: 'pointer' }}><div className="k">Propozycje</div><div className="v">{(gate.allowed ? 1 : 0) + (shortProposal ? 1 : 0)}</div><div className="s">dźwignia {gate.checks.filter((c) => c.ok).length}/{gate.checks.length} · short {shortProposal ? 'tak' : 'nie'}</div></div>
        </div>
      </Card>

      {(gate.allowed || shortProposal) && <div className="section-title">Propozycje w sygnale</div>}
      {gate.allowed && (
        <Card>
          <div className="between"><b className="green">Dźwignia {LEV_MAX}× na BTC</b><span className="pill buy">propozycja</span></div>
          <div className="note-text mt8">Spełnione wszystkie 10 ścisłych warunków. Dotyczy tylko części BTC; nie jest wliczona w alokację. W backteście 2020–2026 taki stan wystąpił w ok. 1% dni i nie zwiększył obsunięcia.</div>
          <button className="btn small mt8" onClick={() => setLevOpen(true)}>Pokaż warunki</button>
        </Card>
      )}
      {shortProposal && (
        <Card>
          <div className="between"><b className="red">Short altów jako zabezpieczenie</b><span className="pill sell">propozycja</span></div>
          <div className="mt8"><b>{picks.shorts.map((r) => r.sym).join(', ')}</b> <span className="dim">· 15–30% części RSPS, kontrakty perpetual</span></div>
          <div className="note-text mt8">Warunek: pełny trend spadkowy BTC (trend ≤ 0,25), tokeny najsłabsze względem BTC i we własnym trendzie spadkowym. W backteście zarabiał w latach bessy (+21,8 p.p. w 2022, +16,1 p.p. w 2025), tracił w odbiciach (−18,8 p.p. w 2020). Sam obniżał Sharpe; w portfelu z SDCA zmniejszał obsunięcie z −37% do −31%. Nie jest wliczony w alokację.</div>
        </Card>
      )}

      <PyramidCard p={pyr} />

      <div className="section-title">Alokacja</div>
      <Card>
        <div className="between mb12"><span className="dim">Kapitał całkowity</span><NumInput className="inline-input" value={s.capital} onChange={(v) => upd({ capital: v ?? 0 })} suffix="$" /></div>
        <Row className="compact" label={<b>SDCA ({SPLIT_SDCA}%)</b>} value={<span>{usd(sdcaCap, 0)} <span className="dim">wg zakładki SDCA</span></span>} />
        <Row className="compact" label={<b>RSPS ({100 - SPLIT_SDCA}%)</b>} value={usd(rspsCap, 0)} />
        <div className="note-text mb12">Podział z najwyższym Sharpe w backteście 2020–2026 (1,52), rebalans raz w roku.</div>
        <div className="mt12" />
        {regime === 'defense' && <div className="note-text">LTPI ujemne: część RSPS w gotówce, bez nowych pozycji.</div>}
        {sleeve.map((x) => (
          <div key={x.sym} className="mb12">
            <div className="between"><b>{x.sym}</b><span className="num">{pct(x.w * 100, 0)} · {usd(x.w * rspsCap, 0)}{x.note ? <span className="dim"> ({x.note})</span> : null}</span></div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, marginTop: 6 }}><div style={{ width: Math.min(100, x.w * 100) + '%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} /></div>
          </div>
        ))}
        {regime !== 'defense' && sleeve.reduce((p, x) => p + x.w, 0) < 0.999 && <div className="note-text">Reszta części RSPS w gotówce (stablecoin).</div>}
      </Card>

      <div className="section-title">Skaner (top {s.universeSize} wg płynności, bez memów)</div>
      <Card className="tight">
        <div className="row"><span>Lista kandydatów</span><button className="text-btn" onClick={() => setTokOpen(true)}>{s.tokens.length} · Edytuj</button></div>
        {!scan && <div style={{ padding: 16 }}><button className="btn primary block" onClick={() => runScan()} disabled={busy}>{busy ? 'Skanowanie…' : 'Skanuj rynek (Binance)'}</button></div>}
        {scan && (
          <>
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th style={{ paddingLeft: 16 }}>Token</th><th>Ratio</th><th>Siła</th><th>Trend</th><th>30d</th><th>Vol</th><th style={{ paddingRight: 16 }}>Waga</th></tr></thead>
                <tbody>
                  {scan.rows.map((r) => {
                    const w = regime === 'rsps' ? picks.sel.find((x) => x.sym === r.sym)?.w : undefined;
                    return (
                      <tr key={r.sym} style={{ opacity: r.inUniverse ? 1 : 0.45, background: w ? 'var(--accent-soft)' : undefined }}>
                        <td style={{ paddingLeft: 16 }}><b>{r.sym}</b>{r.error && <div className="red" style={{ fontSize: 11 }}>{r.error}</div>}</td>
                        <td className={r.ratioUp ? 'green' : 'red'}>{r.error ? '' : r.ratioUp ? '▲' : '▼'}</td>
                        <td>{signed(r.score)}</td><td>{r.error ? '' : r.trend.toFixed(2)}</td>
                        <td className={r.ret >= 0 ? 'green' : 'red'}>{pct(r.ret, 0, true)}</td><td className="dim">{pct(r.vol, 0)}</td>
                        <td style={{ paddingRight: 16 }} className="accent">{w ? pct(w * 100, 0) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="note-text" style={{ padding: '10px 16px 14px' }}>Zamknięcie {scan.closeDate} UTC. Siła = średnia z momentum ratio do BTC z 30/60/90 dni podzielonego przez zmienność. Przegląd codziennie po zamknięciu 00:00 UTC. Wybór: siła &gt; 0 i trend tokena ≥ 0,5; maks. {s.topN} pozycje, limit {s.cap}% na token. Wyszarzone = poza top {s.universeSize}.</div>
          </>
        )}
      </Card>

      <div className="section-title">Parametry</div>
      <Card className="tight">
        <Row label="Przegląd" value="codziennie, 00:00 UTC" />
        <Row label="Siła względem BTC" value="średnia 30/60/90 dni" />
        <Row label="Bramka szerokości" value="wejście ≥ 70%, wyjście < 60%" />
        <Row label="Pozycje / limit" value={`maks. ${s.topN} · ${s.cap}% na token`} />
        <div className="note-text" style={{ padding: '4px 16px 14px' }}>Wybrane na danych 2020–2023, sprawdzone poza próbą 01.2024–10.2026 (Binance, 35 tokenów bez memów). Strategia jest wrażliwa na koszty: przy dziennym przeglądzie używaj zleceń z niską prowizją (≤ 0,1%).</div>
      </Card>

      <div className="section-title">Historia reżimów</div>
      <Card className="tight">
        {log.length === 0 && <div className="empty">Brak zmian</div>}
        {log.slice(0, 20).map((l, i) => <Row key={i} label={REGIMES[l.regime as RegimeId]?.title ?? l.regime} value={<span className="dim">{new Date(l.time).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>} />)}
      </Card>

      <Sheet open={levOpen} onClose={() => setLevOpen(false)} title="Propozycja dźwigni">
        <div className="note-text mb12">Dźwignia nie jest częścią strategii. Propozycja {LEV_MAX}× na BTC pojawia się w sygnale tylko gdy spełnione są wszystkie warunki naraz (w backteście 2020–2026: 24 dni, ok. 1%). W każdej innej sytuacji brak propozycji.</div>
        <Card>
          <ol className="step-list">{gate.checks.map((c) => <li key={c.label} className={c.ok ? 'pass' : 'fail'}>{c.label}</li>)}</ol>
        </Card>
      </Sheet>
      <TokenSheet open={tokOpen} onClose={() => setTokOpen(false)} tokens={s.tokens} onChange={(t) => upd({ tokens: t })} />
      <Sheet open={info} onClose={() => setInfo(false)} title="Jak działa RSPS">
        <div className="note-text" style={{ fontSize: 14.5 }}>
          <p><b className="accent">Podział kapitału.</b> SDCA {SPLIT_SDCA}% (zakładka SDCA, krzywa bez zmian) + RSPS {100 - SPLIT_SDCA}%. Rebalans raz w roku. Dźwignia i shorty nie są częścią alokacji, pojawiają się tylko jako propozycje w sygnale.</p>
          <p><b className="accent">RSPS.</b> Codziennie, spośród {s.universeSize} najpłynniejszych dużych tokenów (bez memów), wybiera do {s.topN} najsilniejszych względem BTC (średnia momentum ratio z 30/60/90 dni podzielona przez zmienność). Włącza się, gdy ≥ 70% tokenów ma ratio do BTC nad 50-dniową średnią, i wyłącza dopiero poniżej 60%; trend BTC ≥ 0,5 i LTPI ≥ 0. W przeciwnym razie część RSPS trzyma BTC proporcjonalnie do trendu.</p>
          <p><b className="accent">Piramida.</b> Siedem rodzajów analizy w kolejności ważności, wagi metodą ROC (Barron i Barrett 1996). Systematyzacja, on-chain, istotność statystyczna i sentyment aktualizują się automatycznie po zamknięciu świecy 00:00 UTC; ekonomia fundamentalna, makro i analiza techniczna są ręczne i ważne 7 dni.</p>
          <p><b className="accent">Aktualizacja.</b> iOS nie pozwala aplikacjom webowym działać w tle, więc przeliczenie następuje przy pierwszym otwarciu aplikacji po 00:00 UTC (albo automatycznie, jeśli jest wtedy otwarta).</p>
          <p className="faint">Wyniki z backtestu: research/ w repozytorium. Narzędzie analityczne, nie porada inwestycyjna.</p>
        </div>
      </Sheet>
    </Screen>
  );
}

function TokenSheet({ open, onClose, tokens, onChange }: { open: boolean; onClose: () => void; tokens: string[]; onChange: (t: string[]) => void }) {
  const [txt, setTxt] = useState('');
  const add = () => {
    const sym = txt.trim().toUpperCase().replace(/USDT$/, '');
    if (!sym) return;
    if (MEME.includes(sym)) { toast(`${sym} to mem coin — wykluczony z uniwersum`); return; }
    if (!tokens.includes(sym)) onChange([...tokens, sym]);
    setTxt('');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Kandydaci RSPS" right={<button className="text-btn" onClick={() => onChange(DEFAULT_TOKENS)}>Reset</button>}>
      <div className="flex mb12"><input className="input" placeholder="Symbol, np. HBAR" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} autoCapitalize="characters" /><button className="btn primary" onClick={add}><IcPlus width={18} /></button></div>
      <Card className="tight">
        {tokens.map((t) => <div key={t} className="row"><b>{t}</b><button className="icon-btn plain" onClick={() => onChange(tokens.filter((x) => x !== t))}><IcX width={18} /></button></div>)}
      </Card>
      <div className="note-text">Pary {'<SYMBOL>'}USDT z Binance. Skaner bierze {RSPS_DEF.universeSize} najpłynniejszych z tej listy. Mem coiny są blokowane.</div>
    </Sheet>
  );
}

