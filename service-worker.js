// TRACER 2025 — Service Worker
// Версия кэша — меняй при обновлении приложения
const CACHE_VERSION = 'tracer-v1';

// Файлы приложения — кэшируются сразу при установке
const APP_SHELL = [
  '/tracer-2025/',
  '/tracer-2025/index.html',
  '/tracer-2025/manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Sans+Hebrew:wght@400;700&family=Noto+Sans+Arabic:wght@400;700&display=swap',
];

// Данные вопросов — кэшируются при первом открытии
const DATA_FILES = [
  '/tracer-2025/data/doctor.json',
  '/tracer-2025/data/nurse.json',
  '/tracer-2025/data/support.json',
];

// ── INSTALL: кэшируем оболочку приложения ────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Кэшируем app shell (обязательные файлы)
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('SW: Не удалось закэшировать часть shell:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: удаляем старые кэши ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: стратегия по типу запроса ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Данные JSON — Network first, fallback to cache
  // Так пользователь всегда получает свежие вопросы если есть сеть,
  // и видит последние закэшированные если нет
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirstWithCache(event.request));
    return;
  }

  // Картинки и PDF — Cache first, fallback to network
  if (
    url.pathname.includes('/images/') ||
    url.pathname.includes('/pdf/')
  ) {
    event.respondWith(cacheFirstWithNetwork(event.request));
    return;
  }

  // Всё остальное (HTML, шрифты, манифест) — Cache first
  event.respondWith(cacheFirstWithNetwork(event.request));
});

// ── СТРАТЕГИИ ─────────────────────────────────────────────────────────────────

// Сначала сеть, при ошибке — кэш
async function networkFirstWithCache(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Если нет ни сети ни кэша — возвращаем пустой JSON
    return new Response('[]', {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Сначала кэш, при промахе — сеть
async function cacheFirstWithNetwork(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Возвращаем заглушку для HTML если офлайн и нет кэша
    if (request.destination === 'document') {
      const fallback = await cache.match('/tracer-2025/index.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}
