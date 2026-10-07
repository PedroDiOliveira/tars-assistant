import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron";

const SECRET = "segredo-do-cron-com-16-ou-mais";
const req = (authorization?: string) => new Request("https://tars.example/api/cron/keep-alive", { headers: authorization ? { authorization } : {} });

describe("isAuthorizedCron", () => {
  it("aceita só 'Bearer <segredo>' exato", () => {
    expect(isAuthorizedCron(req(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });
  // (Espaços nas pontas do valor são aparados pela própria especificação de Headers, então não são distinguíveis.)
  it("recusa ausente, vazio, errado, sem 'Bearer', outro esquema e variações", () => {
    for (const header of [undefined, "", "Bearer ", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET, `bearer ${SECRET}`, `Basic ${SECRET}`, `Bearer  ${SECRET}`]) {
      expect(isAuthorizedCron(req(header), SECRET), String(header)).toBe(false);
    }
  });
  it("sem segredo configurado o endpoint fica FECHADO (nem 'Bearer undefined' passa)", () => {
    expect(isAuthorizedCron(req("Bearer undefined"), undefined)).toBe(false);
    expect(isAuthorizedCron(req("Bearer "), "")).toBe(false);
    expect(isAuthorizedCron(req(), undefined)).toBe(false);
  });
});
