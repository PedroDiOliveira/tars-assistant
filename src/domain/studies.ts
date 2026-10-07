import { dateKeyFromInstant, inPeriod, type DateKey, type Period } from "@/lib/dates";
import type { StudySession, StudyTimer } from "./types";

/** Sessões menores que isto ao finalizar o cronômetro são descartadas como ruído. */
export const MIN_TIMER_SECONDS = 60;

/** Teto de uma sessão (24 h). Um cronômetro esquecido ligado é registrado com o teto, nunca recusado. */
export const MAX_SESSION_SECONDS = 24 * 60 * 60;

/* ---------- cronômetro por timestamps ---------- */

export function startTimer(subjectId: string, nowMs: number): StudyTimer {
  return { subjectId, startedAt: nowMs, runningSince: nowMs, accumulatedSeconds: 0 };
}

export function timerElapsedSeconds(timer: StudyTimer, nowMs: number): number {
  const running =
    timer.runningSince === null ? 0 : Math.max(0, Math.floor((nowMs - timer.runningSince) / 1000));
  return timer.accumulatedSeconds + running;
}

export function isTimerRunning(timer: StudyTimer): boolean {
  return timer.runningSince !== null;
}

/** Pausar duas vezes não soma o tempo em dobro: se já está pausado, nada muda. */
export function pauseTimer(timer: StudyTimer, nowMs: number): StudyTimer {
  if (timer.runningSince === null) return timer;
  return { ...timer, accumulatedSeconds: timerElapsedSeconds(timer, nowMs), runningSince: null };
}

export function resumeTimer(timer: StudyTimer, nowMs: number): StudyTimer {
  if (timer.runningSince !== null) return timer;
  return { ...timer, runningSince: nowMs };
}

/** A sessão pertence ao dia em que começou (não ao dia em que terminou, se virar a meia-noite). */
export function finishTimer(timer: StudyTimer, nowMs: number, id: string): StudySession | null {
  const elapsed = timerElapsedSeconds(timer, nowMs);
  if (elapsed < MIN_TIMER_SECONDS) return null;
  const durationSeconds = Math.min(elapsed, MAX_SESSION_SECONDS);
  return {
    id,
    subjectId: timer.subjectId,
    source: "timer",
    occurredOn: dateKeyFromInstant(timer.startedAt),
    durationSeconds,
  };
}

/* ---------- agregações ---------- */

export function sessionsInPeriod(sessions: StudySession[], period: Period): StudySession[] {
  return sessions.filter((s) => inPeriod(s.occurredOn, period));
}

export function secondsInPeriod(
  sessions: StudySession[],
  period: Period,
  subjectId?: string | null,
): number {
  return sessionsInPeriod(sessions, period)
    .filter((s) => !subjectId || s.subjectId === subjectId)
    .reduce((sum, s) => sum + s.durationSeconds, 0);
}

export function secondsBySubject(
  sessions: StudySession[],
  period: Period,
  subjectIds: string[],
): Map<string, number> {
  const map = new Map<string, number>(subjectIds.map((id) => [id, 0]));
  for (const s of sessionsInPeriod(sessions, period)) {
    map.set(s.subjectId, (map.get(s.subjectId) ?? 0) + s.durationSeconds);
  }
  return map;
}

export function secondsByDay(sessions: StudySession[], days: DateKey[]): number[] {
  return days.map((day) =>
    sessions.filter((s) => s.occurredOn === day).reduce((sum, s) => sum + s.durationSeconds, 0),
  );
}

export function sortStudySessionsDesc(sessions: StudySession[]): StudySession[] {
  return [...sessions].sort((a, b) =>
    a.occurredOn !== b.occurredOn ? (a.occurredOn < b.occurredOn ? 1 : -1) : a.id < b.id ? 1 : -1,
  );
}
