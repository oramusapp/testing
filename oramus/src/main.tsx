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
if ('serviceWorker' in navigator && !isNative && import.meta.env.PROD) {
  updateSW = registerSW({
    onNeedRefresh() { pendingReady = true; setReady?.(true); },
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); }
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
