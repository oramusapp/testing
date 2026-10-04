import { useEffect, useState } from 'react';
import { Card, Seg, Sheet, Switch, toast } from './ui';
import { PILLARS, weights, isFresh, scoreLabel, MANUAL_MAX_AGE_DAYS, type PillarId } from '../lib/pyramid';
import { msToNextUtcClose } from '../lib/market';
import type { usePyramid } from '../lib/pyramidStore';

type P = ReturnType<typeof usePyramid>;
const tone = (s: number | null) => (s == null ? 'var(--faint)' : s >= 0.15 ? 'var(--green)' : s <= -0.15 ? 'var(--red)' : 'var(--amber)');
const fmt = (s: number | null) => (s == null ? '—' : (s > 0 ? '+' : '') + s.toFixed(2));
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
          <span className="pill" style={{ color: tone(p.comp.score), background: 'var(--surface-3)' }}><span className="dot" />{scoreLabel(p.comp.score)}</span></div>
        <div className="flex mt12" style={{ alignItems: 'baseline', gap: 12 }}>
          <div className="big-number" style={{ color: tone(p.comp.score) }}>{fmt(p.comp.score)}</div>
          <div className="dim" style={{ fontSize: 13 }}>pokrycie wag {Math.round(p.comp.coverage * 100)}%<br />zgodność filarów {Math.round(p.comp.agreement * 100)}%</div>
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
                <span className="num" style={{ fontSize: 13.5, fontWeight: 600, color: tone(fresh ? v.score : null), minWidth: 40, textAlign: 'right' }}>{fresh ? fmt(v.score) : x.auto ? '…' : '!'}</span>
              </button>
            );
          })}
        </div>
        {stale.length > 0 && <div className="warn-box mt12" style={{ marginBottom: 0 }}>Do uzupełnienia: {stale.map((s) => s.name).join(', ')}. Dotknij filar, aby zaktualizować. Ręczne wpisy ważą {MANUAL_MAX_AGE_DAYS} dni.</div>}
        <div className="hr" />
        <div className="between" style={{ fontSize: 12.5 }}>
          <span className="dim">Auto: dane do {p.auto?.date ?? '—'} · kolejne zamknięcie 00:00 UTC za {countdown}</span>
        </div>
        <div className="mt12"><Seg value={p.method} onChange={p.setMethod} options={[{ v: 'roc', l: 'Wagi ROC' }, { v: 'linear', l: 'Liniowe' }, { v: 'equal', l: 'Równe' }]} /></div>
      </Card>
      <PillarSheet p={p} id={edit} onClose={() => setEdit(null)} />
    </>
  );
}

const STEPS = [-1, -0.5, 0, 0.5, 1];
const STEP_LABEL = ['Silnie negatywny', 'Negatywny', 'Neutralny', 'Pozytywny', 'Silnie pozytywny'];

function PillarSheet({ p, id, onClose }: { p: P; id: PillarId | null; onClose: () => void }) {
  const def = PILLARS.find((x) => x.id === id);
  const cur = id ? p.manual[id] : undefined;
  const [score, setScore] = useState<number>(cur?.score ?? 0);
  const [note, setNote] = useState(cur?.note ?? '');
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  useEffect(() => {
    setScore(cur?.score ?? 0); setNote(cur?.note ?? '');
    const n = PILLARS.find((x) => x.id === id)?.rubric?.length ?? 0;
    setAnswers(cur?.answers?.length === n ? cur.answers : new Array(n).fill(null));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (i: number, v: number) => {
    const next = [...answers]; next[i] = v; setAnswers(next);
    const done = next.filter((x): x is number => x != null);
    if (done.length) setScore(Math.round((done.reduce((a, b) => a + b, 0) / done.length) * 2) / 2);   // nearest 0.5
  };
  if (!def || !id) return null;
  const v = p.state[id];
  const override = !!(p.overrides as Record<string, boolean>)[id];
  const editable = !def.auto || override;
  return (
    <Sheet open={!!id} onClose={onClose} title={`${def.rank}. ${def.name}`}>
      <div className="note-text mb12">{def.source} · waga {Math.round(weights(p.method)[id] * 100)}%</div>
      <Card className="tight">
        <div className="row"><span>Bieżąca wartość</span><span className="num" style={{ color: tone(v.score), fontWeight: 600 }}>{fmt(v.score)} · {v.score != null ? scoreLabel(v.score) : 'brak'}</span></div>
        <div className="row"><span>Aktualizacja</span><span className="dim">{ago(v.updated)}{v.detail ? ` · ${v.detail}` : ''}</span></div>
        {def.verify?.map((v) => <div key={v.url} className="row"><span>Sprawdź źródło</span><a href={v.url} target="_blank" rel="noopener noreferrer" className="accent" style={{ textDecoration: 'none' }}>↗ {v.label}</a></div>)}
        {def.auto && <div className="row"><div className="grow"><div>Ręczna korekta</div><div className="faint" style={{ fontSize: 12 }}>Zastępuje wartość automatyczną</div></div><Switch checked={override} onChange={(on) => p.setOverrides({ ...p.overrides, [id]: on })} /></div>}
      </Card>
      {editable && (
        <>
          {def.rubric ? (
            <>
              <div className="section-title">Standardowa ocena · {def.rubric.length} pytania</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {def.rubric.map((q, i) => (
                  <Card key={q.q} className="tight">
                    <div style={{ padding: '12px 14px 8px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{q.q}</div>
                      <a href={q.url} target="_blank" rel="noopener noreferrer" className="accent" style={{ fontSize: 13, textDecoration: 'none' }}>↗ {q.label}</a>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '0 10px 10px' }}>
                      {[[-1, q.minus], [0, 'neutralnie'], [1, q.plus]].map(([v, l]) => (
                        <button key={v as number} className="btn small" onClick={() => answer(i, v as number)}
                          style={{ height: 'auto', minHeight: 40, padding: '6px 8px', fontSize: 12.5, lineHeight: 1.25, whiteSpace: 'normal', ...(answers[i] === v ? { background: (v as number) > 0 ? 'var(--green-soft)' : (v as number) < 0 ? 'var(--red-soft)' : 'var(--accent-soft)', color: (v as number) > 0 ? 'var(--green)' : (v as number) < 0 ? 'var(--red)' : 'var(--accent)', borderColor: 'currentColor' } : {}) }}>
                          {(v as number) > 0 ? '+1 ' : (v as number) < 0 ? '−1 ' : '0 '}{l}
                        </button>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
              <div className="note-text mt8">Ocena filaru = średnia odpowiedzi, zaokrąglona do 0,5. Możesz ją zmienić poniżej.</div>
            </>
          ) : def.hints.length > 0 && <><div className="section-title">Na co patrzeć</div><ul className="note-text" style={{ margin: '0 0 8px', paddingLeft: 18 }}>{def.hints.map((h) => <li key={h}>{h}</li>)}</ul></>}
          <div className="section-title">Twoja ocena</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {STEPS.map((s, i) => (
              <button key={s} className="btn block" onClick={() => setScore(s)}
                style={score === s ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                <span className="num" style={{ minWidth: 42, textAlign: 'left' }}>{fmt(s)}</span><span className="grow" style={{ textAlign: 'left' }}>{STEP_LABEL[i]}</span>
              </button>
            ))}
          </div>
          <div className="field mt12"><label>Notatka (opcjonalnie)</label><input className="input" value={note} placeholder="np. Fed obniża stopy, DXY słabnie" onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn primary block" onClick={() => { p.setPillar(id, score, note || undefined, answers.every((x) => x != null) && answers.length ? (answers as number[]) : undefined); toast('Zapisano'); onClose(); }}>Zapisz ocenę</button>
        </>
      )}
    </Sheet>
  );
}
