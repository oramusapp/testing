import { useEffect } from 'react';
import { useBtc } from '../lib/btcStore';
import { usePersisted } from '../lib/db';
import { composite } from '../lib/sdcaModel';
import { ATH_BACKTEST, athSellSeries } from '../lib/quant';
import { notifyOnce } from '../lib/notify';
import { SDCA_DEFAULTS, type SdcaSettings } from '../tabs/Sdca';

/** Runs in the background of the app: on a new all-time-high close while valuation risk ≥ 70%,
 *  shows a one-per-day notification with the ATH sale proposal and what the backtests say. */
export default function AthWatcher() {
  const { model } = useBtc();
  const [sd] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [on] = usePersisted<boolean>('notify.ath', true);
  useEffect(() => {
    if (!model || !on) return;
    const cfg = { ...SDCA_DEFAULTS, ...sd };
    const comp = composite(model, cfg.enabled, cfg.manualRisk);
    const { frac, k } = athSellSeries(model.prices, comp.risk);
    const i = model.dates.length - 1;
    if (frac[i] > 0) {
      void notifyOnce('ath-' + model.dates[i], 'Nowy szczyt BTC (ATH)',
        `Ryzyko wyceny ${comp.risk[i].toFixed(1)}%. Propozycja: sprzedaj ${(frac[i] * 100).toFixed(2)}% BTC z części SDCA (${k[i] + 1}. sprzedaż w cyklu). ${ATH_BACKTEST}`);
    }
  }, [model, on, sd]);
  return null;
}
