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

export interface DailyStreak {
  /** dias seguidos batendo a meta (hoje conta se já foi batida) */
  days: number;
  todayMet: boolean;
}

interface DailyStreakInput {
  today: DateKey;
  /** valor realizado em `day` */
  valueForDay: (day: DateKey) => number;
  /** meta vigente no dia; null = sem meta (interrompe a sequência) */
  targetForDay: (day: DateKey) => number | null;
  maxDays?: number;
}

/**
 * Sequência diária. Hoje só ajuda: enquanto o dia está em andamento e a meta não foi batida, ele NÃO zera a
 * sequência dos dias anteriores (só um dia já encerrado sem a meta a interrompe).
 */
export function dailyStreak({ today, valueForDay, targetForDay, maxDays = 365 }: DailyStreakInput): DailyStreak {
  const todayTarget = targetForDay(today);
  const todayMet = todayTarget !== null && valueForDay(today) >= todayTarget;

  let days = todayMet ? 1 : 0;
  for (let i = 1; i <= maxDays; i += 1) {
    const day = addDays(today, -i);
    const target = targetForDay(day);
    if (target === null || valueForDay(day) < target) break;
    days += 1;
  }
  return { days, todayMet };
}

interface BestDailyStreakInput {
  /** primeiro e último dia a examinar (inclusive); `to` costuma ser hoje */
  from: DateKey;
  to: DateKey;
  valueForDay: (day: DateKey) => number;
  targetForDay: (day: DateKey) => number | null;
  /** dias de histórico examinados no máximo, contando de `to` para trás */
  maxDays?: number;
}

/**
 * A maior sequência de dias seguidos na meta dentro do período. O dia `to` ainda em andamento só conta se já bateu a
 * meta, e não interrompe uma sequência que vinha do dia anterior (o mesmo critério de `dailyStreak`).
 */
export function bestDailyStreak({ from, to, valueForDay, targetForDay, maxDays = 1100 }: BestDailyStreakInput): number {
  let start = from;
  const limit = addDays(to, -(maxDays - 1));
  if (start < limit) start = limit;
  let best = 0;
  let run = 0;
  for (let day = start; day <= to; day = addDays(day, 1)) {
    const target = targetForDay(day);
    const met = target !== null && valueForDay(day) >= target;
    if (met) {
      run += 1;
      if (run > best) best = run;
    } else if (day !== to) {
      run = 0;
    }
  }
  return best;
}

