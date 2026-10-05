// Analysis pyramid: seven pillars in order of importance (1 = most important).
// Weights come from the rank order alone via Rank Order Centroid (Barron & Barrett 1996,
// Management Science 42(11)): w_i = (1/n) * Σ_{k=i..n} 1/k. Linear (rank-sum) and equal
// weights are offered as alternatives.
//
// Normal-distribution model: every pillar is a z-score (σ units, positive = favourable).
// Probability of a favourable reading = Φ(z). Pillars are combined with a weighted mean of z
// (not Stouffer's Σwz/√Σw²): pillars are correlated and the mean avoids overstating confidence.
import { normCdf } from './quant';

export type PillarId = 'system' | 'fundamental' | 'macro' | 'onchain' | 'stats' | 'sentiment' | 'ta';
export type WeightMethod = 'roc' | 'linear' | 'equal';

/** One standardised question: the user reads the measure in σ (e.g. Bollinger Bands) and picks −2…+2. */
/** plus/minus: what a positive / negative reading of the MEASURED quantity means (before any inversion). */
export interface RubricItem { q: string; measure: string; plus: string; minus: string; label: string; url: string; invert?: boolean; qualitative?: boolean; }
export interface PillarDef { id: PillarId; rank: number; name: string; short: string; auto: boolean; source: string; rubric?: RubricItem[]; verify?: { label: string; url: string }[]; }

const TV = (sym: string) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`;

export const PILLARS: PillarDef[] = [
  { id: 'system', rank: 1, name: 'Systematyzacja', short: 'Systematyzacja', auto: true,
    source: 'Auto: średnia z-score momentum BTC 90 dni (vs 8 lat historii) i z-score wyceny SDCA',
    verify: [{ label: 'Strona sygnałów SDCA', url: 'https://sdca-signals-automation-production-bdd2.up.railway.app/' }] },
  { id: 'fundamental', rank: 2, name: 'Ekonomia fundamentalna', short: 'Fundamenty', auto: false, source: 'Ręcznie · skala σ',
    rubric: [
      { q: 'Napływy netto do spot ETF na BTC', measure: 'Suma z 10 sesji względem średniej i odchylenia z ostatniego roku', plus: 'napływy większe niż średnio w roku (np. +1σ = o jedno odchylenie wyżej)', minus: 'napływy mniejsze niż średnio lub odpływy', label: 'Farside Investors', url: 'https://farside.co.uk/btc/' },
      { q: 'Odblokowania tokenów (portfel RSPS, 30 dni)', measure: '% podaży względem typowego miesiąca; więcej = gorzej', plus: 'więcej odblokowań niż zwykle (aplikacja liczy to na minus)', minus: 'mniej odblokowań niż zwykle (aplikacja liczy to na plus)', label: 'Tokenomist', url: 'https://tokenomist.ai/', invert: true },
      { q: 'Opłaty i TVL sieci', measure: 'Zmiana 30-dniowa względem rozkładu zmian z ostatniego roku', plus: 'opłaty/TVL rosną szybciej niż typowo', minus: 'spadają lub rosną wolniej niż typowo', label: 'DefiLlama', url: 'https://defillama.com/' },
      { q: 'Regulacje i zdarzenia strukturalne', measure: 'Ocena jakościowa: siła wpływu w skali σ', plus: 'korzystne: np. zatwierdzenia ETF, jasne przepisy, wejście instytucji', minus: 'niekorzystne: np. zakazy, pozwy, upadki giełd, hakowania', label: 'CoinDesk Policy', url: 'https://www.coindesk.com/policy', qualitative: true }
    ] },
  { id: 'macro', rank: 3, name: 'Makroekonomia', short: 'Makro', auto: false, source: 'Ręcznie · skala σ',
    rubric: [
      { q: 'Płynność: bilans Fed (WALCL)', measure: 'Zmiana 13-tygodniowa względem rozkładu z 5 lat (FRED: Edit graph → Units: % change)', plus: 'bilans rośnie szybciej niż zwykle (dodruk, QE)', minus: 'bilans się kurczy (QT)', label: 'FRED · WALCL', url: 'https://fred.stlouisfed.org/series/WALCL' },
      { q: 'Stopy procentowe: oczekiwania rynku', measure: 'Oczekiwana zmiana stóp na 3 posiedzenia względem zmian z 5 lat; obniżki = plus', plus: 'rynek oczekuje obniżek stóp (większych niż typowo)', minus: 'rynek oczekuje podwyżek lub mniejszych obniżek', label: 'CME FedWatch', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html' },
      { q: 'Dolar (DXY)', measure: 'Pozycja w Bollinger Bands (50, 2σ); górna wstęga ≈ +2σ = negatywne dla krypto', plus: 'DXY przy górnej wstędze, silny dolar (aplikacja liczy to na minus)', minus: 'DXY przy dolnej wstędze, słaby dolar (aplikacja liczy to na plus)', label: 'TradingView · DXY', url: TV('TVC:DXY'), invert: true },
      { q: 'Rentowność 10-letnich obligacji USA (US10Y)', measure: 'Pozycja względem kanału regresji liniowej (TradingView: Linear Regression Channel, ±1σ/±2σ) na 1W; wyżej = gorzej dla ryzyka', plus: 'rentowność przy górnej granicy kanału, drogi pieniądz (aplikacja liczy to na minus)', minus: 'rentowność przy dolnej granicy kanału (aplikacja liczy to na plus)', label: 'TradingView · US10Y', url: TV('TVC:US10Y'), invert: true },
      { q: 'Akcje (S&P 500)', measure: 'Pozycja w Bollinger Bands (50, 2σ)', plus: 'S&P 500 powyżej środkowej linii / przy górnej wstędze (apetyt na ryzyko)', minus: 'poniżej środkowej linii / przy dolnej wstędze', label: 'TradingView · SPX', url: TV('SP:SPX') }
    ] },
  { id: 'onchain', rank: 4, name: 'Dane on-chain', short: 'On-chain', auto: true, source: 'Auto: z-score MVRV (Coin Metrics) po odtrendowaniu; tanio = plus',
    verify: [{ label: 'Coin Metrics · MVRV', url: 'https://charts.coinmetrics.io/crypto-data/' }] },
  { id: 'stats', rank: 5, name: 'Istotność statystyczna', short: 'Statystyka', auto: true, source: 'Auto: statystyka t średniego zwrotu z 90 dni (≈ z przy H0); ×0,5 gdy ADF wskazuje konsolidację' },
  { id: 'sentiment', rank: 6, name: 'Sentyment', short: 'Sentyment', auto: true, source: 'Auto: z-score Fear & Greed względem całej historii, odczyt kontrariański',
    verify: [{ label: 'Crypto Fear & Greed', url: 'https://alternative.me/crypto/fear-and-greed-index/' }],
    rubric: [
      { q: 'Crypto Fear & Greed', measure: 'Odczyt jako z-score względem historii (średnio ok. 50); wysoko = chciwość', plus: 'chciwość, wysoki odczyt (aplikacja liczy to na minus; wyjątek wg kursu: powyżej 90 zwroty 20-dniowe bywały wysokie, zobacz tabelę Sentyment w RSPS)', minus: 'strach, niski odczyt (aplikacja liczy to na plus)', label: 'alternative.me', url: 'https://alternative.me/crypto/fear-and-greed-index/', invert: true },
      { q: 'Google Trends: „bitcoin”', measure: 'Zainteresowanie wyszukiwaniem względem ostatnich 12 miesięcy w σ; wg slajdu silnie powiązane z ceną (R² ≈ 0,9), szczyty przy euforii detalu', plus: 'zainteresowanie dużo wyższe niż zwykle (aplikacja liczy to na minus)', minus: 'zainteresowanie niskie, brak uwagi detalu (aplikacja liczy to na plus)', label: 'Google Trends', url: 'https://trends.google.com/trends/explore?q=bitcoin', invert: true },
      { q: 'Lunacy (akcje): DIX, GEX + CNN Fear & Greed', measure: 'Średnia z-score trzech odczytów (jak „Adam’s Lunacy Gauge”); na wykresie z kursu szczyty wypadały przy euforii (np. początek 2018), dołki w bessie 2022', plus: 'euforia na akcjach, wysoka średnia (aplikacja liczy to na minus)', minus: 'strach na akcjach, niska średnia (aplikacja liczy to na plus)', label: 'SqueezeMetrics · DIX/GEX', url: 'https://squeezemetrics.com/monitor/dix', invert: true },
      { q: 'Smart Money / Dumb Money (akcje) lub sentix (krypto)', measure: 'Różnica pewności „smart money” i „dumb money” w σ względem historii; wysoka pewność „dumb money” = euforia detalu (dane płatne: SentimenTrader, sentix)', plus: 'przewaga „dumb money”, euforia detalu (aplikacja liczy to na minus)', minus: 'przewaga „smart money”, detal w strachu (aplikacja liczy to na plus)', label: 'SentimenTrader', url: 'https://sentimentrader.com/', invert: true },
      { q: 'CNN Fear & Greed (akcje)', measure: 'Odczyt 0–100 jako z-score; składnik wskaźnika Lunacy, gdy liczysz go osobno', plus: 'chciwość na akcjach (aplikacja liczy to na minus)', minus: 'strach na akcjach (aplikacja liczy to na plus)', label: 'CNN Fear & Greed', url: 'https://edition.cnn.com/markets/fear-and-greed', invert: true }
    ] },
  { id: 'ta', rank: 7, name: 'Uznaniowa analiza techniczna', short: 'Analiza techniczna', auto: false, source: 'Ręcznie · skala σ · najniższa waga. Test BTC 2018→ (research/run32.py): formacje świecowe bez istotnej przewagi (|t| < 1,4), struktura szczytów i dołków gorsza od trendu z 4 średnich (Sharpe 2024→ 0,09–0,62 vs 0,89). Traktuj jako uzupełnienie, nie sygnał',
    rubric: [
      { q: 'BTC na interwale tygodniowym', measure: 'Pozycja w Bollinger Bands (20, 2σ) na świecach 1W', plus: 'BTC powyżej środkowej linii, przy górnej wstędze (trend wzrostowy)', minus: 'poniżej środkowej linii, przy dolnej wstędze', label: 'TradingView · BTCUSDT 1W', url: TV('BINANCE:BTCUSDT') },
      { q: 'Kapitalizacja całego rynku (TOTAL)', measure: 'Pozycja w Bollinger Bands (50, 2σ) na świecach 1D', plus: 'TOTAL powyżej środkowej linii, przy górnej wstędze', minus: 'poniżej środkowej linii, przy dolnej wstędze', label: 'TradingView · TOTAL', url: TV('CRYPTOCAP:TOTAL') },
      { q: 'Wolumen BTC', measure: 'Wolumen względem średniej 20 dni w σ, ze znakiem kierunku ceny', plus: 'wolumen powyżej średniej przy rosnącej cenie', minus: 'wolumen powyżej średniej przy spadającej cenie', label: 'TradingView · BTCUSDT', url: TV('BINANCE:BTCUSDT') },
      { q: 'Struktura rynku (szczyty i dołki)', measure: 'Ocena jakościowa: siła struktury w skali σ', plus: 'wyższe szczyty i wyższe dołki', minus: 'niższe szczyty i niższe dołki', label: 'TradingView · BTCUSDT', url: TV('BINANCE:BTCUSDT'), qualitative: true }
    ] }
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

/** z: pillar z-score (σ), positive = favourable. */
export interface PillarValue { z: number | null; updated: number | null; detail?: string; manual?: boolean; }
export type PillarState = Record<PillarId, PillarValue>;

export const MANUAL_MAX_AGE_DAYS = 7;
export const Z_CLIP = 3;
export const clipZ = (z: number) => Math.max(-Z_CLIP, Math.min(Z_CLIP, z));

export const isFresh = (v: PillarValue | undefined, now = Date.now()) =>
  !!v && v.z != null && Number.isFinite(v.z) && v.updated != null && now - v.updated <= MANUAL_MAX_AGE_DAYS * 86400000;

export interface Composite { z: number; p: number; coverage: number; dispersion: number; missing: PillarId[]; contributions: Record<string, number>; }

/** Weighted mean of fresh pillar z-scores; p = Φ(Z); dispersion = weighted std of pillar z (σ). */
export function composite(state: PillarState, method: WeightMethod, now = Date.now()): Composite {
  const w = weights(method);
  let sw = 0, s = 0;
  const missing: PillarId[] = [];
  const contributions: Record<string, number> = {};
  const vals: number[] = [], ws: number[] = [];
  for (const p of PILLARS) {
    const v = state[p.id];
    if (!isFresh(v, now)) { missing.push(p.id); continue; }
    const z = clipZ(v.z as number);
    sw += w[p.id]; s += w[p.id] * z; contributions[p.id] = w[p.id] * z;
    vals.push(z); ws.push(w[p.id]);
  }
  const z = sw ? s / sw : 0;
  const dispersion = sw ? Math.sqrt(ws.reduce((a, wi, i) => a + wi * (vals[i] - z) ** 2, 0) / sw) : 0;
  return { z, p: normCdf(z), coverage: sw, dispersion, missing, contributions };
}

export const zLabel = (z: number) =>
  z >= 1 ? 'Silnie pozytywny' : z >= 0.25 ? 'Pozytywny' : z > -0.25 ? 'Neutralny' : z > -1 ? 'Negatywny' : 'Silnie negatywny';

// ---------- strict leverage gate (proposal only) ----------
export interface LeverageInputs {
  trendEnsemble: number; adfTrending: boolean; ltpi: number; sdcaRisk: number; volBelowMedian: boolean;
  persistDays: number; rspsActive: boolean; pyramid: Composite; state: PillarState;
}
export const LEV_MAX = 1.5;
export const LEV_PERSIST = 10;
/** Z ≥ +0.674 ⇔ Φ(Z) ≥ 75%; pillar floor z > −0.319 ⇔ Φ(z) > 37.5% (same as the former −1…+1 thresholds 0.5 / −0.25). */
export const LEV_Z_MIN = 0.674;
export const LEV_PILLAR_Z_FLOOR = -0.319;

export function leverageGate(x: LeverageInputs) {
  const checks = [
    { ok: x.trendEnsemble >= 1, label: 'Trend BTC: cena nad wszystkimi 4 średnimi (20/50/100/200)' },
    { ok: x.adfTrending, label: 'ADF: rynek w trendzie, nie w konsolidacji' },
    { ok: x.ltpi > 0, label: 'LTPI dodatnie' },
    { ok: x.sdcaRisk < 50, label: 'Wycena SDCA poniżej 50% (rynek nieprzegrzany)' },
    { ok: x.volBelowMedian, label: 'Zmienność BTC 30d poniżej mediany z roku' },
    { ok: x.persistDays >= LEV_PERSIST, label: `Wszystkie warunki automatyczne spełnione ≥ ${LEV_PERSIST} dni z rzędu (teraz ${x.persistDays})` },
    { ok: x.pyramid.missing.length === 0, label: `Wszystkie filary piramidy aktualne (ręczne ≤ ${MANUAL_MAX_AGE_DAYS} dni)` },
    { ok: x.pyramid.z >= LEV_Z_MIN, label: `Piramida Z ≥ +0,67σ, P ≥ 75% (teraz ${x.pyramid.z >= 0 ? '+' : ''}${x.pyramid.z.toFixed(2)}σ, P ${Math.round(x.pyramid.p * 100)}%)` },
    { ok: PILLARS.every((p) => (x.state[p.id]?.z ?? -9) > LEV_PILLAR_Z_FLOOR), label: 'Żaden filar poniżej −0,32σ (P > 37,5%)' },
    { ok: !x.rspsActive, label: 'RSPS nieaktywny (dźwignia tylko na BTC, nigdy na alty)' }
  ];
  const allowed = checks.every((c) => c.ok);
  return { allowed, leverage: allowed ? LEV_MAX : 1, checks };
}
