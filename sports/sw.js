const CACHE = "ward-sports-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./css/app.css",
  "./js/app.js",
  "./js/api.js",
  "./js/normalize.js",
  "./data/snapshot.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./fonts/cinzel-latin-600.woff2",
  "./fonts/cinzel-latin-700.woff2",
  "./fonts/source-sans-3-latin-400.woff2",
  "./fonts/source-sans-3-latin-600.woff2",
  "./fonts/source-sans-3-latin-700.woff2",
  "./fonts/source-sans-3-latin-ext-400.woff2",
  "./fonts/source-sans-3-latin-ext-600.woff2",
  "./fonts/source-sans-3-latin-ext-700.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      await cache.put(request, await storable(fresh));
    }
    return fresh;
  } catch {
    const cached = await cache.match(request) || await cache.match("./index.html");
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function storable(response) {
  if (!response.redirected) return response.clone();
  const body = await response.clone().blob();
  return new Response(body, {
    status: 200,
    statusText: "OK",
    headers: response.headers,
  });
}
