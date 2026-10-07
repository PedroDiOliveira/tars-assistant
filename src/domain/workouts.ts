import {
  daysBetween,
  daysInWeek,
  inPeriod,
  weekPeriod,
  type DateKey,
  type Period,
} from "@/lib/dates";
import type {
  Exercise,
  SessionExercise,
  SetLog,
  WorkoutDraft,
  WorkoutPlan,
  WorkoutSession,
} from "./types";

/** Só sessões finalizadas existem em `sessions`; o rascunho nunca entra nos totais. */
export function sessionsInPeriod(sessions: WorkoutSession[], period: Period): WorkoutSession[] {
  return sessions.filter((s) => inPeriod(s.occurredOn, period));
}

export function sessionsInWeek(sessions: WorkoutSession[], day: DateKey): WorkoutSession[] {
  return sessionsInPeriod(sessions, weekPeriod(day));
}

export interface WeekDot {
  date: DateKey;
  /** quantidade de treinos concluídos no dia */
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

export function weekDots(sessions: WorkoutSession[], today: DateKey): WeekDot[] {
  return daysInWeek(today).map((date) => ({
    date,
    count: sessions.filter((s) => s.occurredOn === date).length,
    isToday: date === today,
    isFuture: date > today,
  }));
}

/** Volume = soma de carga × repetições das séries concluídas com carga externa. */
export function setsVolume(sets: SetLog[]): number {
  return sets.reduce((sum, s) => (s.done && s.weightKg > 0 ? sum + s.weightKg * s.reps : sum), 0);
}

export function doneSets(sets: SetLog[]): SetLog[] {
  return sets.filter((s) => s.done && s.reps > 0);
}

export function sessionVolume(session: Pick<WorkoutSession, "exercises">): number {
  return session.exercises.reduce((sum, e) => sum + setsVolume(e.sets), 0);
}

export function sessionSetCount(session: Pick<WorkoutSession, "exercises">): number {
  return session.exercises.reduce((sum, e) => sum + doneSets(e.sets).length, 0);
}

export function sessionDurationMinutes(session: WorkoutSession): number {
  return Math.max(1, Math.round((session.finishedAt - session.startedAt) / 60_000));
}

export function sortSessionsDesc(sessions: WorkoutSession[]): WorkoutSession[] {
  return [...sessions].sort((a, b) => b.finishedAt - a.finishedAt);
}

/* ---------- histórico por exercício ---------- */

export interface ExerciseEntry {
  sessionId: string;
  date: DateKey;
  sets: SetLog[];
  /** maior carga com séries concluídas (0 para peso corporal) */
  topWeightKg: number;
  /** repetições da série com a maior carga (desempate: mais repetições) */
  topReps: number;
  volume: number;
}

export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExerciseEntry[] {
  const entries: ExerciseEntry[] = [];
  for (const session of sortSessionsDesc(sessions).reverse()) {
    const exercise = session.exercises.find((e) => e.exerciseId === exerciseId);
    if (!exercise) continue;
    const done = doneSets(exercise.sets);
    if (done.length === 0) continue;
    const top = done.reduce((best, s) =>
      s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps) ? s : best,
    );
    entries.push({
      sessionId: session.id,
      date: session.occurredOn,
      sets: done,
      topWeightKg: top.weightKg,
      topReps: top.reps,
      volume: setsVolume(done),
    });
  }
  return entries; // do mais antigo para o mais recente
}

export interface PersonalRecord {
  weightKg: number;
  reps: number;
  date: DateKey;
}

/** Recorde simples: maior carga registrada no exercício (com as repetições e a data). */
export function personalRecord(
  sessions: WorkoutSession[],
  exerciseId: string,
): PersonalRecord | null {
  let best: PersonalRecord | null = null;
  for (const entry of exerciseHistory(sessions, exerciseId)) {
    for (const set of entry.sets) {
      if (set.weightKg <= 0) continue;
      if (
        !best ||
        set.weightKg > best.weightKg ||
        (set.weightKg === best.weightKg && set.reps > best.reps)
      ) {
        best = { weightKg: set.weightKg, reps: set.reps, date: entry.date };
      }
    }
  }
  return best;
}

export function lastPerformance(
  sessions: WorkoutSession[],
  exerciseId: string,
): ExerciseEntry | null {
  const history = exerciseHistory(sessions, exerciseId);
  return history.length > 0 ? history[history.length - 1] : null;
}

export interface ExerciseComparison {
  last: ExerciseEntry;
  previous: ExerciseEntry;
  volumeDelta: number;
  topWeightDeltaKg: number;
}

/** Última sessão do exercício comparada com a anterior (sempre dizendo que é volume/carga). */
export function compareLastTwo(
  sessions: WorkoutSession[],
  exerciseId: string,
): ExerciseComparison | null {
  const history = exerciseHistory(sessions, exerciseId);
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const previous = history[history.length - 2];
  return {
    last,
    previous,
    volumeDelta: last.volume - previous.volume,
    topWeightDeltaKg: last.topWeightKg - previous.topWeightKg,
  };
}

/* ---------- montagem da sessão ---------- */

/**
 * Cria o rascunho a partir da ficha. As séries já vêm preenchidas com o último desempenho
 * do exercício (ou com o planejado, carga 0), mas não concluídas: confirmar = 1 toque.
 */
export function buildDraft(
  plan: WorkoutPlan,
  exercises: Exercise[],
  sessions: WorkoutSession[],
  startedAt: number,
): WorkoutDraft {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const sessionExercises: SessionExercise[] = plan.exercises.map((pe) => {
    const ex = byId.get(pe.exerciseId);
    const last = lastPerformance(sessions, pe.exerciseId);
    const sets: SetLog[] = Array.from({ length: pe.plannedSets }, (_, i) => {
      const reference = last ? (last.sets[i] ?? last.sets[last.sets.length - 1]) : null;
      return {
        weightKg: reference?.weightKg ?? 0,
        reps: reference?.reps ?? pe.repMax,
        done: false,
      };
    });
    return {
      exerciseId: pe.exerciseId,
      nameSnapshot: ex?.name ?? "Exercício",
      loadType: ex?.loadType ?? "external",
      plannedSets: pe.plannedSets,
      repMin: pe.repMin,
      repMax: pe.repMax,
      restSeconds: pe.restSeconds,
      sets,
    };
  });
  return { planId: plan.id, nameSnapshot: plan.name, startedAt, exercises: sessionExercises };
}

export function draftProgress(draft: WorkoutDraft): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const e of draft.exercises) {
    total += e.sets.length;
    done += e.sets.filter((s) => s.done).length;
  }
  return { done, total };
}

/**
 * Finaliza: só séries concluídas (com repetições) são gravadas e exercícios sem nenhuma
 * série concluída são omitidos. Devolve null se não sobrou nada.
 */
export function finalizeDraft(
  draft: WorkoutDraft,
  id: string,
  finishedAt: number,
  occurredOn: DateKey,
): WorkoutSession | null {
  const exercises = draft.exercises
    .map((e) => ({ ...e, sets: doneSets(e.sets).map((s) => ({ ...s })) }))
    .filter((e) => e.sets.length > 0);
  if (exercises.length === 0) return null;
  return {
    id,
    planId: draft.planId,
    nameSnapshot: draft.nameSnapshot,
    startedAt: draft.startedAt,
    finishedAt,
    occurredOn,
    exercises,
    notes: draft.notes,
  };
}

/** Quando foi o último treino de uma ficha, em dias contados a partir de `today`. */
export function daysSinceLastPlan(
  sessions: WorkoutSession[],
  planId: string,
  today: DateKey,
): number | null {
  const dates = sessions.filter((s) => s.planId === planId).map((s) => s.occurredOn);
  if (dates.length === 0) return null;
  const last = dates.reduce((a, b) => (a > b ? a : b));
  return Math.max(0, daysBetween(last, today));
}
