import { describe, it, expect } from 'vitest';
import { weights, composite, leverageGate, PILLARS, type PillarState } from './pyramid';

const full = (z: number): PillarState => Object.fromEntries(PILLARS.map((p) => [p.id, { z, updated: Date.now() }])) as unknown as PillarState;

describe('pyramid (normal model)', () => {
  it('ROC weights for 7 ranks match Barron & Barrett', () => {
    const w = weights('roc');
    expect(w.system).toBeCloseTo(0.3704, 3);
    expect(w.fundamental).toBeCloseTo(0.2276, 3);
    expect(w.ta).toBeCloseTo(0.0204, 3);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it('composite is the weighted mean z with P = Φ(Z); stale pillars excluded', () => {
    const st = full(1); st.macro = { z: 2, updated: Date.now() - 8 * 86400000 };
    const c = composite(st, 'roc');
    expect(c.missing).toEqual(['macro']);
    expect(c.z).toBeCloseTo(1);
    expect(c.p).toBeCloseTo(0.8413, 3);
    expect(c.dispersion).toBeCloseTo(0);
  });
  it('leverage proposal requires every condition', () => {
    const base = { trendEnsemble: 1, adfTrending: true, ltpi: 1, sdcaRisk: 30, volBelowMedian: true, persistDays: 12, rspsActive: false };
    const st = full(1);
    expect(leverageGate({ ...base, pyramid: composite(st, 'roc'), state: st }).allowed).toBe(true);
    expect(leverageGate({ ...base, persistDays: 9, pyramid: composite(st, 'roc'), state: st }).allowed).toBe(false);
    const st2 = full(1); st2.ta = { z: -0.5, updated: Date.now() };
    expect(leverageGate({ ...base, pyramid: composite(st2, 'roc'), state: st2 }).allowed).toBe(false);
    const st3 = full(0.5);
    expect(leverageGate({ ...base, pyramid: composite(st3, 'roc'), state: st3 }).allowed).toBe(false);
  });
});
