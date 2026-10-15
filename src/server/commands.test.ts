import { describe, expect, it } from "vitest";
import { loadSnapshot, type RpcClient } from "./commands";

const client = (data: unknown): RpcClient => ({ rpc: async () => ({ data, error: null }) });

const complete = {
  serverNow: 1, profile: null, categories: [], transactions: [], templates: [], goals: [], exercises: [], plans: [],
  sessions: [], subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [], waterIntakes: [],
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

  it("banco sem a migração de Água (mas com a de Corrida): a mensagem aponta a migração de Água", async () => {
    const { waterIntakes: _omitted, ...beforeWater } = complete;
    void _omitted;
    const result = await loadSnapshot(client(beforeWater));
    expect(result).toEqual({
      ok: false,
      code: "unknown",
      error: "O banco ainda não tem a atualização de Água. Aplique a migração 20261014000015_water e recarregue.",
    });
  });

  it("banco sem NENHUMA das duas: aponta a mais antiga (a ordem de aplicação)", async () => {
    const { runningSessions: _r, waterIntakes: _w, ...old } = complete;
    void _r;
    void _w;
    expect(await loadSnapshot(client(old))).toMatchObject({ ok: false, error: expect.stringContaining("Corrida") });
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
