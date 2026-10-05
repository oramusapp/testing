import { useEffect, useState } from 'react';
import { Card, Row, NumInput, Seg, toast } from './ui';
import { Chart } from './Chart';
import { usePersisted } from '../lib/db';
import { paperStats, paperSummary, startPaper, stepPaper, type PaperInputs, type PaperState } from '../lib/paper';
import { fmtDate } from '../lib/format';

const pc = (x: number) => (Number.isFinite(x) ? (Math.abs(x) < 0.0005 ? '0,0%' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')}%`) : '—');
const nm = (x: number) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');
const usd = (x: number) => `${Math.round(x).toLocaleString('pl-PL')} $`;

/** Live testing: a virtual portfolio that follows the signals from the moment Start is pressed. */
export function PaperCard({ inputs }: { inputs: PaperInputs | null }) {
  const [st, setSt] = usePersisted<PaperState | null>('paper.state', null);
  const [amount, setAmount] = useState<number | null>(10000);
  const [view, setView] = useState<'week' | 'month' | 'log'>('week');

  // one step after every daily close, once the day's signals are ready
  useEffect(() => { if (st && inputs && inputs.date > st.lastDate) setSt(stepPaper(st, inputs)); }, [inputs?.date, inputs?.rspsTarget ? 1 : 0, !!st]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st) return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Live testing</div>
      <div className="note-text mt8">Wirtualny portfel, który od chwili startu sam wykonuje sygnały aplikacji po każdym zamknięciu świecy (00:00 UTC): krzywa SDCA z bezpiecznikiem, alokacja RSPS (gdy sygnał jest dostępny), rebalans podziału. Ceny zamknięcia, koszt 0,15% za stronę. Nic nie trafia na giełdę.</div>
      <div className="between mt12"><span className="dim">Kapitał startowy</span><NumInput className="inline-input" value={amount} onChange={setAmount} suffix="$" /></div>
      <button className="btn primary block mt12" disabled={!inputs || !(amount && amount > 0)} onClick={() => {
        if (!inputs || !amount) return;
        const s = stepPaper(startPaper(inputs.date, amount, inputs.btcPrice, inputs.split), inputs);
        setSt(s); toast('Live testing wystartował');
      }}>{inputs ? 'Start live testingu' : 'Czekam na dzisiejsze sygnały…'}</button>
    </Card>
  );

  const S = paperStats(st);
  const rows = view === 'log' ? [] : paperSummary(st, view);
  const labels = [st.start, ...st.points.map((p) => p.date)];
  const eq = [1, ...st.points.map((p) => p.value / st.startValue)];
  const b0 = st.points[0]?.btc ?? 1;
  const bh = [1, ...st.points.map((p) => p.btc / b0)];
  return (
    <>
      <Card>
        <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Live testing · od {fmtDate(st.start)}</div><span className="pill acc"><span className="dot" />aktywny</span></div>
        <div className="mid-number mt12">{S ? usd(S.value) : usd(st.startValue)} <span className={S && S.ret >= 0 ? 'green' : 'red'} style={{ fontSize: 16 }}>{S ? pc(S.ret) : ''}</span></div>
        <div className="dim" style={{ fontSize: 13 }}>BTC w tym czasie: {S ? pc(S.btcRet) : '—'} · {S?.days ?? 0} dni · ostatnia świeca {st.lastDate ? fmtDate(st.lastDate) : '—'}</div>
        {st.points.length > 1 && <div className="mt12"><Chart labels={labels} height={170} lines={[{ values: bh, color: '#8e8e93', width: 1.1 }, { values: eq, color: '#d4b483', width: 1.7 }]} tip={(i) => `${fmtDate(labels[i])} · portfel ${eq[i].toFixed(3)}× · BTC ${bh[i].toFixed(3)}×`} />
          <div className="legend"><span><i style={{ background: '#d4b483' }} />Live portfel</span><span><i style={{ background: '#8e8e93' }} />BTC</span></div></div>}
        {S && <>
          <Row className="compact" label="CAGR" value={Number.isFinite(S.cagr) ? pc(S.cagr) : 'od 30 dni'} />
          <Row className="compact" label="Sharpe · Sortino" value={`${nm(S.sharpe)} · ${nm(S.sortino)}`} />
          <Row className="compact" label="Maks. obsunięcie" value={<span className="red">{pc(S.maxDD)}</span>} />
          <Row className="compact" label="Średnia ekspozycja" value={`${Math.round(S.expo * 100)}%`} />
        </>}
        <Row className="compact" label="SDCA" value={`${st.sdca.btc.toFixed(6)} BTC + ${usd(st.sdca.usd)}`} />
        <Row className="compact" label="RSPS" value={`${Object.entries(st.rsps.units).filter(([, u]) => u > 0).map(([k]) => k).join(', ') || '—'} + ${usd(st.rsps.usd)}`} />
      </Card>
      <Seg value={view} onChange={setView} options={[{ v: 'week', l: 'Tygodnie' }, { v: 'month', l: 'Miesiące' }, { v: 'log', l: 'Historia' }]} />
      <Card className="tight mt8">
        {view !== 'log' && (rows.length ? rows.map((r) => (
          <Row key={r.period} className="compact" label={view === 'week' ? `tydz. od ${fmtDate(r.period)}` : r.period}
            value={<span className="num" style={{ fontSize: 13 }}><span className={r.ret >= 0 ? 'green' : 'red'}>{pc(r.ret)}</span> · BTC {pc(r.btcRet)} · {usd(r.value)} · {r.actions} zm.</span>} />
        )) : <div className="note-text" style={{ padding: 14 }}>Pierwsze podsumowanie po zamknięciu świecy.</div>)}
        {view === 'log' && st.log.slice(0, 60).map((l, i) => <Row key={i} className="compact" label={<span className="dim">{fmtDate(l.date)}</span>} value={<span style={{ fontSize: 12.5 }}>{l.text}</span>} />)}
      </Card>
      <div className="note-text mt8">Portfel liczy się przy otwarciu aplikacji po zamknięciu świecy; dni, w których aplikacja była zamknięta, łączą się w jeden okres (ceny RSPS z ostatniego skanu). RSPS zmienia się tylko, gdy sygnał jest dostępny (po uzupełnieniu danych ręcznych). Propozycje (ATH, dźwignia, short) nie są wykonywane.</div>
      <button className="btn danger block mt8" onClick={() => { if (confirm('Zakończyć live testing i usunąć jego historię?')) setSt(null); }}>Zakończ live testing</button>
    </>
  );
}
