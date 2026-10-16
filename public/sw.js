const CACHE_NAME = "tivihub-static-shell-v4";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const page = await fetch("/");
    if (!page.ok) throw new Error(`Could not cache the app shell: ${page.status}`);
    const html = await page.clone().text();
    await cache.put("/", page.clone());
    await cache.put("/index.html", page.clone());
    await cache.addAll([
      "/manifest.webmanifest",
      "/icons/tivihub.svg",
      "/icons/apple-touch-icon.png",
      "/icons/tivihub-192.png",
      "/icons/tivihub-512.png",
    ]);

    const assets = new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"))
      .map((url) => url.pathname));

    for (const asset of [...assets]) {
      if (!/\.(css|js)$/i.test(asset)) continue;
      const response = await fetch(asset);
      if (!response.ok) throw new Error(`Could not inspect the app asset: ${asset}`);
      const source = await response.text();
      const references = asset.endsWith(".css")
        ? [...source.matchAll(/url\(["']?([^)"']+)["']?\)/g)].map((match) => match[1])
        : [...source.matchAll(/import\(["']([^"']+)["']\)/g)].map((match) => match[1]);
      for (const reference of references) {
        const url = new URL(reference, new URL(asset, self.location.origin));
        if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
          assets.add(url.pathname);
        }
      }
    }

    await cache.addAll([...assets]);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("tivihub-static-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedPage = await caches.match("/index.html");
        return cachedPage || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then((cached) => {
        if (cached) return cached;
        return fetch(request);
      }),
    );
  }
});
