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
