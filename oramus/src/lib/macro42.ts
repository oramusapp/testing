// 42 Macro weekly readings (Darius Dale). The report is paid and may not be redistributed, so the app stores only the
// user's own weekly readings of the model outputs — never report content. A reading is valid for 7 days (one report).
// The score below is our own mapping of those outputs to σ for the Macro pillar (equal weights; it cannot be backtested
// because the model histories are not available) — treat it as a structured summary, not a tested signal.
export type Regime = 'G' | 'R' | 'I' | 'D' | '';
export type Tri = 'bull' | 'neutral' | 'bear' | '';
export type Risk4 = 'low' | 'moderate' | 'reasonable' | 'high' | '';
export interface Macro42 {
  reportDate: string; updated: number | null;
  regime: Regime;          // Global Macro Risk Matrix: current Market Regime (nowcast)
  riskOnProb: number | null; // probability of a risk-on regime, %
  btcVams: Tri; ethVams: Tri; goldVams: Tri;
  weatherBtc: Tri;         // Macro Weather Model outlook for Bitcoin (2–3 months)
  weatherRiskOn: Risk4;    // probability of sustaining a risk-on regime (short-to-medium term)
  liqTrend: 'up' | 'down' | ''; liqLead: 'up' | 'down' | '';   // Global Liquidity Model: trend now, leading indicators
  grid: Regime;            // GRID Model: consensus modal outcome (medium term)
  corrRisk: Risk4;         // Positioning Model: correction (−10%) risk, short-to-medium term
  crashRisk: Risk4;        // Positioning Model: crash (−20%) risk, medium-to-long term
  kissBtc: number | null;  // KISS: Bitcoin actual exposure in % of the portfolio (max 10)
  drMoBtc: 'longMax' | 'longHalf' | 'none' | 'short' | '';
}
export const MACRO42_EMPTY: Macro42 = { reportDate: '', updated: null, regime: '', riskOnProb: null, btcVams: '', ethVams: '', goldVams: '', weatherBtc: '', weatherRiskOn: '', liqTrend: '', liqLead: '', grid: '', corrRisk: '', crashRisk: '', kissBtc: null, drMoBtc: '' };
export const MACRO42_VALID_DAYS = 7;
export const fresh42 = (m: Macro42, now = Date.now()) => m.updated != null && now - m.updated <= MACRO42_VALID_DAYS * 86400000;

const reg = (r: Regime) => (r === 'G' || r === 'R' ? 1 : r === 'I' || r === 'D' ? -1 : null);
const tri = (t: Tri) => (t === 'bull' ? 1 : t === 'bear' ? -1 : t === 'neutral' ? 0 : null);
const riskBad = (r: Risk4) => (r === 'low' ? 0.5 : r === 'moderate' ? 0 : r === 'reasonable' ? -0.5 : r === 'high' ? -1 : null);
const riskOnGood = (r: Risk4) => (r === 'high' ? 1 : r === 'reasonable' ? 0.5 : r === 'moderate' ? -0.5 : r === 'low' ? -1 : null);
const dir = (d: 'up' | 'down' | '') => (d === 'up' ? 0.5 : d === 'down' ? -0.5 : null);

/** Components in σ-like units (+ = favourable for crypto) and their equal-weight mean, clipped to ±3. */
export function score42(m: Macro42): { z: number | null; parts: { name: string; v: number }[] } {
  const parts: { name: string; v: number | null }[] = [
    { name: 'Reżim (Risk Matrix)', v: reg(m.regime) },
    { name: 'P(risk-on)', v: m.riskOnProb == null ? null : Math.max(-2, Math.min(2, (m.riskOnProb - 50) / 25)) },
    { name: 'VAMS Bitcoin', v: tri(m.btcVams) },
    { name: 'Weather Model · BTC', v: tri(m.weatherBtc) },
    { name: 'Weather · utrzymanie risk-on', v: riskOnGood(m.weatherRiskOn) },
    { name: 'Płynność: trend', v: dir(m.liqTrend) },
    { name: 'Płynność: wskaźniki wyprzedzające', v: dir(m.liqLead) },
    { name: 'GRID (średni termin)', v: m.grid ? (reg(m.grid) ?? 0) * 0.5 : null },
    { name: 'Ryzyko korekty', v: riskBad(m.corrRisk) },
    { name: 'Ryzyko krachu', v: riskBad(m.crashRisk) }
  ];
  const ok = parts.filter((p): p is { name: string; v: number } => p.v != null);
  if (!ok.length) return { z: null, parts: [] };
  const z = ok.reduce((a, p) => a + p.v, 0) / ok.length;
  return { z: Math.max(-3, Math.min(3, Math.round(z * 100) / 100)), parts: ok };
}

/** KISS rule for Bitcoin (from the report's methodology): target 10% in risk-on (G/R), 5% in risk-off (I/D);
 *  actual = 100% / 50% / 0% of target for bullish / neutral / bearish VAMS. */
export function kissBtc(m: Macro42): number | null {
  const r = reg(m.regime), v = tri(m.btcVams);
  if (r == null || v == null) return null;
  return (r > 0 ? 10 : 5) * (v > 0 ? 1 : v === 0 ? 0.5 : 0);
}
