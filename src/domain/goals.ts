import { monthStart, weekStart, type DateKey, type MonthKey } from "@/lib/dates";
import type { Goal, GoalKind } from "./types";

/** Meta mensal ou semanal? Define o início do período a que uma meta se aplica. */
export const GOAL_PERIOD: Record<GoalKind, "month" | "week"> = {
  savings: "month",
  category_budget: "month",
  workout_sessions: "week",
  study_minutes: "week",
  reading_pages: "week",
};

/**
 * Meta vigente para um período: a mais recente com `validFrom <= início do período`.
 * Mudar a meta cria uma nova linha; os períodos passados continuam enxergando a antiga.
 */
export function goalFor(
  goals: Goal[],
  kind: GoalKind,
  scopeId: string | null,
  periodStart: DateKey,
): Goal | null {
  let best: Goal | null = null;
  for (const goal of goals) {
    if (goal.kind !== kind || goal.scopeId !== scopeId) continue;
    if (goal.validFrom > periodStart) continue;
    if (!best || goal.validFrom > best.validFrom) best = goal;
  }
  return best && best.target > 0 ? best : null;
}

export function targetFor(
  goals: Goal[],
  kind: GoalKind,
  scopeId: string | null,
  periodStart: DateKey,
): number | null {
  return goalFor(goals, kind, scopeId, periodStart)?.target ?? null;
}

export function currentMonthTarget(
  goals: Goal[],
  kind: GoalKind,
  scopeId: string | null,
  month: MonthKey,
): number | null {
  return targetFor(goals, kind, scopeId, monthStart(month));
}

export function currentWeekTarget(
  goals: Goal[],
  kind: GoalKind,
  scopeId: string | null,
  day: DateKey,
): number | null {
  return targetFor(goals, kind, scopeId, weekStart(day));
}

/**
 * Grava uma nova meta com vigência a partir de `validFrom` (início de período).
 * Se já existe meta do mesmo tipo/escopo/vigência, ela é substituída; as demais ficam intactas.
 */
export function upsertGoal(goals: Goal[], next: Goal): Goal[] {
  const kept = goals.filter(
    (g) => !(g.kind === next.kind && g.scopeId === next.scopeId && g.validFrom === next.validFrom),
  );
  return [...kept, next];
}
