import { Card, Seg, NumInput, toast } from './ui';
import { usePersisted } from '../lib/db';
import { MACRO42_EMPTY, MACRO42_VALID_DAYS, fresh42, kissBtc, score42, type Macro42, type Regime, type Risk4, type Tri } from '../lib/macro42';
import { fmtDate } from '../lib/format';

// BTC per GRID regime, read from 42 Macro slides in the course notes (monthly data; small BTC sample)
const BTC_BY_REGIME: Record<string, string> = { G: '+483%/rok (n = 7)', R: '+104%/rok (n = 22)', I: '+64%/rok (n = 19)', D: '−10%/rok (n = 17)' };
const REG_OPTS = [{ v: 'G' as Regime, l: 'Goldilocks' }, { v: 'R' as Regime, l: 'Reflacja' }, { v: 'I' as Regime, l: 'Inflacja' }, { v: 'D' as Regime, l: 'Deflacja' }];
const TRI_OPTS = [{ v: 'bull' as Tri, l: 'bullish' }, { v: 'neutral' as Tri, l: 'neutral' }, { v: 'bear' as Tri, l: 'bearish' }];
const RISK_OPTS = [{ v: 'low' as Risk4, l: '<25%' }, { v: 'moderate' as Risk4, l: '25–50' }, { v: 'reasonable' as Risk4, l: '50–75' }, { v: 'high' as Risk4, l: '>75%' }];
const DIR_OPTS = [{ v: 'up' as const, l: 'rośnie' }, { v: 'down' as const, l: 'spada' }];
const tone = (z: number | null) => (z == null ? 'var(--faint)' : z >= 0.25 ? 'var(--green)' : z <= -0.25 ? 'var(--red)' : 'var(--amber)');

export function useMacro42() {
  const [m, setM] = usePersisted<Macro42>('macro.42', MACRO42_EMPTY);
  const ok = fresh42(m);
  return { m, setM, ok, score: ok ? score42(m) : { z: null, parts: [] } };
}

/** Weekly 42 Macro readings: the user copies the model outputs from each Friday report (valid 7 days). */
export function Macro42Card() {
  const { m, setM, ok, score } = useMacro42();
  const set = <K extends keyof Macro42>(k: K, v: Macro42[K]) => setM({ ...m, [k]: v, updated: Date.now(), reportDate: m.reportDate || new Date().toISOString().slice(0, 10) });
  const kiss = kissBtc(m);
  const row = (label: string, el: React.ReactNode, hint?: string) => (
    <div style={{ display: 'grid', gap: 4 }}><div style={{ fontSize: 13.5 }}>{label}{hint && <span className="faint" style={{ fontSize: 12 }}> · {hint}</span>}</div>{el}</div>
  );
  return (
    <Card>
      <div className="between"><div className="eyebrow" style={{ margin: 0 }}>42 Macro · raport tygodniowy</div>
        {ok && score.z != null && <span className="pill" style={{ color: tone(score.z), background: 'var(--surface-3)' }}><span className="dot" />{score.z > 0 ? '+' : ''}{score.z.toFixed(2)}σ</span>}</div>
      <div className="note-text mt8">{ok ? `Odczyt z raportu ${m.reportDate ? fmtDate(m.reportDate) : ''} · ważny do ${fmtDate(new Date((m.updated ?? 0) + MACRO42_VALID_DAYS * 86400000).toISOString().slice(0, 10))}.` : 'Brak aktualnego odczytu (ważny 7 dni). Uzupełnij z najnowszego piątkowego raportu.'} Wpisujesz tylko odczyty modeli — treść raportu nie jest zapisywana.</div>
      <div className="mt12" style={{ display: 'grid', gap: 12 }}>
        {row('Data raportu', <input className="input" type="date" value={m.reportDate} onChange={(e) => set('reportDate', e.target.value)} />)}
        {row('Global Macro Risk Matrix — reżim teraz', <Seg value={m.regime} options={REG_OPTS} onChange={(v) => set('regime', v)} />, 'slajd „Market Regime”')}
        {row('Prawdopodobieństwo risk-on', <NumInput className="input" value={m.riskOnProb} onChange={(v) => set('riskOnProb', v == null ? null : Math.max(0, Math.min(100, v)))} suffix="%" />, '„Regime Change Probabilities”, Latest')}
        {row('VAMS Bitcoin', <Seg value={m.btcVams} options={TRI_OPTS} onChange={(v) => set('btcVams', v)} />, 'zielony / pomarańczowy / czerwony')}
        {row('VAMS Ethereum', <Seg value={m.ethVams} options={TRI_OPTS} onChange={(v) => set('ethVams', v)} />)}
        {row('VAMS złoto', <Seg value={m.goldVams} options={TRI_OPTS} onChange={(v) => set('goldVams', v)} />)}
        {row('Macro Weather Model — Bitcoin', <Seg value={m.weatherBtc} options={TRI_OPTS} onChange={(v) => set('weatherBtc', v)} />, '2–3 miesiące')}
        {row('Weather — utrzymanie risk-on', <Seg value={m.weatherRiskOn} options={RISK_OPTS} onChange={(v) => set('weatherRiskOn', v)} />, 'low / moderate / reasonable / high')}
        {row('Global Liquidity — trend', <Seg value={m.liqTrend} options={DIR_OPTS} onChange={(v) => set('liqTrend', v)} />)}
        {row('Global Liquidity — wskaźniki wyprzedzające', <Seg value={m.liqLead} options={DIR_OPTS} onChange={(v) => set('liqLead', v)} />, 'średni termin')}
        {row('GRID Model — modalny wynik', <Seg value={m.grid} options={REG_OPTS} onChange={(v) => set('grid', v)} />, 'średni termin')}
        {row('Positioning — ryzyko korekty (−10%)', <Seg value={m.corrRisk} options={RISK_OPTS} onChange={(v) => set('corrRisk', v)} />, 'krótki/średni termin')}
        {row('Positioning — ryzyko krachu (−20%)', <Seg value={m.crashRisk} options={RISK_OPTS} onChange={(v) => set('crashRisk', v)} />, 'średni/długi termin')}
        {row('KISS — Bitcoin (udział w portfelu)', <NumInput className="input" value={m.kissBtc} onChange={(v) => set('kissBtc', v)} suffix="%" />, 'np. 5')}
        {row('Dr. Mo — Bitcoin', <Seg value={m.drMoBtc} options={[{ v: 'longMax', l: 'Long max' }, { v: 'longHalf', l: 'Long ½' }, { v: 'none', l: 'Brak' }, { v: 'short', l: 'Short' }]} onChange={(v) => set('drMoBtc', v)} />)}
      </div>
      {ok && score.parts.length > 0 && <div className="mt12">
        <div className="eyebrow">Punktacja do filaru Makro</div>
        {score.parts.map((p) => <div key={p.name} className="row compact"><span className="dim">{p.name}</span><span className="num" style={{ color: tone(p.v) }}>{p.v > 0 ? '+' : ''}{p.v.toFixed(2)}</span></div>)}
      </div>}
      {m.regime && <div className="note-text mt8">BTC w reżimie {REG_OPTS.find((r) => r.v === m.regime)?.l} (slajdy 42 Macro z notatek): {BTC_BY_REGIME[m.regime]}. Reguła KISS dla BTC: cel 10% w risk-on (Goldilocks/Reflacja), 5% w risk-off (Inflacja/Deflacja); ekspozycja 100% / 50% / 0% celu przy VAMS bullish / neutral / bearish{kiss != null ? ` → dziś ${kiss}%` : ''}.</div>}
      <div className="note-text mt8">Jak liczona jest punktacja (nasze przypisanie, równe wagi, bez backtestu — historii modeli nie ma publicznie): reżim risk-on +1 / risk-off −1; P(risk-on) (p − 50)/25; VAMS i Weather Model BTC +1 / 0 / −1; utrzymanie risk-on high +1 … low −1; płynność ±0,5; GRID ±0,5; ryzyko korekty i krachu low +0,5 … high −1. Średnia zasila filar Makro w Piramidzie (razem z ręczną rubryką, jeśli wypełniona) przez 7 dni.</div>
      {ok && <button className="btn block mt8" onClick={() => { setM(MACRO42_EMPTY); toast('Wyczyszczono odczyt 42 Macro'); }}>Wyczyść odczyt</button>}
    </Card>
  );
}
