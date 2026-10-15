/* Economan — notifications des nouvelles commandes (économat).
   Elles s'affichent même page fermée et écran éteint : c'est le système
   (téléphone, PC) qui sonne et vibre. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Economan', body: event.data && event.data.text() } }
  const urgent = !!d.urgent
  event.waitUntil(self.registration.showNotification(d.title || 'Nouvelle commande', {
    body: d.body || '',
    tag: d.tag || 'economan',
    renotify: true,
    requireInteraction: true,
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: urgent ? [400, 150, 400, 150, 400, 150, 800] : [300, 120, 300],
    data: { url: d.url || '/economat' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/economat'
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of fenetres) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url); return }
    }
    await self.clients.openWindow(url)
  })())
})
