import { useEffect, useState, lazy, Suspense } from 'react';
import { IcSdca, IcRsps, IcNotes, IcGrid, IcGear } from './components/icons';
import { ToastHost } from './components/ui';
import { usePersisted } from './lib/db';
import Settings from './Settings';
import Sdca from './tabs/Sdca';
import Rsps from './tabs/Rsps';
import Notes from './tabs/Notes';
const Excel = lazy(() => import('./tabs/Excel'));

type Tab = 'sdca' | 'rsps' | 'notes' | 'excel';
const TABS: { id: Tab; label: string; icon: typeof IcSdca }[] = [
  { id: 'sdca', label: 'SDCA', icon: IcSdca },
  { id: 'rsps', label: 'RSPS', icon: IcRsps },
  { id: 'notes', label: 'Notatnik', icon: IcNotes },
  { id: 'excel', label: 'Excel', icon: IcGrid }
];

export default function App({ updateReady, applyUpdate }: { updateReady: boolean; applyUpdate: () => void }) {
  const [tab, setTab] = usePersisted<Tab>('ui.tab', 'sdca');
  const [theme] = usePersisted<'dark' | 'light' | 'auto'>('ui.theme', 'dark');
  const [settings, setSettings] = useState(false);
  const [visited, setVisited] = useState<Set<Tab>>(new Set([tab]));

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const t = theme === 'auto' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f4f2ed' : '#000000');
    };
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => { setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))); }, [tab]);

  // Tabs stay mounted once visited so scroll position and state survive switching.
  const pane = (id: Tab, el: React.ReactNode) => visited.has(id) && <div key={id} style={{ display: tab === id ? 'contents' : 'none' }}>{el}</div>;

  return (
    <div className="app">
      {pane('sdca', <Sdca />)}
      {pane('rsps', <Rsps />)}
      {pane('notes', <Notes />)}
      {pane('excel', <Suspense fallback={<div className="screen"><div className="empty">Ładowanie…</div></div>}><Excel /></Suspense>)}
      <button className="icon-btn" aria-label="Ustawienia" onClick={() => setSettings(true)}
        style={{ position: 'fixed', zIndex: 21, left: 16, top: 'calc(var(--safe-top) + 10px)' }}><IcGear width={19} /></button>
      <nav className="tabbar">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><t.icon />{t.label}</button>)}
      </nav>
      {updateReady && (
        <div className="update-banner">
          <div className="grow"><b>Dostępna aktualizacja</b><div className="dim" style={{ fontSize: 13 }}>Twoje dane zostaną zachowane.</div></div>
          <button className="btn primary small" onClick={applyUpdate}>Aktualizuj</button>
        </div>
      )}
      <Settings open={settings} onClose={() => setSettings(false)} />
      <ToastHost />
    </div>
  );
}
