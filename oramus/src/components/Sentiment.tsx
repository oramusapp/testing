import { useMemo } from 'react';
import { Card } from './ui';
import { useBtc } from '../lib/btcStore';
import { fgForward } from '../lib/quant';
import type { FG } from '../lib/pyramidStore';

const p1 = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%` : '—');

/** Lesson slide: Fear & Greed vs BTC return 20 days later, computed on the phone from the full F&G history. */
export function SentimentCard({ fg }: { fg: FG | null }) {
  const { model } = useBtc();
  const res = useMemo(() => (fg?.hist && model ? fgForward(fg.hist, model.dates, model.prices, 20) : null), [fg?.hist, model]);
  const now = fg?.value;
  return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Sentyment · F&amp;G a zwrot BTC po 20 dniach</div>
      {!res && <div className="dim mt8" style={{ fontSize: 14 }}>Czekam na historię Fear &amp; Greed (pobiera się raz dziennie).</div>}
      {res && (
        <>
          <div className="scroll-x mt8">
            <table className="data">
              <thead><tr><th style={{ paddingLeft: 0 }}>F&amp;G</th><th>dni</th><th>średnio</th><th>mediana</th><th style={{ paddingRight: 0 }}>% dodatnich</th></tr></thead>
              <tbody>{res.buckets.map((b) => {
                const cur = now != null && now >= b.lo && now < b.hi;
                return (
                  <tr key={b.label} style={cur ? { background: 'var(--accent-soft)' } : undefined}>
                    <td style={{ paddingLeft: 0, whiteSpace: 'nowrap' }}>{b.label}{cur ? ' ◀' : ''}</td><td>{b.n}</td>
                    <td className={b.mean >= res.mean ? 'green' : 'red'}>{p1(b.mean)}</td><td>{p1(b.median)}</td>
                    <td style={{ paddingRight: 0 }}>{Number.isFinite(b.pos) ? Math.round(b.pos * 100) + '%' : '—'}</td></tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="note-text mt8">Wszystkie dni: średnio {p1(res.mean)} (n = {res.n}). Korelacja liniowa F&amp;G ze zwrotem: r = {res.fit.r.toFixed(2).replace('.', ',')}, R² = {res.fit.r2.toFixed(3).replace('.', ',')}.{now != null ? ` Dziś F&G = ${now}.` : ''}</div>
          <div className="note-text mt8">Wg slajdu z kursu zależność ma kształt litery U: wyższe zwroty przy skrajnym strachu i przy chciwości powyżej 90. Filar sentymentu w piramidzie liczy F&amp;G liniowo i kontrariańsko (chciwość = minus). Jeśli ta tabela na Twoich danych pokazuje U, przy F&amp;G &gt; 90 rozważ ręczną korektę filaru. Nakładające się okna 20-dniowe zawyżają liczbę niezależnych obserwacji, więc różnice między przedziałami traktuj ostrożnie.</div>
        </>
      )}
    </Card>
  );
}
