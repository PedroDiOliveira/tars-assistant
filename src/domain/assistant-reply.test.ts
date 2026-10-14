import { describe, expect, it } from "vitest";
import { sampleData, TODAY } from "@/server/ai/fixtures";
import { answerQuestion } from "./assistant";
import { buildCards, parseCardRefs } from "./assistant-cards";
import { parseAssistantReply } from "./assistant-reply";

const proposal = { id: "11111111-1111-4111-8111-111111111111", type: "expense", amountCents: 4200, description: "Outback", occurredOn: "2026-10-06", categoryId: "c-food" };

describe("parseAssistantReply", () => {
  it("aceita só texto, e copia período e referências válidas", () => {
    expect(parseAssistantReply({ text: "oi" })).toEqual({ text: "oi" });
    expect(parseAssistantReply({ text: "oi", period: "Outubro de 2026", cards: [{ kind: "finance_month", month: "2026-10" }] })).toEqual({
      text: "oi",
      period: "Outubro de 2026",
      cards: [{ kind: "finance_month", month: "2026-10" }],
    });
  });

  it("referência inválida é descartada e o texto continua valendo", () => {
    expect(parseAssistantReply({ text: "oi", cards: [{ kind: "finance_month", month: "2026-13" }, "lixo"] })).toEqual({ text: "oi" });
    expect(parseAssistantReply({ text: "oi", cards: "finance_month" })).toEqual({ text: "oi" });
  });

  it("resposta sem texto ou que nem é objeto é inválida", () => {
    for (const raw of [null, undefined, "texto", 5, [], {}, { text: 5 }]) expect(parseAssistantReply(raw), String(raw)).toBeNull();
  });

  it("proposta válida passa; ids extras do servidor são ignorados", () => {
    expect(parseAssistantReply({ text: "ok", proposal })?.proposal).toEqual(proposal);
    expect(parseAssistantReply({ text: "ok", proposal: { ...proposal, lixo: 1 } })?.proposal).toEqual(proposal);
    expect(parseAssistantReply({ text: "ok", proposal: { ...proposal, id: undefined } })?.proposal?.id).toBeUndefined();
  });

  it("proposta malformada invalida a resposta inteira (nunca mostrar 'confirme' sem um lançamento utilizável)", () => {
    const bad = [
      { ...proposal, amountCents: 0 },
      { ...proposal, amountCents: 42.5 },
      { ...proposal, amountCents: -1 },
      { ...proposal, type: "transfer" },
      { ...proposal, occurredOn: "2026-02-30" },
      { ...proposal, description: "x".repeat(201) },
      { ...proposal, categoryId: "" },
      "texto",
      null,
    ];
    for (const p of bad) expect(parseAssistantReply({ text: "ok", proposal: p }), JSON.stringify(p)).toBeNull();
  });
});

describe("simulação local (demo): referências de card", () => {
  const data = sampleData();
  const cardsFor = (question: string) => answerQuestion(question, data, TODAY).cards ?? [];

  it("cada pergunta-modelo devolve referências que o cliente aceita sem alterar", () => {
    const questions = [
      "Quanto gastei com alimentação este mês?",
      "Quanto gastei este mês?",
      "Como foi minha semana?",
      "Quanto corri nesta semana?",
      "Quanto corri neste mês?",
      "Quantas vezes fiz musculação nas últimas quatro semanas?",
      "Quanto estudei SQL neste mês?",
      "Quanto estudei nesta semana?",
      "Qual matéria teve menos tempo de estudo nesta semana?",
      "Quantas páginas li nesta semana?",
    ];
    for (const question of questions) {
      const refs = cardsFor(question);
      expect(refs.length, question).toBeGreaterThan(0);
      expect(parseCardRefs(refs), question).toEqual(refs);
    }
  });

  it("'Como foi minha semana?' gera um card por módulo com registros (musculação, corrida, estudo, leitura)", () => {
    const refs = cardsFor("Como foi minha semana?");
    expect(buildCards(data, refs, { today: TODAY }).map((c) => c.module)).toEqual(["workout", "running", "study", "reading"]);
  });

  it("'Quanto estudei SQL' filtra pela matéria citada", () => {
    expect(cardsFor("Quanto estudei SQL neste mês?")).toEqual([{ kind: "study_range", from: "2026-10-01", to: "2026-10-31", subjectId: "s-sql" }]);
  });

  it("a categoria citada vira o foco do card de finanças", () => {
    const question = "Quanto gastei com alimentação este mês?";
    const [card] = buildCards(data, cardsFor(question), { today: TODAY, question });
    expect(card.rows.find((r) => r.focused)?.label).toBe("Alimentação");
  });

  it("sem registros, nenhum card é montado (o texto já diz que não há nada)", () => {
    const empty = sampleData({ runningSessions: [] });
    const refs = answerQuestion("Quanto corri nesta semana?", empty, TODAY).cards ?? [];
    expect(buildCards(empty, refs, { today: TODAY })).toEqual([]);
  });

  it("pergunta que não sabe responder não traz cards", () => {
    expect(answerQuestion("qual a capital da França?", data, TODAY).cards).toBeUndefined();
  });
});
