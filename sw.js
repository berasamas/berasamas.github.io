const CACHE_NAME = 'wavelength-game-cache-v6';
const coreFiles = ['./', './index.html', './style.css', './script.js', './feedback.js', './escalas.json'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(coreFiles)));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(names => Promise.all(
        names.filter(name => name.startsWith('wavelength-game-cache-') && name !== CACHE_NAME)
            .map(name => caches.delete(name))
    )));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    // Firebase/authentication and third-party requests go straight to the network.
    if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
        !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const response = await fetch(event.request);
            if (response.ok) await cache.put(event.request, response.clone());
            return response;
        } catch (error) {
            const cached = await cache.match(event.request);
            if (cached) return cached;
            throw error;
        }
    })());
});
