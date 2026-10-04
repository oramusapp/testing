import { useEffect, useMemo, useRef, useState } from 'react';
import { Screen, Card, Sheet, toast } from '../components/ui';
import { IcCompose, IcBack, IcShare, IcTrash, IcPin, IcFolder, IcSearch, IcCheck, IcAa, IcMore, IcPlus, IcTable, IcUndo, IcRedo } from '../components/icons';
import { usePersisted, load } from '../lib/db';
import { uid } from '../lib/format';

export interface Note { id: string; html: string; folder: string | null; pinned: boolean; created: number; modified: number; deleted?: number; }
const DELETED = '__deleted';
const ALL = '__all';

const toText = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.replace(/<(br|\/p|\/div|\/h\d|\/li)>/gi, '\n$&');
  return d.textContent ?? '';
};
const titleOf = (html: string) => toText(html).split('\n').map((s) => s.trim()).find(Boolean) ?? 'Nowa notatka';
const previewOf = (html: string) => toText(html).split('\n').map((s) => s.trim()).filter(Boolean).slice(1).join(' ') || 'Brak dodatkowego tekstu';

function when(ts: number) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const diff = (now.getTime() - ts) / 86400000;
  if (diff < 7) return d.toLocaleDateString('pl-PL', { weekday: 'long' });
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function group(ts: number) {
  const diff = (Date.now() - ts) / 86400000;
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return 'Dzisiaj';
  if (diff < 1.5 && new Date(Date.now() - 86400000).toDateString() === d.toDateString()) return 'Wczoraj';
  if (diff < 7) return 'Poprzednie 7 dni';
  if (diff < 30) return 'Poprzednie 30 dni';
  return d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

export default function Notes() {
  const [notes, setNotes] = usePersisted<Note[]>('notes.items', []);
  const [folders, setFolders] = usePersisted<string[]>('notes.folders', []);
  const [folder, setFolder] = useState<string>(ALL);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [folderSheet, setFolderSheet] = useState(false);

  // purge items deleted more than 30 days ago
  useEffect(() => {
    const cutoff = Date.now() - 30 * 86400000;
    if (notes.some((n) => n.deleted && n.deleted < cutoff)) setNotes(notes.filter((n) => !(n.deleted && n.deleted < cutoff)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return notes
      .filter((n) => (folder === DELETED ? !!n.deleted : !n.deleted && (folder === ALL || n.folder === folder)))
      .filter((n) => !ql || toText(n.html).toLowerCase().includes(ql))
      .sort((a, b) => b.modified - a.modified);
  }, [notes, folder, q]);

  const create = () => {
    const n: Note = { id: uid(), html: '<h1><br></h1>', folder: folder === ALL || folder === DELETED ? null : folder, pinned: false, created: Date.now(), modified: Date.now() };
    setNotes([n, ...notes]);
    setOpenId(n.id);
  };
  const update = (id: string, patch: Partial<Note>) => setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const close = () => {
    const n = load<Note[]>('notes.items', []).find((x) => x.id === openId);
    if (n && !toText(n.html).trim() && !/<(img|table)/i.test(n.html)) setNotes((l) => l.filter((x) => x.id !== n.id));
    setOpenId(null);
  };

  const pinned = folder !== DELETED && !q ? visible.filter((n) => n.pinned) : [];
  const rest = visible.filter((n) => !pinned.includes(n));
  const groups: [string, Note[]][] = [];
  rest.forEach((n) => { const g = group(n.modified); const last = groups[groups.length - 1]; if (last?.[0] === g) last[1].push(n); else groups.push([g, [n]]); });
  const open = notes.find((n) => n.id === openId);
  const count = (f: string) => notes.filter((n) => (f === DELETED ? n.deleted : !n.deleted && (f === ALL || n.folder === f))).length;

  return (
    <>
      <Screen title={folder === ALL ? 'Notatki' : folder === DELETED ? 'Ostatnio usunięte' : folder}
        actions={<button className="icon-btn" onClick={() => setFolderSheet(true)} aria-label="Foldery"><IcFolder width={19} /></button>}>
        <div className="search"><IcSearch width={17} /><input placeholder="Szukaj" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">
          {[ALL, ...folders, DELETED].map((f) => (
            <button key={f} className={'folder-chip' + (folder === f ? ' on' : '')} onClick={() => setFolder(f)}>
              {f === ALL ? 'Wszystkie' : f === DELETED ? 'Usunięte' : f} <span className="faint">{count(f)}</span>
            </button>
          ))}
        </div>
        {pinned.length > 0 && <><div className="section-title">Przypięte</div><Card className="tight">{pinned.map((n) => <NoteRow key={n.id} n={n} onOpen={() => setOpenId(n.id)} />)}</Card></>}
        {groups.map(([g, list]) => (
          <div key={g}><div className="section-title">{g}</div><Card className="tight">{list.map((n) => <NoteRow key={n.id} n={n} onOpen={() => setOpenId(n.id)} />)}</Card></div>
        ))}
        {visible.length === 0 && <div className="empty">{q ? 'Brak wyników' : folder === DELETED ? 'Brak usuniętych notatek' : 'Brak notatek'}</div>}
        {visible.length > 0 && <div className="center faint" style={{ fontSize: 12, marginTop: 8 }}>{visible.length} {visible.length === 1 ? 'notatka' : 'notatek'}</div>}
      </Screen>
      {folder !== DELETED && <button className="fab" onClick={create} aria-label="Nowa notatka"><IcCompose width={24} /></button>}
      {open && <Editor key={open.id} note={open} folders={folders} onChange={(p) => update(open.id, p)} onClose={close}
        onDelete={() => { if (open.deleted) setNotes(notes.filter((n) => n.id !== open.id)); else update(open.id, { deleted: Date.now(), pinned: false }); setOpenId(null); toast(open.deleted ? 'Usunięto trwale' : 'Przeniesiono do Ostatnio usuniętych'); }}
        onRestore={() => { update(open.id, { deleted: undefined }); setOpenId(null); toast('Przywrócono'); }} />}
      <FolderSheet open={folderSheet} onClose={() => setFolderSheet(false)} folders={folders} setFolders={setFolders} current={folder}
        onPick={(f) => { setFolder(f); setFolderSheet(false); }} count={count}
        onDeleteFolder={(f) => { setFolders(folders.filter((x) => x !== f)); setNotes(notes.map((n) => (n.folder === f ? { ...n, folder: null } : n))); if (folder === f) setFolder(ALL); }} />
    </>
  );
}

function NoteRow({ n, onOpen }: { n: Note; onOpen: () => void }) {
  return (
    <div className="note-item" onClick={onOpen}>
      <div className="t">{n.pinned && <IcPin width={13} style={{ color: 'var(--accent)', marginRight: 4, verticalAlign: -1 }} />}{titleOf(n.html)}</div>
      <div className="m"><b>{when(n.modified)}</b>{previewOf(n.html)}</div>
    </div>
  );
}

function Editor({ note, folders, onChange, onClose, onDelete, onRestore }: { note: Note; folders: string[]; onChange: (p: Partial<Note>) => void; onClose: () => void; onDelete: () => void; onRestore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [panel, setPanel] = useState(false);
  const [more, setMore] = useState(false);
  const [focused, setFocused] = useState(false);
  const readOnly = !!note.deleted;

  useEffect(() => {
    ref.current!.innerHTML = note.html;
    if (!toText(note.html).trim() && !readOnly) setTimeout(() => ref.current?.focus(), 250);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => { clearTimeout(timer.current); timer.current = setTimeout(() => onChange({ html: ref.current!.innerHTML, modified: Date.now() }), 350); };
  const flush = () => { clearTimeout(timer.current); if (ref.current && ref.current.innerHTML !== note.html) onChange({ html: ref.current.innerHTML, modified: Date.now() }); };
  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); save(); };
  const block = (tag: string) => cmd('formatBlock', tag);
  const checklist = () => {
    ref.current?.focus();
    const sel = window.getSelection();
    let el = sel?.anchorNode as HTMLElement | null;
    while (el && el !== ref.current && el.nodeName !== 'UL') el = el.parentElement;
    if (el && el.nodeName === 'UL') { el.classList.toggle('checklist'); save(); return; }
    document.execCommand('insertUnorderedList');
    el = window.getSelection()?.anchorNode as HTMLElement | null;
    while (el && el !== ref.current && el.nodeName !== 'UL') el = el.parentElement;
    if (el && el.nodeName === 'UL') el.classList.add('checklist');
    save();
  };
  const table = () => cmd('insertHTML', '<table><tbody>' + '<tr><td><br></td><td><br></td><td><br></td></tr>'.repeat(3) + '</tbody></table><p><br></p>');
  const onClick = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest('ul.checklist > li') as HTMLElement | null;
    if (!li) return;
    const x = e.clientX - li.getBoundingClientRect().left;
    if (x < 28) { e.preventDefault(); li.classList.toggle('done'); save(); }
  };
  const share = async () => {
    flush();
    const text = toText(ref.current!.innerHTML).trim();
    try { if (navigator.share) await navigator.share({ title: titleOf(note.html), text }); else { await navigator.clipboard.writeText(text); toast('Skopiowano'); } } catch { /* cancelled */ }
  };

  return (
    <div className="editor-wrap">
      <div className="editor-top">
        <button className="text-btn flex" style={{ gap: 2 }} onClick={() => { flush(); onClose(); }}><IcBack width={22} />Notatki</button>
        <div className="flex" style={{ gap: 4 }}>
          {!readOnly && focused && <><button className="icon-btn plain" onClick={() => cmd('undo')}><IcUndo width={20} /></button><button className="icon-btn plain" onClick={() => cmd('redo')}><IcRedo width={20} /></button></>}
          <button className="icon-btn plain" onClick={share}><IcShare width={20} /></button>
          <button className="icon-btn plain" onClick={() => setMore(true)}><IcMore width={22} /></button>
          {focused && <button className="text-btn" style={{ fontWeight: 600 }} onClick={() => (document.activeElement as HTMLElement)?.blur()}>Gotowe</button>}
        </div>
      </div>
      <div className="editor-date">{new Date(note.modified).toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <div ref={ref} className="editor" contentEditable={!readOnly} suppressContentEditableWarning data-placeholder="Zacznij pisać…"
        onInput={save} onClick={onClick} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); flush(); }}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }} />
      {!readOnly && (
        <div className="fmt-bar">
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => setPanel(!panel)} className={panel ? 'on' : ''}><IcAa width={22} /></button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={checklist}><IcCheck width={22} /></button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={table}><IcTable width={22} /></button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertHorizontalRule')}><span style={{ fontSize: 18 }}>—</span></button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => { flush(); onClose(); }}><IcCompose width={22} /></button>
        </div>
      )}
      {panel && !readOnly && (
        <div className="fmt-panel" onMouseDown={(e) => e.preventDefault()}>
          <div className="styles">
            <button onClick={() => block('h1')} style={{ fontWeight: 700, fontSize: 18 }}>Tytuł</button>
            <button onClick={() => block('h2')} style={{ fontWeight: 700 }}>Nagłówek</button>
            <button onClick={() => block('h3')} style={{ fontWeight: 600 }}>Podnagłówek</button>
            <button onClick={() => block('div')}>Treść</button>
            <button onClick={() => block('pre')} className="mono">Mono</button>
            <button onClick={() => block('blockquote')}>Cytat</button>
          </div>
          <div className="marks">
            <button onClick={() => cmd('bold')} style={{ fontWeight: 800 }}>B</button>
            <button onClick={() => cmd('italic')} style={{ fontStyle: 'italic', fontFamily: 'var(--font-display)' }}>I</button>
            <button onClick={() => cmd('underline')} style={{ textDecoration: 'underline' }}>U</button>
            <button onClick={() => cmd('strikeThrough')} style={{ textDecoration: 'line-through' }}>S</button>
            <button onClick={() => cmd('insertUnorderedList')}>• ≡</button>
            <button onClick={() => cmd('insertOrderedList')}>1. ≡</button>
            <button onClick={() => cmd('outdent')}>⇤</button>
            <button onClick={() => cmd('indent')}>⇥</button>
            <button onClick={() => cmd('hiliteColor', 'rgba(212,180,131,.35)')}>🖍</button>
            <button onClick={() => cmd('removeFormat')}>⌫ Aa</button>
            <button onClick={() => cmd('justifyLeft')}>⟸</button>
            <button onClick={() => cmd('justifyCenter')}>≡</button>
          </div>
        </div>
      )}
      <Sheet open={more} onClose={() => setMore(false)} title="Notatka">
        <Card className="tight">
          {readOnly ? (
            <div className="list-item" onClick={() => { setMore(false); onRestore(); }}><IcUndo width={20} className="accent" /><span className="grow">Przywróć</span></div>
          ) : (
            <>
              <div className="list-item" onClick={() => { onChange({ pinned: !note.pinned }); setMore(false); }}><IcPin width={20} className="accent" /><span className="grow">{note.pinned ? 'Odepnij' : 'Przypnij'}</span></div>
              <div className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="flex"><IcFolder width={20} className="accent" /><span className="grow">Folder</span></div>
                <div className="chips mt8" style={{ margin: '8px 0 0' }}>
                  {[null, ...folders].map((f) => <button key={f ?? 'none'} className={'folder-chip' + (note.folder === f ? ' on' : '')} onClick={() => onChange({ folder: f })}>{f ?? 'Notatki'}</button>)}
                </div>
              </div>
            </>
          )}
          <div className="list-item" onClick={() => { setMore(false); onDelete(); }}><IcTrash width={20} className="red" /><span className="grow red">{readOnly ? 'Usuń trwale' : 'Usuń'}</span></div>
        </Card>
        <div className="note-text center">Utworzono {new Date(note.created).toLocaleString('pl-PL')}</div>
      </Sheet>
    </div>
  );
}

function FolderSheet({ open, onClose, folders, setFolders, current, onPick, count, onDeleteFolder }: { open: boolean; onClose: () => void; folders: string[]; setFolders: (f: string[]) => void; current: string; onPick: (f: string) => void; count: (f: string) => number; onDeleteFolder: (f: string) => void }) {
  const [name, setName] = useState('');
  const add = () => { const n = name.trim(); if (n && !folders.includes(n) && !n.startsWith('__')) setFolders([...folders, n]); setName(''); };
  return (
    <Sheet open={open} onClose={onClose} title="Foldery">
      <Card className="tight">
        {[ALL, ...folders, DELETED].map((f) => (
          <div key={f} className="list-item" onClick={() => onPick(f)}>
            {f === DELETED ? <IcTrash width={20} className="accent" /> : <IcFolder width={20} className="accent" />}
            <span className="grow" style={current === f ? { fontWeight: 600 } : undefined}>{f === ALL ? 'Wszystkie notatki' : f === DELETED ? 'Ostatnio usunięte' : f}</span>
            <span className="faint">{count(f)}</span>
            {f !== ALL && f !== DELETED && <button className="icon-btn plain" onClick={(e) => { e.stopPropagation(); if (confirm(`Usunąć folder „${f}”? Notatki zostaną przeniesione do „Notatki”.`)) onDeleteFolder(f); }}><IcTrash width={17} /></button>}
          </div>
        ))}
      </Card>
      <div className="flex"><input className="input" placeholder="Nowy folder" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /><button className="btn primary" onClick={add}><IcPlus width={18} /></button></div>
    </Sheet>
  );
}
