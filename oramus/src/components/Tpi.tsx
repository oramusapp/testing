import { useState } from 'react';
import { Card } from './ui';
import type { TpiResult } from '../lib/tpi';
import { HYSTERESIS } from '../lib/tpi';

const tone = (v: number) => (v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--amber)');
const f = (v: number) => (v > 0 ? '+' : '') + v.toFixed(2);

/** TPI summary with the vote of every component indicator. */
export function TpiCard({ title, res, note, stateLabel }: { title: string; res: TpiResult; note: string; stateLabel?: boolean }) {
  const [open, setOpen] = useState(false);
  const up = res.votes.filter((v) => v.vote > 0).length;
  return (
    <Card>
      <div className="between">
        <div className="eyebrow" style={{ margin: 0 }}>{title}</div>
        {stateLabel && <span className="pill" style={{ color: tone(res.state), background: 'var(--surface-3)' }}><span className="dot" />{res.state > 0 ? 'Stan: pozytywny' : res.state < 0 ? 'Stan: negatywny' : 'Stan: brak'}</span>}
      </div>
      <div className="flex mt8" style={{ alignItems: 'baseline', gap: 10 }}>
        <div className="mid-number" style={{ color: tone(res.value) }}>{f(res.value)}</div>
        <div className="dim" style={{ fontSize: 13 }}>{up}/{res.votes.length} wskaźników w górę</div>
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
        {res.votes.map((v) => <div key={v.name} title={v.name} style={{ flex: 1, height: 8, borderRadius: 2, background: v.vote > 0 ? 'var(--green)' : v.vote < 0 ? 'var(--red)' : 'var(--surface-3)' }} />)}
      </div>
      <button className="text-btn mt8" style={{ fontSize: 14 }} onClick={() => setOpen(!open)}>{open ? 'Ukryj wskaźniki' : 'Pokaż wskaźniki'}</button>
      {open && (
        <div className="mt8">
          {res.votes.map((v) => (
            <div key={v.name} className="row compact"><span style={{ fontSize: 14 }}>{v.name}</span><span className="num" style={{ color: tone(v.vote), fontWeight: 600 }}>{v.vote > 0 ? '▲ +1' : v.vote < 0 ? '▼ −1' : '0'}</span></div>
          ))}
        </div>
      )}
      <div className="note-text mt8">{note}{stateLabel ? ` Stan zmienia się dopiero po przekroczeniu ±${HYSTERESIS.toString().replace('.', ',')} (histereza ogranicza fałszywe sygnały).` : ''}</div>
    </Card>
  );
}
