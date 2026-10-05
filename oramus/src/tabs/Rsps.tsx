import { HYBRID_RISK_MAX } from '../lib/useRsps';
import { useState } from 'react';
import { Screen, Card, Row, NumInput, Sheet, toast, Fold } from '../components/ui';
import { IcInfo, IcRefresh, IcShield, IcLayers, IcX, IcPlus } from '../components/icons';
import { PyramidCard } from '../components/Pyramid';
import { SentimentCard } from '../components/Sentiment';
import { EventStudyCard } from '../components/EventStudy';
import { usePersisted } from '../lib/db';
import { LEV_MAX } from '../lib/pyramid';
import { useRsps, DEFAULT_TOKENS, MEME, RSPS_DEF, SPLIT_SDCA } from '../lib/useRsps';
import { pct, signed, usd } from '../lib/format';

export { DEFAULT_TOKENS, MEME, RSPS_DEF, SPLIT_SDCA } from '../lib/useRsps';

const REGIMES = {
  defense: { title: 'Ochrona kapitału', tone: 'red', icon: IcShield, desc: 'LTPI ujemne: cała część RSPS w stablecoinach. Bez nowych pozycji.' },
  rsps: { title: 'RSPS aktywny', tone: 'accent', icon: IcLayers, desc: 'Szerokość rynku ≥ próg: część RSPS rotuje do najsilniejszych tokenów względem BTC.' },
  closed: { title: 'Bramka RSPS zamknięta', tone: 'dim', icon: IcShield, desc: '' }
} as const;

export default function Rsps({ nav }: { nav?: React.ReactNode }) {
  const R0 = useRsps();
  const { pyr, s, upd, scan, scanFresh, busy, runScan, breadth, btcTrend, regime, gate, picks, sleeve, shortProposal, log, parking, parkingPending, confirmParking } = R0;
  const [info, setInfo] = useState(false);
  const [tokOpen, setTokOpen] = useState(false);
  const [levOpen, setLevOpen] = useState(false);
  const R = { ...REGIMES[regime], desc: regime === 'closed' ? (parking.choice === 'stable' ? 'Część RSPS w stablecoinach (Twój wybór).' : parking.choice === 'hybrid' ? (R0.sdcaRisk < HYBRID_RISK_MAX ? `Hybryda: BTC × trend (${btcTrend.toFixed(2)}), bo ryzyko wyceny ${R0.sdcaRisk.toFixed(0)}% < ${HYBRID_RISK_MAX}%.` : `Hybryda: stablecoin, bo ryzyko wyceny ${R0.sdcaRisk.toFixed(0)}% ≥ ${HYBRID_RISK_MAX}%.`) : `Część RSPS w BTC skalowanym trendem (${btcTrend.toFixed(2)}).`) : REGIMES[regime].desc };
  const rspsCap = s.capital * (1 - SPLIT_SDCA / 100), sdcaCap = s.capital * SPLIT_SDCA / 100;

  return (
    <Screen nav={nav} title="RSPS" subtitle="Inception SDCA ⊃ RSPS · piramida analizy · ścisła dźwignia"
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
        <div className="row compact" style={{ padding: '10px 0 0' }}><span className="dim">LTPI ($TOTAL) · weto RSPS</span><span className={R0.ltpi > 0 ? 'green' : 'red'} style={{ fontWeight: 600 }}>{R0.ltpi > 0 ? 'pozytywne' : 'negatywne → stablecoin'}</span></div>
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
          <div className="note-text mt8">Warunek z notatek: MTPI ($TOTAL) poniżej zera i spada („below zero and falling → consider shorting”); tokeny najsłabsze względem BTC i we własnym trendzie spadkowym. Wcześniejsze backtesty shortu (warunek trendu BTC): zarabiał w bessie (+21,8 p.p. w 2022), tracił w odbiciach (−18,8 p.p. w 2020) i w portfelu nie poprawił wyniku (research/run39.py). Nie jest wliczony w alokację.</div>
        </Card>
      )}

      {regime === 'closed' && (
        <Card>
          <div className="between"><b>Bramka RSPS zamknięta{scan?.gateSince ? ` od ${scan.gateSince}` : ''}</b>{parkingPending && <span className="pill trim">decyzja</span>}</div>
          <div className="note-text mt8">Gdzie trzymać część RSPS do ponownego otwarcia bramki? Backtest 2020–10.2026, cały portfel z bezpiecznikiem: stablecoin — CAGR 54%, maks. obsunięcie −24%, Sharpe 2024→ 0,94; hybryda (BTC × trend, dopóki ryzyko wyceny SDCA jest poniżej 80%, potem stablecoin) — CAGR 67%, obsunięcie −24%, Sharpe 2024→ 1,07; BTC × trend — CAGR 73%, obsunięcie −27%, Sharpe 2024→ 1,04. Short w żadnym wariancie nie poprawił wyniku, dlatego zostaje tylko warunkową propozycją.</div>
          <div className="flex mt12">
            <button className="btn small grow" style={parking.choice === 'stable' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => { confirmParking('stable'); toast('Wybrano: stablecoin'); }}>Stablecoin</button>
            <button className="btn small grow" style={parking.choice === 'hybrid' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => { confirmParking('hybrid'); toast('Wybrano: hybryda'); }}>Hybryda (domyślnie)</button>
            <button className="btn small grow" style={parking.choice === 'btc' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => { confirmParking('btc'); toast('Wybrano: BTC × trend'); }}>BTC × trend</button>
          </div>
        </Card>
      )}

      <PyramidCard p={pyr} />
      <Fold id="rsps.studies" title="Badania: sentyment i zdarzenia" hint="F&G a zwroty, badanie zdarzeń">
        <SentimentCard fg={pyr.fg} />
        <EventStudyCard fg={pyr.fg} />
      </Fold>

      <div className="section-title">Alokacja</div>
      <Card>
        <div className="between mb12"><span className="dim">Kapitał całkowity</span><NumInput className="inline-input" value={s.capital} onChange={(v) => upd({ capital: v ?? 0 })} suffix="$" /></div>
        <Row className="compact" label={<b>SDCA ({SPLIT_SDCA}%)</b>} value={<span>{usd(sdcaCap, 0)} <span className="dim">wg podzakładki SDCA</span></span>} />
        <Row className="compact" label={<b>RSPS ({100 - SPLIT_SDCA}%)</b>} value={usd(rspsCap, 0)} />
        <div className="note-text mb12">Podział z najwyższym Sharpe w backteście 2020–2026 (1,52), rebalans raz w roku.</div>
        <div className="mt12" />
        {regime === 'defense' && <div className="note-text">LTPI ujemne: cała część RSPS w stablecoinach.</div>}
        {regime === 'closed' && (parking.choice === 'stable' || (parking.choice === 'hybrid' && !(R0.sdcaRisk < HYBRID_RISK_MAX))) && <div className="note-text">Bramka zamknięta: część RSPS w stablecoinach.</div>}
        {sleeve.map((x) => (
          <div key={x.sym} className="mb12">
            <div className="between"><b>{x.sym}</b><span className="num">{pct(x.w * 100, 0)} · {usd(x.w * rspsCap, 0)}{x.note ? <span className="dim"> ({x.note})</span> : null}</span></div>
            <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, marginTop: 6 }}><div style={{ width: Math.min(100, x.w * 100) + '%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} /></div>
          </div>
        ))}
        {regime === 'rsps' && sleeve.reduce((p, x) => p + x.w, 0) < 0.999 && <div className="note-text">Reszta części RSPS w stablecoinach.</div>}
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
            <div className="section-title" style={{ padding: '0 16px' }}>Jakość aktywów (MPT, 365 dni)</div>
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th style={{ paddingLeft: 16 }}>Token</th><th>Omega</th><th>Sortino</th><th>Sharpe</th><th style={{ paddingRight: 16 }}>Korel. BTC</th></tr></thead>
                <tbody>
                  {scan.rows.filter((r) => r.inUniverse && Number.isFinite(r.omega)).sort((a, b) => (b.omega ?? 0) - (a.omega ?? 0)).map((r) => (
                    <tr key={r.sym}><td style={{ paddingLeft: 16 }}><b>{r.sym}</b></td>
                      <td className={(r.omega ?? 0) >= 1 ? 'green' : 'red'}>{r.omega!.toFixed(2)}</td><td>{r.sortino!.toFixed(2)}</td><td>{r.sharpe!.toFixed(2)}</td><td style={{ paddingRight: 16 }}>{r.corrBtc == null || !Number.isFinite(r.corrBtc) ? '—' : r.corrBtc.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note-text" style={{ padding: '6px 16px 0' }}>Informacyjnie, jak w lekcji o wyborze aktywów: Omega = suma zysków / suma strat (&gt; 1 = więcej zysków), Sortino karze tylko spadki, Sharpe całą zmienność. Korelacja dziennych zwrotów z BTC (90 dni): blisko 1 oznacza, że token porusza się prawie jak BTC, więc dywersyfikacja niewiele daje. Ranking według Omega zamiast siły ratio dał w backteście gorszy wynik poza próbą (Sharpe 0,74 vs 0,88), więc nie steruje wyborem.</div>
            <div className="note-text" style={{ padding: '10px 16px 14px' }}>Zamknięcie {scan.closeDate} UTC. Siła = średnia z momentum ratio do BTC z 30/60/90 dni podzielonego przez zmienność. Przegląd codziennie po zamknięciu 00:00 UTC. Wybór: siła &gt; 0 i trend tokena ≥ 0,5; maks. {s.topN} pozycje, limit {s.cap}% na token. Wyszarzone = poza top {s.universeSize}.</div>
          </>
        )}
      </Card>

      <Fold id="rsps.params" title="Parametry i historia reżimów">
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
        {log.slice(0, 20).map((l, i) => <Row key={i} label={(REGIMES as Record<string, { title: string }>)[l.regime]?.title ?? l.regime} value={<span className="dim">{new Date(l.time).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>} />)}
      </Card>

      </Fold>

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

