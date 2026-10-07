import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, SERVICE_WORKER_HEADERS, securityHeaders } from "./security-headers";

const map = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]));
const directives = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("CSP", () => {
  const csp = directives(contentSecurityPolicy({ https: true }));

  it("o navegador só fala com o próprio servidor (nunca direto com Supabase ou IA)", () => {
    expect(csp["connect-src"]).toEqual(["'self'"]);
  });
  it("nada de eval, de domínios de terceiros, de frames ou de <object>", () => {
    expect(contentSecurityPolicy({ https: true })).not.toMatch(/unsafe-eval|https?:\/\/|\*/);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["default-src"]).toEqual(["'self'"]);
  });
  it("formulários só enviam para o próprio site e <base> não pode ser trocado", () => {
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
  });
  it("permite o service worker, o manifesto e imagens locais/data", () => {
    expect(csp["worker-src"]).toEqual(["'self'"]);
    expect(csp["manifest-src"]).toEqual(["'self'"]);
    expect(csp["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:"]));
  });
  it("upgrade-insecure-requests só com HTTPS (senão testar pelo IP da rede em http quebraria)", () => {
    expect(contentSecurityPolicy({ https: true })).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ https: false })).not.toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders", () => {
  it("em produção traz a CSP e os demais cabeçalhos", () => {
    const h = map(securityHeaders({ production: true, https: true }));
    expect(h["Content-Security-Policy"]).toBeTruthy();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/);
  });
  it("só usa nomes de recurso que o Chrome reconhece (um nome desconhecido gera aviso no console a cada página)", () => {
    const policy = map(securityHeaders({ production: true, https: true }))["Permissions-Policy"];
    const names = policy.split(", ").map((entry) => entry.split("=")[0]);
    expect(names.sort()).toEqual(["camera", "geolocation", "microphone", "payment", "usb"]);
  });
  it("nega recursos do aparelho que o app não usa", () => {
    const policy = map(securityHeaders({ production: true, https: true }))["Permissions-Policy"];
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) expect(policy).toContain(`${feature}=()`);
  });
  it("em desenvolvimento NÃO aplica a CSP (Turbopack precisa de eval e WebSocket), mas mantém o resto", () => {
    const h = map(securityHeaders({ production: false, https: false }));
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
  it("o service worker nunca fica em cache e roda com CSP própria", () => {
    const h = map(SERVICE_WORKER_HEADERS);
    expect(h["Cache-Control"]).toMatch(/no-store/);
    expect(h["Content-Security-Policy"]).toBe("default-src 'self'; script-src 'self'");
    expect(h["Content-Type"]).toMatch(/javascript/);
  });
});
