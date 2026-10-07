/*
 * Service worker do Tars. Existe para duas coisas: abrir uma tela de "sem conexão" decente e acelerar os arquivos
 * estáticos. Política deliberadamente RESTRITA (spec §13):
 *
 *   - guarda em cache SÓ arquivos estáticos versionados (/_next/static/*) e a página /offline;
 *   - NUNCA guarda nem serve do cache: HTML das telas do app, /api/*, respostas do Next (RSC) ou qualquer coisa que
 *     não seja GET. Dados do usuário, financeiros ou da IA jamais passam por aqui;
 *   - mensagens e registros SEMPRE vão à rede. Se a rede falha, a navegação cai na página /offline; um POST (salvar
 *     algo) nem passa por este arquivo, então o app nunca finge que salvou.
 *
 * Como o cache só tem arquivos públicos e sem dados, sair da conta não deixa nada do usuário aqui.
 */
const VERSION = "v1";
const STATIC_CACHE = `tars-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_STATIC_ENTRIES = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const response = await fetch(OFFLINE_URL, { cache: "reload" });
      if (!response.ok) throw new Error("A página offline não pôde ser guardada.");
      // Guarda também os arquivos de que a página offline depende (CSS e JS), senão ela abriria sem estilo.
      const assets = [...new Set((await response.clone().text()).match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
      await cache.put(OFFLINE_URL, response);
      await Promise.allSettled(assets.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Versões antigas do cache saem (os arquivos têm hash no nome: acumulariam a cada deploy).
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("tars-") && n !== STATIC_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Respostas do Next para navegação interna (RSC/prefetch) e chamadas de dados nunca são interceptadas. */
function isNextDataRequest(request, url) {
  return (
    request.headers.get("RSC") !== null ||
    request.headers.get("Next-Router-Prefetch") !== null ||
    request.headers.get("Next-Router-State-Tree") !== null ||
    url.searchParams.has("_rsc")
  );
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES))) await cache.delete(key);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Só guarda resposta completa e bem-sucedida (nada de 404/500 nem resposta parcial)
  if (response.ok && response.status === 200) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    return (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // salvar algo (POST, Server Action) nunca é tocado
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // dados do usuário e da IA: sempre rede, sem cache
  if (isNextDataRequest(request, url)) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // Navegação (abrir uma tela): sempre rede; sem rede, a página /offline. O HTML da tela NÃO é guardado.
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  }
});
