import { describe, it, expect } from 'vitest';
import { startPaper, advancePaper, paperAllocation, type PaperInputs } from './paper';

const base = (date: string, btc: number, extra: Partial<PaperInputs> = {}): PaperInputs => ({
  date, btcPrice: btc, prices: { ETH: 2000 }, sdcaRate: 0, risk: 50, ltpi: 1, safety: false, rspsTarget: null, split: 0.6, ...extra
});

describe('live testing portfolio', () => {
  it('books cost, realized P/L and fees, and its allocation sums to the equity', () => {
    let s = startPaper('2026-01-01', 10000, 100, 0.6);
    s = advancePaper(s, base('2026-01-01', 100, { sdcaRate: 0.5, rspsTarget: [{ sym: 'ETH', w: 0.5 }] }));
    expect(s.trades).toBe(2);
    s = advancePaper(s, base('2026-01-02', 120, { prices: { ETH: 2400 }, rspsTarget: [] }));   // RSPS sells ETH at +20%
    expect(s.realized!).toBeGreaterThan(0);
    const a = paperAllocation(s);
    expect(a.total).toBeCloseTo(s.points.at(-1)!.value, 6);
    expect(a.rows.find((r) => r.key === 'SDCA:BTC')!.pl).toBeGreaterThan(0);
  });
  it('replays missed closes for SDCA before today', () => {
    let s = startPaper('2026-01-01', 10000, 100, 1);
    s = advancePaper(s, base('2026-01-01', 100));
    const missed = [{ date: '2026-01-02', btcPrice: 90, sdcaRate: 0.1, risk: 10, ltpi: 1 }, { date: '2026-01-03', btcPrice: 80, sdcaRate: 0.1, risk: 10, ltpi: 1 }];
    s = advancePaper(s, base('2026-01-04', 85, { missed }));
    expect(s.points.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    expect(s.log.filter((l) => l.text.includes('uzupełnione')).length).toBe(2);
  });
});
