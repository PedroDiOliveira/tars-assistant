import { describe, expect, it } from "vitest";
import { formatLog } from "./log";

describe("formatLog", () => {
  it("registra números, booleanos e códigos curtos", () => {
    expect(JSON.parse(formatLog("info", "assistant.reply", { status: 200, tokens: 1234, ok: true, kind: "timeout", tools: ["get_financial_summary"] })))
      .toEqual({ level: "info", event: "assistant.reply", status: 200, tokens: 1234, ok: true, kind: "timeout", tools: ["get_financial_summary"] });
  });
  it("descarta qualquer texto que não seja um código curto (mensagens, e-mails, valores com espaço)", () => {
    const line = formatLog("warn", "x", {
      message: "Gastei 42 reais no Outback ontem",
      email: "pedro@tars.example",
      key: "xai-chave secreta com espaço",
      long: "a".repeat(200),
      tools: ["ok_tool", "texto livre do usuário"],
    });
    expect(line).not.toMatch(/Outback|pedro@|secreta|aaaa/);
    expect(JSON.parse(line)).toMatchObject({ message: "[omitido]", email: "[omitido]", key: "[omitido]", long: "[omitido]", tools: ["ok_tool", "[omitido]"] });
  });
  it("é sempre uma linha JSON válida", () => {
    expect(formatLog("error", "e")).not.toContain("\n");
    expect(() => JSON.parse(formatLog("error", "e", { a: null, b: undefined }))).not.toThrow();
  });
});
