import { describe, expect, it } from "vitest";
import { sampleData, TODAY } from "@/server/ai/fixtures";
import {
  addCardRef,
  buildCard,
  buildCards,
  parseCardRefs,
  periodLabel,
  weekBuckets,
  type CardRef,
} from "./assistant-cards";
import type { Goal } from "./types";

// Intl usa espaço sem quebra (U+00A0) entre "R$" e o valor: normaliza para comparar com texto simples.
const nbsp = (s: string) => s.replace(/[  ]/g, " ");
const WEEK = { from: "2026-10-05", to: "2026-10-11" }; // a semana de TODAY (quarta, 7/10)
const ctx = { today: TODAY };
const data = sampleData();
const goal = (kind: Goal["kind"], target: number, scopeId: string | null = null): Goal => ({ id: `g-${kind}-${scopeId}`, kind, scopeId, validFrom: "2026-10-01", target });

describe("parseCardRefs", () => {
  it("lê referências válidas e ignora o que não é lista", () => {
    expect(parseCardRefs(undefined)).toEqual([]);
    expect(parseCardRefs("finance_month")).toEqual([]);
    expect(parseCardRefs([{ kind: "finance_month", month: "2026-10" }])).toEqual([{ kind: "finance_month", month: "2026-10" }]);
  });

  it("descarta o inválido e mantém o resto (kind desconhecido, mês, datas, campo extra, período invertido ou longo)", () => {
    const parsed = parseCardRefs([
      { kind: "finance_month", month: "2026-13" },
      { kind: "finance_month", month: "2026-10", extra: 1 },
      { kind: "bank_balance", month: "2026-10" },
      { kind: "workout_range", from: "2026-10-11", to: "2026-10-05" },
      { kind: "workout_range", from: "2026-02-30", to: "2026-03-01" },
      { kind: "running_range", from: "2025-01-01", to: "2026-10-11" },
      { kind: "study_range", ...WEEK, subjectId: "" },
      { kind: "reading_range", ...WEEK },
      null,
      "texto",
    ]);
    expect(parsed).toEqual([{ kind: "reading_range", ...WEEK }]);
  });

  it("lê no máximo 10 itens da resposta", () => {
    const junk = Array.from({ length: 10 }, () => ({ kind: "nada" }));
    expect(parseCardRefs([...junk, { kind: "reading_range", ...WEEK }])).toEqual([]);
  });

  it("um card por tipo: o maior período vence, o empate fica com o primeiro, e a ordem é a dos módulos", () => {
    const refs = parseCardRefs([
      { kind: "reading_range", ...WEEK },
      { kind: "running_range", from: "2026-10-05", to: "2026-10-11" },
      { kind: "running_range", from: "2026-10-01", to: "2026-10-31" },
      { kind: "finance_month", month: "2026-10" },
      { kind: "finance_month", month: "2026-09" },
    ]);
    expect(refs).toEqual([
      { kind: "finance_month", month: "2026-10" },
      { kind: "running_range", from: "2026-10-01", to: "2026-10-31" },
      { kind: "reading_range", ...WEEK },
    ]);
  });
});

describe("addCardRef", () => {
  it("não altera a lista de entrada", () => {
    const refs: CardRef[] = [{ kind: "reading_range", ...WEEK }];
    addCardRef(refs, { kind: "workout_range", ...WEEK });
    expect(refs).toHaveLength(1);
  });
});

describe("períodos", () => {
  it("periodLabel: um dia ou um intervalo", () => {
    expect(periodLabel({ start: "2026-10-05", end: "2026-10-05" })).toBe("5 de out");
    expect(periodLabel({ start: "2026-10-05", end: "2026-10-11" })).toBe("5 de out a 11 de out");
  });

  it("weekBuckets: semanas de segunda a domingo que o período toca, da mais antiga para a mais recente", () => {
    expect(weekBuckets({ start: "2026-10-07", end: "2026-10-14" })).toEqual([
      { start: "2026-10-05", end: "2026-10-11" },
      { start: "2026-10-12", end: "2026-10-18" },
    ]);
  });
});

describe("card de finanças", () => {
  const card = buildCard(data, { kind: "finance_month", month: "2026-10" }, ctx)!;

  it("mostra as despesas do mês, as categorias com orçamento e a meta de economia", () => {
    expect(nbsp(card.headline.value)).toBe("R$ 85,00");
    expect(card.headline.unit).toBe("em despesas");
    expect(card.headline.notes.map(nbsp)).toEqual(["Receitas R$ 3.500,00", "Resultado do mês R$ 3.415,00"]);
    expect(card.periodLabel).toBe("Outubro de 2026");
    expect(card.module).toBe("finance");
    expect(card.rows.map((r) => r.label)).toEqual(["Alimentação", "Transporte"]);
    expect(nbsp(card.rows[0].valueText)).toBe("R$ 60,00");
    expect(nbsp(card.rows[0].note ?? "")).toBe("de R$ 200,00 de orçamento");
    expect(card.rows[0].ratio).toBeCloseTo(0.3);
    expect(card.rows[1].note).toBe("29% das despesas");
    expect(nbsp(card.progress?.caption ?? "")).toContain("meta de economia de R$ 1.000,00");
    expect(card.hiddenRows).toBe(0);
  });

  it("a categoria citada na pergunta ganha destaque (o foco é decidido no cliente)", () => {
    const focused = buildCard(data, { kind: "finance_month", month: "2026-10" }, { ...ctx, question: "Quanto gastei com transporte este mês?" })!;
    expect(focused.rows.filter((r) => r.focused).map((r) => r.label)).toEqual(["Transporte"]);
    expect(card.rows.some((r) => r.focused)).toBe(false);
  });

  it("a categoria citada entra mesmo fora das 6 maiores", () => {
    const categories = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `Categoria ${i}x`, type: "expense" as const, icon: "dots", hue: 100 + i }));
    const transactions = categories.map((c, i) => ({
      id: `t${i}`, type: "expense" as const, amountCents: (8 - i) * 1000, categoryId: c.id, description: "", occurredOn: "2026-10-02", source: "manual" as const,
    }));
    const many = buildCard(sampleData({ categories, transactions, goals: [] }), { kind: "finance_month", month: "2026-10" }, { ...ctx, question: "quanto gastei com categoria 7x?" })!;
    expect(many.rows).toHaveLength(6);
    expect(many.rows.map((r) => r.label)).toContain("Categoria 7x");
    expect(many.rows.find((r) => r.focused)?.label).toBe("Categoria 7x");
    expect(many.hiddenRows).toBe(2);
  });

  it("mês sem lançamentos: sem card (o texto já diz que não há registros)", () => {
    expect(buildCard(data, { kind: "finance_month", month: "2026-05" }, ctx)).toBeNull();
  });
});

describe("card de musculação", () => {
  it("semana de segunda a domingo: barras por dia, dias futuros marcados e meta semanal", () => {
    const card = buildCard(sampleData({ goals: [goal("workout_sessions", 4)] }), { kind: "workout_range", ...WEEK }, ctx)!;
    expect(card.headline).toEqual({ value: "2", unit: "treinos", notes: [] });
    expect(card.progress).toMatchObject({ ratio: 0.5, caption: "2 de 4 treinos na semana" });
    expect(card.series?.items.map((i) => `${i.label}:${i.value}`)).toEqual(["Seg:1", "Ter:0", "Qua:1", "Qui:0", "Sex:0", "Sáb:0", "Dom:0"]);
    expect(card.series?.items.find((i) => i.highlight)?.label).toBe("Qua");
    expect(card.series?.items.map((i) => Boolean(i.future))).toEqual([false, false, false, true, true, true, true]);
    expect(card.series?.summary).toContain("Seg 1 treino");
  });

  it("período que não é uma semana exata não ganha meta", () => {
    const card = buildCard(sampleData({ goals: [goal("workout_sessions", 4)] }), { kind: "workout_range", from: "2026-10-06", to: "2026-10-11" }, ctx)!;
    expect(card.progress).toBeNull();
  });

  it("período longo: barras por semana, só as 6 últimas, e avisa que cortou", () => {
    const sessions = Array.from({ length: 8 }, (_, i) => ({
      id: `w${i}`, planId: null, nameSnapshot: "A", startedAt: 1, finishedAt: 2, occurredOn: `2026-0${8 + Math.floor(i / 4)}-${String(3 + (i % 4) * 7).padStart(2, "0")}`, exercises: [],
    }));
    const card = buildCard(sampleData({ sessions }), { kind: "workout_range", from: "2026-08-01", to: "2026-09-30" }, ctx)!;
    expect(card.series?.items).toHaveLength(6);
    expect(card.series?.note).toMatch(/últimas 6 de \d+ semanas/);
    expect(card.series?.items.every((i) => /^\d{2}\/\d{2}$/.test(i.label))).toBe(true);
  });

  it("um dia só não tem série; sem treino no período não há card", () => {
    expect(buildCard(data, { kind: "workout_range", from: "2026-10-05", to: "2026-10-05" }, ctx)?.series).toBeNull();
    expect(buildCard(data, { kind: "workout_range", from: "2026-01-01", to: "2026-01-31" }, ctx)).toBeNull();
  });
});

describe("card de corrida", () => {
  it("distância informada e distância desconhecida ficam separadas (mesma redação da tela)", () => {
    const card = buildCard(data, { kind: "running_range", ...WEEK }, ctx)!;
    expect(card.headline.value).toBe("8");
    expect(card.headline.unit).toBe("km");
    expect(card.headline.notes).toEqual(["3 corridas · 2 dias com corrida", "8 km informados · 1 corrida sem distância"]);
    expect(card.series?.items.map((i) => `${i.label}:${i.display}`)).toEqual(["Seg:5", "Ter:0", "Qua:3", "Qui:0", "Sex:0", "Sáb:0", "Dom:0"]);
    expect(card.series?.note).toBe("distância em km");
    // a descrição falada nunca afirma "0 km": dia sem corrida ou com corrida sem distância é "sem distância informada"
    expect(card.series?.summary).toBe("Distância por dia: Seg 5 km, Ter sem distância informada, Qua 3 km, Qui sem distância informada, Sex sem distância informada, Sáb sem distância informada, Dom sem distância informada");
    expect(card.progress).toBeNull();
  });

  it("com meta semanal: 'x de y km', barra e quanto falta", () => {
    const card = buildCard(sampleData({ goals: [goal("running_meters", 20_000)] }), { kind: "running_range", ...WEEK }, ctx)!;
    expect(card.headline.value).toBe("8 de 20");
    expect(card.progress).toMatchObject({ ratio: 0.4, caption: "Faltam 12 km" });
  });

  it("só corridas sem distância: o total de km é desconhecido, nunca '0 km'", () => {
    const only = sampleData({ runningSessions: [{ id: "r", occurredOn: "2026-10-07" }] });
    const card = buildCard(only, { kind: "running_range", ...WEEK }, ctx)!;
    expect(card.headline).toMatchObject({ value: "1", unit: "corrida" });
    expect(card.headline.notes).toContain("Distância não preenchida");
    expect(JSON.stringify(card)).not.toMatch(/0 km/);
    expect(card.series?.items.map((i) => i.value)).toEqual([0, 0, 1, 0, 0, 0, 0]); // conta corridas, não metros
    expect(card.progress).toBeNull();
  });

  it("sem corridas no período: sem card", () => {
    expect(buildCard(data, { kind: "running_range", from: "2026-01-01", to: "2026-01-31" }, ctx)).toBeNull();
  });
});

describe("card de estudo", () => {
  it("total e tempo por matéria na semana, sem a sessão de setembro", () => {
    const card = buildCard(data, { kind: "study_range", ...WEEK }, ctx)!;
    expect(card.headline.value).toBe("1h 45min");
    expect(card.headline.notes).toEqual(["3 sessões de estudo"]);
    expect(card.rows.map((r) => `${r.label}:${r.valueText}`)).toEqual(["SQL:1h 30min", "Português:15min"]);
    expect(card.rows[0].note).toBe("86% do tempo");
    expect(card.rows[0].hue).toBe(120);
  });

  it("filtrada por matéria: só o tempo dela, sem lista de matérias, e a meta é a da matéria", () => {
    const card = buildCard(sampleData({ goals: [goal("study_minutes", 180, "s-sql")] }), { kind: "study_range", ...WEEK, subjectId: "s-sql" }, ctx)!;
    expect(card.headline).toMatchObject({ value: "1h 30min", notes: ["SQL", "2 sessões de estudo"] });
    expect(card.rows).toEqual([]);
    expect(card.progress).toMatchObject({ ratio: 0.5, caption: "1h 30min de 3h na semana" });
  });

  it("meta por matéria vira a barra da linha", () => {
    const card = buildCard(sampleData({ goals: [goal("study_minutes", 180, "s-sql")] }), { kind: "study_range", ...WEEK }, ctx)!;
    expect(card.rows[0]).toMatchObject({ label: "SQL", note: "meta de 3h", ratio: 0.5 });
  });

  it("matéria que não existe mais: sem card", () => {
    expect(buildCard(data, { kind: "study_range", ...WEEK, subjectId: "apagada" }, ctx)).toBeNull();
  });
});

describe("card de leitura", () => {
  it("páginas do período e a posição de cada livro", () => {
    const card = buildCard(sampleData({ goals: [goal("reading_pages", 70)] }), { kind: "reading_range", ...WEEK }, ctx)!;
    expect(card.headline).toEqual({ value: "35", unit: "páginas", notes: ["2 sessões de leitura"] });
    expect(card.progress).toMatchObject({ ratio: 0.5, caption: "35 de 70 páginas na semana" });
    expect(card.rows).toEqual([
      expect.objectContaining({ label: "Livro A", valueText: "35 páginas", note: "página 65 de 320" }),
    ]);
    expect(card.series?.items.map((i) => i.value)).toEqual([0, 20, 15, 0, 0, 0, 0]);
  });

  it("sem leitura no período: sem card", () => {
    expect(buildCard(data, { kind: "reading_range", from: "2026-01-01", to: "2026-01-31" }, ctx)).toBeNull();
  });
});

describe("buildCards", () => {
  it("monta na ordem recebida e pula o que não tem registros", () => {
    const cards = buildCards(
      data,
      [
        { kind: "finance_month", month: "2026-10" },
        { kind: "workout_range", from: "2026-01-01", to: "2026-01-31" },
        { kind: "reading_range", ...WEEK },
      ],
      ctx,
    );
    expect(cards.map((c) => c.kind)).toEqual(["finance_month", "reading_range"]);
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
  });

  it("não altera os dados", () => {
    const fresh = sampleData();
    const before = JSON.stringify(fresh);
    buildCards(fresh, [{ kind: "finance_month", month: "2026-10" }, { kind: "running_range", ...WEEK }], ctx);
    expect(JSON.stringify(fresh)).toBe(before);
  });
});
