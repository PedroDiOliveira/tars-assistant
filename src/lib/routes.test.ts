import { describe, expect, it } from "vitest";
import { isPublicPage } from "./routes";

describe("isPublicPage", () => {
  it("reconhece as páginas públicas e suas subrotas", () => {
    for (const path of ["/login", "/esqueci-senha", "/redefinir-senha", "/login/", "/redefinir-senha/x"]) {
      expect(isPublicPage(path), path).toBe(true);
    }
  });
  it("tudo o mais é privado, inclusive nomes parecidos", () => {
    for (const path of ["/", "/inicio", "/financas", "/login-fake", "/loginx", "/api/snapshot", "/treino/login"]) {
      expect(isPublicPage(path), path).toBe(false);
    }
  });
});
