import {
  addDays,
  addMonths,
  monthEnd,
  monthOf,
  monthPeriod,
  monthStart,
  weekPeriod,
  weekStart,
  type DateKey,
  type MonthKey,
} from "@/lib/dates";
import { targetFor } from "./goals";
import { runsInPeriod, totalDistanceMeters } from "./running";
import type { DataSnapshot } from "./summary";
import type { SessionEffort, SetLog } from "./types";
import {
  doneSets,
  exerciseHistory,
  sessionDurationMinutes,
  sessionSetCount,
  sessionsInPeriod,
  sessionVolume,
  type ExerciseEntry,
} from "./workouts";

/**
 * "Seu mês em números": o retrato de um mês de musculação, calculado só com os dados (sem IA). É o que a pessoa vê
 * ao fim de cada mês e, mais adiante, a base do resumo que vai para a revisão do plano de treino.
 *
 * Tudo aqui é derivado das sessões registradas: nada é guardado, então o mês corrente se atualiza a cada treino.
 */

export interface TopSet {
  weightKg: number;
  reps: number;
}

export interface MonthRecord extends TopSet {
  exerciseId: string;
  name: string;
  date: DateKey;
  /** recorde anterior, que foi superado */
  previous: TopSet;
}

export interface ExerciseTrend {
  exerciseId: string;
  name: string;
  from: TopSet;
  to: TopSet;
}

export interface StalledExercise {
  exerciseId: string;
  name: string;
  /** treinos seguidos sem superar a melhor série recente */
  sessions: number;
  best: TopSet;
}

export interface MonthWeek {
  start: DateKey;
  done: number;
  target: number | null;
  /** semana ainda em andamento: não conta como cumprida nem como perdida */
  current: boolean;
}

export interface TrainingMonthReport {
  month: MonthKey;
  /** mês ainda em andamento (os números são "até agora") */
  current: boolean;
  sessions: number;
  previousSessions: number;
  sets: number;
  minutes: number;
  volumeKg: number;
  weeks: MonthWeek[];
  /** séries concluídas por grupo muscular, do maior para o menor */
  groups: { group: string; sets: number }[];
  records: MonthRecord[];
  progressed: ExerciseTrend[];
  stalled: StalledExercise[];
  effort: { counts: Record<SessionEffort, number>; rated: number };
  running: { runs: number; meters: number };
}

/** Quantos treinos seguidos sem superar a melhor série recente contam como estagnação. */
export const STALL_SESSIONS = 3;
/** Janela da estagnação: só o que foi feito nas 4 semanas antes do mês e no próprio mês. */
const STALL_WINDOW_DAYS = 28;
/** Melhora de verdade: mais de 1% na força estimada (evita chamar de evolução um arredondamento). */
const MIN_GAIN = 0.01;

/**
 * Força estimada (1RM de Epley): permite comparar 60 kg × 10 com 62 kg × 8. Peso corporal sem carga extra compara
 * só repetições.
 */
export function estimatedStrength(set: TopSet): number {
  return set.weightKg > 0 ? set.weightKg * (1 + set.reps / 30) : set.reps;
}

function topSet(sets: SetLog[]): TopSet {
  const best = sets.reduce((a, b) => (estimatedStrength(b) > estimatedStrength(a) ? b : a));
  return { weightKg: best.weightKg, reps: best.reps };
}

/** Mesmo critério de `personalRecord`: maior carga; na mesma carga, mais repetições. */
function beats(a: TopSet, b: TopSet): boolean {
  return a.weightKg > b.weightKg || (a.weightKg === b.weightKg && a.reps > b.reps);
}

function heaviest(sets: SetLog[]): TopSet {
  return sets.reduce<TopSet>(
    (best, s) => (beats(s, best) ? { weightKg: s.weightKg, reps: s.reps } : best),
    { weightKg: sets[0].weightKg, reps: sets[0].reps },
  );
}

/** Quantos treinos, a partir do último que superou os anteriores, vieram sem superá-lo. */
function sessionsSinceBest(entries: ExerciseEntry[]): { count: number; best: TopSet } {
  let best: TopSet = topSet(entries[0].sets);
  let count = 0;
  for (const entry of entries.slice(1)) {
    const top = topSet(entry.sets);
    if (estimatedStrength(top) > estimatedStrength(best) * (1 + MIN_GAIN)) {
      best = top;
      count = 0;
    } else {
      count += 1;
    }
  }
  return { count, best };
}

/** Até o dia 7, o resumo que interessa é o do mês que acabou de fechar; depois, o do mês corrente (até agora). */
export function defaultReportMonth(today: DateKey): MonthKey {
  const month = monthOf(today);
  return Number(today.slice(8, 10)) <= 7 ? addMonths(month, -1) : month;
}

export function trainingMonthReport(data: DataSnapshot, month: MonthKey, today: DateKey): TrainingMonthReport {
  const period = monthPeriod(month);
  const start = monthStart(month);
  const end = monthEnd(month);
  const sessions = sessionsInPeriod(data.sessions, period);
  const nameOf = (exerciseId: string, fallback: string) =>
    data.exercises.find((e) => e.id === exerciseId)?.name ?? fallback;

  // Grupos musculares: o grupo ATUAL do exercício (a pessoa pode ter corrigido depois); sem cadastro, "Outros".
  const groupSets = new Map<string, number>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const group = data.exercises.find((e) => e.id === exercise.exerciseId)?.muscleGroup ?? "Outros";
      groupSets.set(group, (groupSets.get(group) ?? 0) + doneSets(exercise.sets).length);
    }
  }

  // Semanas (de segunda) que tocam o mês, até a semana de hoje.
  const weeks: MonthWeek[] = [];
  for (let week = weekStart(start); week <= end && week <= today; week = addDays(week, 7)) {
    weeks.push({
      start: week,
      done: sessionsInPeriod(data.sessions, weekPeriod(week)).length,
      target: targetFor(data.goals, "workout_sessions", null, week),
      current: week === weekStart(today),
    });
  }

  const records: MonthRecord[] = [];
  const progressed: ExerciseTrend[] = [];
  const stalled: StalledExercise[] = [];
  const trained = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  const windowStart = addDays(start, -STALL_WINDOW_DAYS);

  for (const exerciseId of trained) {
    const history = exerciseHistory(data.sessions, exerciseId);
    const before = history.filter((e) => e.date < start);
    const during = history.filter((e) => e.date >= start && e.date <= end);
    if (during.length === 0) continue;
    const lastSnapshot = sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === exerciseId)?.nameSnapshot;
    const name = nameOf(exerciseId, lastSnapshot ?? "Exercício");

    // Recorde: a série mais pesada do mês supera a mais pesada de antes (só conta se já havia histórico).
    if (before.length > 0) {
      const previous = heaviest(before.flatMap((e) => e.sets));
      const monthSets = during.flatMap((e) => e.sets.map((s) => ({ set: s, date: e.date })));
      const best = monthSets.reduce((a, b) => (beats(b.set, a.set) ? b : a));
      if (best.set.weightKg > 0 && beats(best.set, previous)) {
        records.push({ exerciseId, name, weightKg: best.set.weightKg, reps: best.set.reps, date: best.date, previous });
      }
    }

    // Estagnação: na janela recente, vários treinos seguidos sem superar a melhor série.
    const recent = history.filter((e) => e.date >= windowStart && e.date <= end);
    const since = recent.length > STALL_SESSIONS ? sessionsSinceBest(recent) : null;
    if (since && since.count >= STALL_SESSIONS) {
      stalled.push({ exerciseId, name, sessions: since.count, best: since.best });
      continue;
    }

    // Evolução: a última vez no mês comparada com a última antes do mês (ou, sem isso, com a primeira do mês).
    const reference = before.length > 0 ? before[before.length - 1] : during.length > 1 ? during[0] : null;
    if (!reference) continue;
    const from = topSet(reference.sets);
    const to = topSet(during[during.length - 1].sets);
    if (estimatedStrength(to) > estimatedStrength(from) * (1 + MIN_GAIN)) {
      progressed.push({ exerciseId, name, from, to });
    }
  }

  const gain = (t: ExerciseTrend) => estimatedStrength(t.to) / estimatedStrength(t.from);
  progressed.sort((a, b) => gain(b) - gain(a));
  records.sort((a, b) => a.date.localeCompare(b.date));
  stalled.sort((a, b) => b.sessions - a.sessions);

  const counts: Record<SessionEffort, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const session of sessions) if (session.effort) counts[session.effort] += 1;
  const runs = runsInPeriod(data.runningSessions, period);

  return {
    month,
    current: today >= start && today <= end,
    sessions: sessions.length,
    previousSessions: sessionsInPeriod(data.sessions, monthPeriod(addMonths(month, -1))).length,
    sets: sessions.reduce((sum, s) => sum + sessionSetCount(s), 0),
    minutes: sessions.reduce((sum, s) => sum + sessionDurationMinutes(s), 0),
    volumeKg: Math.round(sessions.reduce((sum, s) => sum + sessionVolume(s), 0)),
    weeks,
    groups: [...groupSets.entries()]
      .filter(([, sets]) => sets > 0)
      .map(([group, sets]) => ({ group, sets }))
      .sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group, "pt-BR")),
    records,
    progressed,
    stalled,
    effort: { counts, rated: counts[1] + counts[2] + counts[3] + counts[4] },
    running: { runs: runs.length, meters: totalDistanceMeters(runs) },
  };
}
