import { describe, expect, it } from "vitest";
import type { DataSnapshot } from "./summary";
import { estimatedStrength, trainingMonthReport } from "./training-report";
import type { SessionEffort, SessionExercise, WorkoutSession } from "./types";

const EXERCISES = [
  { id: "supino", name: "Supino reto", muscleGroup: "Peito", loadType: "external" as const },
  { id: "agacho", name: "Agachamento livre", muscleGroup: "Pernas", loadType: "external" as const },
  { id: "barra", name: "Barra fixa", muscleGroup: "Costas", loadType: "bodyweight" as const },
];

function work(exerciseId: string, weightKg: number, reps: number, count = 3): SessionExercise {
  const ex = EXERCISES.find((e) => e.id === exerciseId)!;
  return {
    exerciseId,
    nameSnapshot: ex.name,
    loadType: ex.loadType,
    plannedSets: count,
    repMin: 6,
    repMax: 12,
    restSeconds: 90,
    sets: Array.from({ length: count }, () => ({ weightKg, reps, done: true })),
  };
}

function day(date: string, exercises: SessionExercise[], effort?: SessionEffort): WorkoutSession {
  const startedAt = Date.parse(`${date}T18:00:00-03:00`);
  return {
    id: `s-${date}`,
    planId: null,
    nameSnapshot: "Treino",
    startedAt,
    finishedAt: startedAt + 60 * 60_000,
    occurredOn: date,
    exercises,
    ...(effort ? { effort } : {}),
  };
}

function data(sessions: WorkoutSession[]): DataSnapshot {
  return {
    categories: [],
    transactions: [],
    goals: [{ id: "g", kind: "workout_sessions", scopeId: null, validFrom: "2026-09-28", target: 3 }],
    exercises: EXERCISES,
    plans: [],
    sessions,
    subjects: [],
    studySessions: [],
    books: [],
    readingSessions: [],
    runningSessions: [
      { id: "r1", occurredOn: "2026-09-30", distanceMeters: 3000 },
      { id: "r2", occurredOn: "2026-10-10", distanceMeters: 5000, durationSeconds: 1800 },
      { id: "r3", occurredOn: "2026-10-12" },
    ],
    waterIntakes: [],
    trainingProfile: null,
    trainingPlans: [],
    trainingPlanChanges: [],
  };
}

// Setembro serve de "antes"; outubro é o mês do resumo (hoje = quarta, 28/10).
const SESSIONS = [
  day("2026-09-22", [work("supino", 60, 10), work("agacho", 100, 5)]),
  day("2026-10-01", [work("supino", 60, 10), work("agacho", 100, 5)], 2),
  day("2026-10-08", [work("supino", 62, 8), work("agacho", 100, 5), work("barra", 0, 8, 2)], 3),
  day("2026-10-15", [work("supino", 62, 10), work("agacho", 100, 5)], 3),
  day("2026-10-22", [work("supino", 64, 8), work("agacho", 100, 4)]),
  day("2026-10-27", [work("supino", 64, 9), work("agacho", 100, 5)], 4),
];
const TODAY = "2026-10-28";

describe("resumo do mês de musculação", () => {
  const report = trainingMonthReport(data(SESSIONS), "2026-10", TODAY);

  it("totais do mês (até agora) e comparação com o mês anterior", () => {
    expect(report).toMatchObject({ month: "2026-10", current: true, sessions: 5, previousSessions: 1, sets: 32, minutes: 300 });
    // supino 1800 + 1488 + 1860 + 1536 + 1728; agachamento 4 × 1500 + 1200; barra fixa sem carga externa
    expect(report.volumeKg).toBe(15612);
  });

  it("séries por grupo muscular, do maior para o menor (empate em ordem alfabética)", () => {
    expect(report.groups).toEqual([
      { group: "Peito", sets: 15 },
      { group: "Pernas", sets: 15 },
      { group: "Costas", sets: 2 },
    ]);
  });

  it("semanas (de segunda) que tocam o mês, até a de hoje, com a meta de cada uma", () => {
    expect(report.weeks.map((w) => [w.start, w.done, w.target, w.current])).toEqual([
      ["2026-09-28", 1, 3, false],
      ["2026-10-05", 1, 3, false],
      ["2026-10-12", 1, 3, false],
      ["2026-10-19", 1, 3, false],
      ["2026-10-26", 1, 3, true],
    ]);
  });

  it("recorde: a série mais pesada do mês supera a de antes (só com histórico anterior)", () => {
    expect(report.records).toEqual([
      { exerciseId: "supino", name: "Supino reto", weightKg: 64, reps: 9, date: "2026-10-27", previous: { weightKg: 60, reps: 10 } },
    ]);
  });

  it("evolução pela força estimada: 60 × 10 → 64 × 9", () => {
    expect(report.progressed).toEqual([
      { exerciseId: "supino", name: "Supino reto", from: { weightKg: 60, reps: 10 }, to: { weightKg: 64, reps: 9 } },
    ]);
  });

  it("estagnação: vários treinos seguidos sem superar a melhor série recente (e não aparece como evolução)", () => {
    expect(report.stalled).toEqual([
      { exerciseId: "agacho", name: "Agachamento livre", sessions: 5, best: { weightKg: 100, reps: 5 } },
    ]);
  });

  it("como foi: contagem por nível, só das sessões avaliadas", () => {
    expect(report.effort).toEqual({ counts: { 1: 0, 2: 1, 3: 2, 4: 1 }, rated: 4 });
  });

  it("corridas do mês entram como um número à parte (sem distância conta a corrida, não os metros)", () => {
    expect(report.running).toEqual({ runs: 2, meters: 5000 });
  });

  it("mês fechado não é 'até agora' e lista todas as suas semanas", () => {
    const september = trainingMonthReport(data(SESSIONS), "2026-09", TODAY);
    expect(september.current).toBe(false);
    expect(september.weeks.map((w) => w.start)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(september.records).toEqual([]); // sem histórico anterior, nada é "recorde"
  });

  it("mês sem treino: tudo zerado, sem quebrar", () => {
    const empty = trainingMonthReport(data(SESSIONS), "2026-08", TODAY);
    expect(empty).toMatchObject({ sessions: 0, sets: 0, minutes: 0, volumeKg: 0, groups: [], records: [], progressed: [], stalled: [] });
  });

  it("exercício apagado do cadastro cai em 'Outros' e usa o nome guardado na sessão", () => {
    const orphan = trainingMonthReport({ ...data(SESSIONS), exercises: EXERCISES.filter((e) => e.id !== "barra") }, "2026-10", TODAY);
    expect(orphan.groups).toContainEqual({ group: "Outros", sets: 2 });
  });
});

describe("força estimada", () => {
  it("Epley com carga; repetições quando não há carga externa", () => {
    expect(estimatedStrength({ weightKg: 60, reps: 10 })).toBe(80);
    expect(estimatedStrength({ weightKg: 0, reps: 12 })).toBe(12);
  });
});
