import { describe, expect, it } from "vitest";
import { goalFor, upsertGoal } from "./goals";
import { limitTone, progressPercent, progressRatio } from "./progress";
import { weeklyStreak } from "./streaks";
import type { Goal } from "./types";

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  kind: "workout_sessions",
  scopeId: null,
  validFrom: "2026-09-07",
  target: 3,
  ...over,
});

describe("meta por vigência", () => {
  const goals = [
    goal({ id: "a", validFrom: "2026-08-03", target: 3 }),
    goal({ id: "b", validFrom: "2026-10-05", target: 4 }),
  ];

  it("períodos passados continuam com a meta antiga", () => {
    expect(goalFor(goals, "workout_sessions", null, "2026-09-14")?.target).toBe(3);
  });

  it("a nova meta vale a partir do período em que foi criada", () => {
    expect(goalFor(goals, "workout_sessions", null, "2026-10-05")?.target).toBe(4);
    expect(goalFor(goals, "workout_sessions", null, "2026-10-12")?.target).toBe(4);
  });

  it("sem meta vigente devolve null", () => {
    expect(goalFor(goals, "workout_sessions", null, "2026-07-27")).toBeNull();
    expect(goalFor(goals, "reading_pages", null, "2026-10-05")).toBeNull();
  });

  it("meta zero equivale a remover a meta dali em diante", () => {
    const removed = upsertGoal(goals, goal({ id: "c", validFrom: "2026-10-12", target: 0 }));
    expect(goalFor(removed, "workout_sessions", null, "2026-10-12")).toBeNull();
    expect(goalFor(removed, "workout_sessions", null, "2026-10-05")?.target).toBe(4);
  });

  it("upsert substitui só a mesma vigência e preserva o histórico", () => {
    const next = upsertGoal(goals, goal({ id: "d", validFrom: "2026-10-05", target: 5 }));
    expect(next).toHaveLength(2);
    expect(goalFor(next, "workout_sessions", null, "2026-10-05")?.target).toBe(5);
    expect(goalFor(next, "workout_sessions", null, "2026-09-14")?.target).toBe(3);
  });

  it("metas por escopo (categoria/matéria) não se misturam", () => {
    const scoped = [
      goal({ kind: "category_budget", scopeId: "food", target: 800_00, validFrom: "2026-10-01" }),
    ];
    expect(goalFor(scoped, "category_budget", "food", "2026-10-01")?.target).toBe(800_00);
    expect(goalFor(scoped, "category_budget", "car", "2026-10-01")).toBeNull();
  });
});

describe("progresso", () => {
  it("nunca divide por zero", () => {
    expect(progressRatio(10, 0)).toBe(0);
    expect(progressRatio(10, null)).toBe(0);
    expect(progressPercent(10, 0)).toBeNull();
  });

  it("a barra limita a 0..1 mas o percentual real é preservado", () => {
    expect(progressRatio(150, 100)).toBe(1);
    expect(progressRatio(-20, 100)).toBe(0);
    expect(progressPercent(150, 100)).toBe(150);
    expect(progressPercent(-20, 100)).toBe(-20);
  });

  it("tom de limite: ok, atenção a partir de 90% e estourado acima de 100%", () => {
    expect(limitTone(89, 100)).toBe("ok");
    expect(limitTone(90, 100)).toBe("warn");
    expect(limitTone(100, 100)).toBe("warn");
    expect(limitTone(101, 100)).toBe("over");
  });
});

describe("sequência semanal", () => {
  const today = "2026-10-06"; // terça; semana atual começa em 2026-10-05
  const history: Record<string, number> = {
    "2026-09-28": 4,
    "2026-09-21": 4,
    "2026-09-14": 3,
    "2026-09-07": 4,
  };
  const run = (target: number | null, currentWeek: number) =>
    weeklyStreak({
      today,
      valueForWeek: (ws) => (ws === "2026-10-05" ? currentWeek : (history[ws] ?? 0)),
      targetForWeek: () => target,
    });

  it("semana atual em andamento não zera a sequência anterior", () => {
    const streak = run(4, 1);
    expect(streak.weeks).toBe(2); // 28/09 e 21/09; 14/09 ficou em 3 de 4
    expect(streak.currentWeekMet).toBe(false);
  });

  it("semana atual batida soma na sequência", () => {
    const streak = run(4, 4);
    expect(streak.weeks).toBe(3);
    expect(streak.currentWeekMet).toBe(true);
  });

  it("sem meta, não há sequência", () => {
    expect(run(null, 4).weeks).toBe(0);
  });
});
