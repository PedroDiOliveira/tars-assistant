import { describe, expect, it } from "vitest";
import { loadSnapshot, type RpcClient } from "./commands";

const client = (data: unknown): RpcClient => ({ rpc: async () => ({ data, error: null }) });

const complete = {
  serverNow: 1, profile: null, categories: [], transactions: [], templates: [], goals: [], exercises: [], plans: [],
  sessions: [], subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [],
};

describe("loadSnapshot: implantação fora de ordem", () => {
  it("banco sem a migração de Corrida: a mensagem diz o que fazer (não é um 'formato inesperado' genérico)", async () => {
    const { runningSessions: _omitted, ...beforeRunning } = complete;
    void _omitted;
    const result = await loadSnapshot(client(beforeRunning));
    expect(result).toEqual({
      ok: false,
      code: "unknown",
      error: "O banco ainda não tem a atualização de Corrida. Aplique a migração 20261014000013_running e recarregue.",
    });
  });

  it("qualquer outro formato quebrado continua sendo o erro genérico", async () => {
    expect(await loadSnapshot(client({ categories: "não sou uma lista" }))).toMatchObject({ ok: false, error: "Não foi possível ler seus dados (formato inesperado)." });
    expect(await loadSnapshot(client(null))).toMatchObject({ ok: false, error: "Não foi possível ler seus dados (formato inesperado)." });
    expect(await loadSnapshot(client({ ...complete, categories: 5 }))).toMatchObject({ ok: false, error: "Não foi possível ler seus dados (formato inesperado)." });
  });

  it("um snapshot completo é lido normalmente", async () => {
    expect(await loadSnapshot(client(complete))).toMatchObject({ ok: true });
  });
});
