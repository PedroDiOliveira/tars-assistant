import { addDays, weekStart, type DateKey } from "@/lib/dates";

export interface WeeklyStreak {
  /** semanas seguidas batendo a meta (a semana atual conta se já foi batida) */
  weeks: number;
  currentWeekMet: boolean;
}

interface StreakInput {
  today: DateKey;
  /** valor realizado na semana que começa em `weekStartKey` */
  valueForWeek: (weekStartKey: DateKey) => number;
  /** meta vigente na semana; null = sem meta (interrompe a sequência) */
  targetForWeek: (weekStartKey: DateKey) => number | null;
  maxWeeks?: number;
}

/**
 * Sequência semanal: sem culpa por um dia perdido. A semana atual só ajuda (se já bateu a meta);
 * enquanto está em andamento e não bateu, ela não zera a sequência das semanas anteriores.
 */
export function weeklyStreak({
  today,
  valueForWeek,
  targetForWeek,
  maxWeeks = 104,
}: StreakInput): WeeklyStreak {
  const currentStart = weekStart(today);
  const currentTarget = targetForWeek(currentStart);
  const currentWeekMet = currentTarget !== null && valueForWeek(currentStart) >= currentTarget;

  let weeks = currentWeekMet ? 1 : 0;
  for (let i = 1; i <= maxWeeks; i += 1) {
    const start = addDays(currentStart, -7 * i);
    const target = targetForWeek(start);
    if (target === null || valueForWeek(start) < target) break;
    weeks += 1;
  }
  return { weeks, currentWeekMet };
}
