import { useEffect, useState } from 'react';
import { Card, Seg, Sheet, Switch, toast } from './ui';
import { PILLARS, weights, isFresh, zLabel, MANUAL_MAX_AGE_DAYS, type PillarId } from '../lib/pyramid';
import { normCdf } from '../lib/quant';
import { msToNextUtcClose } from '../lib/market';
import type { usePyramid } from '../lib/pyramidStore';

type P = ReturnType<typeof usePyramid>;
const tone = (z: number | null) => (z == null ? 'var(--faint)' : z >= 0.25 ? 'var(--green)' : z <= -0.25 ? 'var(--red)' : 'var(--amber)');
const fz = (z: number | null) => (z == null || !Number.isFinite(z) ? '—' : (z > 0 ? '+' : '') + z.toFixed(2) + 'σ');
const fp = (z: number | null) => (z == null || !Number.isFinite(z) ? '' : `P ${Math.round(normCdf(z) * 100)}%`);
const ago = (t: number | null) => {
  if (!t) return 'nigdy';
  const d = (Date.now() - t) / 86400000;
  return d < 1 / 24 ? 'przed chwilą' : d < 1 ? `${Math.floor(d * 24)} h temu` : `${Math.floor(d)} d temu`;
};

export function useCountdown() {
  const [ms, setMs] = useState(msToNextUtcClose());
  useEffect(() => { const id = setInterval(() => setMs(msToNextUtcClose()), 30000); return () => clearInterval(id); }, []);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h} h ${m} min`;
}

export function PyramidCard({ p }: { p: P }) {
  const [edit, setEdit] = useState<PillarId | null>(null);
  const w = weights(p.method);
  const countdown = useCountdown();
  const stale = PILLARS.filter((x) => !isFresh(p.state[x.id]));
  return (
    <>
      <Card className="hero">
        <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Piramida analizy</div>
          <span className="pill" style={{ color: tone(p.comp.z), background: 'var(--surface-3)' }}><span className="dot" />{zLabel(p.comp.z)}</span></div>
        <div className="flex mt12" style={{ alignItems: 'baseline', gap: 12 }}>
          <div className="big-number" style={{ color: tone(p.comp.z) }}>{fz(p.comp.z)}</div>
          <div className="dim" style={{ fontSize: 13 }}>P(korzystnie) {Math.round(p.comp.p * 100)}%<br />pokrycie wag {Math.round(p.comp.coverage * 100)}% · rozrzut {p.comp.dispersion.toFixed(2)}σ</div>
        </div>
        <div className="mt12" style={{ display: 'grid', gap: 6 }}>
          {PILLARS.map((x) => {
            const v = p.state[x.id];
            const fresh = isFresh(v);
            const width = 100 - (x.rank - 1) * 4;
            return (
              <button key={x.id} onClick={() => setEdit(x.id)} style={{ width: width + '%', margin: '0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'var(--surface-2)', border: `.5px solid ${fresh ? 'var(--line)' : 'var(--amber)'}`, textAlign: 'left' }}>
                <span className="faint num" style={{ fontSize: 11, width: 14 }}>{x.rank}</span>
                <span className="grow" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.short}</span>
                <span className="faint num" style={{ fontSize: 11 }}>{Math.round(w[x.id] * 100)}%</span>
                <span className="num" style={{ fontSize: 13.5, fontWeight: 600, color: tone(fresh ? v.z : null), minWidth: 58, textAlign: 'right' }}>{fresh ? fz(v.z) : x.auto ? '…' : '!'}</span>
              </button>
            );
          })}
        </div>
        {stale.length > 0 && <div className="warn-box mt12" style={{ marginBottom: 0 }}>Do uzupełnienia: {stale.map((s) => s.name).join(', ')}. Dotknij filar, aby zaktualizować. Ręczne wpisy ważą {MANUAL_MAX_AGE_DAYS} dni.</div>}
        <div className="hr" />
        <div className="dim" style={{ fontSize: 12.5 }}>Model rozkładu normalnego: każdy filar to z-score (σ), P = Φ(z). Auto: dane do {p.auto?.date ?? '—'} · kolejne zamknięcie 00:00 UTC za {countdown}</div>
        <div className="mt12"><Seg value={p.method} onChange={p.setMethod} options={[{ v: 'roc', l: 'Wagi ROC' }, { v: 'linear', l: 'Liniowe' }, { v: 'equal', l: 'Równe' }]} /></div>
      </Card>
      <PillarSheet p={p} id={edit} onClose={() => setEdit(null)} />
    </>
  );
}

/** Free numeric σ entry (e.g. 0.5, -1.75); accepts comma or dot, clipped to ±3σ. */
function SigmaInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => { setTxt(value == null ? '' : String(value)); }, [value]);
  const commit = () => {
    const t = txt.replace(',', '.').replace('−', '-').trim();
    if (t === '') return onChange(null);
    const n = parseFloat(t);
    if (Number.isFinite(n)) { const c = Math.max(-3, Math.min(3, Math.round(n * 100) / 100)); setTxt(String(c)); onChange(c); }
    else setTxt(value == null ? '' : String(value));
  };
  return (
    <span className="flex" style={{ gap: 4 }}>
      <input className="input" style={{ width: 96, textAlign: 'center' }} inputMode="decimal" placeholder="np. -1,75" value={txt}
        onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <span className="dim">σ</span>
    </span>
  );
}

function PillarSheet({ p, id, onClose }: { p: P; id: PillarId | null; onClose: () => void }) {
  const def = PILLARS.find((x) => x.id === id);
  const cur = id ? p.manual[id] : undefined;
  const [z, setZ] = useState<number>(cur?.z ?? 0);
  const [note, setNote] = useState(cur?.note ?? '');
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  useEffect(() => {
    setZ(cur?.z ?? 0); setNote(cur?.note ?? '');
    const n = PILLARS.find((x) => x.id === id)?.rubric?.length ?? 0;
    setAnswers(cur?.answers?.length === n ? cur.answers : new Array(n).fill(null));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def || !id) return null;
  const answer = (i: number, raw: number | null) => {
    const next = [...answers]; next[i] = raw; setAnswers(next);
    // pillar z = mean of direction-adjusted readings
    const vals = next.map((v, k) => (v == null ? null : def.rubric![k].invert ? -v : v)).filter((x): x is number => x != null);
    if (vals.length) setZ(Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100);
  };
  const v = p.state[id];
  const override = !!(p.overrides as Record<string, boolean>)[id];
  const editable = !def.auto || override;
  return (
    <Sheet open={!!id} onClose={onClose} title={`${def.rank}. ${def.name}`}>
      <div className="note-text mb12">{def.source} · waga {Math.round(weights(p.method)[id] * 100)}%</div>
      <Card className="tight">
        <div className="row"><span>Bieżąca wartość</span><span className="num" style={{ color: tone(v.z), fontWeight: 600 }}>{fz(v.z)} {fp(v.z)}</span></div>
        <div className="row"><span>Aktualizacja</span><span className="dim">{ago(v.updated)}{v.detail ? ` · ${v.detail}` : ''}</span></div>
        {def.verify?.map((x) => <div key={x.url} className="row"><span>Sprawdź źródło</span><a href={x.url} target="_blank" rel="noopener noreferrer" className="accent" style={{ textDecoration: 'none' }}>↗ {x.label}</a></div>)}
        {def.auto && <div className="row"><div className="grow"><div>Ręczna korekta</div><div className="faint" style={{ fontSize: 12 }}>Zastępuje wartość automatyczną</div></div><Switch checked={override} onChange={(on) => p.setOverrides({ ...p.overrides, [id]: on })} /></div>}
      </Card>
      {editable && (
        <>
          {def.rubric && (
            <>
              <div className="section-title">Odczyt w <span style={{ textTransform: 'none' }}>σ</span> · {def.rubric.length} pytania</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {def.rubric.map((q, i) => (
                  <Card key={q.q} className="tight">
                    <div style={{ padding: '12px 14px 8px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{q.q}{q.invert ? <span className="faint" style={{ fontWeight: 400 }}> · wyżej = gorzej</span> : null}</div>
                      <div className="faint" style={{ fontSize: 12.5, margin: '2px 0 4px' }}>{q.measure}</div>
                      <a href={q.url} target="_blank" rel="noopener noreferrer" className="accent" style={{ fontSize: 13, textDecoration: 'none' }}>↗ {q.label}</a>
                    </div>
                    <div className="flex" style={{ padding: '0 14px 12px', gap: 8 }}>
                      <span className="dim" style={{ fontSize: 13 }}>Odczyt</span>
                      <SigmaInput value={answers[i]} onChange={(v) => answer(i, v)} />
                      {answers[i] != null && <span className="num" style={{ fontSize: 13, color: tone(q.invert ? -(answers[i] as number) : (answers[i] as number)) }}>→ {fz(q.invert ? -(answers[i] as number) : (answers[i] as number))}</span>}
                    </div>
                  </Card>
                ))}
              </div>
              <div className="note-text mt8">Wpisz odczyt w σ dla mierzonej wielkości (dowolna liczba od −3 do +3, np. 0,5 lub −1,75). z filaru = średnia odczytów, ze znakiem odwróconym tam, gdzie „wyżej = gorzej”. Możesz go poprawić poniżej.</div>
            </>
          )}
          <div className="section-title">z filaru</div>
          <div className="flex" style={{ justifyContent: 'center', gap: 8 }}><SigmaInput value={z} onChange={(v) => setZ(v ?? 0)} /></div>
          <div className="center mt8"><span className="num" style={{ color: tone(z), fontWeight: 600 }}>{fz(z)}</span> <span className="dim">· {fp(z)} · {zLabel(z)}</span></div>
          <div className="field mt12"><label>Notatka (opcjonalnie)</label><input className="input" value={note} placeholder="np. DXY przy dolnej wstędze" onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn primary block" onClick={() => { p.setPillar(id, z, note || undefined, answers.every((x) => x != null) && answers.length ? (answers as number[]) : undefined); toast('Zapisano'); onClose(); }}>Zapisz</button>
        </>
      )}
    </Sheet>
  );
}
