import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Executa o public/sw.js REAL num sandbox (self, caches e fetch simulados) e dispara os eventos que o navegador
 * dispararia. Assim a política de cache (o que NUNCA pode ser guardado) é testada no arquivo de verdade.
 */
const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://tars.example";

type Handler = (event: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Harness {
  fire: (type: string, event: object) => void;
  fetchLog: string[];
  cacheStore: Map<string, Map<string, Response>>;
  network: { online: boolean; responses: Record<string, () => Response> };
  navigate: (path: string, init?: { method?: string; headers?: Record<string, string>; mode?: string }) => Promise<Response | "passthrough">;
  claimed: () => boolean;
}

function boot(): Harness {
  const handlers = new Map<string, Handler>();
  const cacheStore = new Map<string, Map<string, Response>>();
  const fetchLog: string[] = [];
  const network = { online: true, responses: {} as Record<string, () => Response> };
  let claimed = false;

  const cacheApi = {
    async open(name: string) {
      if (!cacheStore.has(name)) cacheStore.set(name, new Map());
      const store = cacheStore.get(name)!;
      const keyOf = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
      return {
        async match(r: Request | string) { return store.get(keyOf(r))?.clone(); },
        async put(r: Request | string, response: Response) { store.set(keyOf(r), response); },
        async add(r: string) { const res = await sandboxFetch(r); if (!res.ok) throw new Error("falhou"); store.set(keyOf(r), res); },
        async delete(r: Request | string) { return store.delete(keyOf(r)); },
        async keys() { return [...store.keys()].map((u) => new Request(u)); },
      };
    },
    async keys() { return [...cacheStore.keys()]; },
    async delete(name: string) { return cacheStore.delete(name); },
  };

  async function sandboxFetch(input: Request | string): Promise<Response> {
    const url = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
    fetchLog.push(url);
    if (!network.online) throw new TypeError("Failed to fetch");
    const path = new URL(url).pathname;
    return network.responses[path]?.() ?? new Response(`conteúdo de ${path}`, { status: 200 });
  }

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => void handlers.set(type, handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => void (claimed = true) },
  };
  vm.runInNewContext(SOURCE, { self, caches: cacheApi, fetch: sandboxFetch, Response, Request, URL, Promise, Set, Math });

  const fire = (type: string, event: object) => handlers.get(type)?.(event);

  return {
    fire,
    fetchLog,
    cacheStore,
    network,
    claimed: () => claimed,
    async navigate(path, init = {}) {
      const request = new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers: init.headers });
      Object.defineProperty(request, "mode", { value: init.mode ?? "same-origin" });
      let answer: Promise<Response> | null = null;
      fire("fetch", { request, respondWith: (p: Promise<Response>) => void (answer = p) });
      return answer ? await answer : "passthrough";
    },
  };
}

async function install(h: Harness) {
  let done: Promise<unknown> = Promise.resolve();
  h.fire("install", { waitUntil: (p: Promise<unknown>) => void (done = p) });
  await done;
}
async function activate(h: Harness) {
  let done: Promise<unknown> = Promise.resolve();
  h.fire("activate", { waitUntil: (p: Promise<unknown>) => void (done = p) });
  await done;
}

let h: Harness;
beforeEach(async () => {
  h = boot();
  h.network.responses["/offline"] = () => new Response('<html><link href="/_next/static/css/app.css"><script src="/_next/static/chunks/offline.js"></script>Você está sem conexão</html>', { status: 200 });
  await install(h);
  await activate(h);
});

describe("instalação", () => {
  it("guarda a página /offline e os arquivos estáticos de que ela depende", () => {
    const cached = [...(h.cacheStore.get("tars-static-v1")?.keys() ?? [])].map((u) => new URL(u).pathname).sort();
    expect(cached).toEqual(["/_next/static/chunks/offline.js", "/_next/static/css/app.css", "/offline"]);
  });
  it("falha a instalação se a página offline não puder ser guardada (melhor não instalar do que instalar quebrado)", async () => {
    const broken = boot();
    broken.network.responses["/offline"] = () => new Response("erro", { status: 500 });
    await expect(install(broken)).rejects.toThrow();
  });
  it("na ativação assume o controle e apaga caches de versões antigas (só os do app)", async () => {
    const h2 = boot();
    h2.network.responses["/offline"] = () => new Response("ok", { status: 200 });
    h2.cacheStore.set("tars-static-v0", new Map());
    h2.cacheStore.set("cache-de-outro-app", new Map());
    await install(h2);
    await activate(h2);
    expect([...h2.cacheStore.keys()].sort()).toEqual(["cache-de-outro-app", "tars-static-v1"]);
    expect(h2.claimed()).toBe(true);
  });
});

describe("o que NUNCA passa pelo cache (dados do usuário)", () => {
  it.each([
    ["/api/snapshot"], ["/api/assistant"], ["/api/export"], ["/api/health"], ["/api/cron/keep-alive"],
  ])("%s: o service worker nem intercepta", async (path) => {
    expect(await h.navigate(path)).toBe("passthrough");
    expect(await h.navigate(path, { mode: "navigate" })).toBe("passthrough");
  });

  it("POST (salvar algo, Server Action) nunca é interceptado", async () => {
    for (const path of ["/financas", "/inicio", "/api/assistant", "/_next/static/chunks/a.js"]) {
      expect(await h.navigate(path, { method: "POST", mode: "navigate" }), path).toBe("passthrough");
    }
  });

  it("requisições do Next (RSC/prefetch) nunca são interceptadas, mesmo em navegação", async () => {
    expect(await h.navigate("/financas", { headers: { RSC: "1" }, mode: "navigate" })).toBe("passthrough");
    expect(await h.navigate("/financas?_rsc=abc", { mode: "navigate" })).toBe("passthrough");
    expect(await h.navigate("/treino", { headers: { "Next-Router-Prefetch": "1" } })).toBe("passthrough");
    expect(await h.navigate("/treino", { headers: { "Next-Router-State-Tree": "x" } })).toBe("passthrough");
  });

  it("outras origens e recursos que não são navegação nem estáticos ficam com o navegador", async () => {
    const request = new Request("https://outra.example/_next/static/x.js");
    let answered = false;
    h.fire("fetch", { request, respondWith: () => void (answered = true) });
    expect(answered).toBe(false);
    expect(await h.navigate("/icone.png")).toBe("passthrough");
  });

  it("navegar por uma tela do app NÃO guarda o HTML dela (nada autenticado fica no cache)", async () => {
    h.network.responses["/financas"] = () => new Response("<html>R$ 3.458,00 SEGREDO</html>", { status: 200 });
    const res = await h.navigate("/financas", { mode: "navigate" });
    expect(res instanceof Response && (await res.text())).toContain("SEGREDO");
    for (const cache of h.cacheStore.values()) {
      for (const url of cache.keys()) expect(url).not.toContain("/financas");
    }
  });

  it("depois de várias navegações e chamadas, o cache só tem estáticos e /offline", async () => {
    for (const path of ["/inicio", "/financas", "/treino", "/estudos", "/configuracoes"]) await h.navigate(path, { mode: "navigate" });
    await h.navigate("/_next/static/chunks/main.js");
    await h.navigate("/api/snapshot");
    const cached = [...h.cacheStore.values()].flatMap((c) => [...c.keys()]).map((u) => new URL(u).pathname);
    expect(cached.every((p) => p === "/offline" || p.startsWith("/_next/static/"))).toBe(true);
  });
});

describe("arquivos estáticos: cache primeiro", () => {
  it("busca na rede uma vez e depois serve do cache (sem nova ida à rede)", async () => {
    await h.navigate("/_next/static/chunks/app.js");
    const before = h.fetchLog.filter((u) => u.endsWith("/chunks/app.js")).length;
    const second = await h.navigate("/_next/static/chunks/app.js");
    expect(second instanceof Response && (await second.text())).toBe("conteúdo de /_next/static/chunks/app.js");
    expect(h.fetchLog.filter((u) => u.endsWith("/chunks/app.js")).length).toBe(before);
  });
  it("não guarda respostas de erro (404/500)", async () => {
    h.network.responses["/_next/static/chunks/quebrado.js"] = () => new Response("nada", { status: 404 });
    await h.navigate("/_next/static/chunks/quebrado.js");
    const cached = [...(h.cacheStore.get("tars-static-v1")?.keys() ?? [])];
    expect(cached.some((u) => u.includes("quebrado"))).toBe(false);
  });
  it("limita o tamanho do cache (arquivos com hash acumulariam a cada deploy)", async () => {
    for (let i = 0; i < 200; i++) await h.navigate(`/_next/static/chunks/c${i}.js`);
    expect(h.cacheStore.get("tars-static-v1")!.size).toBeLessThanOrEqual(150);
  });
});

describe("sem conexão", () => {
  it("abrir uma tela sem rede mostra a página /offline", async () => {
    h.network.online = false;
    const res = await h.navigate("/financas", { mode: "navigate" });
    expect(res instanceof Response && (await res.text())).toContain("Você está sem conexão");
  });
  it("com rede, a navegação mostra a tela de verdade (a página offline não 'gruda')", async () => {
    const res = await h.navigate("/inicio", { mode: "navigate" });
    expect(res instanceof Response && (await res.text())).toBe("conteúdo de /inicio");
  });
  it("arquivo estático já guardado continua disponível sem rede", async () => {
    await h.navigate("/_next/static/chunks/app.js");
    h.network.online = false;
    const res = await h.navigate("/_next/static/chunks/app.js");
    expect(res instanceof Response && (await res.text())).toContain("app.js");
  });
});
