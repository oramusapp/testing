import { useEffect, useRef, useState } from 'react';
import { Sheet, Card, Row, Seg, shareFile, toast } from './components/ui';
import { usePersisted, exportBackup, importBackup, SCHEMA_VERSION } from './lib/db';
import { checkForUpdate } from './main';
import { CHANGELOG } from './changelog';

declare const __APP_VERSION__: string;

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = usePersisted<'dark' | 'light' | 'auto'>('ui.theme', 'dark');
  const [lastBackup, setLastBackup] = usePersisted<number | null>('meta.lastBackup', null);
  const [storage, setStorage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      setStorage({ used: est?.usage ?? 0, quota: est?.quota ?? 0, persisted });
    })().catch(() => {});
  }, [open]);

  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

  return (
    <Sheet open={open} onClose={onClose} title="Ustawienia">
      <div className="section-title" style={{ marginTop: 6 }}>Wygląd</div>
      <Seg value={theme} onChange={setTheme} options={[{ v: 'dark', l: 'Ciemny' }, { v: 'light', l: 'Jasny' }, { v: 'auto', l: 'Systemowy' }]} />

      <div className="section-title">Dane</div>
      <Card className="tight">
        <Row label="Zajęte miejsce" value={storage ? `${(storage.used / 1048576).toFixed(1)} MB` : '—'} />
        <Row label="Trwały magazyn" value={storage ? (storage.persisted ? <span className="green">Tak</span> : <span className="amber">Nie</span>) : '—'} />
        <Row label="Ostatnia kopia" value={lastBackup ? new Date(lastBackup).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : 'nigdy'} />
        <div style={{ padding: 12, display: 'grid', gap: 8 }}>
          <button className="btn primary block" onClick={async () => {
            const blob = await exportBackup();
            await shareFile(blob, `oramus-backup-${new Date().toISOString().slice(0, 10)}.json`);
            setLastBackup(Date.now());
          }}>Utwórz kopię zapasową</button>
          <button className="btn block" onClick={() => file.current?.click()}>Przywróć z kopii…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f || !confirm('Przywrócenie zastąpi obecne dane aplikacji. Kontynuować?')) return;
            try { await importBackup(await f.text()); toast('Przywrócono — ponowne uruchamianie'); setTimeout(() => location.reload(), 800); }
            catch (err) { toast('Błąd: ' + (err as Error).message); }
          }} />
        </div>
      </Card>
      <div className="note-text">Notatki, arkusze, ustawienia SDCA/RSPS i dziennik są zapisane lokalnie w telefonie (IndexedDB). Aktualizacje aplikacji podmieniają tylko kod — dane zostają. Kopia zapasowa to dodatkowe zabezpieczenie (np. przy zmianie telefonu).</div>

      <div className="section-title">Aplikacja</div>
      <Card className="tight">
        <Row label="Wersja" value={`${__APP_VERSION__} · schemat ${SCHEMA_VERSION}`} />
        <Row label="Tryb" value={standalone ? 'Zainstalowana' : 'Przeglądarka'} />
        <Row label="Sprawdź aktualizacje" className="tap" onClick={async () => { const r = await checkForUpdate().catch(() => false); toast(r ? 'Aktualizacja gotowa — dotknij „Aktualizuj”' : 'Masz najnowszą wersję'); }} value={<span className="accent">Sprawdź</span>} />
      </Card>
      {!standalone && <div className="warn-box">Aby zainstalować: w Safari dotknij <b>Udostępnij</b> → <b>Do ekranu początkowego</b>. Aplikacja uruchomi się wtedy na pełnym ekranie i będzie działać offline.</div>}

      <div className="section-title">Historia zmian</div>
      <Card className="tight">
        {CHANGELOG.map((c) => <div key={c.v} className="row" style={{ alignItems: 'flex-start' }}><div className="grow"><b>{c.v}</b> <span className="faint">· {c.date}</span><ul className="note-text" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{c.items.map((i) => <li key={i}>{i}</li>)}</ul></div></div>)}
      </Card>
      <div className="note-text center mt12">Oramus · narzędzie analityczne, nie porada inwestycyjna.<br />© {new Date().getFullYear()} @thenotoriousg · Wszelkie prawa zastrzeżone</div>
    </Sheet>
  );
}
