// Shared BTC history + SDCA model, loaded once and used by both SDCA and RSPS tabs.
import { useEffect, useState } from 'react';
import { get, set, createStore } from 'idb-keyval';
import { loadBtcHistory, refreshBtcHistory, type BtcHistory } from './market';
import type { SdcaModel } from './sdcaModel';

const cacheStore = createStore('oramus-model', 'model');
interface State { history: BtcHistory | null; model: SdcaModel | null; status: string; busy: boolean; }
let state: State = { history: null, model: null, status: 'Ładowanie danych…', busy: true };
const subs = new Set<(s: State) => void>();
const emit = (patch: Partial<State>) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };

function runWorker(h: BtcHistory): Promise<SdcaModel> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./sdca.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve(e.data.model) : reject(new Error(e.data.error)); };
    w.onerror = (e) => { w.terminate(); reject(e); };
    w.postMessage(h.rows);
  });
}

async function compute(h: BtcHistory) {
  const key = h.rows.length + ':' + h.rows[h.rows.length - 1].join('|');
  const cached = await get<{ key: string; model: SdcaModel }>('model', cacheStore);
  if (cached?.key === key) { emit({ model: cached.model }); return; }
  emit({ status: 'Liczenie modelu wyceny…', busy: true });
  const model = await runWorker(h);
  emit({ model });
  void set('model', { key, model }, cacheStore);
}

let started = false;
export async function startBtc() {
  if (started) return; started = true;
  try {
    const h = await loadBtcHistory();
    emit({ history: h });
    await compute(h);
    await refresh();
  } catch (e) { emit({ status: 'Błąd: ' + (e as Error).message, busy: false }); }
}

export async function refresh() {
  if (!state.history) return;
  emit({ busy: true, status: 'Aktualizacja danych…' });
  const h = await refreshBtcHistory(state.history, (m) => emit({ status: 'Aktualizacja: ' + m }));
  emit({ history: h });
  await compute(h);
  const last = h.rows[h.rows.length - 1][0];
  emit({ busy: false, status: `Załadowano ${h.rows.length.toLocaleString('pl-PL')} świec dziennych · do ${last}` + (h.updated ? '' : ' · offline (dane wbudowane)') });
}

export function useBtc() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); void startBtc(); return () => { subs.delete(setS); }; }, []);
  return s;
}
