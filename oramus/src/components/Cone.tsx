import { useMemo, useState } from 'react';
import { Card, Seg } from './ui';

const Q = [0.1, 0.25, 0.5, 0.75, 0.9];
const quant = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const pc = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
const zoneOf = (r: number) => (r < 30 ? 0 : r < 70 ? 1 : 2);
const ZONES = ['tanio (<30%)', 'środek (30–70%)', 'drogo (>70%)'];

/** Probabilistic range of outcomes (lesson: value + trend bias the range), from historical days in the same state. */
export function ConeCard({ dates, prices, risk, ltpi }: { dates: string[]; prices: number[]; risk: number[]; ltpi: number[] }) {
  const [h, setH] = useState<'30' | '90'>('90');
  const H = +h, n = prices.length;
  const res = useMemo(() => {
    const zNow = zoneOf(risk[n - 1]), tNow = ltpi[n - 1] > 0 ? 1 : -1;
    const same: number[] = [], all: number[] = [];
    for (let i = 0; i + H < n; i++) {
      if (dates[i] < '2014-01-01' || !Number.isFinite(risk[i])) continue;
      const r = Math.log(prices[i + H] / prices[i]); all.push(r);
      if (zoneOf(risk[i]) === zNow && (ltpi[i] > 0 ? 1 : -1) === tNow) same.push(r);
    }
    return { zNow, tNow, same: same.length >= 60 ? Q.map((q) => quant(same, q)) : null, all: Q.map((q) => quant(all, q)), nSame: same.length, nAll: all.length,
      pos: same.length ? same.filter((x) => x > 0).length / same.length : NaN, posAll: all.filter((x) => x > 0).length / all.length };
  }, [dates, prices, risk, ltpi, H, n]);
  const qs = res.same ?? res.all, p0 = prices[n - 1];
  const W = 320, Hh = 170, L = 6, R = 52, T = 10, B = 18;
  const lo = Math.min(qs[0], res.all[0]), hi = Math.max(qs[4], res.all[4]);
  const sx = (d: number) => L + (d / H) * (W - L - R), sy = (lr: number) => T + ((hi - lr) / (hi - lo || 1)) * (Hh - T - B);
  const at = (q: number, d: number) => q * Math.sqrt(d / H);           // spread grows with √time
  const band = (a: number, b: number) => { const pts = Array.from({ length: 21 }, (_, k) => (k / 20) * H);
    return `M${pts.map((d) => `${sx(d).toFixed(1)} ${sy(at(a, d)).toFixed(1)}`).join('L')}L${pts.reverse().map((d) => `${sx(d).toFixed(1)} ${sy(at(b, d)).toFixed(1)}`).join('L')}Z`; };
  return (
    <Card>
      <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Probabilistyczny zakres</div><Seg value={h} onChange={setH} options={[{ v: '30', l: '30 dni' }, { v: '90', l: '90 dni' }]} /></div>
      <div className="dim mt8" style={{ fontSize: 13 }}>Stan dziś: wycena {ZONES[res.zNow]}, LTPI {res.tNow > 0 ? 'dodatnie' : 'ujemne'} · {res.nSame} podobnych dni od 2014</div>
      <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }} role="img" aria-label="Stożek prawdopodobieństwa">
        <path d={band(qs[0], qs[4])} fill="var(--accent)" opacity={0.16} />
        <path d={band(qs[1], qs[3])} fill="var(--accent)" opacity={0.28} />
        <path d={`M${sx(0)} ${sy(0)}` + Array.from({ length: 21 }, (_, k) => `L${sx((k / 20) * H).toFixed(1)} ${sy(at(qs[2], (k / 20) * H)).toFixed(1)}`).join('')} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {res.same && [res.all[0], res.all[4]].map((q, i) => <path key={i} d={`M${sx(0)} ${sy(0)}` + Array.from({ length: 21 }, (_, k) => `L${sx((k / 20) * H).toFixed(1)} ${sy(at(q, (k / 20) * H)).toFixed(1)}`).join('')} fill="none" stroke="var(--faint)" strokeDasharray="3 3" />)}
        <line x1={sx(0)} x2={sx(H)} y1={sy(0)} y2={sy(0)} stroke="var(--line)" />
        {qs.map((q, i) => (i % 2 === 0) && <text key={i} x={W - R + 4} y={sy(q) + 3} fontSize={9} fill="var(--dim)">{Math.round(p0 * Math.exp(q)).toLocaleString('pl-PL')}</text>)}
        <text x={sx(0)} y={Hh - 4} fontSize={9} fill="var(--faint)">dziś</text><text x={sx(H)} y={Hh - 4} fontSize={9} textAnchor="end" fill="var(--faint)">+{H} d</text>
      </svg>
      <div className="row compact"><span>Mediana / szansa na wzrost</span><span className="num">{pc(Math.exp(qs[2]) - 1)} · {Math.round((res.same ? res.pos : res.posAll) * 100)}%</span></div>
      <div className="row compact"><span>Zakres 50% (P25–P75)</span><span className="num">{pc(Math.exp(qs[1]) - 1)} … {pc(Math.exp(qs[3]) - 1)}</span></div>
      <div className="row compact"><span>Zakres 80% (P10–P90)</span><span className="num">{pc(Math.exp(qs[0]) - 1)} … {pc(Math.exp(qs[4]) - 1)}</span></div>
      <div className="row compact"><span>Wszystkie dni (dla porównania)</span><span className="num dim">{pc(Math.exp(res.all[2]) - 1)} · {Math.round(res.posAll * 100)}%</span></div>
      <div className="note-text mt8">To rozkład wyników z przeszłości w tym samym stanie, a nie prognoza ceny. Wysoka wartość i dodatni trend przesuwały zakres w górę, środek wyceny przy ujemnym LTPI w dół (90 dni: mediana −14%, 31% dni na plusie; research/run30.py). Przerywane linie: zakres 80% dla wszystkich dni. Strefy wyceny liczone są modelem dopasowanym na całej historii, a okna się nakładają, więc rzeczywista niepewność jest większa.</div>
    </Card>
  );
}
