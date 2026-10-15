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

  it("inclui as corridas (distância em metros; ausente quando não informada) e a versão do formato é 3", () => {
    expect(EXPORT_VERSION).toBe(3);
    const file = buildExport(snapshot, new Date());
    expect(file.data.runningSessions.length).toBeGreaterThanOrEqual(3);
    const parsed = JSON.parse(JSON.stringify(file)) as typeof file;
    expect(parsed.version).toBe(3);
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
