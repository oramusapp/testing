import { useMemo } from 'react';
import { Card } from './ui';
import { useBtc } from '../lib/btcStore';

const M = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

/** BTC month-of-year returns since 2013 with t-statistics (seasonal component of the decomposition). */
export function SeasonalityCard() {
  const { model } = useBtc();
  const rows = useMemo(() => {
    if (!model) return null;
    const g: number[][] = Array.from({ length: 12 }, () => []);
    for (let i = 1; i < model.prices.length; i++) {
      const d = model.dates[i]; if (d < '2013-01-01') continue;
      g[+d.slice(5, 7) - 1].push(Math.log(model.prices[i] / model.prices[i - 1]));
    }
    return g.map((a, k) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
      return { k, month: Math.exp(m * 30.4) - 1, t: m / (sd / Math.sqrt(a.length)) }; });
  }, [model]);
  if (!rows) return null;
  const cur = new Date().getUTCMonth(), max = Math.max(...rows.map((r) => Math.abs(r.month)));
  return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Sezonowość BTC · miesiące od 2013</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3, alignItems: 'end', height: 90, marginTop: 10 }}>
        {rows.map((r) => <div key={r.k} title={`${M[r.k]}: ${(r.month * 100).toFixed(1)}%, t ${r.t.toFixed(2)}`} style={{ height: `${Math.max(3, (Math.abs(r.month) / max) * 100)}%`, background: r.month >= 0 ? 'var(--green)' : 'var(--red)', opacity: r.k === cur ? 1 : Math.abs(r.t) >= 2 ? 0.8 : 0.4, borderRadius: 2, outline: r.k === cur ? '2px solid var(--accent)' : undefined }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 3, marginTop: 4 }}>{rows.map((r) => <div key={r.k} className="faint" style={{ fontSize: 9.5, textAlign: 'center' }}>{M[r.k]}</div>)}</div>
      <div className="note-text mt8">Teraz: {M[cur]} · średnio {(rows[cur].month * 100).toFixed(1).replace('.', ',')}% (t = {rows[cur].t.toFixed(2).replace('.', ',')}). Mocniejszy kolor = |t| ≥ 2. Backtest (research/run29.py): średnie miesięcy z lat 2013–19 i 2020–26 korelowały tylko w 0,19, test Kruskala-Wallisa nie wykazał różnic między miesiącami, a filtr sezonowy od 2020 obniżał Sharpe (0,84 vs 0,92). Tylko październik był dodatni w obu okresach; przy 12 miesiącach to może być przypadek. Sezonowość nie wchodzi do sygnałów.</div>
    </Card>
  );
}
