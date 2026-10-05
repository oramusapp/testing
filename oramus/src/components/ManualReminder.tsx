import { useEffect, useState } from 'react';
import { usePersisted } from '../lib/db';
import { freshToday, lastCloseTime, msToNextUtcClose } from '../lib/market';
import { notifyOnce } from '../lib/notify';
import { PILLARS } from '../lib/pyramid';
import type { ManualMap, ExtraMap } from '../lib/pyramidStore';
import { SDCA_DEFAULTS, type LtpiState, type SdcaSettings } from '../tabs/Sdca';

/** After every daily close (00:00 UTC) manual entries reset; this lists what to fill in again, shows a banner
 *  and one notification per day. Manual pillars are always listed; other inputs only if they were used before. */
export default function ManualReminder() {
  const [manual] = usePersisted<ManualMap>('pyramid.manual', {});
  const [extra] = usePersisted<ExtraMap>('pyramid.extra', {});
  const [val] = usePersisted<{ z: Record<string, number | null>; updated: number | null }>('sdca.valuation', { z: {}, updated: null });
  const [grid] = usePersisted<{ updated: number | null }>('macro.grid', { updated: null });
  const [ltpi] = usePersisted<LtpiState>('signals.ltpi', { mode: 'proxy', manual: 0 });
  const [sd] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [dismissed, setDismissed] = usePersisted<number>('ui.manualReminder', 0);
  const [, tick] = useState(0);
  // re-evaluate right after the next close even if the app stays open
  useEffect(() => { const t = setTimeout(() => tick((x) => x + 1), msToNextUtcClose() + 60000); return () => clearTimeout(t); });

  const todo: string[] = [];
  PILLARS.filter((p) => !p.auto && !freshToday(manual[p.id]?.updated)).forEach((p) => todo.push(`Piramida · ${p.short}`));
  PILLARS.filter((p) => p.extra && extra[p.id] && !freshToday(extra[p.id]!.updated)).forEach((p) => todo.push(`Piramida · ${p.short} (uzupełnienie)`));
  if (Object.values(val.z).some((x) => x != null) && !freshToday(val.updated)) todo.push('SDCA · arkusz wyceny (wskaźniki ręczne)');
  if (grid.updated && !freshToday(grid.updated)) todo.push('LTPI·MTPI · 42 Macro GRID');
  if (ltpi.mode === 'manual' && !freshToday(ltpi.updated)) todo.push('LTPI · wartość ręczna');
  const cfg = { ...SDCA_DEFAULTS, ...sd };
  if (cfg.enabled.manual && !freshToday(cfg.manualUpdated)) todo.push('SDCA · wskaźnik ręczny w Composite Risk');

  const day = new Date(lastCloseTime()).toISOString().slice(0, 10);
  useEffect(() => {
    if (todo.length) void notifyOnce('manual-' + day, 'Uzupełnij ręczne wpisy', `Po zamknięciu świecy (00:00 UTC) wpisy zresetowały się: ${todo.join(', ')}.`);
  }, [day, todo.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!todo.length || dismissed >= lastCloseTime()) return null;
  return (
    <div className="update-banner" style={{ top: 'auto', bottom: 'calc(var(--safe-bottom) + 76px)' }}>
      <div className="grow"><b>Uzupełnij ręczne wpisy</b><div className="dim" style={{ fontSize: 13 }}>{todo.join(' · ')}</div></div>
      <button className="btn small" onClick={() => setDismissed(Date.now())}>Później</button>
    </div>
  );
}
