import { describe, expect, it } from "vitest";
import { categoriesByRecentUse } from "./finance";
import { parseQuickEntry } from "./quick-entry";
import { EMPTY_APP_DATA } from "./snapshot";
import { studyWeekSummary } from "./summary";
import type { Category, StudySession, Subject, Transaction } from "./types";

const cat = (id: string, name: string, over: Partial<Category> = {}): Category => ({ id, name, type: "expense", icon: "dots", hue: 100, ...over });

describe("categorias arquivadas nas escolhas", () => {
  const categories = [cat("food", "Alimentação"), cat("old", "Antiga", { archived: true }), cat("other", "Outros")];
  const txs: Transaction[] = [
    { id: "t1", type: "expense", amountCents: 100, categoryId: "old", description: "", occurredOn: "2026-10-01", source: "manual" },
  ];

  it("uma categoria arquivada não é oferecida para um lançamento novo, mesmo muito usada", () => {
    expect(categoriesByRecentUse(categories, txs, "expense").map((c) => c.id)).toEqual(["food", "other"]);
  });
  it("ao EDITAR um lançamento antigo, a categoria dele (arquivada) continua na lista", () => {
    expect(categoriesByRecentUse(categories, txs, "expense", 60, "old").map((c) => c.id)).toContain("old");
  });
});

describe("assistente de lançamento", () => {
  it("nunca propõe uma categoria arquivada: cai em 'Outros' ativa", () => {
    const categories = [
      cat("food", "Alimentação", { archived: true }),
      cat("other", "Outros"),
    ];
    const result = parseQuickEntry("Gastei 42 reais no Outback ontem", "2026-10-07", categories);
    expect(result).toMatchObject({ kind: "proposal", proposal: { categoryId: "other" } });
  });
});

describe("resumo de estudo da semana", () => {
  const today = "2026-10-07"; // quarta-feira; a semana começa em 2026-10-05
  const subjects: Subject[] = [
    { id: "sql", name: "SQL", hue: 120 },
    { id: "pt", name: "Português", hue: 130, archived: true },
    { id: "redes", name: "Redes", hue: 140, archived: true },
  ];
  const session = (subjectId: string, durationSeconds: number): StudySession => ({ id: `${subjectId}-1`, subjectId, source: "manual", occurredOn: "2026-10-06", durationSeconds });

  it("matéria arquivada sem tempo na semana some da lista", () => {
    const summary = studyWeekSummary({ ...EMPTY_APP_DATA, subjects, studySessions: [session("sql", 600)] }, today);
    expect(summary.bySubject.map((r) => r.subject.id)).toEqual(["sql"]);
  });

  it("matéria arquivada COM tempo na semana continua aparecendo, e o total fecha", () => {
    const summary = studyWeekSummary({ ...EMPTY_APP_DATA, subjects, studySessions: [session("sql", 600), session("pt", 1800)] }, today);
    expect(summary.bySubject.map((r) => r.subject.id)).toEqual(["sql", "pt"]);
    expect(summary.seconds).toBe(2400);
    expect(summary.bySubject.reduce((sum, r) => sum + r.seconds, 0)).toBe(summary.seconds);
  });
});
