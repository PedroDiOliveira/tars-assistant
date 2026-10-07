import { describe, expect, it } from "vitest";
import { translateDbError } from "./db-errors";

const t = (code: string | undefined, message = "x", status?: number) => translateDbError({ code, message, status });

describe("translateDbError", () => {
  it("mensagens de regra escritas em português passam como estão", () => {
    for (const message of [
      "O livro tem 320 páginas.",
      "A página final deve ser maior que a inicial.",
      "As páginas não podem ser negativas.",
      "Conclua ao menos uma série para salvar o treino.",
      "O livro já tem leituras até a página 200.",
    ]) {
      expect(t("23514", message)).toEqual({ ok: false, code: "validation", error: message });
    }
    expect(t("P0002", "Livro não encontrado.")).toEqual({ ok: false, code: "validation", error: "Livro não encontrado." });
  });

  it("nome repetido: a mensagem NOSSA passa; o texto cru do índice único continua escondido", () => {
    expect(t("23505", "Já existe uma categoria com este nome.")).toEqual({ ok: false, code: "validation", error: "Já existe uma categoria com este nome." });
    const raw = t("23505", 'duplicate key value violates unique constraint "categories_active_name_uq"');
    expect(raw).toEqual({ ok: false, code: "conflict", error: "Já existe um registro igual a este." });
  });

  it("texto cru do Postgres nunca chega ao usuário (cita tabela e constraint)", () => {
    const raw = 'new row for relation "transactions" violates check constraint "transactions_amount_cents_check"';
    const failure = t("23514", raw);
    expect(failure).toEqual({ ok: false, code: "validation", error: "Algum valor informado é inválido." });
    expect(JSON.stringify(failure)).not.toContain("transactions");
    for (const [code, message] of [
      ["23505", 'duplicate key value violates unique constraint "categories_active_name_uq"'],
      ["23503", 'insert or update on table "transactions" violates foreign key constraint'],
      ["22P02", 'invalid input syntax for type uuid: "abc"'],
      ["42501", 'new row violates row-level security policy for table "books"'],
    ] as const) {
      const out = JSON.stringify(t(code, message));
      expect(out, code).not.toMatch(/violates|constraint|relation|table|uuid|policy|duplicate/i);
    }
  });

  it("sessão: JWT expirado e 'não autenticado' viram unauthorized", () => {
    expect(t("42501", "Não autenticado.")).toMatchObject({ code: "unauthorized", error: "Sua sessão expirou. Entre de novo." });
    expect(t("PGRST301", "JWT expired")).toMatchObject({ code: "unauthorized" });
    expect(t("42501", "permission denied for table books")).toMatchObject({ code: "unauthorized", error: "Você não tem permissão para isso." });
  });

  it("conflitos: duplicado e em uso", () => {
    expect(t("23505")).toMatchObject({ code: "conflict", error: "Já existe um registro igual a este." });
    expect(t("23503")).toMatchObject({ code: "conflict" });
    expect(t("23001")).toMatchObject({ code: "conflict" });
  });

  it("sem código nem status = nem chegou ao banco = offline, e diz que nada foi salvo", () => {
    expect(translateDbError({ message: "TypeError: fetch failed" })).toEqual({
      ok: false, code: "offline", error: "Sem conexão com o servidor. Nada foi salvo.",
    });
    // com status HTTP (a requisição chegou) deixa de ser "offline"
    expect(translateDbError({ message: "Bad gateway", status: 502 })).toMatchObject({ code: "unknown" });
  });

  it("indisponibilidade do banco (timeout, conexões esgotadas, projeto pausado) = offline", () => {
    for (const code of ["57014", "53300", "08006", "57P01"]) expect(t(code), code).toMatchObject({ code: "offline" });
  });

  it("qualquer outro erro: mensagem genérica, sem detalhes", () => {
    expect(t("XX000", "internal error at foo.c:123")).toEqual({
      ok: false, code: "unknown", error: "Não foi possível salvar. Tente de novo.",
    });
  });
});
