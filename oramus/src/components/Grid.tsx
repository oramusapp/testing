import { Card, Seg } from './ui';
import { usePersisted } from '../lib/db';
import { freshToday } from '../lib/market';

// 42 Macro GRID (Darius Dale): the macro regime from the direction of growth and inflation.
// Growth = 3-month change of the OECD Composite Leading Indicator, inflation = 3-month change of headline CPI YoY.
// BTC and S&P 500 numbers are read from the 42 Macro slides in the course notes (monthly data; BTC sample tiny).
type Dir = 'up' | 'down' | '';
interface GridState { growth: Dir; inflation: Dir; updated: number | null; }
const REG = {
  goldilocks: { name: 'Goldilocks', desc: 'wzrost ↑ · inflacja ↓', color: 'var(--green)', btc: '+483%/rok · 100% miesięcy na plus · n = 7', spx: '+25%/rok' },
  reflation: { name: 'Reflacja', desc: 'wzrost ↑ · inflacja ↑', color: '#9ccc5a', btc: '+104%/rok · 59% na plus · n = 22', spx: 'ok. +13%/rok' },
  inflation: { name: 'Inflacja', desc: 'wzrost ↓ · inflacja ↑', color: 'var(--amber)', btc: '+64%/rok · 47% na plus · n = 19', spx: '−8%/rok' },
  deflation: { name: 'Deflacja', desc: 'wzrost ↓ · inflacja ↓', color: 'var(--red)', btc: '−10%/rok · 35% na plus · n = 17', spx: '−3%/rok' }
} as const;
const regimeOf = (g: Dir, i: Dir) => (!g || !i ? null : g === 'up' ? (i === 'down' ? 'goldilocks' : 'reflation') : (i === 'up' ? 'inflation' : 'deflation'));

export function GridCard() {
  const [st, setSt] = usePersisted<GridState>('macro.grid', { growth: '', inflation: '', updated: null });
  // manual macro readings reset at every daily close (00:00 UTC)
  const fresh = freshToday(st.updated);
  const g: Dir = fresh ? st.growth : '', inf: Dir = fresh ? st.inflation : '';
  const r = regimeOf(g, inf);
  const R = r ? REG[r] : null;
  const opts = [{ v: 'up' as Dir, l: 'rośnie ↑' }, { v: 'down' as Dir, l: 'spada ↓' }];
  return (
    <Card>
      <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Reżim makro · 42 Macro GRID</div>
        {R && <span className="pill" style={{ color: R.color, background: 'var(--surface-3)' }}><span className="dot" />{R.name}</span>}</div>
      <div className="mt12" style={{ display: 'grid', gap: 8 }}>
        <div className="between"><span>Wzrost (OECD CLI, zmiana 3 mies.)</span><Seg value={g} options={opts} onChange={(v) => setSt({ growth: v, inflation: inf, updated: Date.now() })} /></div>
        <div className="between"><span>Inflacja (CPI r/r, zmiana 3 mies.)</span><Seg value={inf} options={opts} onChange={(v) => setSt({ growth: g, inflation: v, updated: Date.now() })} /></div>
      </div>
      {R && <div className="mt12">
        <div style={{ fontWeight: 600, color: R.color }}>{R.name} <span className="dim" style={{ fontWeight: 400 }}>· {R.desc}</span></div>
        <div className="note-text">BTC w tym reżimie (42 Macro): {R.btc}. S&amp;P 500: {R.spx}.</div>
      </div>}
      <div className="note-text mt8">Wpisz kierunki z najnowszych danych: <a className="accent" href="https://fred.stlouisfed.org/series/USALOLITONOSTSAM" target="_blank" rel="noopener noreferrer">OECD CLI (FRED)</a>, <a className="accent" href="https://www.bls.gov/cpi/" target="_blank" rel="noopener noreferrer">CPI (BLS)</a>, <a className="accent" href="https://42macro.com/" target="_blank" rel="noopener noreferrer">42 Macro</a>. Dane makro zostają ręczne, bo publiczne źródła nie są dostępne z aplikacji. Statystyki pochodzą ze slajdów 42 Macro w notatkach; dla BTC próba jest mała (7–22 miesięcy na reżim), więc to tło, a nie sygnał. Sprzedawaj wysoką betę najpierw przy przejściu do Inflacji/Deflacji (slajd z czynnikami: w Goldilocks prowadzi wysoka beta, w Deflacji niska). {st.updated ? `Ostatnia zmiana: ${new Date(st.updated).toLocaleDateString('pl-PL')}.` : ''}</div>
    </Card>
  );
}
