// Combines automatic pillars (recomputed after each 00:00 UTC close) with manual ones.
import { useEffect, useMemo } from 'react';
import { useBtc } from './btcStore';
import { usePersisted, load, save } from './db';
import { composite as sdcaComposite } from './sdcaModel';
import { computeAuto, sentimentZ } from './autoSignals';
import { fearGreed, lastClosedDay } from './market';
import { composite, type PillarId, type PillarState, type PillarValue, type WeightMethod } from './pyramid';
import { SDCA_DEFAULTS, type SdcaSettings } from '../tabs/Sdca';

/** z: pillar z-score in σ; answers: the per-question σ readings (direction-adjusted). */
export interface TpiSettings { ltpiSource: 'ensemble' | 'sma200'; mtpiSizing: 'ma4' | 'ensemble'; }
export const TPI_DEFAULTS: TpiSettings = { ltpiSource: 'ensemble', mtpiSizing: 'ma4' };

export type ManualMap = Partial<Record<PillarId, { z: number; updated: number; note?: string; answers?: number[] }>>;
export interface Overrides { onchain?: boolean; sentiment?: boolean; stats?: boolean; system?: boolean; }
export interface FG { value: number; label: string; time: number; fetched: number; mu?: number; sd?: number; n?: number; hist?: [string, number][]; }

export function usePyramid() {
  const { model, history } = useBtc();
  const [manual, setManual] = usePersisted<ManualMap>('pyramid.manual', {});
  const [overrides, setOverrides] = usePersisted<Overrides>('pyramid.overrides', {});
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
    const comp = sdcaComposite(model, cfg.enabled, cfg.manualRisk);
    return computeAuto(model.dates, model.prices, comp.risk, model.risk.mvrv, comp.z, model.z.mvrv, tpiCfg.ltpiSource);
  }, [model, sdca, tpiCfg.ltpiSource]);

  const state: PillarState = useMemo(() => {
    const at = auto ? Date.parse(auto.date + 'T23:59:59Z') : null;
    const now = Date.now();
    const autoVal = (id: PillarId, z: number | undefined, detail: string): PillarValue => {
      const m = manual[id];
      if ((overrides as Record<string, boolean>)[id] && m) return { z: m.z, updated: m.updated, manual: true, detail: 'ręczna korekta' };
      // auto values stay fresh as long as the data is at most a few days old
      return { z: z != null && Number.isFinite(z) ? z : null, updated: at && now - at < 4 * 86400000 ? now : at, detail };
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
      ta: man('ta')
    };
  }, [auto, manual, overrides, fg]);

  const comp = useMemo(() => composite(state, method), [state, method]);

  // one snapshot per closed day for the history chart / journal
  useEffect(() => {
    if (!auto) return;
    const hist = load<{ date: string; z: number; p: number; coverage: number }[]>('pyramid.history', []);
    if (hist.at(-1)?.date === auto.date) return;
    void save('pyramid.history', [...hist, { date: auto.date, z: comp.z, p: comp.p, coverage: comp.coverage }].slice(-730));
  }, [auto?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPillar = (id: PillarId, z: number, note?: string, answers?: number[]) => setManual({ ...manual, [id]: { z, updated: Date.now(), note, answers } });
  return { auto, state, comp, method, setMethod, manual, setPillar, overrides, setOverrides, fg, tpiCfg: { ...TPI_DEFAULTS, ...tpiCfg } };
}
