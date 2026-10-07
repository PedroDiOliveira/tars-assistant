import { describe, expect, it } from "vitest";
import {
  MIN_TIMER_SECONDS,
  finishTimer,
  pauseTimer,
  resumeTimer,
  secondsInPeriod,
  startTimer,
  timerElapsedSeconds,
} from "./studies";
import type { StudySession } from "./types";

const T0 = Date.UTC(2026, 9, 6, 15, 0, 0); // 12:00 em São Paulo
const sec = (n: number) => n * 1000;

describe("cronômetro por timestamps", () => {
  it("soma o tempo a partir do instante de início, sem contador em segundo plano", () => {
    const timer = startTimer("sql", T0);
    expect(timerElapsedSeconds(timer, T0 + sec(90))).toBe(90);
  });

  it("pausa e retomada acumulam sem contar o tempo parado", () => {
    let timer = startTimer("sql", T0);
    timer = pauseTimer(timer, T0 + sec(600)); // 10 min
    expect(timerElapsedSeconds(timer, T0 + sec(5_000))).toBe(600); // parado: não cresce
    timer = resumeTimer(timer, T0 + sec(5_000));
    expect(timerElapsedSeconds(timer, T0 + sec(5_300))).toBe(900); // +5 min
  });

  it("pausar ou retomar duas vezes não duplica o tempo", () => {
    const timer = startTimer("sql", T0);
    const paused = pauseTimer(timer, T0 + sec(300));
    const pausedAgain = pauseTimer(paused, T0 + sec(900));
    expect(timerElapsedSeconds(pausedAgain, T0 + sec(2_000))).toBe(300);
    const resumed = resumeTimer(paused, T0 + sec(1_000));
    const resumedAgain = resumeTimer(resumed, T0 + sec(1_500));
    expect(resumedAgain).toBe(resumed);
  });

  it("recarregar a página (estado reconstruído do timestamp) não perde tempo", () => {
    const timer = startTimer("sql", T0);
    const restored = JSON.parse(JSON.stringify(timer));
    expect(timerElapsedSeconds(restored, T0 + sec(1_800))).toBe(1_800);
  });
});

describe("finalizar", () => {
  it("grava a duração e a data de início, mesmo virando a meia-noite", () => {
    // começa 23:30 em São Paulo (02:30Z do dia seguinte) e termina 00:30
    const start = Date.UTC(2026, 9, 7, 2, 30);
    const timer = startTimer("sql", start);
    const session = finishTimer(timer, start + sec(3_600), "x");
    expect(session?.durationSeconds).toBe(3_600);
    expect(session?.occurredOn).toBe("2026-10-06");
  });

  it("descarta sessões abaixo do mínimo", () => {
    const timer = startTimer("sql", T0);
    expect(finishTimer(timer, T0 + sec(MIN_TIMER_SECONDS - 1), "x")).toBeNull();
    expect(finishTimer(timer, T0 + sec(MIN_TIMER_SECONDS), "x")).not.toBeNull();
  });
});

describe("agregação por período", () => {
  const sessions: StudySession[] = [
    { id: "1", subjectId: "sql", source: "manual", occurredOn: "2026-10-04", durationSeconds: 1_800 },
    { id: "2", subjectId: "sql", source: "timer", occurredOn: "2026-10-05", durationSeconds: 3_600 },
    { id: "3", subjectId: "redes", source: "timer", occurredOn: "2026-10-06", durationSeconds: 1_200 },
  ];
  const week = { start: "2026-10-05", end: "2026-10-11" };

  it("soma só a semana consultada, geral ou por matéria", () => {
    expect(secondsInPeriod(sessions, week)).toBe(4_800);
    expect(secondsInPeriod(sessions, week, "sql")).toBe(3_600);
    expect(secondsInPeriod(sessions, week, "redes")).toBe(1_200);
  });
});
