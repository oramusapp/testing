import { useEffect, useState } from 'react';
import { IcSdca, IcGear, IcWallet, IcApps } from './components/icons';
import { ToastHost } from './components/ui';
import { usePersisted } from './lib/db';
import Settings from './Settings';
import Strategy from './tabs/Strategy';
import Signals from './tabs/Signals';
import Other from './tabs/Other';
import AthWatcher from './components/AthWatcher';
import { save } from './lib/db';

type Tab = 'strategy' | 'portfolio' | 'other';
const TABS: { id: Tab; label: string; icon: typeof IcSdca }[] = [
  { id: 'strategy', label: 'Strategia', icon: IcSdca },
  { id: 'portfolio', label: 'Portfel', icon: IcWallet },
  { id: 'other', label: 'Inne', icon: IcApps }
];
// tab ids from versions ≤ 1.9 → new layout (sub-tab remembered)
const LEGACY: Record<string, [Tab, string?, string?]> = {
  sdca: ['strategy', 'ui.strategy', 'sdca'], rsps: ['strategy', 'ui.strategy', 'rsps'], signals: ['portfolio'],
  notes: ['other', 'ui.other', 'notes'], excel: ['other', 'ui.other', 'excel']
};

export default function App({ updateReady, applyUpdate }: { updateReady: boolean; applyUpdate: () => void }) {
  const [tab0, setTab] = usePersisted<string>('ui.tab', 'strategy');
  const legacy = LEGACY[tab0];
  const tab: Tab = legacy ? legacy[0] : (TABS.some((t) => t.id === tab0) ? tab0 as Tab : 'strategy');
  useEffect(() => { if (legacy) { if (legacy[1]) void save(legacy[1], legacy[2]); setTab(legacy[0]); } }, [tab0]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {pane('strategy', <Strategy />)}
      {pane('portfolio', <Signals />)}
      {pane('other', <Other />)}
      <AthWatcher />
      <button className="icon-btn" aria-label="Ustawienia" onClick={() => setSettings(true)}
        style={{ position: 'fixed', zIndex: 21, left: 16, top: 'calc(var(--safe-top) + 10px)' }}><IcGear width={19} /></button>
      <nav className="tabbar">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><t.icon />{t.label}</button>)}
      </nav>
      {updateReady && (
        <div className="update-banner">
          <div className="grow"><b>Dostępna aktualizacja</b><div className="dim" style={{ fontSize: 13 }}>Zainstaluje się sama przy ponownym otwarciu. Dane zostaną zachowane.</div></div>
          <button className="btn primary small" onClick={applyUpdate}>Teraz</button>
        </div>
      )}
      <Settings open={settings} onClose={() => setSettings(false)} />
      <ToastHost />
    </div>
  );
}
