import { api } from './api';

const b64 = (s: string) => { const pad = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushState(): Promise<'unsupported' | 'blocked' | 'on' | 'off'> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Asks permission (only when the person taps the button), subscribes, and registers the browser with the API. */
export async function enableWebPush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support notifications.');
  const cfg = await api('/config', { auth: false });
  if (!cfg.vapid_public_key) throw new Error('Notifications are not switched on for this server yet.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings to turn this on.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cfg.vapid_public_key) }));
  await api('/me/push-token', { method: 'POST', body: { token: JSON.stringify(sub), platform: 'web', device_label: navigator.userAgent.slice(0, 70) } });
}

export async function disableWebPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api('/me/push-token', { method: 'DELETE', body: { token: JSON.stringify(sub) } }).catch(() => {});
  await sub.unsubscribe();
}
