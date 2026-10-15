import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./snapshot";

/** O que `get_snapshot()` devolve para uma conta vazia (camelCase, nulos como `null`). */
const empty = {
  serverNow: 1_760_000_000_000,
  profile: { displayName: "Pedro" },
  categories: [], transactions: [], templates: [], goals: [], exercises: [], plans: [], sessions: [],
  subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [], waterIntakes: [],
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
