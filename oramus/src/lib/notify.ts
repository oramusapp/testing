// Local notifications (no push server): shown when the app is opened or refreshed and a condition is met.
// iOS shows them only for the installed PWA (iOS 16.4+) after the user grants permission.
import { toast } from '../components/ui';

export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;
export const notifyPermission = () => (canNotify() ? Notification.permission : 'denied');
export async function askNotify(): Promise<boolean> {
  if (!canNotify()) return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

/** Shows the notification once per key (e.g. once per day); falls back to an in-app toast. */
export async function notifyOnce(key: string, title: string, body: string) {
  const k = 'notify.' + key;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, String(Date.now())); } catch { /* storage blocked: still show */ }
  if (canNotify() && Notification.permission === 'granted') {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) { await reg.showNotification(title, { body, icon: 'icon-192.png', tag: key }); return; }
      new Notification(title, { body, tag: key }); return;
    } catch { /* fall through */ }
  }
  toast(`${title}: ${body}`);
}
