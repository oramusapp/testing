import { useMemo, useState } from 'react';
import { Card, Seg } from './ui';
import { useBtc } from '../lib/btcStore';
import type { FG } from '../lib/pyramidStore';

type Ev = 'fgLow' | 'fgHigh' | 'drop' | 'vol' | 'ath' | 'smaUp' | 'smaDown';
const EVENTS: { v: Ev; l: string; unit?: string; def?: number }[] = [
  { v: 'fgLow', l: 'Fear & Greed poniżej', unit: '', def: 12 },
  { v: 'fgHigh', l: 'Fear & Greed powyżej', unit: '', def: 90 },
  { v: 'drop', l: 'Spadek dzienny co najmniej', unit: '%', def: 10 },
  { v: 'vol', l: 'Zmienność 30 d > k × mediana roczna', unit: '×', def: 2 },
  { v: 'ath', l: 'Nowy szczyt wszech czasów' },
  { v: 'smaUp', l: 'Cena przebija SMA 200 w górę' },
  { v: 'smaDown', l: 'Cena przebija SMA 200 w dół' }
];
const HZ = [7, 14, 30, 60, 90];
const HL: Record<number, string> = { 7: '1 tydz.', 14: '2 tyg.', 30: '1 mies.', 60: '2 mies.', 90: '3 mies.' };
const pc = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%` : '—');

/** Event study as in the statistical-significance lesson: returns after an event, overlaps excluded, z vs all days. */
export function EventStudyCard({ fg }: { fg: FG | null }) {
  const { model } = useBtc();
  const [ev, setEv] = useState<Ev>('fgLow');
  const [thr, setThr] = useState<string>('12');
  const [gap, setGap] = useState<'30' | '90'>('30');
  const def = EVENTS.find((e) => e.v === ev)!;
  const res = useMemo(() => {
    if (!model) return null;
    const { dates, prices } = model, n = prices.length, k = parseFloat(thr.replace(',', '.'));
    const from = dates.findIndex((d) => d >= '2014-01-01');
    const fgMap = new Map(fg?.hist ?? []);
    const sma = (i: number) => { if (i < 199) return NaN; let s = 0; for (let j = i - 199; j <= i; j++) s += prices[j]; return s / 200; };
    const lr = prices.map((p, i) => (i ? Math.log(p / prices[i - 1]) : 0));
    const vol = (i: number) => { if (i < 30) return NaN; let m = 0; for (let j = i - 29; j <= i; j++) m += lr[j]; m /= 30; let v = 0; for (let j = i - 29; j <= i; j++) v += (lr[j] - m) ** 2; return Math.sqrt(v / 29); };
    const vols = prices.map((_, i) => (i >= from - 400 ? vol(i) : NaN));
    let peak = 0; const athFlag = prices.map((p) => { const a = p >= peak; peak = Math.max(peak, p); return a; });
    const hit = (i: number): boolean => {
      switch (ev) {
        case 'fgLow': { const v = fgMap.get(dates[i]); return v != null && v < k; }
        case 'fgHigh': { const v = fgMap.get(dates[i]); return v != null && v > k; }
        case 'drop': return lr[i] <= Math.log(1 - k / 100);
        case 'vol': { const w = vols.slice(Math.max(0, i - 364), i + 1).filter(Number.isFinite).sort((a, b) => a - b); return w.length > 200 && vols[i] > k * w[Math.floor(w.length / 2)]; }
        case 'ath': return athFlag[i];
        case 'smaUp': return prices[i] > sma(i) && prices[i - 1] <= sma(i - 1);
        case 'smaDown': return prices[i] < sma(i) && prices[i - 1] >= sma(i - 1);
      }
    };
    const sig: number[] = []; const G = +gap;
    for (let i = Math.max(from, 1); i < n; i++) if (hit(i) && (!sig.length || i - sig[sig.length - 1] > G)) sig.push(i);
    const rows = HZ.map((h) => {
      const all: number[] = []; for (let i = from; i + h < n; i++) all.push(Math.log(prices[i + h] / prices[i]));
      const x = sig.filter((i) => i + h < n).map((i) => Math.log(prices[i + h] / prices[i])).sort((a, b) => a - b);
      const mA = all.reduce((a, b) => a + b, 0) / all.length, sA = Math.sqrt(all.reduce((a, b) => a + (b - mA) ** 2, 0) / (all.length - 1));
      const m = x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN;
      return { h, n: x.length, med: x.length ? Math.expm1(x[Math.floor(x.length / 2)]) : NaN, pos: x.length ? x.filter((v) => v > 0).length / x.length : NaN, z: x.length > 1 ? (m - mA) / (sA / Math.sqrt(x.length)) : NaN, allMed: Math.expm1([...all].sort((a, b) => a - b)[Math.floor(all.length / 2)]) };
    });
    return { sig: sig.map((i) => dates[i]), rows, needFg: (ev === 'fgLow' || ev === 'fgHigh') && !fg?.hist };
  }, [model, fg?.hist, ev, thr, gap]);
  return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Badanie zdarzeń · istotność statystyczna</div>
      <select className="input mt8" style={{ width: '100%' }} value={ev} onChange={(e) => { const v = e.target.value as Ev; setEv(v); const d = EVENTS.find((x) => x.v === v)!; if (d.def != null) setThr(String(d.def)); }}>
        {EVENTS.map((e) => <option key={e.v} value={e.v}>{e.l}</option>)}
      </select>
      <div className="flex mt8" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {def.unit != null && <label className="dim" style={{ fontSize: 13 }}>próg <input className="input" style={{ width: 70 }} inputMode="decimal" value={thr} onChange={(e) => setThr(e.target.value)} /> {def.unit}</label>}
        <span className="dim" style={{ fontSize: 13 }}>odstęp sygnałów</span><Seg value={gap} onChange={setGap} options={[{ v: '30', l: '30 d' }, { v: '90', l: '90 d' }]} />
      </div>
      {res?.needFg && <div className="note-text mt8">Czekam na historię Fear &amp; Greed (pobiera się raz dziennie).</div>}
      {res && !res.needFg && (
        <>
          <div className="scroll-x mt8">
            <table className="data">
              <thead><tr><th style={{ paddingLeft: 0 }}>Po</th><th>n</th><th>mediana</th><th>% &gt; 0</th><th>z</th><th style={{ paddingRight: 0 }}>wszystkie dni</th></tr></thead>
              <tbody>{res.rows.map((r) => (
                <tr key={r.h}><td style={{ paddingLeft: 0 }}>{HL[r.h]}</td><td>{r.n}</td><td className={r.med >= 0 ? 'green' : 'red'}>{pc(r.med)}</td>
                  <td>{Number.isFinite(r.pos) ? Math.round(r.pos * 100) + '%' : '—'}</td>
                  <td style={{ fontWeight: Math.abs(r.z) >= 2 ? 700 : 400, color: Math.abs(r.z) >= 2 ? 'var(--accent)' : undefined }}>{Number.isFinite(r.z) ? r.z.toFixed(1).replace('.', ',') : '—'}</td>
                  <td className="dim" style={{ paddingRight: 0 }}>{pc(r.allMed)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="note-text mt8">Sygnały od 2014: {res.sig.length}{res.sig.length ? ` (ostatni ${res.sig[res.sig.length - 1]})` : ''}. z = różnica średniego zwrotu po zdarzeniu i ze wszystkich dni w jednostkach błędu standardowego; |z| ≥ 2 sugeruje istotność. Oceniaj jak w lekcji: częstość (n), siłę efektu (mediana vs wszystkie dni) i proporcję wyników (% &gt; 0), a na końcu, czy istnieje logiczny powód. Przy wielu sprawdzanych zdarzeniach część wyników |z| ≥ 2 wyjdzie przypadkiem.</div>
        </>
      )}
    </Card>
  );
}
