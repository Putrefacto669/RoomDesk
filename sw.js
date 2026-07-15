// ============================================================
// RoomDesk — Service Worker
// Versión: 1.0.0
// Ubica este archivo en la RAÍZ del repo (mismo nivel que /Dashboard y /Login)
// ============================================================

const CACHE_NAME = 'roomdesk-v1';

// Archivos estáticos que se cachean en la instalación
const STATIC_ASSETS = [
  '/Dashboard/dashboard.html',
  '/Dashboard/dashboardstyle.css',
  '/Dashboard/script.js',
  '/Dashboard/db-offline.js',
  '/Login/index.html',
  '/Login/style.css',
  '/Login/main.js',
  // CDN externos necesarios para funcionar offline
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'
];

// ============================================================
// INSTALL — cachea todos los assets estáticos
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll falla si un recurso falla → usamos add individual con try/catch
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] No se pudo cachear:', url, err.message)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW] Instalado y assets cacheados');
        return self.skipWaiting(); // activa el SW inmediatamente sin esperar recarga
      })
  );
});

// ============================================================
// ACTIVATE — limpia caches de versiones anteriores
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Eliminando caché vieja:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => {
        console.log('[SW] Activado — controlando todas las pestañas');
        return self.clients.claim(); // toma control inmediato de todas las páginas abiertas
      })
  );
});

// ============================================================
// FETCH — estrategia por tipo de recurso
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Supabase API → solo red, nunca caché
  //    Los datos se manejan en IndexedDB desde script.js + db-offline.js
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla (sin internet), devolvemos un error JSON controlado
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Sin conexión a Supabase' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 2. Servidor de PDFs → solo red
  if (url.hostname.includes('onrender.com')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'offline', message: 'El servidor de PDFs no está disponible sin internet' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 3. Nuestros archivos + CDN → Network-first, caché como fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Solo cacheamos respuestas exitosas
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sin red → servimos desde caché
        return caches.match(event.request).then(cached => {
          if (cached) {
            console.log('[SW] Sirviendo desde caché:', url.pathname);
            return cached;
          }
          // Si tampoco hay caché, devolvemos página de error offline
          if (event.request.destination === 'document') {
            return caches.match('/Dashboard/dashboard.html');
          }
          return new Response('Recurso no disponible offline', { status: 503 });
        });
      })
  );
});

// ============================================================
// MESSAGE — recibe mensajes del cliente (para forzar actualización)
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
