import { useState } from 'react';
import { Card, toast, SignBtn, flipSign } from './ui';
import { usePersisted } from '../lib/db';
import { normCdf } from '../lib/quant';
import { freshToday } from '../lib/market';

// Aggregate valuation sheet, as taught in the valuation lessons: every indicator gets a z-score
// (+ = high value / cheap, − = expensive), all equally weighted to cancel estimation error,
// at most two indicators per data site, so one site going down or misreporting does not skew the sheet;
// long-term indicators kept apart from faster (sentiment-like) ones so time horizons do not mix.
type Horizon = 'long' | 'medium';
interface ValItem { id: string; name: string; kind: 'on-chain' | 'technical' | 'aggregate'; horizon: Horizon; hint: string; label: string; url: string; }
const BMP = (slug: string) => `https://www.bitcoinmagazinepro.com/charts/${slug}/`;
export const VAL_ITEMS: ValItem[] = [
  { id: 'mvrvz', name: 'MVRV Z-Score', kind: 'on-chain', horizon: 'long', hint: 'Zielona strefa przy dnie cyklu = około +2; czerwona strefa szczytu = około −2.', label: 'Bitcoin Magazine Pro', url: BMP('mvrv-zscore') },
  { id: 'nupl', name: 'NUPL (niezrealizowany zysk netto)', kind: 'on-chain', horizon: 'long', hint: 'Kapitulacja (poniżej 0) = plus; euforia (powyżej 0,75) = minus. Mierzy presję sprzedaży z zysków.', label: 'Checkonchain', url: 'https://charts.checkonchain.com/' },
  { id: 'rhodl', name: 'RHODL Ratio', kind: 'on-chain', horizon: 'long', hint: 'Dolna część pasma historycznego = plus, górna = minus.', label: 'Glassnode Studio', url: 'https://studio.glassnode.com/charts/indicators.RhodlRatio?a=BTC' },
  { id: 'reserve', name: 'Reserve Risk', kind: 'on-chain', horizon: 'long', hint: 'Niska wartość (silne przekonanie posiadaczy, niska cena) = plus.', label: 'Bitcoin Magazine Pro', url: BMP('reserve-risk') },
  { id: 'realized', name: 'Cena zrealizowana / CVDD', kind: 'on-chain', horizon: 'long', hint: 'Cena blisko lub poniżej ceny zrealizowanej/CVDD = plus; wysoko ponad nią = minus.', label: 'Checkonchain', url: 'https://charts.checkonchain.com/' },
  { id: '2yma', name: 'Mnożnik 2-letniej średniej', kind: 'technical', horizon: 'long', hint: 'Cena poniżej 2Y MA = plus; przy linii ×5 = minus. Techniczny, więc nie przeważaj.', label: 'Blockchain.com', url: 'https://www.blockchain.com/explorer/charts/2y-moving-average' },
  { id: 'cbbi', name: 'CBBI (agregat)', kind: 'aggregate', horizon: 'long', hint: 'Niski CBBI (< 20) = plus, wysoki (> 80) = minus. Sprawdź, czy składniki są dobrze skalibrowane.', label: 'CBBI', url: 'https://colintalkscrypto.com/cbbi/' },
  { id: 'puell', name: 'Puell Multiple', kind: 'on-chain', horizon: 'medium', hint: 'Szybszy, bliższy sentymentowi; liczony osobno, żeby nie mieszać horyzontów.', label: 'Glassnode Studio', url: 'https://studio.glassnode.com/charts/indicators.PuellMultiple?a=BTC' }
];
interface ValState { z: Record<string, number | null>; updated: number | null; }

const heat = (z: number | null) => (z == null ? 'var(--surface-3)' : z >= 1.5 ? 'var(--green)' : z >= 0.5 ? '#9ccc5a' : z > -0.5 ? 'var(--amber)' : z > -1.5 ? '#e5ac4f' : 'var(--red)');
const sz = (z: number) => (z > 0 ? '+' : '') + z.toFixed(2).replace('.', ',');
function parse(t: string): number | null {
  const s = t.replace(',', '.').replace('−', '-').trim(); if (s === '') return null;
  const n = parseFloat(s); return Number.isFinite(n) ? Math.max(-3, Math.min(3, Math.round(n * 100) / 100)) : null;
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Returns the long-term valuation z (TRW sign: + = cheap) and its risk-% equivalent. */
export function useValuation(auto?: Record<string, number>) {
  const [v, setV] = usePersisted<ValState>('sdca.valuation', { z: {}, updated: null });
  // manual readings reset at every daily close (00:00 UTC) so they are re-entered each day
  const manualFresh = freshToday(v.updated);
  const zOf = (id: string): number | null => auto?.[id] ?? (manualFresh ? v.z[id] ?? null : null);
  const longZ = avg(VAL_ITEMS.filter((i) => i.horizon === 'long').map((i) => zOf(i.id)).filter((x): x is number => x != null));
  const medZ = avg(VAL_ITEMS.filter((i) => i.horizon === 'medium').map((i) => zOf(i.id)).filter((x): x is number => x != null));
  const filled = VAL_ITEMS.filter((i) => i.horizon === 'long' && zOf(i.id) != null).length;
  return { v, setV, zOf, manualFresh, longZ, medZ, filled, risk: longZ == null ? null : normCdf(-longZ) * 100 };
}

export function ValuationCard({ onUse, auto, mvrvAsOf, lastDate }: { onUse: (riskPct: number) => void; auto?: Record<string, number>; mvrvAsOf?: string | null; lastDate?: string }) {
  const val = useValuation(auto);
  const [txt, setTxt] = useState<Record<string, string>>({});
  const set = (id: string, t: string) => {
    setTxt({ ...txt, [id]: t });
    const z = parse(t);
    val.setV({ z: { ...(val.manualFresh ? val.v.z : {}), [id]: z }, updated: Date.now() });
  };
  const nLong = VAL_ITEMS.filter((i) => i.horizon === 'long').length;
  return (
    <Card>
      <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Arkusz wyceny (z-score)</div>
        {val.longZ != null && <span className="pill" style={{ color: heat(val.longZ), background: 'var(--surface-3)' }}><span className="dot" />{val.longZ >= 1.5 ? 'Wysoka wartość' : val.longZ <= -1.5 ? 'Drogo' : 'Neutralnie'}</span>}</div>
      <div className="flex mt8" style={{ alignItems: 'baseline', gap: 10 }}>
        <div className="mid-number" style={{ color: heat(val.longZ) }}>{val.longZ == null ? '—' : sz(val.longZ)}<span className="dim" style={{ fontSize: 14, textTransform: 'none' }}> σ</span></div>
        <div className="dim" style={{ fontSize: 13 }}>{val.filled}/{nLong} wskaźników długoterminowych{val.risk != null ? ` · odpowiada ryzyku ${val.risk.toFixed(1)}%` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
        {VAL_ITEMS.map((i) => <div key={i.id} title={i.name} style={{ flex: 1, height: 8, borderRadius: 2, background: heat(val.zOf(i.id)), opacity: i.horizon === 'medium' ? 0.5 : 1 }} />)}
      </div>
      <div className="mt12" style={{ display: 'grid', gap: 10 }}>
        {VAL_ITEMS.map((i) => (
          <div key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 8, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{i.name} <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>· {i.kind}{i.horizon === 'medium' ? ' · średni horyzont' : ''}</span></div>
              <div className="faint" style={{ fontSize: 12.5 }}>{i.hint}</div>
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="accent" style={{ fontSize: 12.5, textDecoration: 'none' }}>↗ {i.label}</a>
            </div>
            {auto?.[i.id] != null
              ? <div className="num" style={{ width: 84, textAlign: 'center', fontWeight: 600, color: heat(auto[i.id]) }}>{sz(auto[i.id])}<div className="faint" style={{ fontSize: 11, fontWeight: 400 }}>auto</div></div>
              : <input className="input" style={{ width: 84, textAlign: 'center', borderColor: heat(val.v.z[i.id] ?? null) }} inputMode="decimal" placeholder="z"
                  value={txt[i.id] ?? (!val.manualFresh || val.v.z[i.id] == null ? '' : String(val.v.z[i.id]))} onChange={(e) => set(i.id, e.target.value)} />}
            {auto?.[i.id] == null && <SignBtn onClick={() => set(i.id, flipSign(txt[i.id] ?? (!val.manualFresh || val.v.z[i.id] == null ? '' : String(val.v.z[i.id]))))} />}
          </div>
        ))}
      </div>
      {val.medZ != null && <div className="note-text mt8">Średni horyzont (osobno): {sz(val.medZ)}σ. Nie wchodzi do wyceny długoterminowej.</div>}
      <button className="btn block mt12" disabled={val.risk == null} onClick={() => { onUse(Math.round(val.risk! * 10) / 10); toast('Ustawiono jako wskaźnik ręczny'); }}>Użyj jako wskaźnik ręczny w Composite Risk</button>
      <div className="note-text mt8">Wskaźniki oznaczone „auto” liczy aplikacja z ceny i MVRV (Coin Metrics); podaż i emisja to przybliżenie z harmonogramu halvingów (liniowo między halvingami, 144 bloki dziennie), z-score względem całej historii od 2011 — bez ręcznej oceny. Pozostałe wpisz ręcznie: z-score każdego wskaźnika (−3…+3, np. 1,5 lub −0,75). Konwencja TRW: plus = wysoka wartość (tanio, strefa akumulacji), minus = drogo (strefa sprzedaży); ±1,5–2σ to skrajności. Wszystkie wskaźniki mają równe wagi, więc błędy ocen się uśredniają. Wskaźniki o krótszym horyzoncie liczone są osobno. Wyższa jakość danych (on-chain, fundamenty) jest ważniejsza niż wskaźniki techniczne. Wynik zamieniany jest na ryzyko 0–100% wzorem Φ(−z) i może zasilić Composite Risk jako wskaźnik ręczny. {mvrvAsOf && lastDate && mvrvAsOf < lastDate ? `MVRV z Coin Metrics tylko do ${mvrvAsOf}; późniejsze dni szacowane z dzisiejszej ceny i ostatniej ceny zrealizowanej. ` : ''}{val.v.updated ? `Ostatnia zmiana: ${new Date(val.v.updated).toLocaleDateString('pl-PL')}.` : ''}</div>
    </Card>
  );
}

/** Rate of accumulation: spread the stablecoin reserve over the expected DCA-able period (best guess, not a forecast). */
export function AccumulationCalc({ cash }: { cash: number }) {
  const [days, setDays] = usePersisted<{ mean: number; sd: number }>('sdca.accum', { mean: 114, sd: 32 });
  const rows = [{ l: 'Krótszy okres (−1σ)', d: Math.max(1, days.mean - days.sd) }, { l: 'Średnio', d: days.mean }, { l: 'Dłuższy okres (+1σ)', d: days.mean + days.sd }];
  return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Tempo akumulacji (kalkulator)</div>
      <div className="flex mt8" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => setDays({ mean: 114, sd: 32 })}>Średnia bess · 114 ± 32</button>
        <button className="btn small" onClick={() => setDays({ mean: 145, sd: 27 })}>Regresja faz · 145 ± 27</button>
      </div>
      <div className="flex mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="dim" style={{ fontSize: 13 }}>Dni wartości: średnio <input className="input" style={{ width: 70 }} inputMode="numeric" value={days.mean} onChange={(e) => setDays({ ...days, mean: Math.max(1, +e.target.value || 1) })} /></label>
        <label className="dim" style={{ fontSize: 13 }}>odchylenie <input className="input" style={{ width: 70 }} inputMode="numeric" value={days.sd} onChange={(e) => setDays({ ...days, sd: Math.max(0, +e.target.value || 0) })} /></label>
      </div>
      <div className="mt8">
        {rows.map((r) => <div key={r.l} className="row compact"><span>{r.l} · {r.d} dni</span><span className="num">{(100 / r.d).toFixed(2).replace('.', ',')}%/dzień{cash > 0 ? ` · ${Math.round(cash / r.d).toLocaleString('pl-PL')} $` : ''}</span></div>)}
      </div>
      <div className="note-text mt8">Domyślnie 114 ± 32 dni, czyli średnia długość okresów wysokiej wartości w poprzednich bessach według notatek z kursu. Wariant „regresja faz” pochodzi ze slajdu: regresja liniowa długości 4 poprzednich faz (77, 147, 98, 135 dni; R² = 0,25) daje 145 dni dla fazy 5, z odchyleniem reszt 27 dni. To tylko szacunek z kilku cykli. Zbyt wolne tempo jest bezpieczniejsze niż zbyt szybkie, bo resztę gotówki można dokupić przy powrocie dodatniego trendu. Decyzję podejmuje krzywa akumulacji; w backteście wolniejsze tempo od 2020 obniżyło CAGR, choć zmniejszyło obsunięcie.</div>
    </Card>
  );
}
