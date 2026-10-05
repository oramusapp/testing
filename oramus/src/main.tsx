import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { hydrate } from './lib/db';
import './styles.css';

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
let setReady: ((v: boolean) => void) | undefined;
let pendingReady = false;
// The native (Capacitor) build ships code inside the app bundle, so no service worker there.
const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
const bootTime = Date.now();
if ('serviceWorker' in navigator && !isNative && import.meta.env.PROD) {
  updateSW = registerSW({
    onNeedRefresh() {
      // New version found. Right after opening the app: apply at once (data lives in IndexedDB and is kept).
      // While the app is in use: show the banner and apply automatically the next time the app is reopened.
      if (Date.now() - bootTime < 15000) { void updateSW?.(true); return; }
      pendingReady = true; setReady?.(true);
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      void reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      // iOS keeps home-screen apps suspended instead of restarting them: check again on every return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (pendingReady) { void updateSW?.(true); return; }
        void reg.update().catch(() => {});
      });
    }
  });
}
export const checkForUpdate = async () => {
  const reg = await navigator.serviceWorker?.getRegistration();
  await reg?.update();
  return pendingReady;
};

function Root() {
  const [ready, setR] = useState(pendingReady);
  useEffect(() => { setReady = setR; }, []);
  return <App updateReady={ready} applyUpdate={() => updateSW?.(true)} />;
}

hydrate().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
});
