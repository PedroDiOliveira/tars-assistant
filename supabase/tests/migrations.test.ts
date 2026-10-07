import { beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let t: TestDb;
beforeAll(async () => {
  t = await TestDb.create();
});

describe("migrações", () => {
  it("aplicam do zero, na ordem, sem erro", async () => {
    const tables = await t.admin<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    );
    expect(tables.map((r) => r.tablename)).toEqual([
      "ai_rate", "ai_usage", "books", "categories", "exercise_sets", "exercises", "goals", "profiles",
      "reading_sessions", "session_exercises", "study_sessions", "study_subjects", "study_timers", "transactions",
      "tx_templates", "workout_plan_exercises", "workout_plans", "workout_sessions",
    ]);
  });

  it("TODA tabela do schema public tem RLS ligado (nenhuma esquecida)", async () => {
    const open = await t.admin<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1",
    );
    expect(open).toEqual([]);
  });
});
