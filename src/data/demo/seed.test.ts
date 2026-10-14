import { describe, expect, it } from "vitest";
import { runningWeekSummary } from "@/domain/summary";
import { EMPTY_APP_DATA } from "@/domain/snapshot";
import { goalFor } from "@/domain/goals";
import { weekStart } from "@/lib/dates";
import { buildSeed } from "./seed";

describe("dados fictícios de corrida", () => {
  const days = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-11", "2026-10-12", "2026-12-31"];

  it.each(days)("em %s: nada no futuro, há uma sem distância e ontem sempre tem corrida", (today) => {
    const seed = buildSeed(today);
    expect(seed.runningSessions.length).toBeGreaterThan(10);
    expect(seed.runningSessions.every((r) => r.occurredOn < today)).toBe(true);
    expect(seed.runningSessions.some((r) => r.distanceMeters === undefined)).toBe(true);
    expect(seed.runningSessions.some((r) => r.occurredOn === new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10))).toBe(true);
    expect(new Set(seed.runningSessions.map((r) => r.id)).size).toBe(seed.runningSessions.length);
    for (const r of seed.runningSessions) {
      if (r.distanceMeters !== undefined) expect(Number.isInteger(r.distanceMeters) && r.distanceMeters > 0).toBe(true);
      if (r.durationSeconds !== undefined) expect(Number.isInteger(r.durationSeconds) && r.durationSeconds > 0).toBe(true);
    }
  });

  it("a meta de corrida vem por vigência: a antiga continua valendo para as semanas passadas", () => {
    const today = "2026-10-09";
    const seed = buildSeed(today);
    const goals = seed.goals.filter((g) => g.kind === "running_meters");
    expect(goals).toHaveLength(2);
    expect(goals.every((g) => g.target % 1000 === 0 && weekStart(g.validFrom) === g.validFrom)).toBe(true);
    expect(goalFor(seed.goals, "running_meters", null, weekStart(today))?.target).toBe(20_000);
    expect(goalFor(seed.goals, "running_meters", null, "2026-08-31")?.target).toBe(15_000);
  });

  it("a semana do demo conta corridas, dias e distância sem misturar com os treinos", () => {
    const seed = buildSeed("2026-10-09");
    const week = runningWeekSummary({ ...EMPTY_APP_DATA, ...seed }, "2026-10-09");
    expect(week.runs).toBeGreaterThan(0);
    expect(week.activeDays).toBeLessThanOrEqual(week.runs);
  });

  it("é determinístico para o mesmo dia (a corrida não usa sorteio)", () => {
    const a = buildSeed("2026-10-09");
    const b = buildSeed("2026-10-09");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // determinístico
    expect(a.transactions.length).toBeGreaterThan(0);
  });
});
