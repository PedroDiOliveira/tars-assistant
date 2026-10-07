import { describe, expect, it } from "vitest";
import { financeSummary } from "@/domain/summary";
import { runTool, TOOL_DEFINITIONS, type ToolOutcome } from "./tools";
import { sampleData, TODAY } from "./fixtures";

const ctx = { data: sampleData(), today: TODAY };
const run = (name: string, args: unknown, c = ctx): ToolOutcome => runTool(name, typeof args === "string" ? args : JSON.stringify(args), c);
// O payload é JSON dinâmico de cada ferramenta; tipá-lo campo a campo em cada teste só esconderia o que se verifica.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
const result = (o: ToolOutcome): Json => {
  if (o.kind !== "result") throw new Error(`esperava resultado, veio ${o.kind}: ${JSON.stringify(o)}`);
  return o.payload as Json;
};
const error = (o: ToolOutcome) => {
  if (o.kind !== "error") throw new Error(`esperava erro, veio ${o.kind}`);
  return o.message;
};
// Intl usa espaço sem quebra (U+00A0) entre "R$" e o valor: normaliza para comparar com texto simples.
const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("propose_transaction", () => {
  const proposal = (o: ToolOutcome) => {
    if (o.kind !== "proposal") throw new Error(`esperava proposta, veio ${o.kind}: ${JSON.stringify(o)}`);
    return o.proposal;
  };

  it("converte reais em centavos exatos e resolve categoria e data", () => {
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 42, description: "Outback", date: "2026-10-06", category_name: "Alimentação" }))).toEqual({
      type: "expense", amountCents: 4200, description: "Outback", occurredOn: "2026-10-06", categoryId: "c-food",
    });
  });

  it("não perde centavos por ponto flutuante (18,50 e 0,1 + 0,2)", () => {
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 18.5 })).amountCents).toBe(1850);
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 0.3 })).amountCents).toBe(30);
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 1234.56 })).amountCents).toBe(123456);
  });

  it("sem data = hoje; sem nome de categoria = 'Outros' do tipo certo", () => {
    expect(proposal(run("propose_transaction", { type: "income", amount_brl: 10 }))).toMatchObject({ occurredOn: TODAY, categoryId: "c-income-other" });
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 10 }))).toMatchObject({ categoryId: "c-other" });
  });

  it("nome de categoria sem acento/maiúscula resolve; o tipo manda (nome de despesa em receita cai em 'Outros')", () => {
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 10, category_name: "alimentacao" })).categoryId).toBe("c-food");
    expect(proposal(run("propose_transaction", { type: "income", amount_brl: 10, category_name: "Alimentação" })).categoryId).toBe("c-income-other");
  });

  it("nunca propõe uma categoria arquivada", () => {
    expect(proposal(run("propose_transaction", { type: "expense", amount_brl: 10, category_name: "Antiga" })).categoryId).toBe("c-other");
  });

  it("o id da categoria é decidido pelo servidor: um id vindo do modelo é recusado", () => {
    expect(error(run("propose_transaction", { type: "expense", amount_brl: 10, category_id: "c-salary" }))).toBeTruthy();
  });

  it("recusa valor zero, negativo, absurdo e que arredonda para zero", () => {
    for (const amount_brl of [0, -5, 1e9, 0.004]) {
      expect(run("propose_transaction", { type: "expense", amount_brl }).kind, String(amount_brl)).toBe("error");
    }
  });

  it("recusa data futura, inválida e antiga demais, com mensagem para o modelo corrigir", () => {
    expect(error(run("propose_transaction", { type: "expense", amount_brl: 10, date: "2026-10-08" }))).toMatch(/futuro/);
    expect(error(run("propose_transaction", { type: "expense", amount_brl: 10, date: "2026-02-30" }))).toMatch(/inválida/);
    expect(error(run("propose_transaction", { type: "expense", amount_brl: 10, date: "1999-12-31" }))).toMatch(/antiga/);
  });

  it("recusa tipo inválido, campos desconhecidos e descrição enorme", () => {
    expect(run("propose_transaction", { type: "transfer", amount_brl: 10 }).kind).toBe("error");
    expect(run("propose_transaction", { type: "expense", amount_brl: 10, user_id: "x" }).kind).toBe("error");
    expect(run("propose_transaction", { type: "expense", amount_brl: 10, description: "x".repeat(201) }).kind).toBe("error");
  });

  it("não altera os dados (só propõe)", () => {
    const data = sampleData();
    const before = JSON.stringify(data);
    run("propose_transaction", { type: "expense", amount_brl: 42 }, { data, today: TODAY });
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("get_financial_summary", () => {
  it("devolve exatamente os números que a tela mostra (R$ 3.500 − R$ 85 = R$ 3.415 em outubro)", () => {
    const out = result(run("get_financial_summary", { month: "2026-10" }));
    const screen = financeSummary(ctx.data, "2026-10");
    expect(screen.resultCents).toBe(341_500); // o que a tela de Finanças calcula
    expect(nbsp(out.incomeText)).toBe("R$ 3.500,00");
    expect(nbsp(out.expenseText)).toBe("R$ 85,00"); // 42 + 18 + 25
    expect(nbsp(out.resultText)).toBe("R$ 3.415,00");
    expect(out.transactionCount).toBe(4);
    expect(out.hasRecords).toBe(true);
  });

  it("agrupa por categoria, com orçamento quando existe, e informa o período", () => {
    const out = result(run("get_financial_summary", { month: "2026-10" }));
    expect(out.period).toMatchObject({ month: "2026-10", from: "2026-10-01", to: "2026-10-31" });
    expect(out.topExpenseCategories.map((c: { name: string }) => c.name)).toEqual(["Alimentação", "Transporte"]);
    expect(nbsp(out.topExpenseCategories[0].spentText)).toBe("R$ 60,00");
    expect(nbsp(out.topExpenseCategories[0].budgetText)).toBe("R$ 200,00");
    expect(out.topExpenseCategories[1].budgetText).toBeNull();
    expect(nbsp(out.savingsGoalText)).toBe("R$ 1.000,00");
  });

  it("mês sem lançamentos: hasRecords=false (não é o mesmo que zero)", () => {
    const out = result(run("get_financial_summary", { month: "2026-05" }));
    expect(out.hasRecords).toBe(false);
    expect(out.transactionCount).toBe(0);
    expect(out.topExpenseCategories).toEqual([]);
  });

  it("recusa mês mal formatado", () => {
    for (const month of ["2026-13", "10/2026", "2026-1", "", 5]) expect(run("get_financial_summary", { month }).kind, String(month)).toBe("error");
  });
});

describe("get_workout_summary", () => {
  it("conta só os treinos do período, por semana", () => {
    const out = result(run("get_workout_summary", { from: "2026-09-28", to: "2026-10-11" }));
    expect(out.sessionsCompleted).toBe(3);
    expect(out.byWeek).toEqual([{ weekStarting: "2026-09-28", sessions: 1 }, { weekStarting: "2026-10-05", sessions: 2 }]);
    expect(out.hasRecords).toBe(true);
    expect(out.period.label).toBeTruthy();
  });
  it("período sem treino: hasRecords=false", () => {
    const out = result(run("get_workout_summary", { from: "2026-01-01", to: "2026-01-31" }));
    expect(out.hasRecords).toBe(false);
    expect(out.sessionsCompleted).toBe(0);
  });
});

describe("get_study_summary", () => {
  it("total e por matéria (SQL 1h30 + Português 15 min na semana)", () => {
    const out = result(run("get_study_summary", { from: "2026-10-05", to: "2026-10-11" }));
    expect(out.totalText).toBe("1h 45min");
    expect(out.bySubject).toEqual([{ name: "SQL", timeText: "1h 30min" }, { name: "Português", timeText: "15min" }]);
    expect(out.sessionCount).toBe(3);
  });
  it("filtra por matéria sem diferenciar maiúsculas/acentos", () => {
    const out = result(run("get_study_summary", { from: "2026-09-01", to: "2026-10-31", subject_name: "sql" }));
    expect(out.bySubject).toEqual([{ name: "SQL", timeText: "3h 30min" }]);
    const pt = result(run("get_study_summary", { from: "2026-10-01", to: "2026-10-31", subject_name: "portugues" }));
    expect(pt.totalText).toBe("15min");
  });
  it("matéria inexistente é erro (não um 'zero' enganoso)", () => {
    expect(error(run("get_study_summary", { from: "2026-10-01", to: "2026-10-31", subject_name: "Física" }))).toMatch(/Não existe a matéria/);
  });
  it("matéria sem tempo no período aparece com hasRecords=false", () => {
    const out = result(run("get_study_summary", { from: "2026-01-01", to: "2026-01-31" }));
    expect(out.hasRecords).toBe(false);
  });
});

describe("get_reading_summary", () => {
  it("soma as páginas das sessões (20 + 15), não a página de cadastro", () => {
    const out = result(run("get_reading_summary", { from: "2026-10-05", to: "2026-10-11" }));
    expect(out.pagesRead).toBe(35);
    expect(out.byBook).toEqual([{ title: "Livro A", pages: 35 }]);
    expect(out.note).toMatch(/não conta/);
  });
  it("semana sem leitura: 0 páginas mas hasRecords=false", () => {
    const out = result(run("get_reading_summary", { from: "2026-09-21", to: "2026-09-27" }));
    expect(out).toMatchObject({ pagesRead: 0, hasRecords: false });
  });
});

describe("validação de período (vale para todas as ferramentas de intervalo)", () => {
  const tools = ["get_workout_summary", "get_study_summary", "get_reading_summary"];
  it.each(tools)("%s: início depois do fim, datas inválidas e período longo demais", (tool) => {
    expect(error(run(tool, { from: "2026-10-10", to: "2026-10-01" }))).toMatch(/depois do fim/);
    expect(run(tool, { from: "2026-02-30", to: "2026-03-01" }).kind).toBe("error");
    expect(run(tool, { from: "ontem", to: "hoje" }).kind).toBe("error");
    expect(error(run(tool, { from: "2025-01-01", to: "2026-10-07" }))).toMatch(/Período longo demais/);
    expect(run(tool, { from: "2025-10-07", to: "2026-10-06" }).kind).toBe("result"); // exatamente 365 dias
    expect(run(tool, { from: "2026-10-01" }).kind).toBe("error");
  });
});

describe("runTool", () => {
  it("ferramenta desconhecida e JSON quebrado voltam como erro, nunca como exceção", () => {
    expect(error(run("apagar_tudo", {}))).toMatch(/desconhecida/);
    expect(error(run("get_financial_summary", "{não é json"))).toMatch(/JSON válido/);
    expect(error(run("__proto__", {}))).toMatch(/desconhecida/);
    expect(error(run("constructor", {}))).toMatch(/desconhecida/);
  });
  it("nenhuma ferramenta recebe nem devolve identificadores de usuário", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(JSON.stringify(tool.parameters)).not.toMatch(/user_id|userId/);
    }
    const out = JSON.stringify(result(run("get_financial_summary", { month: "2026-10" })));
    expect(out).not.toMatch(/user/i);
  });
  it("só a proposta é a ferramenta que 'escreve', e mesmo ela não grava: o catálogo de ferramentas não tem apagar/alterar", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([
      "get_financial_summary", "get_reading_summary", "get_study_summary", "get_workout_summary", "propose_transaction",
    ]);
  });
});
