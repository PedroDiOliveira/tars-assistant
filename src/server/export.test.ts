import { describe, expect, it } from "vitest";
import { buildExport, EXPORT_VERSION, exportFilename } from "./export";
import { sampleData } from "./ai/fixtures";
import type { Snapshot } from "./snapshot";

const snapshot: Snapshot = { data: sampleData(), profile: { displayName: "Ana" }, serverNow: 0 };

describe("buildExport", () => {
  it("leva todos os dados, o nome de exibição, a versão do formato e o instante da exportação", () => {
    const file = buildExport(snapshot, new Date("2026-10-07T17:00:00Z"));
    expect(file).toMatchObject({ app: "tars", version: EXPORT_VERSION, exportedAt: "2026-10-07T17:00:00.000Z", profile: { displayName: "Ana" } });
    expect(file.data).toEqual(snapshot.data);
  });

  it("resiste a ir e voltar por JSON sem perder nada (é o que vira arquivo)", () => {
    const file = buildExport(snapshot, new Date());
    expect(JSON.parse(JSON.stringify(file, null, 2)).data).toEqual(JSON.parse(JSON.stringify(snapshot.data)));
  });

  it("inclui as corridas (distância em metros; ausente quando não informada) e a versão do formato é 6", () => {
    expect(EXPORT_VERSION).toBe(6);
    const file = buildExport(snapshot, new Date());
    expect(file.data.runningSessions.length).toBeGreaterThanOrEqual(3);
    const parsed = JSON.parse(JSON.stringify(file)) as typeof file;
    expect(parsed.version).toBe(6);
    expect(parsed.data.runningSessions).toEqual(snapshot.data.runningSessions);
    const withoutDistance = parsed.data.runningSessions.find((r) => r.id === "run3");
    expect(withoutDistance).toEqual({ id: "run3", occurredOn: "2026-10-07", notes: "Esqueci o relógio" });
    expect(withoutDistance).not.toHaveProperty("distanceMeters"); // ausente, nunca 0 nem null
  });

  it("inclui a água (um registro por toque: instante em ms e ml inteiros) e a meta diária", () => {
    const withWater: Snapshot = {
      ...snapshot,
      data: sampleData({
        waterIntakes: [
          { id: "w1", at: 1_760_000_000_000, ml: 500 },
          { id: "w2", at: 1_760_003_600_000, ml: 1000 },
        ],
        goals: [{ id: "g-w", kind: "water_ml", scopeId: null, validFrom: "2026-10-05", target: 2500 }],
      }),
    };
    const parsed = JSON.parse(JSON.stringify(buildExport(withWater, new Date()))) as ReturnType<typeof buildExport>;
    expect(parsed.data.waterIntakes).toEqual(withWater.data.waterIntakes);
    expect(parsed.data.goals).toContainEqual({ id: "g-w", kind: "water_ml", scopeId: null, validFrom: "2026-10-05", target: 2500 });
  });

  it("v4: inclui o \"como foi?\" das sessões e o vínculo dos exercícios com a biblioteca (ausentes quando não há)", () => {
    const base = sampleData();
    const [first, ...rest] = base.sessions;
    const [exercise, ...others] = base.exercises;
    const data = {
      ...base,
      sessions: [{ ...first, effort: 3 as const }, ...rest],
      exercises: [{ ...exercise, libraryKey: "supino-reto-barra" }, ...others],
    };
    const parsed = JSON.parse(JSON.stringify(buildExport({ ...snapshot, data }, new Date()))) as ReturnType<typeof buildExport>;
    expect(parsed.data.sessions[0].effort).toBe(3);
    expect(parsed.data.exercises[0].libraryKey).toBe("supino-reto-barra");
    for (const session of parsed.data.sessions.slice(1)) expect(session).not.toHaveProperty("effort");
  });

  it("v5/v6: inclui as respostas do plano de treino, os planos aceitos (com os motivos) e os ajustes", () => {
    const data = {
      ...sampleData(),
      trainingProfile: {
        goal: "massa" as const,
        experience: "intermediario" as const,
        daysPerWeek: 4 as const,
        sessionMinutes: 60 as const,
        location: "academia" as const,
        limitations: [],
        screening: "nao-respondida" as const,
        priorities: [],
        updatedAt: 1_760_000_000_000,
      },
      trainingPlans: [
        {
          id: "tp1",
          acceptedAt: 1_760_000_100_000,
          source: "ai" as const,
          model: "openai/gpt-oss-20b",
          promptVersion: "plano-v1/regras-v1",
          split: "superior-inferior" as const,
          summary: "Superior e inferior alternados.",
          answers: { goal: "massa" as const, experience: "intermediario" as const, daysPerWeek: 4 as const, sessionMinutes: 60 as const, location: "academia" as const, priorities: [] },
          days: [{ planId: "p1", name: "Superior A", exercises: [{ exerciseId: "e1", libraryKey: "supino-reto-barra", reason: "Você já faz e está evoluindo." }] }],
          edits: 0,
        },
      ],
      trainingPlanChanges: [
        {
          id: "tc1",
          planRecordId: "tp1",
          createdAt: 1_760_000_200_000,
          source: "rules" as const,
          trigger: "mais-curto" as const,
          promptVersion: "ajuste-regras-v1",
          items: [{ planId: "p1", where: "Superior A · Tríceps", before: "3 séries", after: "2 séries", reason: "Treino mais curto.", principle: "volume" }],
        },
      ],
    };
    const parsed = JSON.parse(JSON.stringify(buildExport({ ...snapshot, data }, new Date()))) as ReturnType<typeof buildExport>;
    expect(parsed.version).toBe(6);
    expect(parsed.data.trainingProfile).toEqual(data.trainingProfile);
    expect(parsed.data.trainingPlans).toEqual(data.trainingPlans);
    expect(parsed.data.trainingPlanChanges).toEqual(data.trainingPlanChanges);
  });

  it("inclui os itens arquivados (backup completo)", () => {
    const withArchived = { ...snapshot, data: sampleData() };
    expect(buildExport(withArchived, new Date()).data.categories.some((c) => c.archived)).toBe(true);
  });

  it("não inclui e-mail nem identificadores de usuário/autenticação", () => {
    const text = JSON.stringify(buildExport(snapshot, new Date()));
    expect(text).not.toMatch(/user_id|userId|email|token|password|serverNow/i);
  });
});

describe("exportFilename", () => {
  it("usa a data de São Paulo, não a UTC", () => {
    expect(exportFilename(new Date("2026-10-08T02:30:00Z"))).toBe("tars-backup-2026-10-07.json"); // 23h30 do dia 7 em SP
    expect(exportFilename(new Date("2026-10-08T03:30:00Z"))).toBe("tars-backup-2026-10-08.json");
  });
  it("só tem caracteres seguros para o cabeçalho Content-Disposition", () => {
    expect(exportFilename(new Date())).toMatch(/^tars-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
