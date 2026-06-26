importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAGVWXc3W6gkAc4mSxAFqoVI1gcqCNom_g",
  authDomain: "sekretaris-umkm.firebaseapp.com",
  projectId: "sekretaris-umkm",
  storageBucket: "sekretaris-umkm.appspot.com",
  messagingSenderId: "885552629940",
  appId: "1:885552629940:web:c29ac342006b6ea099efe1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Sekretaris UMKM 🤝';
  const body  = n.body  || d.body  || 'Ada notifikasi baru';
  const icon  = n.icon  || '/icon-192.png';
  const tag   = d.tag   || 'umkm-notif';
  const url   = d.url   || '/';

  self.registration.showNotification(title, {
    body,
    icon,
    tag,
    vibrate: [200, 80, 200],
    badge: '/icon-72.png',
    data: { url }
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cl => {
      for (const c of cl) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
