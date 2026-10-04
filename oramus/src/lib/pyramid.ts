// Analysis pyramid: seven pillars in order of importance (1 = most important).
// Weights come from the rank order alone via Rank Order Centroid (Barron & Barrett 1996,
// Management Science 42(11)): w_i = (1/n) * Σ_{k=i..n} 1/k. Linear (rank-sum) and equal
// weights are offered as alternatives. Each pillar is scored on −1 (bearish) … +1 (bullish).

export type PillarId = 'system' | 'fundamental' | 'macro' | 'onchain' | 'stats' | 'sentiment' | 'ta';
export type WeightMethod = 'roc' | 'linear' | 'equal';

export interface RubricItem { q: string; label: string; url: string; plus: string; minus: string; }
export interface PillarDef { id: PillarId; rank: number; name: string; short: string; auto: boolean; source: string; hints: string[]; rubric?: RubricItem[]; verify?: { label: string; url: string }[]; }

export const PILLARS: PillarDef[] = [
  { id: 'system', rank: 1, name: 'Systematyzacja', short: 'Systematyzacja', auto: true, source: 'Auto: trend BTC (4 średnie), LTPI (SMA200), wycena SDCA', hints: [], verify: [{ label: 'Strona sygnałów SDCA', url: 'https://sdca-signals-automation-production-bdd2.up.railway.app/' }] },
  { id: 'fundamental', rank: 2, name: 'Ekonomia fundamentalna', short: 'Fundamenty', auto: false, source: 'Ręcznie',
    hints: ['Podaż i emisja (halving, odblokowania tokenów)', 'Adopcja i popyt (ETF, napływy instytucjonalne)', 'Regulacje i ryzyka strukturalne'],
    rubric: [
      { q: 'Napływy do spot ETF na BTC (ostatnie 10 sesji)', label: 'Farside Investors', url: 'https://farside.co.uk/btc/', plus: 'przewaga napływów', minus: 'przewaga odpływów' },
      { q: 'Odblokowania tokenów w portfelu RSPS (najbliższe 30 dni)', label: 'Tokenomist', url: 'https://tokenomist.ai/', plus: 'brak dużych odblokowań', minus: 'odblokowania > 2% podaży' },
      { q: 'Aktywność sieci: opłaty i TVL (trend 30 dni)', label: 'DefiLlama', url: 'https://defillama.com/', plus: 'rosną', minus: 'spadają' },
      { q: 'Regulacje i zdarzenia strukturalne', label: 'CoinDesk Policy', url: 'https://www.coindesk.com/policy', plus: 'korzystne', minus: 'niekorzystne / ryzyko systemowe' }
    ],
  },
  { id: 'macro', rank: 3, name: 'Makroekonomia', short: 'Makro', auto: false, source: 'Ręcznie',
    hints: ['Globalna płynność (M2, bilanse banków centralnych)', 'Kierunek stóp procentowych', 'Dolar (DXY) i apetyt na ryzyko (akcje)'],
    rubric: [
      { q: 'Płynność: bilans Fed (WALCL), trend 3 mies.', label: 'FRED · WALCL', url: 'https://fred.stlouisfed.org/series/WALCL', plus: 'rośnie', minus: 'spada' },
      { q: 'Stopy: oczekiwania na najbliższe posiedzenia Fed', label: 'CME FedWatch', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', plus: 'obniżki', minus: 'podwyżki' },
      { q: 'Dolar (DXY) względem 50-dniowej średniej', label: 'TradingView · DXY', url: 'https://www.tradingview.com/symbols/TVC-DXY/', plus: 'poniżej i spada', minus: 'powyżej i rośnie' },
      { q: 'Akcje (S&P 500) względem 200-dniowej średniej', label: 'TradingView · SPX', url: 'https://www.tradingview.com/symbols/SPX/', plus: 'powyżej', minus: 'poniżej' }
    ],
  },
  { id: 'onchain', rank: 4, name: 'Dane on-chain', short: 'On-chain', auto: true, source: 'Auto: MVRV (Coin Metrics), percentyl po odtrendowaniu', hints: [], verify: [{ label: 'Coin Metrics · MVRV', url: 'https://charts.coinmetrics.io/crypto-data/' }] },
  { id: 'stats', rank: 5, name: 'Istotność statystyczna', short: 'Statystyka', auto: true, source: 'Auto: statystyka t momentum 90 dni + test ADF', hints: [] },
  { id: 'sentiment', rank: 6, name: 'Sentyment', short: 'Sentyment', auto: true, source: 'Auto: Crypto Fear & Greed (alternative.me), odczyt kontrariański', hints: [], verify: [{ label: 'Crypto Fear & Greed', url: 'https://alternative.me/crypto/fear-and-greed-index/' }] },
  { id: 'ta', rank: 7, name: 'Uznaniowa analiza techniczna', short: 'Analiza techniczna', auto: false, source: 'Ręcznie',
    hints: ['Struktura rynku (wyższe szczyty/dołki)', 'Kluczowe wsparcia i opory', 'Formacje i wolumen'],
    rubric: [
      { q: 'Struktura BTC na interwale tygodniowym', label: 'TradingView · BTCUSDT', url: 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT', plus: 'wyższe szczyty i dołki', minus: 'niższe szczyty i dołki' },
      { q: 'Cena względem kluczowego wsparcia/oporu', label: 'TradingView · BTCUSDT', url: 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT', plus: 'wybicie oporu', minus: 'przebicie wsparcia' },
      { q: 'Kapitalizacja całego rynku (TOTAL) względem 200-dniowej średniej', label: 'TradingView · TOTAL', url: 'https://www.tradingview.com/symbols/CRYPTOCAP-TOTAL/', plus: 'powyżej', minus: 'poniżej' },
      { q: 'Wolumen potwierdza ruch', label: 'TradingView · BTCUSDT', url: 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT', plus: 'rośnie z trendem', minus: 'rośnie przeciw trendowi' }
    ],
  }
];

export function weights(method: WeightMethod): Record<PillarId, number> {
  const n = PILLARS.length;
  const raw = PILLARS.map((p) => {
    if (method === 'equal') return 1;
    if (method === 'linear') return n + 1 - p.rank;
    let s = 0; for (let k = p.rank; k <= n; k++) s += 1 / k; return s / n;
  });
  const tot = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(PILLARS.map((p, i) => [p.id, raw[i] / tot])) as Record<PillarId, number>;
}

export interface PillarValue { score: number | null; updated: number | null; detail?: string; manual?: boolean; }
export type PillarState = Record<PillarId, PillarValue>;

/** Manual inputs older than this are treated as missing (and block leverage). */
export const MANUAL_MAX_AGE_DAYS = 7;

export const isFresh = (v: PillarValue | undefined, now = Date.now()) =>
  !!v && v.score != null && v.updated != null && now - v.updated <= MANUAL_MAX_AGE_DAYS * 86400000;

export interface Composite { score: number; coverage: number; agreement: number; missing: PillarId[]; contributions: Record<string, number>; }

/** Weighted average over pillars that have a fresh value; coverage = weight share available. */
export function composite(state: PillarState, method: WeightMethod, now = Date.now()): Composite {
  const w = weights(method);
  let sw = 0, s = 0;
  const missing: PillarId[] = [];
  const contributions: Record<string, number> = {};
  const vals: number[] = [], ws: number[] = [];
  for (const p of PILLARS) {
    const v = state[p.id];
    if (!isFresh(v, now)) { missing.push(p.id); continue; }
    sw += w[p.id]; s += w[p.id] * (v.score as number);
    contributions[p.id] = w[p.id] * (v.score as number);
    vals.push(v.score as number); ws.push(w[p.id]);
  }
  const score = sw ? s / sw : 0;
  // agreement: 1 − weighted std of pillar scores around the composite (scores live in [−1, 1])
  const varw = sw ? ws.reduce((a, wi, i) => a + wi * (vals[i] - score) ** 2, 0) / sw : 1;
  return { score, coverage: sw, agreement: Math.max(0, 1 - Math.sqrt(varw)), missing, contributions };
}

export const scoreLabel = (s: number) =>
  s >= 0.5 ? 'Silnie pozytywny' : s >= 0.15 ? 'Pozytywny' : s > -0.15 ? 'Neutralny' : s > -0.5 ? 'Negatywny' : 'Silnie negatywny';

// ---------- strict leverage gate ----------
export interface LeverageInputs {
  trendEnsemble: number;      // 0..1, BTC price above SMA20/50/100/200
  adfTrending: boolean;       // ADF fails to reject unit root (5%) on 90d log price
  ltpi: number;               // −1..1
  sdcaRisk: number;           // 0..100
  volBelowMedian: boolean;    // 30d realised vol < 365d median
  persistDays: number;        // consecutive days all automatic conditions held
  rspsActive: boolean;        // leverage only applies to the BTC fallback, never to RSPS picks
  pyramid: Composite;
  state: PillarState;
}
export const LEV_MAX = 1.5;
export const LEV_PERSIST = 10;
export const LEV_PYRAMID_MIN = 0.5;
export const LEV_PILLAR_FLOOR = -0.25;

export function leverageGate(x: LeverageInputs) {
  const checks = [
    { ok: x.trendEnsemble >= 1, label: 'Trend BTC: cena nad wszystkimi 4 średnimi (20/50/100/200)' },
    { ok: x.adfTrending, label: 'ADF: rynek w trendzie, nie w konsolidacji' },
    { ok: x.ltpi > 0, label: 'LTPI dodatnie' },
    { ok: x.sdcaRisk < 50, label: 'Wycena SDCA poniżej 50% (rynek nieprzegrzany)' },
    { ok: x.volBelowMedian, label: 'Zmienność BTC 30d poniżej mediany z roku' },
    { ok: x.persistDays >= LEV_PERSIST, label: `Wszystkie warunki automatyczne spełnione ≥ ${LEV_PERSIST} dni z rzędu (teraz ${x.persistDays})` },
    { ok: x.pyramid.missing.length === 0, label: `Wszystkie filary piramidy aktualne (ręczne ≤ ${MANUAL_MAX_AGE_DAYS} dni)` },
    { ok: x.pyramid.score >= LEV_PYRAMID_MIN, label: `Wynik piramidy ≥ +${LEV_PYRAMID_MIN} (teraz ${x.pyramid.score >= 0 ? '+' : ''}${x.pyramid.score.toFixed(2)})` },
    { ok: PILLARS.every((p) => (x.state[p.id]?.score ?? -1) > LEV_PILLAR_FLOOR), label: `Żaden filar poniżej ${LEV_PILLAR_FLOOR}` },
    { ok: !x.rspsActive, label: 'RSPS nieaktywny (dźwignia tylko na BTC, nigdy na alty)' }
  ];
  const allowed = checks.every((c) => c.ok);
  return { allowed, leverage: allowed ? LEV_MAX : 1, checks };
}
