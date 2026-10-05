import { Screen, Card, Seg } from '../components/ui';
import { TpiCard } from '../components/Tpi';
import { usePersisted } from '../lib/db';
import { usePyramid, TPI_DEFAULTS, type TpiSettings } from '../lib/pyramidStore';
import type { LtpiState } from './Sdca';
import { signed } from '../lib/format';

/** LTPI / MTPI: trend-following signals (not valuation). */
export default function Trend({ nav }: { nav?: React.ReactNode }) {
  const pyr = usePyramid();
  const [ltpi, setLtpi] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [tpi0, setTpi] = usePersisted<TpiSettings>('signals.tpi', TPI_DEFAULTS);
  const tpi = { ...TPI_DEFAULTS, ...tpi0 };
  const a = pyr.auto;
  const ltpiValue = ltpi.mode === 'manual' ? ltpi.manual : a?.ltpi ?? 0;
  return (
    <Screen nav={nav} title="LTPI · MTPI" subtitle="Sygnały podążania za trendem · zamknięcie 00:00 UTC">
      <Card className="hero">
        <div className="between"><div className="eyebrow" style={{ margin: 0 }}>LTPI — długoterminowy trend</div>
          <Seg value={ltpi.mode} onChange={(m) => setLtpi({ ...ltpi, mode: m })} options={[{ v: 'proxy', l: 'Auto' }, { v: 'manual', l: 'Ręcznie' }]} /></div>
        <div className={'mid-number mt12 ' + (ltpiValue > 0 ? 'green' : ltpiValue < 0 ? 'red' : 'dim')}>{ltpi.mode === 'manual' ? signed(ltpiValue) : ltpiValue > 0 ? 'Stan: pozytywny' : ltpiValue < 0 ? 'Stan: negatywny' : 'Stan: brak'}</div>
        <div className="dim" style={{ fontSize: 13 }}>{ltpiValue > 0 ? 'Trend długoterminowy pozytywny' : ltpiValue < 0 ? 'Sygnał „emergency exit”: LTPI negatywne' : 'Neutralnie'}{ltpi.mode !== 'manual' && a && tpi.ltpiSource === 'ensemble' ? ` · wartość ${signed(a.ltpiTpi.value)}` : ''}</div>
        {ltpi.mode === 'manual' ? (
          <div className="mt12"><input type="range" min={-1} max={1} step={0.05} value={ltpi.manual} onChange={(e) => setLtpi({ ...ltpi, manual: +e.target.value })} />
            <div className="note-text">Wpisz LTPI z własnego systemu (−1 … +1). Używają go: bezpiecznik SDCA, reżim RSPS i Portfel.</div></div>
        ) : <div className="note-text mt12">{tpi.ltpiSource === 'sma200' ? 'Źródło: cena vs SMA 200.' : 'Źródło: 10 wskaźników trendu z histerezą ±0,2.'} Steruje: bezpiecznikiem SDCA (LTPI &lt; 0 i ryzyko ≥ 70%) oraz RSPS (LTPI &lt; 0 → stablecoiny).</div>}
      </Card>

      {a && <TpiCard title="LTPI · składniki (10 wskaźników)" res={a.ltpiTpi} stateLabel
        note={tpi.ltpiSource === 'ensemble' ? 'Steruje bezpiecznikiem SDCA i reżimem RSPS.' : 'Informacyjnie: wybrane źródło LTPI to cena vs SMA 200.'} />}
      {a && <TpiCard title="MTPI · średnioterminowy (10 wskaźników)" res={a.mtpi}
        note={tpi.mtpiSizing === 'ensemble' ? 'Steruje skalowaniem BTC w części RSPS (MTPI przeliczony na 0…1).' : 'Informacyjnie: skalowanie BTC używa 4 średnich (wariant z backtestu).'} />}
      {!a && <Card><div className="dim">Ładowanie danych BTC…</div></Card>}

      <div className="section-title">Ustawienia</div>
      <Card className="tight">
        <div className="row"><div className="grow"><div>Źródło LTPI</div><div className="faint" style={{ fontSize: 12 }}>Backtest: ensemble ≈ SMA 200 (Sharpe OOS 1,03 vs 1,03), mniejsze obsunięcie</div></div>
          <Seg value={tpi.ltpiSource} onChange={(v) => setTpi({ ...tpi, ltpiSource: v })} options={[{ v: 'ensemble', l: '10 wsk. ★' }, { v: 'sma200', l: 'SMA 200' }]} /></div>
        <div className="row"><div className="grow"><div>Skalowanie BTC</div><div className="faint" style={{ fontSize: 12 }}>Backtest: MTPI z 10 wsk. obniżał wynik OOS (Sharpe 0,82–0,95 vs 1,03)</div></div>
          <Seg value={tpi.mtpiSizing} onChange={(v) => setTpi({ ...tpi, mtpiSizing: v })} options={[{ v: 'ma4', l: '4 średnie ★' }, { v: 'ensemble', l: 'MTPI' }]} /></div>
        <div className="note-text" style={{ padding: '4px 16px 14px' }}>★ = wariant wybrany w backteście (research/run17–18.py).</div>
      </Card>

      <div className="section-title">Jak czytać TPI</div>
      <Card>
        <div className="note-text">TPI podąża za trendem: kupuje wysoko, żeby sprzedać wyżej, i sprzedaje nisko, zanim spadnie niżej. Nie wskazuje szczytów ani dołków i nie mierzy wyceny. Wycena (SDCA) to osobny system typu „kup tanio, sprzedaj drogo”, więc te dwa sygnały są liczone oddzielnie. TPI ponosi serie małych strat w rynku bocznym i odrabia je dużymi zyskami w trendzie. Najważniejszy jest stan (powyżej/poniżej zera), potem tempo zmian; siła oznacza tylko zgodność składników.</div>
      </Card>
    </Screen>
  );
}
