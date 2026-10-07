import { describe, expect, it } from "vitest";
import { expensesByCategory, filterTransactions, groupByDay, monthSummary } from "./finance";
import { centsFromDigits, formatBRL, formatSignedBRL, parseBRLToCents } from "./money";
import type { Category, Transaction } from "./types";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: "t",
  type: "expense",
  amountCents: 0,
  categoryId: "food",
  description: "",
  occurredOn: "2026-10-06",
  source: "manual",
  ...over,
});

describe("resultado do mês", () => {
  it("receita de R$ 3.500 e despesa de R$ 42 resultam em R$ 3.458", () => {
    const txs = [
      tx({ id: "1", type: "income", amountCents: 350_000 }),
      tx({ id: "2", type: "expense", amountCents: 4_200 }),
    ];
    const summary = monthSummary(txs, "2026-10");
    expect(summary.resultCents).toBe(345_800);
    expect(formatBRL(summary.resultCents).replace(/\s/g, " ")).toBe("R$ 3.458,00");
  });

  it("déficit aparece negativo, não é escondido", () => {
    const summary = monthSummary([tx({ amountCents: 12_000 })], "2026-10");
    expect(summary.resultCents).toBe(-12_000);
    expect(formatSignedBRL(summary.resultCents)).toContain("−");
  });

  it("só conta lançamentos do mês consultado", () => {
    const txs = [
      tx({ id: "1", amountCents: 1_000, occurredOn: "2026-09-30" }),
      tx({ id: "2", amountCents: 2_000, occurredOn: "2026-10-01" }),
    ];
    expect(monthSummary(txs, "2026-10").expenseCents).toBe(2_000);
    expect(monthSummary(txs, "2026-09").expenseCents).toBe(1_000);
  });

  it("editar ou excluir recalcula: o total sai sempre da lista", () => {
    const txs = [tx({ id: "1", amountCents: 1_000 }), tx({ id: "2", amountCents: 500 })];
    expect(monthSummary(txs, "2026-10").expenseCents).toBe(1_500);
    expect(monthSummary(txs.filter((t) => t.id !== "1"), "2026-10").expenseCents).toBe(500);
  });
});

describe("categorias e filtros", () => {
  const categories: Category[] = [
    { id: "food", name: "Alimentação", type: "expense", icon: "utensils", hue: 40 },
    { id: "car", name: "Transporte", type: "expense", icon: "car", hue: 220 },
  ];

  it("agrupa despesas por categoria, da maior para a menor", () => {
    const txs = [
      tx({ id: "1", categoryId: "car", amountCents: 3_000 }),
      tx({ id: "2", categoryId: "food", amountCents: 5_000 }),
      tx({ id: "3", categoryId: "food", amountCents: 1_000 }),
      tx({ id: "4", type: "income", categoryId: "food", amountCents: 99_000 }),
    ];
    const rows = expensesByCategory(txs, "2026-10");
    expect(rows.map((r) => [r.categoryId, r.cents])).toEqual([
      ["food", 6_000],
      ["car", 3_000],
    ]);
  });

  it("busca ignora acentos e maiúsculas", () => {
    const txs = [
      tx({ id: "1", description: "Alimentação no Outback" }),
      tx({ id: "2", description: "Uber", categoryId: "car" }),
    ];
    const found = filterTransactions(txs, { month: "2026-10", query: "alimentacao" }, categories);
    expect(found.map((t) => t.id)).toEqual(["1"]);
  });

  it("agrupa por dia com saldo do dia", () => {
    const txs = [
      tx({ id: "1", amountCents: 1_000, occurredOn: "2026-10-06" }),
      tx({ id: "2", type: "income", amountCents: 4_000, occurredOn: "2026-10-06" }),
      tx({ id: "3", amountCents: 500, occurredOn: "2026-10-05" }),
    ];
    const groups = groupByDay(txs);
    expect(groups.map((g) => [g.date, g.netCents])).toEqual([
      ["2026-10-06", 3_000],
      ["2026-10-05", -500],
    ]);
  });
});

describe("dinheiro em centavos", () => {
  it("máscara de digitação preenche da direita", () => {
    expect(centsFromDigits("4200")).toBe(4_200);
    expect(centsFromDigits("R$ 0,05")).toBe(5);
    expect(centsFromDigits("")).toBe(0);
  });

  it("interpreta texto brasileiro", () => {
    expect(parseBRLToCents("1.234,56")).toBe(123_456);
    expect(parseBRLToCents("42")).toBe(4_200);
    expect(parseBRLToCents("42,5")).toBe(4_250);
    expect(parseBRLToCents("abc")).toBeNull();
    expect(parseBRLToCents("")).toBeNull();
  });
});
