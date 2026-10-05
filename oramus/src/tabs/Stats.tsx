import { useMemo } from 'react';
import { Screen, Card, Seg } from '../components/ui';
import { usePersisted } from '../lib/db';
import { normCdf } from '../lib/quant';

const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('pl-PL', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const parse = (t: string) => t.replace(/;/g, ' ').split(/[\s\n]+/).map((x) => parseFloat(x.replace(',', '.').replace('−', '-'))).filter(Number.isFinite);

/** Standard deviation, z-score and normal-table probability, step by step as in the statistics lessons. */
export default function Stats({ nav }: { nav?: React.ReactNode }) {
  const [st0, setSt] = usePersisted<{ data: string; x: string; mode?: 'data' | 'params'; mu?: string; sd?: string; a?: string; b?: string }>('tools.stats', { data: '56 65 74 75 76 77 77 87 88', x: '80' });
  const st = { mode: 'data' as const, mu: '30', sd: '5', a: '25', b: '35', ...st0 };
  const pf = (t: string) => parseFloat(t.replace(',', '.').replace('−', '-'));
  const xs = useMemo(() => parse(st.data), [st.data]);
  const byData = st.mode === 'data';
  const n = byData ? xs.length : 0;
  const mu = byData ? (n ? xs.reduce((a, b) => a + b, 0) / n : NaN) : pf(st.mu);
  const ss = xs.reduce((a, b) => a + (b - mu) ** 2, 0);
  const sigma = byData ? (n ? Math.sqrt(ss / n) : NaN) : pf(st.sd);   // population σ (÷N), as in the lesson
  const A = pf(st.a), B = pf(st.b);
  const pAB = normCdf((Math.max(A, B) - mu) / sigma) - normCdf((Math.min(A, B) - mu) / sigma);
  const s = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;      // sample s (÷N−1)
  const x = parseFloat(st.x.replace(',', '.').replace('−', '-'));
  const z = (x - mu) / sigma;
  const below = normCdf(z);
  return (
    <Screen nav={nav} title="Statystyka" subtitle="Odchylenie standardowe · z-score · tablica rozkładu normalnego">
      <Seg value={st.mode} onChange={(m) => setSt({ ...st, mode: m })} options={[{ v: 'data', l: 'Z listy danych' }, { v: 'params', l: 'Znane μ i σ' }]} />
      <div className="mt12" />
      {!byData && (
        <Card>
          <div className="flex" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="dim" style={{ fontSize: 14 }}>Średnia μ <input className="input" style={{ width: 90 }} inputMode="decimal" value={st.mu} onChange={(e) => setSt({ ...st, mu: e.target.value })} /></label>
            <label className="dim" style={{ fontSize: 14 }}>Odchylenie σ <input className="input" style={{ width: 90 }} inputMode="decimal" value={st.sd} onChange={(e) => setSt({ ...st, sd: e.target.value })} /></label>
            <label className="dim" style={{ fontSize: 14 }}>Punkt x <input className="input" style={{ width: 90 }} inputMode="decimal" value={st.x} onChange={(e) => setSt({ ...st, x: e.target.value })} /></label>
          </div>
          <div className="note-text mt8">Przykład z lekcji: czas dostawy pizzy μ = 30 min, σ = 5. Dla x = 17 wychodzi z = −2,6, czyli szansa na dostawę w mniej niż 17 minut to 0,47%.</div>
        </Card>
      )}
      {byData && <Card>
        <div className="eyebrow" style={{ margin: 0 }}>Dane</div>
        <textarea className="input mt8" style={{ width: '100%', minHeight: 84, fontFamily: 'inherit' }} value={st.data} onChange={(e) => setSt({ ...st, data: e.target.value })} placeholder="Wartości oddzielone spacją, nową linią lub średnikiem" />
        <div className="flex mt8" style={{ gap: 8, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 14 }}>Punkt x</span>
          <input className="input" style={{ width: 110 }} inputMode="decimal" value={st.x} onChange={(e) => setSt({ ...st, x: e.target.value })} />
        </div>
      </Card>}
      {Number.isFinite(mu) && sigma > 0 && <Bell mu={mu} sigma={sigma} x={x} />}
      <Card>
        {byData && <>
        <div className="row compact"><span>Liczba danych N</span><span className="num">{n}</span></div>
        <div className="row compact"><span>Średnia μ</span><span className="num">{num(mu)}</span></div>
        <div className="row compact"><span>Suma kwadratów Σ(x − μ)²</span><span className="num">{num(ss)}</span></div>
        <div className="row compact"><span>Wariancja Σ/N</span><span className="num">{num(ss / n)}</span></div>
        <div className="row compact"><span>Odchylenie σ = √(Σ/N)</span><span className="num" style={{ fontWeight: 600 }}>{num(sigma)}</span></div>
        <div className="row compact"><span>Odchylenie z próby s = √(Σ/(N−1))</span><span className="num">{num(s)}</span></div>
        </>}
        <div className="hr" />
        <div className="row compact"><span>z = (x − μ) / σ</span><span className="num" style={{ fontWeight: 600, color: Math.abs(z) > 1 ? 'var(--amber)' : undefined }}>{num(z)}</span></div>
        <div className="row compact"><span>Pole na lewo od z (tablica)</span><span className="num">{num(below, 4)}</span></div>
        <div className="row compact"><span>Odsetek danych poniżej x</span><span className="num">{num(below * 100, 2)}%</span></div>
        <div className="row compact"><span>Szansa na wartość ≥ x</span><span className="num">{num((1 - below) * 100, 2)}%</span></div>
        <div className="hr" />
        <div className="flex" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="dim" style={{ fontSize: 14 }}>Przedział od</span>
          <input className="input" style={{ width: 80 }} inputMode="decimal" value={st.a} onChange={(e) => setSt({ ...st, a: e.target.value })} />
          <span className="dim" style={{ fontSize: 14 }}>do</span>
          <input className="input" style={{ width: 80 }} inputMode="decimal" value={st.b} onChange={(e) => setSt({ ...st, b: e.target.value })} />
        </div>
        <div className="row compact"><span>Szansa na wartość w przedziale</span><span className="num" style={{ fontWeight: 600 }}>{num(pAB * 100, 2)}%</span></div>
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

/** Normal curve with ±1…3σ lines, band shares and the area left of x shaded. */
function Bell({ mu, sigma, x }: { mu: number; sigma: number; x: number }) {
  const W = 340, H = 150, L = 10, R = 10, T = 14, Bm = 30;
  const zx = (z: number) => L + ((z + 4) / 8) * (W - L - R);
  const pdf = (z: number) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const zy = (d: number) => H - Bm - (d / 0.4) * (H - T - Bm);
  const pts = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05);
  const path = pts.map((z, i) => `${i ? 'L' : 'M'}${zx(z).toFixed(1)} ${zy(pdf(z)).toFixed(1)}`).join('');
  const zc = Number.isFinite(x) ? Math.max(-4, Math.min(4, (x - mu) / sigma)) : null;
  const area = zc == null ? '' : `M${zx(-4)} ${zy(0)}` + pts.filter((z) => z <= zc).map((z) => `L${zx(z).toFixed(1)} ${zy(pdf(z)).toFixed(1)}`).join('') + `L${zx(zc)} ${zy(pdf(zc))}L${zx(zc)} ${zy(0)}Z`;
  const bands = [[-3, -2, '2,14%'], [-2, -1, '13,6%'], [-1, 0, '34,1%'], [0, 1, '34,1%'], [1, 2, '13,6%'], [2, 3, '2,14%']] as const;
  return (
    <Card>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Rozkład normalny">
        {area && <path d={area} fill="var(--accent)" opacity={0.28} />}
        {[-3, -2, -1, 1, 2, 3].map((z) => <line key={z} x1={zx(z)} x2={zx(z)} y1={T} y2={zy(0)} stroke="var(--line)" strokeDasharray="3 3" />)}
        <line x1={zx(0)} x2={zx(0)} y1={T} y2={zy(0)} stroke="var(--faint)" />
        <path d={path} fill="none" stroke="var(--text)" strokeWidth={1.6} />
        <line x1={L} x2={W - R} y1={zy(0)} y2={zy(0)} stroke="var(--faint)" />
        {bands.map(([a, b, t]) => <text key={a} x={(zx(a) + zx(b)) / 2} y={zy(0) - 4} fontSize={8.5} textAnchor="middle" fill="var(--dim)">{t}</text>)}
        {[-3, -2, -1, 0, 1, 2, 3].map((z) => <text key={z} x={zx(z)} y={H - 16} fontSize={9} textAnchor="middle" fill="var(--faint)">{z === 0 ? 'μ' : `${z > 0 ? '+' : '−'}${Math.abs(z)}σ`}</text>)}
        {[-3, -2, -1, 0, 1, 2, 3].map((z) => <text key={'v' + z} x={zx(z)} y={H - 4} fontSize={9} textAnchor="middle" fill="var(--dim)">{num(mu + z * sigma, 1)}</text>)}
        {zc != null && <line x1={zx(zc)} x2={zx(zc)} y1={T - 6} y2={zy(0)} stroke="var(--accent)" strokeWidth={2} />}
      </svg>
      <div className="note-text">Zacieniowane pole na lewo od x to odsetek wartości mniejszych od x.</div>
    </Card>
  );
}
