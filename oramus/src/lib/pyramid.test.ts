import { describe, it, expect } from 'vitest';
import { weights, composite, leverageGate, PILLARS, type PillarState } from './pyramid';

const full = (score: number): PillarState => Object.fromEntries(PILLARS.map((p) => [p.id, { score, updated: Date.now() }])) as PillarState;

describe('pyramid', () => {
  it('ROC weights for 7 ranks match Barron & Barrett', () => {
    const w = weights('roc');
    expect(w.system).toBeCloseTo(0.3704, 3);
    expect(w.fundamental).toBeCloseTo(0.2276, 3);
    expect(w.ta).toBeCloseTo(0.0204, 3);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it('stale manual pillars are excluded and reported', () => {
    const st = full(0.5); st.macro = { score: 1, updated: Date.now() - 8 * 86400000 };
    const c = composite(st, 'roc');
    expect(c.missing).toEqual(['macro']);
    expect(c.score).toBeCloseTo(0.5);
  });
  it('leverage gate requires every condition', () => {
    const base = { trendEnsemble: 1, adfTrending: true, ltpi: 1, sdcaRisk: 30, volBelowMedian: true, persistDays: 12, rspsActive: false };
    const st = full(0.8);
    expect(leverageGate({ ...base, pyramid: composite(st, 'roc'), state: st }).allowed).toBe(true);
    expect(leverageGate({ ...base, persistDays: 9, pyramid: composite(st, 'roc'), state: st }).allowed).toBe(false);
    const st2 = full(0.8); st2.ta = { score: -0.5, updated: Date.now() };
    expect(leverageGate({ ...base, pyramid: composite(st2, 'roc'), state: st2 }).allowed).toBe(false);
    const st3 = full(0.8); st3.macro = { score: null, updated: null };
    expect(leverageGate({ ...base, pyramid: composite(st3, 'roc'), state: st3 }).leverage).toBe(1);
  });
});
