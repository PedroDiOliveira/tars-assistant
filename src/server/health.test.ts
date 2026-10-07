import { describe, expect, it } from "vitest";
import { healthBody } from "./health";

const up = { ok: true, ms: 12.4 };
const down = { ok: false, ms: 5000 };

describe("healthBody", () => {
  it("público: só o status, nada de detalhes", () => {
    expect(healthBody({ database: up, aiConfigured: true, authenticated: false })).toEqual({ status: "ok" });
    expect(healthBody({ database: down, aiConfigured: true, authenticated: false })).toEqual({ status: "degraded" });
  });
  it("logado: acrescenta a latência do banco e se a IA está configurada", () => {
    expect(healthBody({ database: up, aiConfigured: true, authenticated: true })).toEqual({ status: "ok", database: { ok: true, ms: 12 }, ai: "configured" });
    expect(healthBody({ database: down, aiConfigured: false, authenticated: true })).toEqual({ status: "degraded", database: { ok: false, ms: 5000 }, ai: "off" });
  });
  it("nunca devolve chaves, URLs ou nomes de variável", () => {
    const text = JSON.stringify(healthBody({ database: up, aiConfigured: true, authenticated: true }));
    expect(text).not.toMatch(/key|secret|url|http|SUPABASE|XAI/i);
  });
});
