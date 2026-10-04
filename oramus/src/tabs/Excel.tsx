import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Screen, Card, Sheet, shareFile, toast } from '../components/ui';
import { IcPlus, IcFile, IcBack, IcShare, IcUndo, IcRedo, IcTrash, IcMore, IcDownload } from '../components/icons';
import { listFiles, putFile, getFile, deleteFile, usePersisted, type FileMeta } from '../lib/db';
import { Book, addr, colName, formatValue, DEFAULT_COL, DEFAULT_ROW, NUM_FORMATS } from '../lib/workbook';
import { uid } from '../lib/format';

const HEAD_W = 44, HEAD_H = 26;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function Excel() {
  const [files] = usePersisted<FileMeta[]>('excel.files', []);
  const [open, setOpen] = useState<{ meta: FileMeta; book: Book } | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function openFile(f: File) {
    setLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const book = await Book.open(buf, f.name);
      const name = f.name.replace(/\.(csv|txt)$/i, '.xlsx');
      const meta: FileMeta = { id: uid(), name, size: buf.byteLength, modified: Date.now() };
      await putFile(meta, /\.xlsx?$/i.test(f.name) ? buf : await book.toXlsx());
      setOpen({ meta, book });
    } catch (e) { toast('Nie można otworzyć pliku: ' + (e as Error).message); }
    finally { setLoading(false); }
  }
  async function openStored(meta: FileMeta) {
    setLoading(true);
    try {
      const buf = await getFile(meta.id);
      if (!buf) throw new Error('brak danych pliku');
      setOpen({ meta, book: await Book.open(buf, meta.name) });
    } catch (e) { toast('Błąd: ' + (e as Error).message); }
    finally { setLoading(false); }
  }
  async function create() {
    const book = Book.blank();
    const n = listFiles().filter((f) => f.name.startsWith('Skoroszyt')).length + 1;
    const meta: FileMeta = { id: uid(), name: `Skoroszyt ${n}.xlsx`, size: 0, modified: Date.now() };
    await putFile(meta, await book.toXlsx());
    setOpen({ meta, book });
  }

  return (
    <>
      <Screen title="Excel" subtitle="Czytnik i edytor arkuszy · formuły liczone na żywo">
        <div className="flex mb12">
          <button className="btn primary grow" onClick={() => input.current?.click()} disabled={loading}><IcFile width={18} />{loading ? 'Otwieranie…' : 'Otwórz plik'}</button>
          <button className="btn grow" onClick={create}><IcPlus width={18} />Nowy skoroszyt</button>
        </div>
        <input ref={input} type="file" hidden accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void openFile(f); }} />
        <div className="section-title">Ostatnie</div>
        <Card className="tight">
          {files.length === 0 && <div className="empty">Brak plików. Otwórz .xlsx lub .csv z aplikacji Pliki, iCloud lub poczty.</div>}
          {files.map((f) => (
            <div key={f.id} className="list-item file-item" onClick={() => openStored(f)}>
              <div className="ext">XLSX</div>
              <div className="grow">
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div className="faint" style={{ fontSize: 12.5 }}>{new Date(f.modified).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })} · {(f.size / 1024).toFixed(0)} KB</div>
              </div>
              <button className="icon-btn plain" onClick={async (e) => { e.stopPropagation(); const b = await getFile(f.id); if (b) await shareFile(new Blob([b], { type: XLSX_MIME }), f.name); }}><IcShare width={19} /></button>
              <button className="icon-btn plain" onClick={(e) => { e.stopPropagation(); if (confirm(`Usunąć „${f.name}” z aplikacji?`)) void deleteFile(f.id); }}><IcTrash width={19} /></button>
            </div>
          ))}
        </Card>
        <div className="note-text mt12">Obsługiwane: .xlsx, .xlsm (bez makr), .csv. Formuły są przeliczane silnikiem HyperFormula (~420 funkcji Excela). Zapis zachowuje style, szerokości kolumn i scalenia z oryginału. Pliki przechowywane są lokalnie w telefonie; eksport przez „Udostępnij → Zapisz w Plikach”.</div>
      </Screen>
      {open && <Workbook key={open.meta.id} meta={open.meta} book={open.book} onClose={() => setOpen(null)} />}
    </>
  );
}

interface Sel { r0: number; c0: number; r1: number; c1: number; }
const norm = (s: Sel) => ({ r0: Math.min(s.r0, s.r1), c0: Math.min(s.c0, s.c1), r1: Math.max(s.r0, s.r1), c1: Math.max(s.c0, s.c1) });

function Workbook({ meta: meta0, book, onClose }: { meta: FileMeta; book: Book; onClose: () => void }) {
  const [meta, setMetaState] = useState(meta0);
  const metaRef = useRef(meta0);
  const setMeta = (m: FileMeta) => { metaRef.current = m; setMetaState(m); };
  const [sheet, setSheet] = useState(0);
  const [sel, setSel] = useState<Sel>({ r0: 0, c0: 0, r1: 0, c1: 0 });
  const [rangeMode, setRangeMode] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [ver, setVer] = useState(0);
  const [view, setView] = useState({ top: 0, left: 0, w: 400, h: 600 });
  const [menu, setMenu] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bump = () => setVer((v) => v + 1);
  const m = book.sheets[sheet];

  const persist = useCallback(async () => {
    const buf = await book.toXlsx();
    const nm = { ...metaRef.current, size: buf.byteLength, modified: Date.now() };
    await putFile(nm, buf);
    setMeta(nm);
  }, [book]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = () => { bump(); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void persist(), 1500); };
  useEffect(() => () => { clearTimeout(saveTimer.current); if (book.dirty) void persist(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // geometry
  const dims = book.dims(sheet);
  const nRows = Math.max(dims.rows + 60, 100), nCols = Math.max(dims.cols + 8, 26);
  const colW = (c: number) => m.colWidths[c] || DEFAULT_COL;
  const rowH = (r: number) => m.rowHeights[r] || DEFAULT_ROW;
  const colX = useMemo(() => { const a = [0]; for (let c = 0; c < nCols; c++) a.push(a[c] + colW(c)); return a; }, [nCols, sheet, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowY = useMemo(() => { const a = [0]; for (let r = 0; r < nRows; r++) a.push(a[r] + rowH(r)); return a; }, [nRows, sheet, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const find = (arr: number[], v: number) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid - 1; } return Math.min(lo, arr.length - 2); };

  useEffect(() => {
    const el = scroller.current!;
    let raf = 0;
    const upd = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setView({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth, h: el.clientHeight })); };
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    return () => { el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); };
  }, []);

  const r0 = find(rowY, Math.max(0, view.top - HEAD_H)), r1 = find(rowY, view.top + view.h) + 1;
  const c0 = find(colX, Math.max(0, view.left - HEAD_W)), c1 = find(colX, view.left + view.w) + 1;
  const S = norm(sel);
  const active = { r: sel.r0, c: sel.c0 };
  const rawActive = book.raw(sheet, active.r, active.c);
  const editingFormula = edit != null && edit.startsWith('=');

  // merged cells: map top-left → span, hidden cells skipped
  const mergeInfo = useMemo(() => {
    const top = new Map<string, { r1: number; c1: number }>(), hidden = new Set<string>();
    m.merges.forEach((g) => { top.set(g.r0 + ':' + g.c0, { r1: g.r1, c1: g.c1 }); for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) if (r !== g.r0 || c !== g.c0) hidden.add(r + ':' + c); });
    return { top, hidden };
  }, [m]);

  function commit(move?: 'down' | 'right') {
    if (edit != null && edit !== rawActive) { book.set(sheet, active.r, active.c, edit); changed(); }
    setEdit(null);
    if (move === 'down') setSel({ r0: active.r + 1, c0: active.c, r1: active.r + 1, c1: active.c });
    if (move === 'right') setSel({ r0: active.r, c0: active.c + 1, r1: active.r, c1: active.c + 1 });
  }

  const caret = useRef<[number, number]>([0, 0]);
  const lastTap = useRef<{ r: number; c: number; t: number }>({ r: -1, c: -1, t: 0 });
  function tapCell(r: number, c: number) {
    if (editingFormula) {
      // insert the tapped cell's address at the caret of the formula being typed
      const [a, b] = caret.current;
      const ref = addr(r, c);
      const next = edit!.slice(0, a) + ref + edit!.slice(b);
      setEdit(next);
      caret.current = [a + ref.length, a + ref.length];
      fx.current?.focus();
      requestAnimationFrame(() => fx.current?.setSelectionRange(a + ref.length, a + ref.length));
      return;
    }
    if (edit != null) commit();
    const now = Date.now();
    if (lastTap.current.r === r && lastTap.current.c === c && now - lastTap.current.t < 350) { fx.current?.focus(); return; }
    lastTap.current = { r, c, t: now };
    if (rangeMode) setSel({ ...sel, r1: r, c1: c });
    else setSel({ r0: r, c0: c, r1: r, c1: c });
  }

  const autoSum = () => {
    const s = S;
    let target: { r: number; c: number }, range: string;
    if (s.r0 === s.r1 && s.c0 === s.c1) {
      // sum the contiguous numbers above the active cell
      let r = s.r0 - 1; while (r >= 0 && typeof book.value(sheet, r, s.c0) === 'number') r--;
      if (r === s.r0 - 1) return toast('Zaznacz zakres do zsumowania');
      target = { r: s.r0, c: s.c0 }; range = `${addr(r + 1, s.c0)}:${addr(s.r0 - 1, s.c0)}`;
    } else { target = { r: s.r1 + 1, c: s.c0 }; range = `${addr(s.r0, s.c0)}:${addr(s.r1, s.c1)}`; }
    book.set(sheet, target.r, target.c, `=SUM(${range})`); setSel({ r0: target.r, c0: target.c, r1: target.r, c1: target.c }); setRangeMode(false); changed();
  };

  const cells: React.ReactNode[] = [];
  for (let r = r0; r <= Math.min(r1, nRows - 1); r++) {
    for (let c = c0; c <= Math.min(c1, nCols - 1); c++) {
      const key = r + ':' + c;
      if (mergeInfo.hidden.has(key)) continue;
      const v = book.value(sheet, r, c);
      const st = book.style(sheet, r, c);
      if (v == null && !st.fill) continue;
      const span = mergeInfo.top.get(key);
      const f = formatValue(v, st.numFmt);
      const w = span ? colX[span.c1 + 1] - colX[c] : colW(c), h = span ? rowY[span.r1 + 1] - rowY[r] : rowH(r);
      cells.push(
        <div key={key} className={'gcell' + (f.num ? ' n' : '') + (f.err ? ' err' : '')}
          style={{ left: HEAD_W + colX[c], top: HEAD_H + rowY[r], width: w, height: h, fontWeight: st.b ? 700 : undefined, fontStyle: st.i ? 'italic' : undefined, textDecoration: st.u ? 'underline' : undefined, color: st.color && st.color !== '#000000' ? st.color : undefined, background: st.fill, justifyContent: st.align === 'center' || st.align === 'centerContinuous' ? 'center' : st.align === 'right' ? 'flex-end' : st.align === 'left' ? 'flex-start' : undefined, fontSize: st.size ? Math.min(Math.max(st.size * 1.1, 10), 22) : undefined, whiteSpace: st.wrap ? 'normal' : undefined, overflow: v != null && !f.num && !st.wrap && c + 1 < nCols && book.value(sheet, r, c + 1) == null ? 'visible' : undefined, zIndex: v != null && !f.num ? 1 : undefined }}>
          {f.text}
        </div>
      );
    }
  }
  const colHeads: React.ReactNode[] = [], rowHeads: React.ReactNode[] = [];
  for (let c = c0; c <= Math.min(c1, nCols - 1); c++) colHeads.push(<div key={c} className={'ghead' + (c >= S.c0 && c <= S.c1 ? ' on' : '')} style={{ left: HEAD_W + colX[c], top: view.top, width: colW(c), height: HEAD_H }} onClick={(e) => { e.stopPropagation(); setSel({ r0: 0, c0: c, r1: Math.max(dims.rows - 1, 0), c1: c }); }}>{colName(c)}</div>);
  for (let r = r0; r <= Math.min(r1, nRows - 1); r++) rowHeads.push(<div key={r} className={'ghead' + (r >= S.r0 && r <= S.r1 ? ' on' : '')} style={{ left: view.left, top: HEAD_H + rowY[r], width: HEAD_W, height: rowH(r) }} onClick={(e) => { e.stopPropagation(); setSel({ r0: r, c0: 0, r1: r, c1: Math.max(dims.cols - 1, 0) }); }}>{r + 1}</div>);

  const selSpan = mergeInfo.top.get(S.r0 + ':' + S.c0);
  const selBox = { left: HEAD_W + colX[S.c0], top: HEAD_H + rowY[S.r0], width: colX[(selSpan && S.r0 === S.r1 && S.c0 === S.c1 ? selSpan.c1 : S.c1) + 1] - colX[S.c0], height: rowY[(selSpan && S.r0 === S.r1 && S.c0 === S.c1 ? selSpan.r1 : S.r1) + 1] - rowY[S.r0] };

  // selection summary (like Excel's status bar)
  const summary = useMemo(() => {
    if (S.r0 === S.r1 && S.c0 === S.c1) return null;
    let sum = 0, cnt = 0, nums = 0;
    for (let r = S.r0; r <= Math.min(S.r1, S.r0 + 2000); r++) for (let c = S.c0; c <= S.c1; c++) { const v = book.value(sheet, r, c); if (v != null) cnt++; if (typeof v === 'number') { sum += v; nums++; } }
    return { sum, cnt, avg: nums ? sum / nums : NaN };
  }, [S.r0, S.r1, S.c0, S.c1, sheet, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellsInSel = () => { const a: { r: number; c: number }[] = []; for (let r = S.r0; r <= Math.min(S.r1, S.r0 + 5000); r++) for (let c = S.c0; c <= S.c1; c++) a.push({ r, c }); return a; };

  return (
    <div className="xl">
      <div className="xl-top">
        <button className="text-btn flex" style={{ gap: 2 }} onClick={async () => { commit(); if (book.dirty) await persist(); onClose(); }}><IcBack width={22} />Pliki</button>
        <div className="name">{meta.name}</div>
        <button className="icon-btn plain" onClick={() => { if (book.undo()) changed(); }}><IcUndo width={20} /></button>
        <button className="icon-btn plain" onClick={() => { if (book.redo()) changed(); }}><IcRedo width={20} /></button>
        <button className="icon-btn plain" onClick={() => setMenu(true)}><IcMore width={22} /></button>
      </div>
      <div className="fx">
        <div className="addr">{S.r0 === S.r1 && S.c0 === S.c1 ? addr(active.r, active.c) : `${addr(S.r0, S.c0)}:${addr(S.r1, S.c1)}`}</div>
        <span className="fx-ico">fx</span>
        <input ref={fx} value={edit ?? rawActive} placeholder="Wartość lub =formuła" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onFocus={() => setEdit(edit ?? rawActive)} onChange={(e) => { setEdit(e.target.value); caret.current = [e.target.selectionStart ?? 0, e.target.selectionEnd ?? 0]; }}
          onSelect={(e) => { const t = e.target as HTMLInputElement; caret.current = [t.selectionStart ?? 0, t.selectionEnd ?? 0]; }}
          onKeyDown={(e) => { if (e.key === 'Enter') { commit('down'); fx.current?.blur(); } if (e.key === 'Escape') { setEdit(null); fx.current?.blur(); } if (e.key === 'Tab') { e.preventDefault(); commit('right'); } }}
          onBlur={() => { if (!editingFormula) commit(); }} />
        {edit != null && <button className="text-btn" style={{ fontWeight: 600 }} onPointerDown={(e) => e.preventDefault()} onClick={() => { commit(); fx.current?.blur(); }}>OK</button>}
      </div>
      <div className="xl-tools">
        <button onClick={autoSum}>Σ Suma</button>
        <button className={rangeMode ? 'on' : ''} onClick={() => setRangeMode(!rangeMode)}>⬚ Zakres</button>
        <button onClick={() => { book.copy(sheet, S.r0, S.c0, S.r1, S.c1); toast('Skopiowano'); }}>Kopiuj</button>
        <button onClick={() => { if (book.paste(sheet, S.r0, S.c0)) changed(); else toast('Schowek pusty'); }}>Wklej</button>
        <button onClick={() => { book.clear(sheet, S.r0, S.c0, S.r1, S.c1); changed(); }}>Wyczyść</button>
        <button style={{ fontWeight: 800 }} onClick={() => { const b = !book.style(sheet, S.r0, S.c0).b; book.setStyle(sheet, cellsInSel(), (cell) => { cell.font = { ...(cell.font ?? {}), bold: b }; }); changed(); }}>B</button>
        <button onClick={() => setFmtOpen(true)}>123</button>
        <button onClick={() => { book.insertRow(sheet, S.r0); changed(); }}>+ Wiersz</button>
        <button onClick={() => { book.deleteRow(sheet, S.r0); changed(); }}>− Wiersz</button>
        <button onClick={() => { book.insertCol(sheet, S.c0); changed(); }}>+ Kolumna</button>
        <button onClick={() => { book.deleteCol(sheet, S.c0); changed(); }}>− Kolumna</button>
      </div>
      <div className="grid-scroll" ref={scroller}>
        <div className="grid-canvas" style={{ width: HEAD_W + colX[nCols], height: HEAD_H + rowY[nRows] }}
          onClick={(e) => {
            const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - box.left - HEAD_W, y = e.clientY - box.top - HEAD_H;
            if (x < 0 || y < 0) return;
            tapCell(find(rowY, y), find(colX, x));
          }}>
          {cells}
          <div className="gsel" style={selBox} />
          {colHeads}{rowHeads}
          <div className="ghead" style={{ left: view.left, top: view.top, width: HEAD_W, height: HEAD_H, zIndex: 5 }} />
        </div>
      </div>
      {summary && <div className="faint num" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--surface)', borderTop: '.5px solid var(--line)' }}>Suma: {formatValue(summary.sum).text} · Średnia: {Number.isFinite(summary.avg) ? formatValue(+summary.avg.toPrecision(10)).text : '—'} · Liczba: {summary.cnt}</div>}
      <div className="sheet-tabs">
        {book.sheets.map((s, i) => <button key={s.name + i} className={i === sheet ? 'on' : ''} onClick={() => { commit(); setSheet(i); setSel({ r0: 0, c0: 0, r1: 0, c1: 0 }); scroller.current?.scrollTo(0, 0); }}>{s.name}</button>)}
        <button onClick={() => { const i = book.addSheet(); setSheet(i); changed(); }}><IcPlus width={16} /></button>
      </div>

      <Sheet open={fmtOpen} onClose={() => setFmtOpen(false)} title="Format liczb">
        <Card className="tight">
          {NUM_FORMATS.map((f) => <div key={f.f} className="list-item" onClick={() => { book.setStyle(sheet, cellsInSel(), (cell) => { cell.numFmt = f.f; }); setFmtOpen(false); changed(); }}><span className="grow">{f.l}</span><span className="faint mono" style={{ fontSize: 12 }}>{f.f}</span></div>)}
        </Card>
      </Sheet>
      <Sheet open={menu} onClose={() => setMenu(false)} title={meta.name}>
        <Card className="tight">
          <div className="list-item" onClick={async () => { setMenu(false); commit(); const buf = await book.toXlsx(); await putFile({ ...meta, size: buf.byteLength, modified: Date.now() }, buf); await shareFile(new Blob([buf], { type: XLSX_MIME }), meta.name); }}><IcShare width={20} className="accent" /><span className="grow">Udostępnij / Zapisz w Plikach (.xlsx)</span></div>
          <div className="list-item" onClick={async () => { setMenu(false); await shareFile(new Blob([book.toCSV(sheet)], { type: 'text/csv' }), meta.name.replace(/\.xlsx?$/i, '') + ' - ' + m.name + '.csv'); }}><IcDownload width={20} className="accent" /><span className="grow">Eksportuj arkusz do CSV</span></div>
          <div className="list-item" onClick={async () => { setMenu(false); const n = prompt('Nazwa pliku', meta.name.replace(/\.xlsx$/i, '')); if (!n) return; const buf = await book.toXlsx(); const nm = { ...meta, name: n.replace(/\.xlsx$/i, '') + '.xlsx', size: buf.byteLength, modified: Date.now() }; await putFile(nm, buf); setMeta(nm); }}><IcFile width={20} className="accent" /><span className="grow">Zmień nazwę pliku</span></div>
          <div className="list-item" onClick={() => { const n = prompt('Nazwa arkusza', m.name); if (n && book.renameSheet(sheet, n)) changed(); setMenu(false); }}><IcFile width={20} className="accent" /><span className="grow">Zmień nazwę arkusza</span></div>
          <div className="list-item" onClick={() => { if (confirm(`Usunąć arkusz „${m.name}”?`) && book.removeSheet(sheet)) { setSheet(0); changed(); } setMenu(false); }}><IcTrash width={20} className="red" /><span className="grow red">Usuń arkusz</span></div>
        </Card>
        <div className="note-text">Wskazówka: podczas wpisywania formuły (zaczynającej się od „=”) dotknij komórkę, aby wstawić jej adres. Tryb „Zakres” pozwala zaznaczyć obszar drugim dotknięciem.</div>
      </Sheet>
    </div>
  );
}
