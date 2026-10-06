// Shared BTC history + SDCA model, loaded once and used by both SDCA and RSPS tabs.
import { useEffect, useState } from 'react';
import { get, set, createStore } from 'idb-keyval';
import { loadBtcHistory, refreshBtcHistory, loadTotalHistory, refreshTotalHistory, alignTotal, loadTvTotal, saveTvTotal, mergeTvTotal, snapshotTotal, loadTotalSnaps, type TvTotal, type TotalSnap, lastClosedDay, msToNextUtcClose, type BtcHistory, type TotalHistory } from './market';
import type { SdcaModel } from './sdcaModel';

const cacheStore = createStore('oramus-model', 'model');
/** tpiPrices: $TOTAL aligned to model.dates — the input of LTPI / MTPI (course notes: "The TPI is built for $TOTAL"). */
interface State { snaps?: TotalSnap[]; tv?: TvTotal | null; history: BtcHistory | null; model: SdcaModel | null; total: TotalHistory | null; tpiPrices: number[] | null; status: string; busy: boolean; }
let state: State = { history: null, model: null, total: null, tpiPrices: null, status: 'Ładowanie danych…', busy: true };
const subs = new Set<(s: State) => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  if ((patch.model || patch.total || 'tv' in patch) && state.model) state = { ...state, tpiPrices: alignTotal(state.model.dates, state.model.prices, mergeTvTotal(state.total, state.tv ?? null)) };
  subs.forEach((f) => f(state));
};

function runWorker(h: BtcHistory): Promise<SdcaModel> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./sdca.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve(e.data.model) : reject(new Error(e.data.error)); };
    w.onerror = (e) => { w.terminate(); reject(e); };
    w.postMessage(h.rows);
  });
}

async function compute(h: BtcHistory) {
  const key = 'pit2:' + h.rows.length + ':' + h.rows[h.rows.length - 1].join('|');   // pit1 = point-in-time model (no look-ahead)
  const cached = await get<{ key: string; model: SdcaModel }>('model', cacheStore);
  if (cached?.key === key) { emit({ model: cached.model }); return; }
  emit({ status: 'Liczenie modelu wyceny…', busy: true });
  const model = await runWorker(h);
  emit({ model });
  void set('model', { key, model }, cacheStore);
}

let started = false;
let lastRefresh = 0;
export async function startBtc() {
  if (started) return; started = true;
  try {
    const [h, t, tv, snaps] = await Promise.all([loadBtcHistory(), loadTotalHistory(), loadTvTotal(), loadTotalSnaps()]);
    emit({ history: h, total: t, tv, snaps });
    await compute(h);
    await refresh();
  } catch (e) { emit({ status: 'Błąd: ' + (e as Error).message, busy: false }); }
  scheduleDailyClose();
  // iOS suspends web apps in the background, so also catch up whenever the app returns to the foreground
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void catchUp(); });
}

/** Refreshes when a newer daily candle has closed than the one the model was built on. */
async function catchUp() {
  const last = state.history?.rows.at(-1)?.[0];
  if (!last || state.busy) return;
  if (last < lastClosedDay() && Date.now() - lastRefresh > 10 * 60 * 1000) await refresh();
}

function scheduleDailyClose() {
  // 2 minutes after 00:00 UTC so exchanges have published the closed candle
  setTimeout(() => { void refresh().finally(scheduleDailyClose); }, msToNextUtcClose() + 2 * 60 * 1000);
}

export async function refresh() {
  if (!state.history) return;
  lastRefresh = Date.now();
  emit({ busy: true, status: 'Aktualizacja danych…' });
  const h = await refreshBtcHistory(state.history, (m) => emit({ status: 'Aktualizacja: ' + m }));
  emit({ history: h });
  if (state.total) { emit({ status: 'Aktualizacja: $TOTAL…' }); emit({ total: await refreshTotalHistory(state.total) }); }
  try { emit({ snaps: await snapshotTotal() }); } catch { /* offline: next close */ }
  await compute(h);
  const last = h.rows[h.rows.length - 1][0];
  emit({ busy: false, status: `Załadowano ${h.rows.length.toLocaleString('pl-PL')} świec dziennych · do ${last}` + (h.updated ? '' : ' · offline (dane wbudowane)') });
}

export function useBtc() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); void startBtc(); return () => { subs.delete(setS); }; }, []);
  return s;
}

/** Imports (or clears, with null) the user's TradingView CRYPTOCAP:TOTAL export; the TPIs recompute at once. */
export async function setTvTotal(tv: TvTotal | null) { await saveTvTotal(tv); emit({ tv }); }
/** The $TOTAL series actually used by the TPIs (TradingView import merged with the built-in index). */
export const effectiveTotal = (st: { total: TotalHistory | null; tv?: TvTotal | null }) => mergeTvTotal(st.total, st.tv ?? null);
