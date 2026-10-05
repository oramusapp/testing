import { describe, it, expect } from 'vitest';
import data from '../data-btc.json';
import fx from './tpi.fixture.json';
import { MTPI_SPEC, LTPI_SPEC, hysteresis } from './tpi';

const prices = (data as any).rows.map((r: any[]) => r[1] as number);

describe('TPI parity with research/tpi.py', () => {
  for (const [name, spec, key, vkey] of [['MTPI', MTPI_SPEC, 'mt', 'mv'], ['LTPI', LTPI_SPEC, 'lt', 'lv']] as const) {
    it(`${name}: every component vote matches over the last 60 days`, () => {
      for (const s of spec) {
        const v = s.fn(prices).slice(-60);
        const ref = (fx as any)[vkey][s.name] as number[];
        const mism = v.filter((x, i) => x !== ref[i]).length;
        expect(mism, s.name).toBe(0);
      }
      const mean = spec.map((s) => s.fn(prices).slice(-60)).reduce((acc, v) => acc.map((a, i) => a + v[i] / spec.length), new Array(60).fill(0));
      // expected mean from the research votes of the components in this spec (LTPI keeps only time-coherent ones)
      const expMean = new Array(60).fill(0).map((_, i) => spec.reduce((acc, s) => acc + ((fx as any)[vkey][s.name][i] as number), 0) / spec.length);
      mean.forEach((m, i) => expect(m).toBeCloseTo(key === 'mt' ? (fx as any)[key][i] : expMean[i], 6));
    });
  }
  it('hysteresis holds the state inside the ±0.2 band', () => {
    expect(hysteresis([0.1, 0.3, 0.1, -0.1, -0.3, 0.15], 0.2)).toEqual([0, 1, 1, 1, -1, -1]);
  });
  it('default threshold 0 follows the sign (course notes)', () => {
    expect(hysteresis([0.1, 0.3, -0.1, 0, 0.15])).toEqual([1, 1, -1, -1, 1]);
  });
});
