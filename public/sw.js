/* The cache contains the public app shell only, never refrigerator records. */
const CACHE_PREFIX = "refrigerator-counter-app-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SHELL_PATH = "/";
const STATIC_PREFIX = "/_next/static/";
const PRECACHE_FILES = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

function isRscRequest(request, url) {
  return (
    url.searchParams.has("_rsc") ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-State-Tree") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.has("Next-Router-Segment-Prefetch") ||
    (request.headers.get("Accept") || "").includes("text/x-component")
  );
}

function shouldBypass(request, url) {
  return (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.cache === "no-store" ||
    request.headers.has("Authorization") ||
    request.headers.has("Range") ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/_vercel" ||
    url.pathname.startsWith("/_vercel/") ||
    url.pathname === "/sw.js" ||
    isRscRequest(request, url)
  );
}

function canCache(response) {
  return (
    response.ok &&
    response.status !== 206 &&
    !response.redirected &&
    response.type !== "opaque" &&
    response.type !== "opaqueredirect" &&
    (!response.url || new URL(response.url).origin === self.location.origin) &&
    !(response.headers.get("Content-Type") || "").includes("text/x-component")
  );
}

function isHtml(response) {
  return (
    canCache(response) &&
    (response.headers.get("Content-Type") || "").includes("text/html")
  );
}

function staticAssetsFromHtml(html) {
  const assets = new Set();
  // Next.js includes references in both HTML attributes and serialized RSC data.
  const normalized = html
    .replace(/\\\//g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&");
  const references = normalized.matchAll(
    /["']((?:(?:https?:)?\/\/[^/"'\\\s<>]+)?\/_next\/static\/[^"'\\\s<>]+)["'\\]/g,
  );

  for (const reference of references) {
    const url = new URL(reference[1], self.location.origin);
    if (
      url.origin === self.location.origin &&
      url.pathname.startsWith(STATIC_PREFIX) &&
      !url.searchParams.has("_rsc")
    ) {
      assets.add(url.href);
    }
  }

  return [...assets];
}

async function precacheFile(cache, path) {
  const url = new URL(path, self.location.origin);
  const isStatic = url.pathname.startsWith(STATIC_PREFIX);

  // Hashed build assets are immutable; retain already-cached copies on reload.
  if (isStatic && (await cache.match(url.href))) return;

  const response = await fetch(
    new Request(url.href, {
      cache: isStatic ? "default" : "reload",
      credentials: "same-origin",
    }),
  );
  if (!canCache(response)) {
    throw new Error("The offline app shell could not be prepared.");
  }
  await cache.put(url.href, response);
}

async function saveShell(response, extraFiles = []) {
  if (!isHtml(response)) {
    throw new Error("A valid HTML app shell is required for offline use.");
  }

  const html = await response.clone().text();
  const cache = await caches.open(CACHE_NAME);
  const files = new Set([...extraFiles, ...staticAssetsFromHtml(html)]);

  // Save the HTML last so a failed refresh cannot replace a working offline shell.
  await Promise.all([...files].map((path) => precacheFile(cache, path)));
  await cache.put(SHELL_PATH, response);
}

async function cachedResponse(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(request);
  } catch {
    // Storage can be unavailable in private browsing or after quota eviction.
    return undefined;
  }
}

async function rememberResponse(request, response) {
  try {
    if (!canCache(response)) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // Cache failures must not prevent normal online use.
  }
}

async function navigationResponse(event) {
  try {
    const response = await fetch(event.request);
    const url = new URL(event.request.url);

    if (url.pathname === SHELL_PATH && isHtml(response)) {
      event.waitUntil(saveShell(response.clone()).catch(() => {}));
    }

    return response;
  } catch {
    const shell = await cachedResponse(SHELL_PATH);
    return (
      shell ||
      new Response(
        "オフラインです。初回はインターネットに接続して冷蔵庫カウンターを開いてください。",
        {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      )
    );
  }
}

async function assetResponse(event) {
  const cached = await cachedResponse(event.request);
  if (cached) return cached;

  const response = await fetch(event.request);
  event.waitUntil(rememberResponse(event.request, response.clone()));
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(
        new Request(new URL(SHELL_PATH, self.location.origin), {
          cache: "reload",
          credentials: "same-origin",
          headers: { Accept: "text/html" },
        }),
      );
      // The first page is not controlled yet, so fetch its JS/CSS proactively.
      await saveShell(response, PRECACHE_FILES);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (shouldBypass(event.request, url)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(navigationResponse(event));
    return;
  }

  if (
    url.pathname.startsWith(STATIC_PREFIX) ||
    PRECACHE_FILES.includes(url.pathname)
  ) {
    event.respondWith(assetResponse(event));
  }
});
