import { daysInWeek, weekPeriod, type DateKey, type MonthKey } from "@/lib/dates";
import { expensesByCategory, monthSummary } from "./finance";
import { currentMonthTarget, currentWeekTarget, targetFor } from "./goals";
import { limitTone, progressRatio, type ProgressTone } from "./progress";
import { bookProgress, pagesByDay, pagesInPeriod, pickCurrentBook } from "./reading";
import { weeklyStreak, type WeeklyStreak } from "./streaks";
import { secondsByDay, secondsBySubject, secondsInPeriod } from "./studies";
import { sessionsInPeriod as workoutSessionsInPeriod, weekDots, type WeekDot } from "./workouts";
import type {
  Book,
  Category,
  Exercise,
  Goal,
  ReadingSession,
  StudySession,
  Subject,
  Transaction,
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
  const bySubject: SubjectWeek[] = data.subjects.map((subject) => {
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
