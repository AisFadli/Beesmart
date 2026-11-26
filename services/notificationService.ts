/**
 * Notifikasi browser terpusat.
 * Memakai Service Worker bila tersedia, fallback ke Notification biasa.
 */

const NOTIFICATION_ICON = '/app/logo/beesmart-favicon.png';

export function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      void Notification.requestPermission();
    } catch (e) {
      console.warn('Notification permission error:', e);
    }
  }
}

export function notifyUser(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  try {
    if (Notification.permission !== 'granted') {
      if (Notification.permission !== 'denied') requestNotificationPermission();
      return;
    }

    const showDirectly = () => {
      try {
        new Notification(title, { body, icon: NOTIFICATION_ICON });
      } catch (e) {
        console.warn('Notification error:', e);
      }
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then(registration => registration.showNotification(title, { body, icon: NOTIFICATION_ICON }))
        .catch(showDirectly);
    } else {
      showDirectly();
    }
  } catch (e) {
    console.warn('Notification error:', e);
  }
}
