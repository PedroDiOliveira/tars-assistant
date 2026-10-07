import { describe, expect, it } from "vitest";
import {
  buildDraft,
  compareLastTwo,
  draftProgress,
  finalizeDraft,
  personalRecord,
  setsVolume,
  weekDots,
} from "./workouts";
import type { Exercise, WorkoutPlan, WorkoutSession } from "./types";

const exercises: Exercise[] = [
  { id: "supino", name: "Supino reto", muscleGroup: "Peito", loadType: "external" },
  { id: "barra", name: "Barra fixa", muscleGroup: "Costas", loadType: "bodyweight" },
];

const plan: WorkoutPlan = {
  id: "A",
  name: "Treino A — Peito e tríceps",
  exercises: [
    { exerciseId: "supino", plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 120 },
    { exerciseId: "barra", plannedSets: 2, repMin: 5, repMax: 8, restSeconds: 90 },
  ],
};

const session = (
  id: string,
  occurredOn: string,
  sets: { weightKg: number; reps: number }[],
): WorkoutSession => ({
  id,
  planId: "A",
  nameSnapshot: plan.name,
  startedAt: Date.parse(`${occurredOn}T15:00:00Z`),
  finishedAt: Date.parse(`${occurredOn}T16:00:00Z`),
  occurredOn,
  exercises: [
    {
      exerciseId: "supino",
      nameSnapshot: "Supino reto",
      loadType: "external",
      plannedSets: 3,
      repMin: 6,
      repMax: 10,
      restSeconds: 120,
      sets: sets.map((s) => ({ ...s, done: true })),
    },
  ],
});

describe("volume", () => {
  it("soma carga × repetições das séries concluídas com carga externa", () => {
    expect(
      setsVolume([
        { weightKg: 60, reps: 10, done: true },
        { weightKg: 60, reps: 8, done: true },
        { weightKg: 60, reps: 8, done: false }, // não concluída: fora
        { weightKg: 0, reps: 10, done: true }, // peso corporal: fora
      ]),
    ).toBe(60 * 10 + 60 * 8);
  });
});

describe("rascunho local-first", () => {
  it("pré-preenche as séries com o último desempenho, sem marcá-las como feitas", () => {
    const history = [
      session("s1", "2026-09-28", [
        { weightKg: 60, reps: 10 },
        { weightKg: 62.5, reps: 8 },
        { weightKg: 62.5, reps: 7 },
      ]),
    ];
    const draft = buildDraft(plan, exercises, history, 0);
    const sets = draft.exercises[0].sets;
    expect(sets.map((s) => [s.weightKg, s.reps, s.done])).toEqual([
      [60, 10, false],
      [62.5, 8, false],
      [62.5, 7, false],
    ]);
  });

  it("sem histórico usa o planejado com carga zero", () => {
    const draft = buildDraft(plan, exercises, [], 0);
    expect(draft.exercises[0].sets).toHaveLength(3);
    expect(draft.exercises[0].sets[0]).toEqual({ weightKg: 0, reps: 10, done: false });
  });

  it("guarda uma cópia dos parâmetros: editar a ficha depois não muda o treino já feito", () => {
    const draft = buildDraft(plan, exercises, [], 0);
    const finished = finalizeDraft(
      { ...draft, exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: true })) })) },
      "x",
      1,
      "2026-10-06",
    )!;
    plan.exercises[0].plannedSets = 5; // "edita" a ficha
    plan.name = "Outro nome";
    expect(finished.nameSnapshot).toBe("Treino A — Peito e tríceps");
    expect(finished.exercises[0].plannedSets).toBe(3);
    plan.exercises[0].plannedSets = 3;
    plan.name = "Treino A — Peito e tríceps";
  });

  it("ao finalizar só grava séries concluídas e omite exercícios vazios", () => {
    const draft = buildDraft(plan, exercises, [], 0);
    draft.exercises[0].sets[0] = { weightKg: 50, reps: 10, done: true };
    const done = finalizeDraft(draft, "x", 1, "2026-10-06")!;
    expect(done.exercises).toHaveLength(1);
    expect(done.exercises[0].sets).toHaveLength(1);
  });

  it("sem nenhuma série concluída não gera sessão (não conta na meta)", () => {
    const draft = buildDraft(plan, exercises, [], 0);
    expect(finalizeDraft(draft, "x", 1, "2026-10-06")).toBeNull();
    expect(draftProgress(draft)).toEqual({ done: 0, total: 5 });
  });
});

describe("recorde e comparação", () => {
  const history = [
    session("s1", "2026-09-14", [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 8 }]),
    session("s2", "2026-09-21", [{ weightKg: 65, reps: 6 }, { weightKg: 60, reps: 9 }]),
    session("s3", "2026-09-28", [{ weightKg: 62.5, reps: 8 }, { weightKg: 62.5, reps: 8 }]),
  ];

  it("recorde é a maior carga registrada, com repetições e data", () => {
    expect(personalRecord(history, "supino")).toEqual({ weightKg: 65, reps: 6, date: "2026-09-21" });
  });

  it("compara a última sessão com a anterior informando volume e carga", () => {
    const cmp = compareLastTwo(history, "supino")!;
    expect(cmp.last.date).toBe("2026-09-28");
    expect(cmp.previous.date).toBe("2026-09-21");
    expect(cmp.volumeDelta).toBe(62.5 * 16 - (65 * 6 + 60 * 9));
    expect(cmp.topWeightDeltaKg).toBe(-2.5);
  });

  it("sem sessões suficientes não compara", () => {
    expect(compareLastTwo(history.slice(0, 1), "supino")).toBeNull();
    expect(personalRecord([], "supino")).toBeNull();
  });
});

describe("semana do treino", () => {
  it("marca os dias com treino concluído e identifica hoje e o futuro", () => {
    const sessions = [session("s1", "2026-10-05", [{ weightKg: 60, reps: 10 }])];
    const dots = weekDots(sessions, "2026-10-06");
    expect(dots).toHaveLength(7);
    expect(dots[0]).toMatchObject({ date: "2026-10-05", count: 1, isToday: false, isFuture: false });
    expect(dots[1]).toMatchObject({ date: "2026-10-06", count: 0, isToday: true });
    expect(dots[2].isFuture).toBe(true);
  });
});
