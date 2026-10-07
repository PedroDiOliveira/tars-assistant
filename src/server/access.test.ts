import { describe, expect, it } from "vitest";
import { decideAccess } from "./access";

describe("decideAccess", () => {
  it("deslogado: tudo vai para o login, menos as páginas públicas", () => {
    for (const path of ["/", "/inicio", "/financas", "/treino/sessao", "/configuracoes", "/assistente", "/estudos/leitura"]) {
      expect(decideAccess(path, false), path).toEqual({ action: "redirect", to: "/login" });
    }
    for (const path of ["/login", "/esqueci-senha", "/redefinir-senha"]) {
      expect(decideAccess(path, false), path).toEqual({ action: "next" });
    }
  });

  it("logado: acessa o app; login e 'esqueci a senha' redirecionam para o início", () => {
    expect(decideAccess("/inicio", true)).toEqual({ action: "next" });
    expect(decideAccess("/treino/exercicio/abc", true)).toEqual({ action: "next" });
    expect(decideAccess("/login", true)).toEqual({ action: "redirect", to: "/inicio" });
    expect(decideAccess("/esqueci-senha", true)).toEqual({ action: "redirect", to: "/inicio" });
  });

  it("redefinir senha continua acessível logado (o link do e-mail cria a sessão no próprio fluxo)", () => {
    expect(decideAccess("/redefinir-senha", true)).toEqual({ action: "next" });
  });

  it("API sem sessão responde 401 em vez de redirecionar para uma página", () => {
    for (const path of ["/api/snapshot", "/api/assistant", "/api/export"]) {
      expect(decideAccess(path, false), path).toEqual({ action: "unauthorized" });
      expect(decideAccess(path, true), path).toEqual({ action: "next" });
    }
  });

  it("o cron passa pelo proxy: o handler valida o CRON_SECRET", () => {
    expect(decideAccess("/api/cron/keep-alive", false)).toEqual({ action: "next" });
  });

  it("o health é público; /api/export e as demais continuam fechadas", () => {
    expect(decideAccess("/api/health", false)).toEqual({ action: "next" });
    for (const path of ["/api/healthz", "/api/health/x", "/api/export", "/api/snapshot"]) {
      expect(decideAccess(path, false), path).toEqual({ action: "unauthorized" });
    }
  });

  it("não confunde prefixos parecidos com páginas públicas", () => {
    expect(decideAccess("/login-fake", false)).toEqual({ action: "redirect", to: "/login" });
    expect(decideAccess("/loginx/inicio", false)).toEqual({ action: "redirect", to: "/login" });
    expect(decideAccess("/apinada", false)).toEqual({ action: "redirect", to: "/login" });
    expect(decideAccess("/api/cron", false)).toEqual({ action: "unauthorized" }); // sem a barra final não é o cron
  });
});
