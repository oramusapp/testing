import { describe, it, expect } from 'vitest';
import { twrReturns, index, stats, monthlyReport, type Snapshot, type Flow } from './performance';

const snap = (date: string, time: number, sdca: number, rsps: number, btc = 100): Snapshot => ({ date, time, total: sdca + rsps, sdca, rsps, stable: 0, btcPrice: btc });

describe('performance', () => {
  it('deposits do not count as return (TWR)', () => {
    const s = [snap('2026-10-05', 1, 600, 400), snap('2026-10-06', 2, 660, 440), snap('2026-10-07', 3, 1260, 840)];
    const f: Flow[] = [{ time: 2.5, amount: 1000, sdca: 600, rsps: 400, note: 'deposit' }];
    const r = twrReturns(s, f);
    expect(r[0].r).toBeCloseTo(0.1);
    expect(r[1].r).toBeCloseTo((2100 - 1000) / 1100 - 1);
    expect(index(r).at(-1)).toBeCloseTo(1.1 * (1100 / 1100));
  });
  it('transfers between portfolios are neutral for each portfolio', () => {
    const s = [snap('2026-10-05', 1, 700, 300), snap('2026-10-06', 2, 600, 400)];
    const f: Flow[] = [{ time: 1.5, amount: 0, sdca: -100, rsps: 100, note: 'transfer' }];
    const st = stats(s, f);
    expect(st.twr).toBeCloseTo(0); expect(st.sdcaTwr).toBeCloseTo(0); expect(st.rspsTwr).toBeCloseTo(0);
  });
  it('monthly report chains from the last snapshot of the previous month', () => {
    const s = [snap('2026-10-31', 1, 600, 400, 100), snap('2026-11-15', 2, 660, 440, 110), snap('2026-11-30', 3, 600, 400, 120)];
    const rep = monthlyReport('2026-11', s, [], { history: [], regimes: [], pyramid: [] })!;
    expect(rep.twr).toBeCloseTo(0);
    expect(rep.btc).toBeCloseTo(0.2);
    expect(rep.maxDD).toBeCloseTo(1000 / 1100 - 1);
  });
});
