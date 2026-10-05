import { describe, it, expect } from 'vitest';
import { parseTvCsv, mergeTvTotal, type TotalHistory } from './market';

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86400000);
const csv = (unix: boolean) => ['time,open,high,low,close,Volume', ...Array.from({ length: 400 }, (_, i) =>
  `${unix ? Math.floor(day(i).getTime() / 1000) : day(i).toISOString()},1,1,1,${1000 + i},5`)].join('\n');

describe('TradingView $TOTAL import', () => {
  it('parses unix-time and ISO-time exports into daily rows', () => {
    for (const u of [true, false]) {
      const r = parseTvCsv(csv(u));
      expect(r.length).toBe(400);
      expect(r[0]).toEqual(['2024-01-01', 1000]);
    }
  });
  it('rejects files without time/close or with too few bars', () => {
    expect(() => parseTvCsv('a,b\n1,2')).toThrow();
    expect(() => parseTvCsv('time,close\n1704067200,5')).toThrow();
  });
  it('uses TradingView where present and chain-links the built-in index before and after', () => {
    const own: TotalHistory = { rows: [['2023-12-31', 50], ['2024-01-01', 100], ['2024-01-02', 110], ['2024-01-03', 121]], updated: 0, source: 'x' };
    const m = mergeTvTotal(own, { rows: [['2024-01-01', 1000], ['2024-01-02', 1050]], imported: 0, file: 'f' })!;
    expect(m.rows).toEqual([['2023-12-31', 500], ['2024-01-01', 1000], ['2024-01-02', 1050], ['2024-01-03', 1050 * 121 / 110]]);
    expect(m.approxFrom).toBe('2024-01-03');
  });
});

import { snapAgreement } from './market';
describe('official total market cap snapshots', () => {
  it('compares on-time consecutive same-source days with the index', () => {
    const snaps = [0, 1, 2, 3].map((i) => ({ date: `2024-01-0${i + 1}`, value: 3e12 * 1.01 ** i, at: 0, lagH: i === 3 ? 9 : 1, source: 'CoinGecko' }));
    const idx = { rows: [0, 1, 2, 3].map((i) => [`2024-01-0${i + 1}`, 2.7e12 * 1.01 ** i] as [string, number]), updated: 0, source: 'x' };
    const a = snapAgreement(snaps, idx);
    expect(a.onTime).toBe(3);   // the 9 h late one is left out
    expect(a.n).toBe(2);
    expect(a.mad).toBeCloseTo(0, 10);
    expect(a.levelRatio).toBeCloseTo(3 / 2.7, 6);
  });
});
