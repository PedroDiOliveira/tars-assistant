import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./snapshot";

/** O que `get_snapshot()` devolve para uma conta vazia (camelCase, nulos como `null`). */
const empty = {
  serverNow: 1_760_000_000_000,
  schemaVersion: 18,
  profile: { displayName: "Pedro" },
  categories: [], transactions: [], templates: [], goals: [], exercises: [], plans: [], sessions: [],
  subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [], waterIntakes: [],
  trainingProfile: null, trainingPlans: [], trainingPlanChanges: [],
};

describe("parseSnapshot: corridas", () => {
  it("NULL do banco vira campo ausente (nunca 0), e a corrida fica igual à que o reducer produz", () => {
    const { data } = parseSnapshot({
      ...empty,
      runningSessions: [
        { id: "r1", occurredOn: "2026-10-07", distanceMeters: null, durationSeconds: null, notes: null },
        { id: "r2", occurredOn: "2026-10-06", distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" },
      ],
    });
    expect(data.runningSessions).toEqual([
      { id: "r1", occurredOn: "2026-10-07" },
      { id: "r2", occurredOn: "2026-10-06", distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" },
    ]);
    expect(Object.keys(data.runningSessions[0])).toEqual(["id", "occurredOn"]);
  });

  it("aceita a meta de corrida (running_meters)", () => {
    const { data } = parseSnapshot({ ...empty, goals: [{ id: "g", kind: "running_meters", scopeId: null, validFrom: "2026-10-05", target: 20_000 }] });
    expect(data.goals[0]).toMatchObject({ kind: "running_meters", target: 20_000 });
  });

  it("um banco SEM a coleção (migração ainda não aplicada) é erro explícito, nunca dado pela metade", () => {
    const { runningSessions: _omitted, ...withoutRunning } = empty;
    void _omitted;
    expect(() => parseSnapshot(withoutRunning)).toThrow();
  });

  it("recusa distância que não é inteira (metros inteiros) ou data malformada", () => {
    expect(() => parseSnapshot({ ...empty, runningSessions: [{ id: "r", occurredOn: "2026-10-07", distanceMeters: 5.2 }] })).toThrow();
    expect(() => parseSnapshot({ ...empty, runningSessions: [{ id: "r", occurredOn: "07/10/2026" }] })).toThrow();
  });
});

describe("parseSnapshot: plano de treino", () => {
  it("respostas: NULL de consentimento e de texto viram campos ausentes", () => {
    const parsed = parseSnapshot({
      ...empty,
      trainingProfile: {
        goal: "forca", experience: "avancado", daysPerWeek: 5, sessionMinutes: 75, location: "academia",
        limitations: [], screening: "nao-respondida", healthConsentAt: null, priorities: ["costas"], notes: null,
        updatedAt: 1_760_000_000_000,
      },
    });
    expect(parsed.data.trainingProfile).toEqual({
      goal: "forca", experience: "avancado", daysPerWeek: 5, sessionMinutes: 75, location: "academia",
      limitations: [], screening: "nao-respondida", priorities: ["costas"], updatedAt: 1_760_000_000_000,
    });
    expect(parsed.data.trainingProfile).not.toHaveProperty("healthConsentAt");
  });

  it("plano aceito: o documento volta com as colunas e sem chaves vazias", () => {
    const plan = {
      id: "tp1", acceptedAt: 1_760_000_100_000, source: "rules", promptVersion: "regras-v1", split: "corpo-inteiro",
      summary: "Corpo inteiro.", answers: { goal: "saude", experience: "iniciante", daysPerWeek: 3, sessionMinutes: 45, location: "casa-halteres", priorities: [] },
      days: [{ planId: "p1", name: "Corpo inteiro A", exercises: [{ exerciseId: "e1", libraryKey: "agachamento-goblet" }] }],
      edits: 1,
    };
    const parsed = parseSnapshot({ ...empty, trainingPlans: [plan] });
    expect(parsed.data.trainingPlans).toEqual([plan]);
    expect(parsed.data.trainingPlans[0]).not.toHaveProperty("model");
  });

  it("valor fora do permitido é recusado (nunca vira dado pela metade)", () => {
    expect(() => parseSnapshot({ ...empty, trainingProfile: { ...{ goal: "voar" } } })).toThrow();
  });
});
