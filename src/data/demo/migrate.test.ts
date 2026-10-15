import { describe, expect, it } from "vitest";
import type { WorkoutDraft } from "@/domain/types";
import { migrateDemoState } from "./migrate";
import type { TarsState } from "./store";

const base = {
  seeded: true,
  displayName: "Pedro",
  categories: [{ id: "c", name: "Alimentação", type: "expense", icon: "utensils", hue: 100 }],
  transactions: [{ id: "t", type: "expense", amountCents: 4200, categoryId: "c", description: "Outback", occurredOn: "2026-10-07", source: "manual" }],
  templates: [],
  goals: [{ id: "g", kind: "workout_sessions", scopeId: null, validFrom: "2026-10-05", target: 4 }],
  exercises: [],
  plans: [],
  sessions: [{ id: "w", planId: null, nameSnapshot: "Treino A", startedAt: 1, finishedAt: 2, occurredOn: "2026-10-05", exercises: [] }],
  subjects: [],
  studySessions: [],
  timer: null,
  books: [],
  readingSessions: [],
  draft: null,
};

describe("migração do estado do demo (localStorage)", () => {
  it("v2 sem corridas passa a ter uma coleção vazia, sem perder nenhum outro registro", () => {
    const old = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    expect("runningSessions" in old).toBe(false);
    const migrated = migrateDemoState(old, 2);
    expect(migrated.runningSessions).toEqual([]);
    for (const key of Object.keys(base) as (keyof typeof base)[]) expect(migrated[key as keyof TarsState]).toEqual(base[key]);
  });

  it("v1 também chega à v3: corridas vazias e o rascunho em andamento ganha um id", () => {
    const draft: Omit<WorkoutDraft, "id"> = { planId: "p", nameSnapshot: "Treino A", startedAt: 1, exercises: [] };
    const migrated = migrateDemoState({ ...base, draft }, 1);
    expect(migrated.runningSessions).toEqual([]);
    expect(migrated.draft?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(migrated.draft).toMatchObject({ planId: "p", nameSnapshot: "Treino A" });
  });

  it("não apaga as corridas de um estado que já as tem (nem as reescreve)", () => {
    const runningSessions = [{ id: "r1", occurredOn: "2026-10-06", distanceMeters: 5200 }, { id: "r2", occurredOn: "2026-10-07" }];
    expect(migrateDemoState({ ...base, runningSessions }, 3).runningSessions).toEqual(runningSessions);
    expect(migrateDemoState({ ...base, runningSessions }, 2).runningSessions).toEqual(runningSessions);
  });

  it("um valor inesperado no lugar da coleção vira lista vazia, em vez de quebrar a tela", () => {
    expect(migrateDemoState({ ...base, runningSessions: null }, 3).runningSessions).toEqual([]);
  });

  it("mantém um rascunho que já tem id", () => {
    const draft: WorkoutDraft = { id: "keep", planId: "p", nameSnapshot: "A", startedAt: 1, exercises: [] };
    expect(migrateDemoState({ ...base, draft }, 2).draft?.id).toBe("keep");
  });

  it("v3 sem água passa a ter uma coleção vazia, sem perder corridas nem nenhum outro registro", () => {
    const runningSessions = [{ id: "r1", occurredOn: "2026-10-06", distanceMeters: 5200 }];
    const migrated = migrateDemoState({ ...base, runningSessions }, 3);
    expect(migrated.waterIntakes).toEqual([]);
    expect(migrated.runningSessions).toEqual(runningSessions);
    for (const key of Object.keys(base) as (keyof typeof base)[]) expect(migrated[key as keyof TarsState]).toEqual(base[key]);
  });

  it("v1 chega à v4: corridas e água vazias", () => {
    const migrated = migrateDemoState({ ...base }, 1);
    expect(migrated.runningSessions).toEqual([]);
    expect(migrated.waterIntakes).toEqual([]);
  });

  it("não apaga a água de um estado que já a tem (nem a reescreve)", () => {
    const waterIntakes = [{ id: "w1", at: 1_760_000_000_000, ml: 500 }, { id: "w2", at: 1_760_000_100_000, ml: 100 }];
    expect(migrateDemoState({ ...base, runningSessions: [], waterIntakes }, 4).waterIntakes).toEqual(waterIntakes);
    expect(migrateDemoState({ ...base, runningSessions: [], waterIntakes }, 3).waterIntakes).toEqual(waterIntakes);
  });

  it("um valor inesperado no lugar da coleção de água vira lista vazia, em vez de quebrar a tela", () => {
    expect(migrateDemoState({ ...base, runningSessions: [], waterIntakes: null }, 4).waterIntakes).toEqual([]);
    expect(migrateDemoState({ ...base, runningSessions: [], waterIntakes: "x" }, 4).waterIntakes).toEqual([]);
  });
});
