import { useEffect, useState } from 'react';
import { Card, Row, NumInput, Seg, toast } from './ui';
import { Chart } from './Chart';
import { usePersisted } from '../lib/db';
import { advancePaper, paperAllocation, paperDays, paperStats, paperSummary, startPaper, type PaperInputs, type PaperState } from '../lib/paper';
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
  useEffect(() => { if (st && inputs && inputs.date > st.lastDate) setSt(advancePaper(st, inputs)); }, [inputs?.date, inputs?.rspsTarget ? 1 : 0, !!st]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st) return (
    <Card>
      <div className="eyebrow" style={{ margin: 0 }}>Live testing</div>
      <div className="note-text mt8">Wirtualny portfel, który od chwili startu sam prowadzi strategię po każdym zamknięciu świecy (00:00 UTC): krzywa SDCA z bezpiecznikiem, rotacja RSPS z rezerwą złoto/BTC/stablecoin, rebalans podziału — bez Twoich kliknięć i bez czekania na wpisy ręczne. Ceny zamknięcia, koszt 0,15% za stronę. Nic nie trafia na giełdę.</div>
      <div className="between mt12"><span className="dim">Kapitał startowy</span><NumInput className="inline-input" value={amount} onChange={setAmount} suffix="$" /></div>
      <button className="btn primary block mt12" disabled={!inputs || !(amount && amount > 0)} onClick={() => {
        if (!inputs || !amount) return;
        const s = advancePaper(startPaper(inputs.date, amount, inputs.btcPrice, inputs.split), { ...inputs, missed: undefined });
        setSt(s); toast('Live testing wystartował');
      }}>{inputs ? 'Start live testingu' : 'Czekam na dzisiejsze sygnały…'}</button>
    </Card>
  );

  const S = paperStats(st);
  const A = paperAllocation(st), D = paperDays(st);
  const pl = A.total - st.startValue;
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
      </Card>
      <Card>
        <div className="eyebrow" style={{ margin: 0 }}>Zysk / strata</div>
        <Row className="compact" label="Wynik łącznie" value={<span className={pl >= 0 ? 'green' : 'red'}>{pl >= 0 ? '+' : ''}{usd(pl)} ({pc(pl / st.startValue)})</span>} />
        <Row className="compact" label="Niezrealizowany (otwarte pozycje)" value={<span className={A.unrealized >= 0 ? 'green' : 'red'}>{A.unrealized >= 0 ? '+' : ''}{usd(A.unrealized)}</span>} />
        <Row className="compact" label="Zrealizowany (po kosztach)" value={<span className={(st.realized ?? 0) >= 0 ? 'green' : 'red'}>{(st.realized ?? 0) >= 0 ? '+' : ''}{usd(st.realized ?? 0)}</span>} />
        <Row className="compact" label="Koszty transakcji" value={`${usd(st.fees ?? 0)} · ${st.trades ?? 0} transakcji`} />
        {D && <Row className="compact" label="Dni na plus · najlepszy · najgorszy" value={`${Math.round(D.up * 100)}% · ${pc(D.best)} · ${pc(D.worst)}`} />}
        <div className="note-text mt8">Wynik łącznie = niezrealizowany + zrealizowany (koszty już odjęte).</div>
      </Card>
      <Card className="tight">
        <div className="eyebrow" style={{ padding: '12px 16px 0', margin: 0 }}>Obecne rozłożenie · {usd(A.total)}</div>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th style={{ paddingLeft: 16 }}>Pozycja</th><th>Ilość</th><th>Wartość</th><th>Udział</th><th style={{ paddingRight: 16 }}>P/L</th></tr></thead>
            <tbody>
              {A.rows.filter((r) => r.value >= 0.5).map((r) => (
                <tr key={r.key}>
                  <td style={{ paddingLeft: 16 }}><b>{r.sym}</b> <span className="faint" style={{ fontSize: 11 }}>{r.sleeve}</span></td>
                  <td className="num">{r.sym === 'USDT' ? '—' : r.units.toPrecision(5)}</td>
                  <td className="num">{usd(r.value)}</td>
                  <td className="num">{Math.round(r.share * 100)}%</td>
                  <td className="num" style={{ paddingRight: 16 }}>{r.sym === 'USDT' ? '—' : <span className={r.pl >= 0 ? 'green' : 'red'}>{r.pl >= 0 ? '+' : ''}{usd(r.pl)} ({pc(r.plPct)})</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Seg value={view} onChange={setView} options={[{ v: 'week', l: 'Tygodnie' }, { v: 'month', l: 'Miesiące' }, { v: 'log', l: 'Historia' }]} />
      <Card className="tight mt8">
        {view !== 'log' && (rows.length ? rows.map((r) => (
          <Row key={r.period} className="compact" label={view === 'week' ? `tydz. od ${fmtDate(r.period)}` : r.period}
            value={<span className="num" style={{ fontSize: 13 }}><span className={r.ret >= 0 ? 'green' : 'red'}>{pc(r.ret)}</span> · BTC {pc(r.btcRet)} · {usd(r.value)} · {r.actions} zm.</span>} />
        )) : <div className="note-text" style={{ padding: 14 }}>Pierwsze podsumowanie po zamknięciu świecy.</div>)}
        {view === 'log' && st.log.slice(0, 60).map((l, i) => <Row key={i} className="compact" label={<span className="dim">{fmtDate(l.date)}</span>} value={<span style={{ fontSize: 12.5 }}>{l.text}</span>} />)}
      </Card>
      <div className="note-text mt8">Działa samodzielnie: po każdym zamknięciu dnia przy otwarciu aplikacji (iOS nie pozwala stronom działać w tle) wykonuje sygnały strategii. Dni, w których aplikacja była zamknięta, są nadrabiane z historii: SDCA i bezpiecznik dzień po dniu na cenach zamknięcia BTC; pozycje RSPS w tym czasie bez zmian (ceny altów znane tylko z dzisiejszego skanu) — wpisy oznaczone „uzupełnione z historii”. RSPS nie czeka na wpisy ręczne. Propozycje (ATH, dźwignia, short) nie są wykonywane. P/L liczony metodą średniego kosztu.</div>
      <button className="btn danger block mt8" onClick={() => { if (confirm('Zakończyć live testing i usunąć jego historię?')) setSt(null); }}>Zakończ live testing</button>
    </>
  );
}
