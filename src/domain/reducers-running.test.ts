import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { applyCommand } from "./reducers";
import { FUTURE_RUN_ERROR, RUN_NOT_FOUND } from "./running";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import { runningWeekSummary, workoutSummary } from "./summary";
import type { RunningSession, WorkoutSession } from "./types";

const NOW = Date.UTC(2026, 9, 7, 17, 0); // 07/10/2026 14:00 em São Paulo (quarta; a semana é 05..11)
const TODAY = "2026-10-07";

function ok(data: AppData, command: Command): AppData {
  const applied = applyCommand(data, command);
  if (!applied.ok) throw new Error(`esperava sucesso, veio: ${applied.error}`);
  return applied.data;
}
const fail = (data: AppData, command: Command): string => {
  const applied = applyCommand(data, command);
  if (applied.ok) throw new Error("esperava falha");
  return applied.error;
};
const add = (session: RunningSession, nowMs = NOW): Command => ({ type: "running.addSession", session, nowMs });
const update = (id: string, fields: Omit<RunningSession, "id">, nowMs = NOW): Command => ({ type: "running.updateSession", id, fields, nowMs });
const remove = (id: string): Command => ({ type: "running.deleteSession", id });

const empty: AppData = { ...EMPTY_APP_DATA };
const week = (data: AppData) => runningWeekSummary(data, TODAY);

describe("running.addSession", () => {
  it("só a data: cria a corrida e marca o dia, sem inventar distância nem duração", () => {
    const data = ok(empty, add({ id: "r1", occurredOn: TODAY }));
    expect(data.runningSessions).toEqual([{ id: "r1", occurredOn: TODAY }]);
    expect(Object.keys(data.runningSessions[0])).toEqual(["id", "occurredOn"]);
    expect(week(data)).toMatchObject({ runs: 1, activeDays: 1, distanceMeters: 0, runsWithoutDistance: 1, hasDistance: false });
    expect(week(data).dots[2]).toMatchObject({ date: TODAY, count: 1 });
  });

  it("5,2 km = 5200 metros, com duração e observação", () => {
    const data = ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" }));
    expect(data.runningSessions[0]).toEqual({ id: "r1", occurredOn: TODAY, distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" });
  });

  it("guarda a forma canônica: sem chaves indefinidas e sem observação vazia", () => {
    const data = ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: undefined, durationSeconds: undefined, notes: "" }));
    expect(data.runningSessions[0]).toEqual({ id: "r1", occurredOn: TODAY });
    expect(Object.keys(data.runningSessions[0])).toEqual(["id", "occurredOn"]);
  });

  it("repetir o MESMO id (toque duplo, nova tentativa) não duplica nem altera o que já foi salvo", () => {
    const first = ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: 5000 }));
    const again = ok(first, add({ id: "r1", occurredOn: TODAY, distanceMeters: 9999 }));
    expect(again.runningSessions).toEqual([{ id: "r1", occurredOn: TODAY, distanceMeters: 5000 }]);
    expect(again).toBe(first); // nada mudou: mesma referência
  });

  it("duas corridas no mesmo dia: 2 corridas, 1 dia, 8 km", () => {
    let data = ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: 3000 }));
    data = ok(data, add({ id: "r2", occurredOn: TODAY, distanceMeters: 5000 }));
    expect(week(data)).toMatchObject({ runs: 2, activeDays: 1, distanceMeters: 8000 });
  });

  it("recusa data futura (hoje vale, amanhã não), no fuso do app e não em UTC", () => {
    expect(fail(empty, add({ id: "r1", occurredOn: "2026-10-08" }))).toBe(FUTURE_RUN_ERROR);
    ok(empty, add({ id: "r1", occurredOn: TODAY }));
    const lateEvening = Date.UTC(2026, 9, 8, 2, 30); // 07/10 23:30 em SP, já dia 08 em UTC
    ok(empty, add({ id: "r2", occurredOn: TODAY }, lateEvening));
    expect(fail(empty, add({ id: "r3", occurredOn: "2026-10-08" }, lateEvening))).toBe(FUTURE_RUN_ERROR);
  });

  it("não mexe nas demais coleções (mesmas referências) nem na meta de musculação", () => {
    const base: AppData = {
      ...empty,
      goals: [{ id: "g", kind: "workout_sessions", scopeId: null, validFrom: "2026-10-05", target: 4 }],
      sessions: [{ id: "w", planId: null, nameSnapshot: "A", startedAt: 1, finishedAt: 2, occurredOn: TODAY, exercises: [] } satisfies WorkoutSession],
    };
    const data = ok(base, add({ id: "r1", occurredOn: TODAY, distanceMeters: 5000 }));
    for (const key of Object.keys(base).filter((k) => k !== "runningSessions") as (keyof AppData)[]) expect(data[key]).toBe(base[key]);
    expect(workoutSummary(data, TODAY)).toMatchObject({ done: 1, target: 4 }); // corrida não conta como treino
  });
});

describe("running.updateSession", () => {
  const base = ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: 5000, durationSeconds: 1800, notes: "Parque" }));

  it("substitui todos os campos (não é um patch): omitir limpa", () => {
    const data = ok(base, update("r1", { occurredOn: TODAY, distanceMeters: 6000 }));
    expect(data.runningSessions).toEqual([{ id: "r1", occurredOn: TODAY, distanceMeters: 6000 }]);
  });

  it("adiciona uma distância que estava ausente e recalcula a semana", () => {
    let data = ok(empty, add({ id: "r1", occurredOn: TODAY }));
    expect(week(data)).toMatchObject({ distanceMeters: 0, hasDistance: false });
    data = ok(data, update("r1", { occurredOn: TODAY, distanceMeters: 7500 }));
    expect(week(data)).toMatchObject({ runs: 1, distanceMeters: 7500, hasDistance: true, runsWithoutDistance: 0 });
  });

  it("corrige a distância e recalcula", () => {
    const data = ok(base, update("r1", { occurredOn: TODAY, distanceMeters: 10_000, durationSeconds: 1800, notes: "Parque" }));
    expect(week(data).distanceMeters).toBe(10_000);
  });

  it("remover a distância mantém a corrida e deixa a informação ausente (nunca 0)", () => {
    const data = ok(base, update("r1", { occurredOn: TODAY, durationSeconds: 1800, notes: "Parque" }));
    expect(data.runningSessions).toEqual([{ id: "r1", occurredOn: TODAY, durationSeconds: 1800, notes: "Parque" }]);
    expect(week(data)).toMatchObject({ runs: 1, activeDays: 1, distanceMeters: 0, runsWithoutDistance: 1, hasDistance: false });
  });

  it("remove duração e observação", () => {
    const data = ok(base, update("r1", { occurredOn: TODAY, distanceMeters: 5000 }));
    expect(data.runningSessions[0]).toEqual({ id: "r1", occurredOn: TODAY, distanceMeters: 5000 });
  });

  it("mover a data entre semanas recalcula as duas semanas", () => {
    const moved = ok(base, update("r1", { occurredOn: "2026-10-02", distanceMeters: 5000 })); // sexta da semana anterior
    expect(runningWeekSummary(moved, TODAY)).toMatchObject({ runs: 0, distanceMeters: 0 });
    expect(runningWeekSummary(moved, "2026-10-02")).toMatchObject({ runs: 1, distanceMeters: 5000 });
    expect(runningWeekSummary(base, TODAY)).toMatchObject({ runs: 1, distanceMeters: 5000 });
  });

  it("não troca a ordem nem mexe nas outras corridas", () => {
    const two = ok(base, add({ id: "r2", occurredOn: TODAY, distanceMeters: 3000 }));
    const data = ok(two, update("r1", { occurredOn: TODAY, distanceMeters: 1 }));
    expect(data.runningSessions.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(data.runningSessions[1]).toBe(two.runningSessions[1]);
  });

  it("corrida inexistente falha com mensagem clara (e não cria nada)", () => {
    expect(fail(base, update("outro", { occurredOn: TODAY }))).toBe(RUN_NOT_FOUND);
  });

  it("mover a data para o futuro é recusado; corrigir sem mexer na data nunca depende do relógio", () => {
    expect(fail(base, update("r1", { occurredOn: "2026-10-08", distanceMeters: 5000 }))).toBe(FUTURE_RUN_ERROR);
    const clockBehind = Date.UTC(2026, 9, 6, 15); // o relógio recuou: a data guardada (07) parece futura
    expect(ok(base, update("r1", { occurredOn: TODAY, distanceMeters: 4000 }, clockBehind)).runningSessions[0].distanceMeters).toBe(4000);
  });
});

describe("running.deleteSession", () => {
  it("exclui e recalcula todos os indicadores", () => {
    let data = ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: 3000 }));
    data = ok(data, add({ id: "r2", occurredOn: "2026-10-05", distanceMeters: 5000 }));
    data = ok(data, remove("r1"));
    expect(week(data)).toMatchObject({ runs: 1, activeDays: 1, distanceMeters: 5000 });
    data = ok(data, remove("r2"));
    expect(week(data)).toMatchObject({ runs: 0, distanceMeters: 0 });
    expect(data.runningSessions).toEqual([]);
  });

  it("excluir de novo (resposta perdida) ou um id desconhecido não é erro", () => {
    const data = ok(empty, add({ id: "r1", occurredOn: TODAY }));
    expect(ok(data, remove("nunca-existiu")).runningSessions).toHaveLength(1);
    expect(ok(ok(data, remove("r1")), remove("r1")).runningSessions).toEqual([]);
  });
});

describe("goal.set de corrida", () => {
  it("grava em metros, substitui a mesma vigência mantendo o id e preserva as anteriores", () => {
    const goal = (id: string, validFrom: string, target: number): Command => ({ type: "goal.set", goal: { id, kind: "running_meters", scopeId: null, validFrom, target } });
    let data = ok(empty, goal("a", "2026-09-28", 15_000));
    data = ok(data, goal("b", "2026-10-05", 12_500));
    data = ok(data, goal("c", "2026-10-05", 20_000)); // mesma vigência: substitui, mantém o id "b"
    expect(data.goals).toEqual([
      { id: "a", kind: "running_meters", scopeId: null, validFrom: "2026-09-28", target: 15_000 },
      { id: "b", kind: "running_meters", scopeId: null, validFrom: "2026-10-05", target: 20_000 },
    ]);
    expect(runningWeekSummary(data, "2026-10-01").targetMeters).toBe(15_000);
    expect(runningWeekSummary(data, TODAY).targetMeters).toBe(20_000);
  });
});

describe("pureza", () => {
  it("nenhum comando de corrida altera os dados de entrada", () => {
    const frozen = JSON.parse(JSON.stringify(ok(empty, add({ id: "r1", occurredOn: TODAY, distanceMeters: 1 })))) as AppData;
    const deepFreeze = <T,>(v: T): T => {
      if (v && typeof v === "object") {
        for (const child of Object.values(v)) deepFreeze(child);
        Object.freeze(v);
      }
      return v;
    };
    deepFreeze(frozen);
    expect(() => {
      ok(frozen, add({ id: "r2", occurredOn: TODAY }));
      ok(frozen, update("r1", { occurredOn: TODAY }));
      ok(frozen, remove("r1"));
    }).not.toThrow();
  });
});
