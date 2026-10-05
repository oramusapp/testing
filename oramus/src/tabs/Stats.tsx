import { useMemo } from 'react';
import { Screen, Card, Seg } from '../components/ui';
import { usePersisted } from '../lib/db';
import { normCdf, linfit, spearman, probit } from '../lib/quant';

const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('pl-PL', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const parse = (t: string) => t.replace(/;/g, ' ').split(/[\s\n]+/).map((x) => parseFloat(x.replace(',', '.').replace('−', '-'))).filter(Number.isFinite);

/** Standard deviation, z-score and normal-table probability, step by step as in the statistics lessons. */
export default function Stats({ nav }: { nav?: React.ReactNode }) {
  const [st0, setSt] = usePersisted<{ data: string; x: string; mode?: 'data' | 'params' | 'corr'; cx?: string; cy?: string; mu?: string; sd?: string; a?: string; b?: string }>('tools.stats', { data: '56 65 74 75 76 77 77 87 88', x: '80' });
  const st = { mode: 'data' as 'data' | 'params' | 'corr', mu: '30', sd: '5', a: '', b: '', cx: '540 600 700 760 820 860 900 950 1000 1060 1120 1300', cy: '8500 7800 9100 8200 9900 9800 10300 11100 11300 10700 8900 11300', ...st0 };
  const pf = (t: string) => parseFloat(t.replace(',', '.').replace('−', '-'));
  const xs = useMemo(() => parse(st.data), [st.data]);
  const byData = st.mode === 'data';
  const n = byData ? xs.length : 0;
  const mu = byData ? (n ? xs.reduce((a, b) => a + b, 0) / n : NaN) : pf(st.mu);
  const ss = xs.reduce((a, b) => a + (b - mu) ** 2, 0);
  const sigma = byData ? (n ? Math.sqrt(ss / n) : NaN) : pf(st.sd);   // population σ (÷N), as in the lesson
  const A = st.a.trim() === '' ? mu - sigma : pf(st.a), B = st.b.trim() === '' ? mu + sigma : pf(st.b);
  const pAB = normCdf((Math.max(A, B) - mu) / sigma) - normCdf((Math.min(A, B) - mu) / sigma);
  const s = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;      // sample s (÷N−1)
  const x = parseFloat(st.x.replace(',', '.').replace('−', '-'));
  const z = (x - mu) / sigma;
  const below = normCdf(z);
  return (
    <Screen nav={nav} title="Statystyka" subtitle="Odchylenie standardowe · z-score · tablica rozkładu normalnego">
      <Seg value={st.mode} onChange={(m) => setSt({ ...st, mode: m })} options={[{ v: 'data', l: 'Lista danych' }, { v: 'params', l: 'Znane μ i σ' }, { v: 'corr', l: 'Korelacja' }]} />
      <div className="mt12" />
      {st.mode === 'corr' && <Corr x={st.cx} y={st.cy} set={(cx, cy) => setSt({ ...st, cx, cy })} />}
      {st.mode !== 'corr' && <>
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
          <input className="input" style={{ width: 80 }} inputMode="decimal" placeholder={num(mu - sigma, 1)} value={st.a} onChange={(e) => setSt({ ...st, a: e.target.value })} />
          <span className="dim" style={{ fontSize: 14 }}>do</span>
          <input className="input" style={{ width: 80 }} inputMode="decimal" placeholder={num(mu + sigma, 1)} value={st.b} onChange={(e) => setSt({ ...st, b: e.target.value })} />
        </div>
        <div className="row compact"><span>Szansa na wartość w przedziale</span><span className="num" style={{ fontWeight: 600 }}>{num(pAB * 100, 2)}%</span></div>
        <div className="note-text mt8">Reguła 68–95–99,7: w rozkładzie normalnym 68% danych mieści się w ±1σ od średniej, 95% w ±2σ, 99,7% w ±3σ. z między −1 a +1 to wartość typowa. Model normalny pasuje tylko do danych jednomodalnych i symetrycznych; ceny trendujące (niestacjonarne) najpierw trzeba przekształcić.</div>
      </Card>
      {byData && n >= 5 && <QQ xs={xs} mu={mu} sigma={sigma} />}
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
      </>}
    </Screen>
  );
}

const strength = (r: number) => { const a = Math.abs(r); const w = a >= 0.99 ? 'idealna' : a >= 0.7 ? 'wysoka' : a >= 0.3 ? 'niska' : 'brak'; return w === 'brak' ? 'brak korelacji' : `${w} ${r > 0 ? 'dodatnia' : 'ujemna'}`; };

/** Scatter plot with Pearson r, R² and the least-squares line (lesson: scatterplots, correlation, regression). */
function Corr({ x, y, set }: { x: string; y: string; set: (x: string, y: string) => void }) {
  const xs = parse(x), ys = parse(y), n = Math.min(xs.length, ys.length);
  const f = linfit(xs.slice(0, n), ys.slice(0, n));
  const rho = spearman(xs, ys);
  // outliers: residual from the fit beyond 2.5 standard deviations of the residuals
  const res = xs.slice(0, n).map((v, i) => ys[i] - (f.a + f.b * v));
  const rsd = Math.sqrt(res.reduce((a, v) => a + v * v, 0) / Math.max(n - 2, 1));
  const out = res.map((v) => Math.abs(v) > 2.5 * rsd);
  const keep = xs.slice(0, n).map((v, i) => [v, ys[i]] as const).filter((_, i) => !out[i]);
  const f2 = out.some(Boolean) ? linfit(keep.map((k) => k[0]), keep.map((k) => k[1])) : null;
  const W = 320, H = 200, L = 40, R = 10, T = 10, B = 24;
  const [x0, x1] = [Math.min(...xs.slice(0, n)), Math.max(...xs.slice(0, n))], [y0, y1] = [Math.min(...ys.slice(0, n)), Math.max(...ys.slice(0, n))];
  const sx = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), sy = (v: number) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
  return (
    <>
      <Card>
        <div className="eyebrow" style={{ margin: 0 }}>Zmienna x</div>
        <textarea className="input mt8" style={{ width: '100%', minHeight: 60, fontFamily: 'inherit' }} value={x} onChange={(e) => set(e.target.value, y)} />
        <div className="eyebrow mt12" style={{ margin: 0 }}>Zmienna y</div>
        <textarea className="input mt8" style={{ width: '100%', minHeight: 60, fontFamily: 'inherit' }} value={y} onChange={(e) => set(x, e.target.value)} />
        {xs.length !== ys.length && <div className="warn-box mt8">Listy mają różną długość ({xs.length} i {ys.length}); liczę pierwsze {n} par.</div>}
      </Card>
      {n >= 3 && (
        <Card>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Wykres punktowy">
            <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--faint)" /><line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--faint)" />
            {xs.slice(0, n).map((v, i) => <circle key={i} cx={sx(v)} cy={sy(ys[i])} r={out[i] ? 5 : 3.5} fill={out[i] ? 'none' : 'var(--text)'} stroke={out[i] ? 'var(--red)' : 'none'} strokeWidth={2} opacity={0.85} />)}
            {Number.isFinite(f.b) && <line x1={sx(x0)} y1={sy(f.a + f.b * x0)} x2={sx(x1)} y2={sy(f.a + f.b * x1)} stroke="var(--accent)" strokeWidth={2} />}
            <text x={L} y={H - 6} fontSize={9} fill="var(--faint)">{num(x0)}</text><text x={W - R} y={H - 6} fontSize={9} fill="var(--faint)" textAnchor="end">{num(x1)}</text>
            <text x={L - 4} y={H - B} fontSize={9} fill="var(--faint)" textAnchor="end">{num(y0)}</text><text x={L - 4} y={T + 8} fontSize={9} fill="var(--faint)" textAnchor="end">{num(y1)}</text>
          </svg>
          <div className="row compact"><span>Korelacja r</span><span className="num" style={{ fontWeight: 600 }}>{num(f.r, 3)} · {strength(f.r)}</span></div>
          <div className="row compact"><span>Korelacja rangowa Spearmana ρ</span><span className="num">{num(rho, 3)}</span></div>
          {f2 && <div className="row compact"><span>r bez odstających ({out.filter(Boolean).length})</span><span className="num">{num(f2.r, 3)}</span></div>}
          <div className="row compact"><span>R² (siła wyjaśniania, 0–1)</span><span className="num">{num(f.r2, 3)}</span></div>
          <div className="row compact"><span>Prosta regresji</span><span className="num">y = {num(f.a)} {f.b >= 0 ? '+' : '−'} {num(Math.abs(f.b), 4)}·x</span></div>
          <div className="note-text mt8">Regresja wybiera prostą o najmniejszej sumie kwadratów odległości punktów od niej. r mierzy siłę i kierunek zależności liniowej (od −1 do +1), R² = r² mówi, jaką część zmienności y wyjaśnia x. Punkty odstające (czerwone kółka, reszta &gt; 2,5σ) mocno zmieniają r; sprawdź, czy to błąd danych, czy szczególna sytuacja, zanim je pominiesz. r mierzy tylko zależność liniową: krzywa lub fala może mieć r = 0 mimo silnego związku, a duże r nie gwarantuje, że prosta pasuje. Spearman ρ porównuje rangi, więc wychwytuje zależności rosnące lub malejące także nieliniowe i jest mniej czuły na odstające. Korelacja nie oznacza przyczynowości.</div>
        </Card>
      )}
    </>
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

/** Normal Q-Q plot: sorted data vs normal quantiles. Points on the line = data roughly normal. */
function QQ({ xs, mu, sigma }: { xs: number[]; mu: number; sigma: number }) {
  const v = [...xs].sort((a, b) => a - b), n = v.length;
  const th = v.map((_, i) => mu + sigma * probit((i + 0.5) / n));
  const lo = Math.min(v[0], th[0]), hi = Math.max(v[n - 1], th[n - 1]);
  const W = 300, H = 220, M = 30, sc = (x: number) => M + ((x - lo) / (hi - lo || 1)) * (W - 2 * M), sy = (y: number) => H - M - ((y - lo) / (hi - lo || 1)) * (H - 2 * M);
  return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Wykres Q-Q względem rozkładu normalnego</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }} role="img" aria-label="Wykres Q-Q">
        <line x1={sc(lo)} y1={sy(lo)} x2={sc(hi)} y2={sy(hi)} stroke="var(--accent)" strokeWidth={1.5} />
        <line x1={M} x2={W - M} y1={H - M} y2={H - M} stroke="var(--faint)" /><line x1={M} x2={M} y1={M} y2={H - M} stroke="var(--faint)" />
        {v.map((y, i) => <circle key={i} cx={sc(th[i])} cy={sy(y)} r={3} fill="var(--text)" opacity={0.8} />)}
        <text x={W / 2} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--faint)">kwantyle rozkładu normalnego</text>
        <text x={10} y={H / 2} fontSize={9} textAnchor="middle" fill="var(--faint)" transform={`rotate(-90 10 ${H / 2})`}>dane</text>
      </svg>
      <div className="note-text">Punkty blisko linii: dane mniej więcej normalne, więc z-score i procenty z tablicy są wiarygodne. Końce uciekające od linii oznaczają grube ogony (częstsze skrajne wartości niż w rozkładzie normalnym, typowe dla zwrotów krypto) albo skośność.</div>
    </Card>
  );
}
