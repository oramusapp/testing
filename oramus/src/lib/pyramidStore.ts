// Combines automatic pillars (recomputed after each 00:00 UTC close) with manual ones.
import { useEffect, useMemo } from 'react';
import { useBtc } from './btcStore';
import { usePersisted, load, save } from './db';
import { composite as sdcaComposite, freshManual } from './sdcaModel';
import { computeAuto, sentimentZ } from './autoSignals';
import { fearGreed, lastClosedDay, freshToday } from './market';
import { composite, PILLARS, type PillarId, type PillarState, type PillarValue, type WeightMethod } from './pyramid';
import { SDCA_DEFAULTS, type SdcaSettings } from '../tabs/Sdca';

/** z: pillar z-score in σ; answers: the per-question σ readings (direction-adjusted). */
export interface TpiSettings { ltpiSource: 'ensemble' | 'sma200'; mtpiSizing: 'ma4' | 'ensemble'; hyst?: number; }
export const TPI_DEFAULTS: TpiSettings = { ltpiSource: 'ensemble', mtpiSizing: 'ma4', hyst: 0 };

export type ExtraMap = Partial<Record<PillarId, { answers: (number | null)[]; updated: number }>>;
export type ManualMap = Partial<Record<PillarId, { z: number; updated: number; note?: string; answers?: number[] }>>;
export interface Overrides { onchain?: boolean; sentiment?: boolean; stats?: boolean; system?: boolean; ta?: boolean; }
export interface FG { value: number; label: string; time: number; fetched: number; mu?: number; sd?: number; n?: number; hist?: [string, number][]; }

export function usePyramid() {
  const { model, history, tpiPrices } = useBtc();
  const [manual, setManual] = usePersisted<ManualMap>('pyramid.manual', {});
  const [overrides, setOverrides] = usePersisted<Overrides>('pyramid.overrides', {});
  const [extra, setExtra] = usePersisted<ExtraMap>('pyramid.extra', {});
  const [method, setMethod] = usePersisted<WeightMethod>('pyramid.method', 'roc');
  const [fg, setFg] = usePersisted<FG | null>('pyramid.fg', null);
  const [sdca] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [tpiCfg] = usePersisted<TpiSettings>('signals.tpi', TPI_DEFAULTS);

  // Fear & Greed publishes once a day; refetch when the last fetch predates the latest UTC close
  useEffect(() => {
    const due = !fg || fg.mu == null || !fg.hist || new Date(fg.fetched).toISOString().slice(0, 10) <= lastClosedDay();
    if (due) void fearGreed().then((v) => { if (v) setFg({ ...v, fetched: Date.now() }); });
  }, [history?.updated]); // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useMemo(() => {
    if (!model) return null;
    const cfg = { ...SDCA_DEFAULTS, ...sdca };
    const comp = sdcaComposite(model, cfg.enabled, freshManual(cfg));
    return computeAuto(model.dates, model.prices, comp.risk, model.risk.mvrv, comp.z, model.z.mvrv, tpiCfg.ltpiSource, tpiPrices ?? undefined, tpiCfg.hyst ?? 0);
  }, [model, sdca, tpiCfg.ltpiSource, tpiCfg.hyst, tpiPrices]);

  const state: PillarState = useMemo(() => {
    const at = auto ? Date.parse(auto.date + 'T23:59:59Z') : null;
    const now = Date.now();
    const autoVal = (id: PillarId, z: number | undefined, detail: string): PillarValue => {
      const m = manual[id];
      if ((overrides as Record<string, boolean>)[id] && m) return { z: m.z, updated: m.updated, manual: true, detail: 'ręczna korekta' };
      // auto values stay fresh as long as the data is at most a few days old
      const base = { z: z != null && Number.isFinite(z) ? z : null, updated: at && now - at < 4 * 86400000 ? now : at, detail };
      // manual supplements (data the app cannot fetch) blend in like extra components while fresh
      const def = PILLARS.find((d) => d.id === id), ex = extra[id];
      if (base.z == null || !def?.extra || !ex || !freshToday(ex.updated, now)) return base;
      const vals = ex.answers.map((v, k) => (v == null ? null : def.extra![k]?.invert ? -v : v)).filter((x): x is number => x != null);
      if (!vals.length) return base;
      const n = def.autoN ?? 1;
      return { ...base, z: (base.z * n + vals.reduce((a, b) => a + b, 0)) / (n + vals.length), detail: `${detail} · + ręczne uzupełnienie (${vals.length})` };
    };
    const man = (id: PillarId): PillarValue => ({ z: manual[id]?.z ?? null, updated: manual[id]?.updated ?? null, manual: true, detail: manual[id]?.note });
    return {
      system: autoVal('system', auto?.system, auto ? `z momentum ${auto.zMom.toFixed(2)} · z wyceny ${Number.isFinite(auto.zVal) ? auto.zVal.toFixed(2) : '—'}` : ''),
      fundamental: man('fundamental'),
      macro: man('macro'),
      onchain: autoVal('onchain', auto?.onchain, auto ? `ryzyko MVRV ${auto.mvrvRisk.toFixed(0)}% (percentyl)` : ''),
      stats: autoVal('stats', auto?.stats, auto ? `t(90d) ${auto.tStat90.toFixed(2)} · ADF ${auto.adfStat.toFixed(2)}` : ''),
      sentiment: (overrides.sentiment && manual.sentiment) ? { z: manual.sentiment.z, updated: manual.sentiment.updated, manual: true, detail: 'ręczna korekta' }
        : fg && fg.mu != null && fg.sd ? { z: sentimentZ(fg.value, fg.mu, fg.sd), updated: fg.time + 86400000 > now - 3 * 86400000 ? now : fg.time, detail: `F&G ${fg.value} · ${fg.label} · μ ${fg.mu.toFixed(0)}, σ ${fg.sd.toFixed(0)} (n=${fg.n})` } : { z: null, updated: null, detail: 'brak danych F&G' },
      ta: autoVal('ta', auto?.ta, auto ? `BB 1W ${auto.taParts.bbWeekly.toFixed(2)}σ · BB 1D(50) ${auto.taParts.bbDaily.toFixed(2)}σ · struktura ${auto.taParts.structure > 0 ? 'HH/HL' : auto.taParts.structure < 0 ? 'LH/LL' : 'mieszana'}` : '')
    };
  }, [auto, manual, overrides, fg, extra]);

  const comp = useMemo(() => composite(state, method), [state, method]);

  // one snapshot per closed day for the history chart / journal
  useEffect(() => {
    if (!auto) return;
    const hist = load<{ date: string; z: number; p: number; coverage: number }[]>('pyramid.history', []);
    if (hist.at(-1)?.date === auto.date) return;
    void save('pyramid.history', [...hist, { date: auto.date, z: comp.z, p: comp.p, coverage: comp.coverage }].slice(-730));
  }, [auto?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const setExtraAnswers = (id: PillarId, answers: (number | null)[]) => setExtra({ ...extra, [id]: { answers, updated: Date.now() } });
  const setPillar = (id: PillarId, z: number, note?: string, answers?: number[]) => setManual({ ...manual, [id]: { z, updated: Date.now(), note, answers } });
  return { auto, state, comp, method, setMethod, manual, setPillar, extra, setExtraAnswers, overrides, setOverrides, fg, tpiCfg: { ...TPI_DEFAULTS, ...tpiCfg } };
}
