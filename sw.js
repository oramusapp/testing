/* FutureApp Service Worker — offline cache + powiadomienia w tle.
   Umieść ten plik obok index.html na hostingu. Aplikacja rejestruje go automatycznie
   (navigator.serviceWorker.register("sw.js")); dzięki temu powiadomienia systemowe
   działają także przy zablokowanym ekranie, a tam gdzie przeglądarka wspiera
   Notification Triggers — nawet bez otwartej karty aplikacji. */
const CACHE_NAME = 'futureapp-cache-v15';

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return fetch(self.registration.scope)
      .then(function (resp) { return cache.put(self.registration.scope, resp); })
      .catch(function () {});
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

/* Strategia NETWORK-FIRST: zawsze próbuj pobrać świeżą wersję strony z sieci
   (żeby aktualizacje aplikacji docierały od razu), cache służy tylko offline. */
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  if (event.request.mode !== 'navigate') return;
  event.respondWith(caches.open(CACHE_NAME).then(function (cache) {
    return fetch(event.request)
      .then(function (resp) { if (resp && resp.ok) cache.put(event.request, resp.clone()); return resp; })
      .catch(function () {
        return cache.match(event.request).then(function (cached) { return cached || cache.match(self.registration.scope); });
      });
  }));
});

/* Harmonogram powiadomień przekazywany ze strony:
   {type:'scheduleNotifications', plan:[{key, at, title, body}, ...]}
   Anuluje wszystkie wcześniej zaplanowane i planuje od nowa (Notification Triggers). */
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type !== 'scheduleNotifications') return;
  if (!(self.Notification && 'showTrigger' in Notification.prototype && self.TimestampTrigger)) return;
  var run = self.registration.getNotifications({ includeTriggered: false }).then(function (list) {
    list.forEach(function (n) { if (n.data && n.data.futureapp) { try { n.close(); } catch (e) {} } });
    return Promise.all((data.plan || []).map(function (n) {
      if (!n || !n.at || n.at <= Date.now()) return Promise.resolve();
      return self.registration.showNotification(n.title || 'FutureApp', {
        body: n.body || '', tag: n.key, data: { futureapp: true },
        showTrigger: new TimestampTrigger(n.at)
      }).catch(function () {});
    }));
  }).catch(function () {});
  if (event.waitUntil) event.waitUntil(run);
});

/* Web Push z własnego serwera (Cloudflare Worker): wyświetl powiadomienie systemowe.
   Dzięki temu powiadomienia docierają przy ZAMKNIĘTEJ aplikacji i zgaszonym ekranie —
   bez żadnej dodatkowej aplikacji. */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { body: (event.data && event.data.text && event.data.text()) || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'FutureApp', {
    body: data.body || '', tag: data.key || undefined, data: { futureapp: true }
  }));
});

/* Kliknięcie powiadomienia: fokus na otwartą aplikację lub otwarcie nowej karty */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
  }));
});
