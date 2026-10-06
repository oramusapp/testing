import { useRef } from 'react';
import { Card, toast } from './ui';
import { useBtc, setTvTotal, effectiveTotal } from '../lib/btcStore';
import { parseTvCsv, snapAgreement, SNAP_ON_TIME_H } from '../lib/market';
import { fmtDate } from '../lib/format';

/** $TOTAL source: the user's TradingView CRYPTOCAP:TOTAL export (official series) or the built-in index. */
export function TvTotalCard() {
  const st = useBtc();
  const file = useRef<HTMLInputElement>(null);
  const eff = effectiveTotal(st);
  const tv = st.tv;
  const lastTv = tv?.rows.at(-1)?.[0];
  const ageDays = lastTv ? Math.floor((Date.now() - Date.parse(lastTv)) / 86400000) : NaN;
  const stale = !tv || ageDays > 7;
  const ag = snapAgreement(st.snaps ?? [], st.total);
  const lastTot = eff?.rows.at(-1)?.[0], lastBtc = st.model?.dates.at(-1);
  const trackBtcFrom = lastTot && lastBtc && lastTot < lastBtc ? st.model!.dates.find((d) => d > lastTot) ?? null : null;
  const pl = (x: number, d = 1) => x.toFixed(d).replace('.', ',');
  async function onFile(f: File) {
    try {
      const rows = parseTvCsv(await f.text());
      await setTvTotal({ rows, imported: Date.now(), file: f.name });
      toast(`Zaimportowano ${rows.length} świec $TOTAL (do ${rows.at(-1)![0]})`);
    } catch (e) { toast('Import nieudany: ' + (e as Error).message); }
  }
  return (
    <Card>
      <div className="between"><div className="eyebrow" style={{ margin: 0 }}>Źródło $TOTAL</div>
        <span className="pill" style={{ color: stale ? 'var(--amber)' : 'var(--green)', background: 'var(--surface-3)' }}><span className="dot" />{tv ? (stale ? `TradingView · ${ageDays} dni temu` : 'TradingView') : 'indeks wbudowany'}</span></div>
      <div className="note-text mt8">{eff?.source ?? '—'}.{eff?.approxFrom ? ` Od ${fmtDate(eff.approxFrom)} szacunek.` : ''}{trackBtcFrom ? ` Uwaga: od ${fmtDate(trackBtcFrom)} brak danych $TOTAL — TPI używa wtedy ruchu BTC.` : ''}</div>
      <div className="note-text mt8">
        {tv
          ? `Dane TradingView do ${fmtDate(lastTv!)} (plik ${tv.file}). Kolejne dni do następnego importu wylicza własny indeks z 39 aktywów Coin Metrics, przypięty do poziomu TradingView. Importuj co tydzień, żeby TPI liczyło się na oficjalnej serii.`
          : 'Teraz TPI liczy się na własnym indeksie z 39 aktywów Coin Metrics (część oficjalnego $TOTAL — o ile mniejsza, pokaże porównanie z codziennymi zapisami niżej). Oficjalny CRYPTOCAP:TOTAL z TradingView możesz zaimportować: TradingView nie udostępnia publicznego API, więc dane pochodzą z Twojego eksportu.'}
      </div>
      <div className="hr" />
      <div className="eyebrow">Oficjalna kapitalizacja · codzienny zapis</div>
      <div className="note-text">{ag.total
        ? `Zapisane zamknięcia: ${ag.total} (na czas, do ${SNAP_ON_TIME_H} h po 00:00 UTC: ${ag.onTime}). Ostatni: ${ag.last ? `${fmtDate(ag.last.date)} · ${(ag.last.value / 1e12).toFixed(2).replace('.', ',')} bln $ · ${ag.last.source}` : '—'}.`
        : 'Po każdym zamknięciu dnia aplikacja zapisuje bieżącą całkowitą kapitalizację rynku (CoinGecko, w razie braku: CoinMarketCap, CoinPaprika, CoinLore — darmowe, bez klucza). Pierwszy zapis po najbliższym otwarciu aplikacji.'}</div>
      {ag.total > 0 && <div className="note-text mt8">{ag.n >= 10
        ? `Zgodność z indeksem używanym przez TPI (${ag.n} par dni): korelacja dziennych zmian ${pl(ag.corr, 3)}, średnia różnica ${pl(ag.mad * 100, 2)} pkt proc. dziennie; poziom indeksu ≈ ${pl(ag.levelRatio > 0 ? 100 / ag.levelRatio : NaN, 0)}% oficjalnej kapitalizacji.`
        : `Porównanie z indeksem pojawi się po 10 parach kolejnych dni zapisanych na czas (teraz ${ag.n}). Seria służy do kontroli — TPI liczy się na imporcie z TradingView lub indeksie.`}</div>}
      <div className="note-text mt8">Jak: TradingView → wykres CRYPTOCAP:TOTAL, interwał 1D, przewiń w lewo do początku historii → menu wykresu → „Export chart data” (plan płatny od Essential) → wybierz plik CSV tutaj.</div>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
      <button className="btn primary block mt12" onClick={() => file.current?.click()}>{tv ? 'Zaktualizuj z pliku TradingView' : 'Importuj CSV z TradingView'}</button>
      {tv && <button className="btn block mt8" onClick={() => { void setTvTotal(null); toast('Usunięto import — wraca indeks wbudowany'); }}>Usuń import</button>}
    </Card>
  );
}
