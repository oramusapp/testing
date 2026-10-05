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
  const st = stateLabel ? res.state : Math.sign(res.value);
  const dir = res.roc5 > 0.1 ? 1 : res.roc5 < -0.1 ? -1 : 0;
  // guidance from the TPI lesson: state first, rate of change for expectation management
  const guide = st > 0
    ? dir > 0 ? 'Powyżej zera i rośnie: trend wzrostowy się umacnia (można rozważyć więcej bety).'
      : dir < 0 ? 'Powyżej zera, ale spada: zachowaj ostrożność i przygotuj się do sprzedaży (mniej bety, więcej gotówki).'
      : 'Powyżej zera: trzymaj krypto.'
    : st < 0
      ? dir < 0 ? 'Poniżej zera i spada: trend spadkowy się umacnia, poza krypto.'
        : dir > 0 ? 'Poniżej zera, ale rośnie: przygotuj się do kupna.'
        : 'Poniżej zera: poza krypto.'
      : 'Brak stanu: czekaj na przekroczenie progu.';
  const consensus = Math.abs(res.value);
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
      <div className="mt8">
        <div className="row compact"><span>1. Stan</span><span style={{ color: tone(st), fontWeight: 600 }}>{st > 0 ? 'long (powyżej 0)' : st < 0 ? 'short (poniżej 0)' : 'brak'}</span></div>
        <div className="row compact"><span>2. Tempo zmian (5 dni)</span><span className="num" style={{ color: tone(res.roc5) }}>{f(res.roc5)} {dir > 0 ? '↑' : dir < 0 ? '↓' : '→'}</span></div>
        <div className="row compact"><span>3. Siła = zgodność</span><span className="num">{Math.round(consensus * 100)}%{consensus >= 0.8 ? ' · skrajna' : ''}</span></div>
      </div>
      <div className="note-text mt8">{guide}{consensus >= 0.8 ? ' Skrajna zgodność nie oznacza większego prawdopodobieństwa wzrostu; jej słabnięcie bywa wczesnym ostrzeżeniem przed zwrotem.' : ''}</div>
      {res.sig && <div className="note-text mt8">Istotność (historia {Math.round((res.sig.nUp + res.sig.nDown) / 365)} lat): średni zwrot {res.sig.h} dni przy stanie + {(res.sig.up * 100).toFixed(1)}%, przy stanie − {(res.sig.down * 100).toFixed(1)}%, wszystkie dni {(res.sig.all * 100).toFixed(1)}% · t = {res.sig.t.toFixed(2)} {Math.abs(res.sig.t) >= 1.96 ? '(istotne na 5%)' : '(nieistotne na 5%)'}.</div>}
      <button className="text-btn mt8" style={{ fontSize: 14 }} onClick={() => setOpen(!open)}>{open ? 'Ukryj wskaźniki' : 'Pokaż wskaźniki'}</button>
      {open && (
        <div className="mt8">
          {res.votes.map((v) => (
            <div key={v.name} className="row compact"><span style={{ fontSize: 14 }}>{v.name}<span className="faint" style={{ fontSize: 12 }}> · {v.flipsPerYear.toFixed(1)} zmian/rok</span></span><span className="num" style={{ color: tone(v.vote), fontWeight: 600 }}>{v.vote > 0 ? '▲ +1' : v.vote < 0 ? '▼ −1' : '0'}</span></div>
          ))}
        </div>
      )}
      {open && <div className="note-text mt8">Spójność czasowa: składniki jednego TPI powinny działać w podobnym horyzoncie. Liczba zmian sygnału na rok (ostatnie 2 lata) pokazuje, które są wyraźnie szybsze lub wolniejsze od reszty.</div>}
      <div className="note-text mt8">{note}{stateLabel ? ` Stan zmienia się dopiero po przekroczeniu ±${HYSTERESIS.toString().replace('.', ',')} (histereza ogranicza fałszywe sygnały).` : ''}</div>
    </Card>
  );
}
