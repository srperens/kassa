// Simple local notifications. No push server: these fire only while the app is
// running (foreground or a backgrounded tab/PWA). Used to surface weekly
// allowance and transactions that arrive from the other person via sync.
// Full Web Push (notifications when the app is fully closed) can be layered on
// later without changing the call sites.

import { kvGet, kvSet } from './store';

export async function notifyEnabled(): Promise<boolean> {
  return (await kvGet<boolean>('notify')) === true && Notification?.permission === 'granted';
}

export async function setNotifyPref(on: boolean): Promise<boolean> {
  if (on && Notification?.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      await kvSet('notify', false);
      return false;
    }
  }
  await kvSet('notify', on);
  return on;
}

export async function notify(title: string, body: string): Promise<void> {
  if (!(await notifyEnabled())) return;
  try {
    // Prefer the service worker registration (works when backgrounded on mobile).
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
    } else {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  } catch (err) {
    console.warn('notify failed', err);
  }
}
