import { useRef } from 'react';
import { Card, toast } from './ui';
import { useBtc, setTvTotal, effectiveTotal } from '../lib/btcStore';
import { parseTvCsv } from '../lib/market';
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
      <div className="note-text mt8">{eff?.source ?? '—'}.</div>
      <div className="note-text mt8">
        {tv
          ? `Dane TradingView do ${fmtDate(lastTv!)} (plik ${tv.file}). Kolejne dni do następnego importu wylicza własny indeks z 45 aktywów Coin Metrics, przypięty do poziomu TradingView. Importuj co tydzień, żeby TPI liczyło się na oficjalnej serii.`
          : 'Teraz TPI liczy się na własnym indeksie z 45 aktywów Coin Metrics (ok. 90% oficjalnego $TOTAL). Oficjalny CRYPTOCAP:TOTAL z TradingView możesz zaimportować: TradingView nie udostępnia publicznego API, więc dane pochodzą z Twojego eksportu.'}
      </div>
      <div className="note-text mt8">Jak: TradingView → wykres CRYPTOCAP:TOTAL, interwał 1D, przewiń w lewo do początku historii → menu wykresu → „Export chart data” (plan płatny od Essential) → wybierz plik CSV tutaj.</div>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
      <button className="btn primary block mt12" onClick={() => file.current?.click()}>{tv ? 'Zaktualizuj z pliku TradingView' : 'Importuj CSV z TradingView'}</button>
      {tv && <button className="btn block mt8" onClick={() => { void setTvTotal(null); toast('Usunięto import — wraca indeks wbudowany'); }}>Usuń import</button>}
    </Card>
  );
}
