import { lazy, Suspense, useState } from 'react';
import { Seg } from '../components/ui';
import { usePersisted } from '../lib/db';
import Notes from './Notes';
const Excel = lazy(() => import('./Excel'));

type Sub = 'notes' | 'excel';

/** "Inne": notes and spreadsheets in one tab. */
export default function Other() {
  const [sub, setSub] = usePersisted<Sub>('ui.other', 'notes');
  const [seen, setSeen] = useState<Set<Sub>>(new Set([sub]));
  const go = (v: Sub) => { setSub(v); setSeen((s) => (s.has(v) ? s : new Set(s).add(v))); };
  const nav = <Seg value={sub} onChange={go} options={[{ v: 'notes', l: 'Notatnik' }, { v: 'excel', l: 'Excel' }]} />;
  return (
    <>
      {(seen.has('notes') || sub === 'notes') && <div style={{ display: sub === 'notes' ? 'contents' : 'none' }}><Notes nav={nav} /></div>}
      {(seen.has('excel') || sub === 'excel') && <div style={{ display: sub === 'excel' ? 'contents' : 'none' }}>
        <Suspense fallback={<div className="screen"><div className="empty">Ładowanie…</div></div>}><Excel nav={nav} /></Suspense></div>}
    </>
  );
}
