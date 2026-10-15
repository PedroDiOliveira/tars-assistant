import { addDays, daysInWeek, monthEnd, monthStart, weekPeriod, weekdayIndex, type DateKey, type MonthKey } from "@/lib/dates";
import type { WeekDot } from "./activity";
import { expensesByCategory, monthSummary } from "./finance";
import { currentMonthTarget, currentWeekTarget, targetFor } from "./goals";
import { limitTone, progressRatio, type ProgressTone } from "./progress";
import { bookProgress, pagesByDay, pagesInPeriod, pickCurrentBook } from "./reading";
import { runsInPeriod, runTotals, runWeekDots, totalDistanceMeters, type RunTotals } from "./running";
import { bestDailyStreak, dailyStreak, weeklyStreak, type DailyStreak, type WeeklyStreak } from "./streaks";
import { secondsByDay, secondsBySubject, secondsInPeriod } from "./studies";
import { waterDayTotals, waterGoalFor } from "./water";
import { sessionsInPeriod as workoutSessionsInPeriod, weekDots } from "./workouts";
import type {
  Book,
  Category,
  Exercise,
  Goal,
  ReadingSession,
  RunningSession,
  StudySession,
  Subject,
  Transaction,
  WaterIntake,
  WorkoutPlan,
  WorkoutSession,
} from "./types";

/** Tudo o que o domínio lê. Hoje vem do store mock; depois, do banco. */
export interface DataSnapshot {
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
  exercises: Exercise[];
  plans: WorkoutPlan[];
  sessions: WorkoutSession[];
  subjects: Subject[];
  studySessions: StudySession[];
  books: Book[];
  readingSessions: ReadingSession[];
  runningSessions: RunningSession[];
  waterIntakes: WaterIntake[];
}

/* ---------- Finanças ---------- */

export interface CategoryRow {
  categoryId: string;
  category: Category | undefined;
  cents: number;
  count: number;
  /** orçamento do mês (centavos) ou null */
  budget: number | null;
  /** participação nas despesas do mês (0..1) */
  share: number;
  /** gasto/orçamento, limitado a 0..1 (o valor real fica no texto) */
  budgetRatio: number;
  tone: ProgressTone;
}

export interface FinanceSummary {
  month: MonthKey;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
  count: number;
  savingsTarget: number | null;
  savingsRatio: number;
  rows: CategoryRow[];
}

export function financeSummary(data: DataSnapshot, month: MonthKey): FinanceSummary {
  const base = monthSummary(data.transactions, month);
  const spend = expensesByCategory(data.transactions, month);
  const spendById = new Map(spend.map((s) => [s.categoryId, s]));

  const budgetCategoryIds = data.categories
    .filter((c) => c.type === "expense")
    .filter((c) => currentMonthTarget(data.goals, "category_budget", c.id, month) !== null)
    .map((c) => c.id);
  const ids = new Set([...spend.map((s) => s.categoryId), ...budgetCategoryIds]);

  const rows: CategoryRow[] = [...ids].map((categoryId) => {
    const entry = spendById.get(categoryId);
    const cents = entry?.cents ?? 0;
    const budget = currentMonthTarget(data.goals, "category_budget", categoryId, month);
    return {
      categoryId,
      category: data.categories.find((c) => c.id === categoryId),
      cents,
      count: entry?.count ?? 0,
      budget,
      share: base.expenseCents > 0 ? cents / base.expenseCents : 0,
      budgetRatio: budget ? progressRatio(cents, budget) : 0,
      tone: budget ? limitTone(cents, budget) : "ok",
    };
  });
  rows.sort((a, b) => b.cents - a.cents);

  const savingsTarget = currentMonthTarget(data.goals, "savings", null, month);
  return {
    month,
    incomeCents: base.incomeCents,
    expenseCents: base.expenseCents,
    resultCents: base.resultCents,
    count: base.count,
    savingsTarget,
    savingsRatio: progressRatio(base.resultCents, savingsTarget),
    rows,
  };
}

/* ---------- Treino ---------- */

export interface WorkoutSummary {
  done: number;
  target: number | null;
  remaining: number;
  ratio: number;
  dots: WeekDot[];
  streak: WeeklyStreak;
}

export function workoutSummary(data: DataSnapshot, today: DateKey): WorkoutSummary {
  const period = weekPeriod(today);
  const weekSessions = workoutSessionsInPeriod(data.sessions, period);
  const done = weekSessions.length;
  const target = currentWeekTarget(data.goals, "workout_sessions", null, today);
  return {
    done,
    target,
    remaining: target ? Math.max(0, target - done) : 0,
    ratio: progressRatio(done, target),
    dots: weekDots(weekSessions, today),
    streak: weeklyStreak({
      today,
      valueForWeek: (ws) => workoutSessionsInPeriod(data.sessions, weekPeriod(ws)).length,
      targetForWeek: (ws) => targetFor(data.goals, "workout_sessions", null, ws),
    }),
  };
}

/* ---------- Estudos ---------- */

export interface SubjectWeek {
  subject: Subject;
  seconds: number;
  /** meta semanal da matéria em minutos, ou null */
  targetMinutes: number | null;
  ratio: number;
}

export interface StudyWeekSummary {
  seconds: number;
  targetMinutes: number | null;
  ratio: number;
  bySubject: SubjectWeek[];
  byDay: { date: DateKey; seconds: number }[];
  streak: WeeklyStreak;
}

export function studyWeekSummary(data: DataSnapshot, today: DateKey): StudyWeekSummary {
  const period = weekPeriod(today);
  const seconds = secondsInPeriod(data.studySessions, period);
  const targetMinutes = currentWeekTarget(data.goals, "study_minutes", null, today);
  const subjectSeconds = secondsBySubject(
    data.studySessions,
    period,
    data.subjects.map((s) => s.id),
  );
  // Matéria arquivada sai da lista, a menos que tenha tempo registrado nesta semana (o total precisa fechar).
  const visibleSubjects = data.subjects.filter((s) => !s.archived || (subjectSeconds.get(s.id) ?? 0) > 0);
  const bySubject: SubjectWeek[] = visibleSubjects.map((subject) => {
    const subjectTarget = currentWeekTarget(data.goals, "study_minutes", subject.id, today);
    const subjectSecs = subjectSeconds.get(subject.id) ?? 0;
    return {
      subject,
      seconds: subjectSecs,
      targetMinutes: subjectTarget,
      ratio: progressRatio(subjectSecs / 60, subjectTarget),
    };
  });
  const days = daysInWeek(today);
  const perDay = secondsByDay(data.studySessions, days);
  return {
    seconds,
    targetMinutes,
    ratio: progressRatio(seconds / 60, targetMinutes),
    bySubject,
    byDay: days.map((date, i) => ({ date, seconds: perDay[i] })),
    streak: weeklyStreak({
      today,
      valueForWeek: (ws) => secondsInPeriod(data.studySessions, weekPeriod(ws)) / 60,
      targetForWeek: (ws) => targetFor(data.goals, "study_minutes", null, ws),
    }),
  };
}

/* ---------- Leitura ---------- */

export interface ReadingWeekSummary {
  book: Book | null;
  currentPage: number;
  totalPages: number;
  bookPercent: number;
  bookRatio: number;
  pages: number;
  target: number | null;
  ratio: number;
  byDay: { date: DateKey; pages: number }[];
  streak: WeeklyStreak;
}

export function readingWeekSummary(data: DataSnapshot, today: DateKey): ReadingWeekSummary {
  const period = weekPeriod(today);
  const book = pickCurrentBook(data.books, data.readingSessions);
  const progress = book ? bookProgress(book, data.readingSessions) : null;
  const pages = pagesInPeriod(data.readingSessions, period);
  const target = currentWeekTarget(data.goals, "reading_pages", null, today);
  const days = daysInWeek(today);
  const perDay = pagesByDay(data.readingSessions, days);
  return {
    book,
    currentPage: progress?.current ?? 0,
    totalPages: progress?.total ?? 0,
    bookPercent: progress?.percent ?? 0,
    bookRatio: progress?.ratio ?? 0,
    pages,
    target,
    ratio: progressRatio(pages, target),
    byDay: days.map((date, i) => ({ date, pages: perDay[i] })),
    streak: weeklyStreak({
      today,
      valueForWeek: (ws) => pagesInPeriod(data.readingSessions, weekPeriod(ws)),
      targetForWeek: (ws) => targetFor(data.goals, "reading_pages", null, ws),
    }),
  };
}

/* ---------- Corrida ---------- */

export interface RunningWeekSummary extends RunTotals {
  /** meta semanal de distância, em metros, ou null */
  targetMeters: number | null;
  /** quanto falta para a meta (0 sem meta ou com a meta batida) */
  remainingMeters: number;
  ratio: number;
  dots: WeekDot[];
  /** semanas seguidas batendo a meta de DISTÂNCIA da corrida (independente da sequência de musculação) */
  streak: WeeklyStreak;
}

/** A única definição de "como foi a semana de corrida": a tela, a Home e o assistente leem esta. */
export function runningWeekSummary(data: DataSnapshot, today: DateKey): RunningWeekSummary {
  const weekRuns = runsInPeriod(data.runningSessions, weekPeriod(today));
  const totals = runTotals(weekRuns);
  const targetMeters = currentWeekTarget(data.goals, "running_meters", null, today);
  return {
    ...totals,
    targetMeters,
    remainingMeters: targetMeters ? Math.max(0, targetMeters - totals.distanceMeters) : 0,
    ratio: progressRatio(totals.distanceMeters, targetMeters),
    dots: runWeekDots(weekRuns, today),
    streak: weeklyStreak({
      today,
      valueForWeek: (ws) => totalDistanceMeters(runsInPeriod(data.runningSessions, weekPeriod(ws))),
      targetForWeek: (ws) => targetFor(data.goals, "running_meters", null, ws),
    }),
  };
}

/* ---------- Água ---------- */

export interface WaterDayRow {
  date: DateKey;
  ml: number;
  /** meta do dia batida (sempre false sem meta) */
  met: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface WaterTodaySummary {
  /** ml bebidos hoje */
  ml: number;
  /** quantos toques hoje */
  count: number;
  /** meta diária em ml, ou null */
  targetMl: number | null;
  /** 0..1 (o valor real fica no texto) */
  ratio: number;
  /** quanto falta para a meta (0 sem meta ou com a meta batida) */
  remainingMl: number;
  /** quanto passou da meta (0 abaixo dela ou sem meta); passar da meta é sucesso, não alerta */
  overMl: number;
  met: boolean;
  /** segunda a domingo da semana de hoje */
  week: WaterDayRow[];
  /** dias da semana (até hoje) com a meta batida */
  daysMet: number;
  /** dias seguidos na meta, sem punir o dia ainda em andamento */
  streak: DailyStreak;
}

/** A única definição de "como está a água hoje": o card da Início, a tela de água e o assistente leem esta. */
export function waterTodaySummary(data: DataSnapshot, today: DateKey): WaterTodaySummary {
  const totals = waterDayTotals(data.waterIntakes);
  const mlOn = (day: DateKey) => totals.get(day)?.ml ?? 0;
  const targetMl = waterGoalFor(data.goals, today);
  const ml = mlOn(today);

  const week = daysInWeek(today).map((date): WaterDayRow => {
    const target = waterGoalFor(data.goals, date);
    const dayMl = mlOn(date);
    return { date, ml: dayMl, met: target !== null && dayMl >= target, isToday: date === today, isFuture: date > today };
  });

  return {
    ml,
    count: totals.get(today)?.count ?? 0,
    targetMl,
    ratio: progressRatio(ml, targetMl),
    remainingMl: targetMl ? Math.max(0, targetMl - ml) : 0,
    overMl: targetMl ? Math.max(0, ml - targetMl) : 0,
    met: targetMl !== null && ml >= targetMl,
    week,
    daysMet: week.filter((d) => d.met && !d.isFuture).length,
    streak: dailyStreak({
      today,
      valueForDay: mlOn,
      targetForDay: (day) => waterGoalFor(data.goals, day),
    }),
  };
}

export interface WaterWeekStats {
  /**
   * média por dia, só nos dias já decorridos COM registro (um dia esquecido não puxa a média para baixo), arredondada
   * a 10 ml (ninguém precisa de "3,233 L" numa média); null sem registro
   */
  averageMl: number | null;
  /** dias decorridos com pelo menos um registro */
  daysWithRecord: number;
  /** o dia da semana com mais água, ou null */
  best: { date: DateKey; ml: number } | null;
}

/** Os números que acompanham o gráfico da semana: média, dias com registro e melhor dia. */
export function waterWeekStats(week: readonly WaterDayRow[]): WaterWeekStats {
  const recorded = week.filter((d) => !d.isFuture && d.ml > 0);
  const total = recorded.reduce((sum, d) => sum + d.ml, 0);
  let best: WaterWeekStats["best"] = null;
  for (const d of recorded) if (!best || d.ml > best.ml) best = { date: d.date, ml: d.ml };
  return {
    averageMl: recorded.length > 0 ? Math.round(total / recorded.length / 10) * 10 : null,
    daysWithRecord: recorded.length,
    best,
  };
}

/** Nível de preenchimento de um dia no calendário: 0 sem registro, 1 abaixo da metade da meta, 2 até a meta, 3 meta batida. */
export type WaterLevel = 0 | 1 | 2 | 3;

export interface WaterMonthCell {
  date: DateKey;
  ml: number;
  count: number;
  /** meta do dia, ou null */
  targetMl: number | null;
  met: boolean;
  level: WaterLevel;
  isToday: boolean;
  isFuture: boolean;
}

export interface WaterMonthSummary {
  month: MonthKey;
  /** células em semanas de segunda a domingo; null = dia de fora do mês (preenche o começo e o fim do calendário) */
  weeks: (WaterMonthCell | null)[][];
  daysMet: number;
  daysWithRecord: number;
  totalMl: number;
  /** média por dia COM registro, arredondada a 10 ml */
  averageMl: number | null;
}

function waterLevel(ml: number, targetMl: number | null): WaterLevel {
  if (ml <= 0) return 0;
  // Sem meta só existe "bebeu" (nível 2); com meta, quanto da meta foi.
  if (!targetMl) return 2;
  if (ml >= targetMl) return 3;
  return ml >= targetMl / 2 ? 2 : 1;
}

/** O calendário de um mês: um dia por célula, com o nível de cada um e os números do mês (só dias já decorridos). */
export function waterMonthSummary(data: DataSnapshot, month: MonthKey, today: DateKey): WaterMonthSummary {
  const totals = waterDayTotals(data.waterIntakes);
  const first = monthStart(month);
  const last = monthEnd(month);

  const cells: (WaterMonthCell | null)[] = Array.from({ length: weekdayIndex(first) }, () => null);
  let daysMet = 0;
  let daysWithRecord = 0;
  let totalMl = 0;
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const entry = totals.get(date);
    const ml = entry?.ml ?? 0;
    const targetMl = waterGoalFor(data.goals, date);
    const isFuture = date > today;
    const met = targetMl !== null && ml >= targetMl;
    cells.push({ date, ml, count: entry?.count ?? 0, targetMl, met, level: waterLevel(ml, targetMl), isToday: date === today, isFuture });
    if (!isFuture) {
      if (met) daysMet += 1;
      if (ml > 0) {
        daysWithRecord += 1;
        totalMl += ml;
      }
    }
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (WaterMonthCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return {
    month,
    weeks,
    daysMet,
    daysWithRecord,
    totalMl,
    averageMl: daysWithRecord > 0 ? Math.round(totalMl / daysWithRecord / 10) * 10 : null,
  };
}

/** A maior sequência de dias seguidos na meta de toda a história (0 sem meta ou sem registros). */
export function waterBestStreak(data: DataSnapshot, today: DateKey): number {
  if (data.waterIntakes.length === 0) return 0;
  const totals = waterDayTotals(data.waterIntakes);
  let from = today;
  for (const day of totals.keys()) if (day < from) from = day;
  return bestDailyStreak({
    from,
    to: today,
    valueForDay: (day) => totals.get(day)?.ml ?? 0,
    targetForDay: (day) => waterGoalFor(data.goals, day),
  });
}

