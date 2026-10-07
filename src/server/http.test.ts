import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/app-mode", () => ({ IS_LIVE: true }));
const { isSameOrigin } = await import("./http");

const req = (headers: Record<string, string>) => new Request("https://tars.example/api/assistant", { method: "POST", headers });

describe("isSameOrigin (CSRF em Route Handlers)", () => {
  it("aceita a própria origem", () => {
    expect(isSameOrigin(req({ origin: "https://tars.example", host: "tars.example" }))).toBe(true);
  });
  it("usa x-forwarded-host atrás do proxy da Vercel", () => {
    expect(isSameOrigin(req({ origin: "https://tars.example", host: "internal:3000", "x-forwarded-host": "tars.example" }))).toBe(true);
  });
  it("recusa outra origem, origem ausente e origem malformada", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "tars.example" }))).toBe(false);
    expect(isSameOrigin(req({ host: "tars.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "não é uma url", host: "tars.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "null", host: "tars.example" }))).toBe(false);
  });
  it("não confunde subdomínio ou prefixo parecido", () => {
    expect(isSameOrigin(req({ origin: "https://tars.example.evil.com", host: "tars.example" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "https://evil-tars.example", host: "tars.example" }))).toBe(false);
  });
});
