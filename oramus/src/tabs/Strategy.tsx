import { useState } from 'react';
import { Seg } from '../components/ui';
import { usePersisted } from '../lib/db';
import Sdca from './Sdca';
import Rsps from './Rsps';
import Trend from './Trend';
import Backtest from './Backtest';

export type StrategySub = 'sdca' | 'rsps' | 'tpi' | 'bt';

/** Strategy tab: SDCA, RSPS and LTPI/MTPI as sub-tabs, grouped by the signals they give. */
export default function Strategy() {
  const [sub, setSub] = usePersisted<StrategySub>('ui.strategy', 'sdca');
  const [seen, setSeen] = useState<Set<StrategySub>>(new Set([sub]));
  const go = (v: StrategySub) => { setSub(v); setSeen((s) => (s.has(v) ? s : new Set(s).add(v))); };
  const nav = <Seg value={sub} onChange={go} options={[{ v: 'sdca', l: 'SDCA' }, { v: 'rsps', l: 'RSPS' }, { v: 'tpi', l: 'LTPI·MTPI' }, { v: 'bt', l: 'Backtest' }]} />;
  const pane = (id: StrategySub, el: React.ReactNode) => (seen.has(id) || sub === id) && <div key={id} style={{ display: sub === id ? 'contents' : 'none' }}>{el}</div>;
  return (
    <>
      {pane('sdca', <Sdca nav={nav} />)}
      {pane('rsps', <Rsps nav={nav} />)}
      {pane('tpi', <Trend nav={nav} />)}
      {pane('bt', <Backtest nav={nav} />)}
    </>
  );
}
