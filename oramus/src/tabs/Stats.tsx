import { useMemo } from 'react';
import { Screen, Card } from '../components/ui';
import { usePersisted } from '../lib/db';
import { normCdf } from '../lib/quant';

const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('pl-PL', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const parse = (t: string) => t.replace(/;/g, ' ').split(/[\s\n]+/).map((x) => parseFloat(x.replace(',', '.').replace('−', '-'))).filter(Number.isFinite);

/** Standard deviation, z-score and normal-table probability, step by step as in the statistics lessons. */
export default function Stats({ nav }: { nav?: React.ReactNode }) {
  const [st, setSt] = usePersisted<{ data: string; x: string }>('tools.stats', { data: '56 65 74 75 76 77 77 87 88', x: '80' });
  const xs = useMemo(() => parse(st.data), [st.data]);
  const n = xs.length;
  const mu = n ? xs.reduce((a, b) => a + b, 0) / n : NaN;
  const ss = xs.reduce((a, b) => a + (b - mu) ** 2, 0);
  const sigma = n ? Math.sqrt(ss / n) : NaN;            // population σ (÷N), as in the lesson
  const s = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;      // sample s (÷N−1)
  const x = parseFloat(st.x.replace(',', '.').replace('−', '-'));
  const z = (x - mu) / sigma;
  const below = normCdf(z);
  return (
    <Screen nav={nav} title="Statystyka" subtitle="Odchylenie standardowe · z-score · tablica rozkładu normalnego">
      <Card>
        <div className="eyebrow" style={{ margin: 0 }}>Dane</div>
        <textarea className="input mt8" style={{ width: '100%', minHeight: 84, fontFamily: 'inherit' }} value={st.data} onChange={(e) => setSt({ ...st, data: e.target.value })} placeholder="Wartości oddzielone spacją, nową linią lub średnikiem" />
        <div className="flex mt8" style={{ gap: 8, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 14 }}>Punkt x</span>
          <input className="input" style={{ width: 110 }} inputMode="decimal" value={st.x} onChange={(e) => setSt({ ...st, x: e.target.value })} />
        </div>
      </Card>
      <Card>
        <div className="row compact"><span>Liczba danych N</span><span className="num">{n}</span></div>
        <div className="row compact"><span>Średnia μ</span><span className="num">{num(mu)}</span></div>
        <div className="row compact"><span>Suma kwadratów Σ(x − μ)²</span><span className="num">{num(ss)}</span></div>
        <div className="row compact"><span>Wariancja Σ/N</span><span className="num">{num(ss / n)}</span></div>
        <div className="row compact"><span>Odchylenie σ = √(Σ/N)</span><span className="num" style={{ fontWeight: 600 }}>{num(sigma)}</span></div>
        <div className="row compact"><span>Odchylenie z próby s = √(Σ/(N−1))</span><span className="num">{num(s)}</span></div>
        <div className="hr" />
        <div className="row compact"><span>z = (x − μ) / σ</span><span className="num" style={{ fontWeight: 600, color: Math.abs(z) > 1 ? 'var(--amber)' : undefined }}>{num(z)}</span></div>
        <div className="row compact"><span>Pole na lewo od z (tablica)</span><span className="num">{num(below, 4)}</span></div>
        <div className="row compact"><span>Odsetek danych poniżej x</span><span className="num">{num(below * 100, 2)}%</span></div>
        <div className="row compact"><span>Szansa na wartość ≥ x</span><span className="num">{num((1 - below) * 100, 2)}%</span></div>
        <div className="note-text mt8">Reguła 68–95–99,7: w rozkładzie normalnym 68% danych mieści się w ±1σ od średniej, 95% w ±2σ, 99,7% w ±3σ. z między −1 a +1 to wartość typowa. Model normalny pasuje tylko do danych jednomodalnych i symetrycznych; ceny trendujące (niestacjonarne) najpierw trzeba przekształcić.</div>
      </Card>
      {n > 0 && n <= 40 && (
        <Card className="tight">
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th style={{ paddingLeft: 16 }}>xᵢ</th><th>xᵢ − μ</th><th>(xᵢ − μ)²</th><th style={{ paddingRight: 16 }}>z</th></tr></thead>
              <tbody>{xs.map((v, i) => <tr key={i}><td style={{ paddingLeft: 16 }}>{num(v)}</td><td>{num(v - mu)}</td><td>{num((v - mu) ** 2)}</td><td style={{ paddingRight: 16 }}>{num((v - mu) / sigma)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
    </Screen>
  );
}
