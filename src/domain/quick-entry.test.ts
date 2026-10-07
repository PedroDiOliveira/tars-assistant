import { describe, expect, it } from "vitest";
import { parseQuickEntry } from "./quick-entry";
import type { Category } from "./types";

const categories: Category[] = [
  { id: "food", name: "Alimentação", type: "expense", icon: "utensils", hue: 40 },
  { id: "car", name: "Transporte", type: "expense", icon: "car", hue: 220 },
  { id: "other", name: "Outros", type: "expense", icon: "dots", hue: 0 },
  { id: "salary", name: "Salário", type: "income", icon: "wage", hue: 150 },
  { id: "other-in", name: "Outros", type: "income", icon: "plus", hue: 0 },
];

const today = "2026-10-06";

describe("lançamento por texto (simulação local)", () => {
  it("“Gastei 42 reais no Outback ontem” vira despesa de R$ 42 ontem em Alimentação", () => {
    const result = parseQuickEntry("Gastei 42 reais no Outback ontem", today, categories);
    expect(result).toEqual({
      kind: "proposal",
      proposal: {
        type: "expense",
        amountCents: 4_200,
        description: "Outback",
        occurredOn: "2026-10-05",
        categoryId: "food",
      },
    });
  });

  it("“Recebi 3500 de salário hoje” vira receita em Salário", () => {
    const result = parseQuickEntry("Recebi 3500 de salário hoje", today, categories);
    expect(result).toMatchObject({
      kind: "proposal",
      proposal: { type: "income", amountCents: 350_000, occurredOn: today, categoryId: "salary" },
    });
  });

  it("aceita decimais à brasileira", () => {
    const result = parseQuickEntry("paguei 1.234,56 de uber", today, categories);
    expect(result).toMatchObject({ kind: "proposal", proposal: { amountCents: 123_456, categoryId: "car" } });
  });

  it("categoria incerta cai em Outros, sem inventar", () => {
    const result = parseQuickEntry("Gastei 15 numa coisa qualquer", today, categories);
    expect(result).toMatchObject({ kind: "proposal", proposal: { categoryId: "other" } });
  });

  it("sem valor, pergunta antes de propor", () => {
    expect(parseQuickEntry("Gastei no Outback ontem", today, categories).kind).toBe("ask");
  });

  it("mais de um valor pede para separar os lançamentos", () => {
    expect(parseQuickEntry("Gastei 20 no uber e 30 no almoço", today, categories).kind).toBe("ask");
  });

  it("texto que não é lançamento é ignorado", () => {
    expect(parseQuickEntry("como foi minha semana?", today, categories).kind).toBe("none");
  });
});
