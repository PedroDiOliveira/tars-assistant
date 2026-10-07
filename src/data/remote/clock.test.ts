import { describe, expect, it } from "vitest";
import { timerElapsedSeconds } from "@/domain/studies";
import { EMPTY_APP_DATA } from "@/domain/snapshot";
import { alignClock } from "./clock";
import type { SnapshotPayload } from "./payload";

const payload = (over: Partial<SnapshotPayload["data"]>, serverNow: number): SnapshotPayload => ({
  data: { ...EMPTY_APP_DATA, ...over },
  profile: null,
  user: { email: null },
  serverNow,
  capabilities: { ai: false, aiProvider: null },
});

describe("alignClock", () => {
  const SERVER_NOW = Date.UTC(2026, 9, 7, 17, 0, 0);
  const runningSince = SERVER_NOW - 600_000; // o servidor iniciou o cronômetro há 10 min
  const timer = { subjectId: "s", startedAt: runningSince, runningSince, accumulatedSeconds: 0 };

  it("aparelho 5 min ADIANTADO do servidor: o cronômetro continua mostrando 10:00, não 15:00", () => {
    const clientNow = SERVER_NOW + 300_000;
    const aligned = alignClock(payload({ timer }, SERVER_NOW), clientNow);
    expect(timerElapsedSeconds(aligned.data.timer!, clientNow)).toBe(600);
  });

  it("aparelho 5 min ATRASADO: continua 10:00, não 05:00 (nem negativo)", () => {
    const clientNow = SERVER_NOW - 300_000;
    const aligned = alignClock(payload({ timer }, SERVER_NOW), clientNow);
    expect(timerElapsedSeconds(aligned.data.timer!, clientNow)).toBe(600);
  });

  it("relógios iguais: nada muda", () => {
    const aligned = alignClock(payload({ timer }, SERVER_NOW), SERVER_NOW);
    expect(aligned.data.timer).toEqual(timer);
  });

  it("cronômetro pausado: só startedAt é deslocado, runningSince continua nulo e o acumulado intacto", () => {
    const paused = { subjectId: "s", startedAt: SERVER_NOW - 900_000, runningSince: null, accumulatedSeconds: 540 };
    const aligned = alignClock(payload({ timer: paused }, SERVER_NOW), SERVER_NOW + 120_000);
    // aparelho 2 min adiantado: o instante do servidor equivale a 2 min MAIS TARDE no relógio local
    expect(aligned.data.timer).toEqual({ ...paused, startedAt: paused.startedAt + 120_000 });
    expect(timerElapsedSeconds(aligned.data.timer!, SERVER_NOW + 999_999)).toBe(540);
  });

  it("sem cronômetro devolve o mesmo objeto, sem copiar", () => {
    const p = payload({}, SERVER_NOW);
    expect(alignClock(p, SERVER_NOW + 5000)).toBe(p);
  });

  it("não altera outros dados nem o objeto original", () => {
    const original = payload({ timer, books: [{ id: "b", title: "L", totalPages: 10, initialPage: 0, status: "reading" }] }, SERVER_NOW);
    const snapshot = JSON.stringify(original);
    const aligned = alignClock(original, SERVER_NOW + 1000);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(aligned.data.books).toBe(original.data.books);
  });
});
