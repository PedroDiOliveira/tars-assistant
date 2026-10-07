import { describe, expect, it } from "vitest";
import { isHttps, sessionCookieOptions } from "./session-cookie";

describe("sessionCookieOptions", () => {
  it("força httpOnly e SameSite=Lax, mantendo path e validade que o Supabase definiu", () => {
    expect(sessionCookieOptions({ path: "/", maxAge: 400, httpOnly: false, sameSite: "none" }, true)).toEqual({
      path: "/",
      maxAge: 400,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });
  it("secure só quando a requisição é https (http na rede local precisa continuar funcionando)", () => {
    expect(sessionCookieOptions({}, false).secure).toBe(false);
    expect(sessionCookieOptions({}, true).secure).toBe(true);
  });
  it("a remoção do cookie (maxAge 0) mantém os mesmos atributos", () => {
    expect(sessionCookieOptions({ maxAge: 0 }, true)).toMatchObject({ maxAge: 0, httpOnly: true });
  });
});

describe("isHttps", () => {
  const headers = (value?: string) => new Headers(value ? { "x-forwarded-proto": value } : {});
  it("lê o protocolo original informado pelo proxy da Vercel", () => {
    expect(isHttps(headers("https"))).toBe(true);
    expect(isHttps(headers("https, http"))).toBe(true);
  });
  it("http, ausente ou desconhecido não é https", () => {
    expect(isHttps(headers("http"))).toBe(false);
    expect(isHttps(headers())).toBe(false);
    expect(isHttps(headers("ftp"))).toBe(false);
  });
});
