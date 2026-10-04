// Combines automatic pillars (recomputed after each 00:00 UTC close) with manual ones.
import { useEffect, useMemo } from 'react';
import { useBtc } from './btcStore';
import { usePersisted, load, save } from './db';
import { composite as sdcaComposite } from './sdcaModel';
import { computeAuto, sentimentScore } from './autoSignals';
import { fearGreed, lastClosedDay } from './market';
import { composite, type PillarId, type PillarState, type PillarValue, type WeightMethod } from './pyramid';
import { SDCA_DEFAULTS, type SdcaSettings } from '../tabs/Sdca';

export type ManualMap = Partial<Record<PillarId, { score: number; updated: number; note?: string }>>;
export interface Overrides { onchain?: boolean; sentiment?: boolean; stats?: boolean; system?: boolean; }
interface FG { value: number; label: string; time: number; fetched: number; }

export function usePyramid() {
  const { model, history } = useBtc();
  const [manual, setManual] = usePersisted<ManualMap>('pyramid.manual', {});
  const [overrides, setOverrides] = usePersisted<Overrides>('pyramid.overrides', {});
  const [method, setMethod] = usePersisted<WeightMethod>('pyramid.method', 'roc');
  const [fg, setFg] = usePersisted<FG | null>('pyramid.fg', null);
  const [sdca] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);

  // Fear & Greed publishes once a day; refetch when the last fetch predates the latest UTC close
  useEffect(() => {
    const due = !fg || new Date(fg.fetched).toISOString().slice(0, 10) <= lastClosedDay();
    if (due) void fearGreed().then((v) => { if (v) setFg({ ...v, fetched: Date.now() }); });
  }, [history?.updated]); // eslint-disable-line react-hooks/exhaustive-deps

  const auto = useMemo(() => {
    if (!model) return null;
    const cfg = { ...SDCA_DEFAULTS, ...sdca };
    const comp = sdcaComposite(model, cfg.enabled, cfg.manualRisk);
    return computeAuto(model.dates, model.prices, comp.risk, model.risk.mvrv);
  }, [model, sdca]);

  const state: PillarState = useMemo(() => {
    const at = auto ? Date.parse(auto.date + 'T23:59:59Z') : null;
    const now = Date.now();
    const autoVal = (id: PillarId, score: number | undefined, detail: string): PillarValue => {
      const m = manual[id];
      if ((overrides as Record<string, boolean>)[id] && m) return { score: m.score, updated: m.updated, manual: true, detail: 'ręczna korekta' };
      // auto values stay fresh as long as the data is at most a few days old
      return { score: score ?? null, updated: at && now - at < 4 * 86400000 ? now : at, detail };
    };
    const man = (id: PillarId): PillarValue => ({ score: manual[id]?.score ?? null, updated: manual[id]?.updated ?? null, manual: true, detail: manual[id]?.note });
    return {
      system: autoVal('system', auto?.system, auto ? `trend ${auto.trendEnsemble.toFixed(2)} · LTPI ${auto.ltpi > 0 ? '+' : '−'} · ryzyko ${auto.sdcaRisk.toFixed(0)}%` : ''),
      fundamental: man('fundamental'),
      macro: man('macro'),
      onchain: autoVal('onchain', auto?.onchain, auto ? `ryzyko MVRV ${auto.mvrvRisk.toFixed(0)}%` : ''),
      stats: autoVal('stats', auto?.stats, auto ? `t(90d) ${auto.tStat90.toFixed(2)} · ADF ${auto.adfStat.toFixed(2)}` : ''),
      sentiment: (overrides.sentiment && manual.sentiment) ? { score: manual.sentiment.score, updated: manual.sentiment.updated, manual: true, detail: 'ręczna korekta' }
        : fg ? { score: sentimentScore(fg.value), updated: fg.time + 86400000 > now - 3 * 86400000 ? now : fg.time, detail: `Fear & Greed ${fg.value} · ${fg.label}` } : { score: null, updated: null, detail: 'brak danych F&G' },
      ta: man('ta')
    };
  }, [auto, manual, overrides, fg]);

  const comp = useMemo(() => composite(state, method), [state, method]);

  // one snapshot per closed day for the history chart / journal
  useEffect(() => {
    if (!auto) return;
    const hist = load<{ date: string; score: number; coverage: number }[]>('pyramid.history', []);
    if (hist.at(-1)?.date === auto.date) return;
    void save('pyramid.history', [...hist, { date: auto.date, score: comp.score, coverage: comp.coverage }].slice(-730));
  }, [auto?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPillar = (id: PillarId, score: number, note?: string) => setManual({ ...manual, [id]: { score, updated: Date.now(), note } });
  return { auto, state, comp, method, setMethod, manual, setPillar, overrides, setOverrides, fg };
}
