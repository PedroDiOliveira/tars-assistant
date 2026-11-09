import { describe, expect, it } from "vitest";
import { loadSnapshot, type RpcClient } from "./commands";

const client = (data: unknown): RpcClient => ({ rpc: async () => ({ data, error: null }) });

const complete = {
  serverNow: 1, schemaVersion: 18, profile: null, categories: [], transactions: [], templates: [], goals: [], exercises: [], plans: [],
  sessions: [], subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [], waterIntakes: [],
  trainingProfile: null, trainingPlans: [], trainingPlanChanges: [],
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

  it("banco sem a migração 16 (sem versão do esquema): recusa abrir em vez de perder o \"como foi?\" e o vínculo em silêncio", async () => {
    const { schemaVersion: _omitted, ...beforeTraining } = complete;
    void _omitted;
    const expected = {
      ok: false,
      code: "unknown",
      error: "O banco ainda não tem a atualização de Treino (como foi e biblioteca). Aplique a migração 20261028000016_training_foundation e recarregue.",
    };
    expect(await loadSnapshot(client(beforeTraining))).toEqual(expected);
    expect(await loadSnapshot(client({ ...complete, schemaVersion: 15 }))).toEqual(expected);
  });

  it("banco com a migração 16 mas sem a 17: recusa abrir e aponta a do plano de treino", async () => {
    const { trainingProfile: _p, trainingPlans: _t, ...beforePlan } = complete;
    void _p;
    void _t;
    expect(await loadSnapshot(client({ ...beforePlan, schemaVersion: 16 }))).toEqual({
      ok: false,
      code: "unknown",
      error: "O banco ainda não tem a atualização de Plano de treino. Aplique a migração 20261028000017_training_plan e recarregue.",
    });
  });

  it("banco com a 17 mas sem a 18: recusa abrir e aponta a dos ajustes no plano (o que quer que o app grave lá)", async () => {
    const { trainingPlanChanges: _c, ...beforeChanges } = complete;
    void _c;
    expect(await loadSnapshot(client({ ...beforeChanges, schemaVersion: 17 }))).toEqual({
      ok: false,
      code: "unknown",
      error: "O banco ainda não tem a atualização de Ajustes no plano de treino. Aplique a migração 20261108000018_training_plan_changes e recarregue.",
    });
  });

  it("banco com a versão do esquema atual (ou mais nova) abre normalmente", async () => {
    expect(await loadSnapshot(client(complete))).toMatchObject({ ok: true });
    expect(await loadSnapshot(client({ ...complete, schemaVersion: 19 }))).toMatchObject({ ok: true });
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
