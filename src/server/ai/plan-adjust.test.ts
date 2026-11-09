import { describe, expect, it } from "vitest";
import { applyChanges } from "@/domain/training-adjust";
import { effectiveOf } from "@/domain/training-focus";
import { rulesProposal } from "@/domain/training-proposal";
import { SLOT_TYPES } from "@/domain/training-rules";
import { SPLIT_OPTIONS } from "@/domain/training-splits";
import type { TrainingProfile } from "@/domain/types";
import { ADJUST_MAX_TOKENS, adjustMessages, adjustPlan, adjustResponseSchema, readAdjustResponse } from "./plan-adjust";
import { ProviderError, type LlmProvider } from "./provider";

const NOW = Date.UTC(2026, 10, 8, 15, 0);
const PROFILE: TrainingProfile = {
  goal: "massa",
  experience: "intermediario",
  daysPerWeek: 4,
  sessionMinutes: 60,
  location: "academia",
  limitations: [],
  screening: "liberado",
  healthConsentAt: NOW - 1000,
  priorities: [],
  updatedAt: NOW,
};
const ID = "00000000-0000-4000-8000-000000000009";
const proposal = rulesProposal(PROFILE, [], ID, NOW);
const day = proposal.skeleton.days[0];
const [main, second, third] = day.slots;

const item = (over: Record<string, string>) => ({
  tipo: "series",
  vaga: second.id,
  grupo: "-",
  exercicio: "-",
  series: "-",
  repeticoes: "-",
  posicao: "-",
  motivo: "menos cansaço no fim.",
  principio: "volume",
  ...over,
});

describe("prompt e schema do ajuste", () => {
  it("o schema só aceita vagas, exercícios, séries e faixas do próprio plano", () => {
    const schema = adjustResponseSchema(proposal) as { properties: { mudancas: { items: { properties: Record<string, { enum?: string[] }> } } } };
    const props = schema.properties.mudancas.items.properties;
    expect(props.vaga.enum).toEqual(["-", ...proposal.skeleton.days.flatMap((d) => d.slots.map((s) => s.id))]);
    expect(props.tipo.enum).toContain("foco");
    expect(props.grupo.enum).toEqual(["-", "peito", "costas", "ombros", "bracos", "pernas", "gluteos"]);
    expect(props.exercicio.enum).toContain("-");
    expect(props.exercicio.enum).toContain(main.options[0]);
    expect(props.principio.enum).toContain("ordem");
  });

  it("custo: o pedido do maior plano (6 treinos) fica perto de 1,5 mil tokens de entrada, mais o schema", () => {
    const big = rulesProposal({ ...PROFILE, daysPerWeek: 6, sessionMinutes: 75 }, [], ID, NOW, undefined, SPLIT_OPTIONS.find((o) => o.id === "por-grupo-6")!.id);
    const text = "x".repeat(200);
    const chars = adjustMessages(PROFILE, big, text).reduce((n, m) => n + (m.content ?? "").length, 0) + JSON.stringify(adjustResponseSchema(big)).length;
    // Estimativa conservadora: ~3,5 caracteres por token em português com chaves técnicas.
    const tokens = Math.ceil(chars / 3.5);
    expect(tokens).toBeLessThan(3000);
    expect(ADJUST_MAX_TOKENS).toBeLessThanOrEqual(900);
  });

  it("o texto da pessoa vai entre aspas, depois das regras fixas (parte fixa no começo, boa para o cache)", () => {
    const [system, user] = adjustMessages(PROFILE, proposal, "quero começar pelo leg press");
    expect(system.role).toBe("system");
    expect(system.content).not.toContain("leg press");
    expect(user.content).toMatch(/PEDIDO\n"quero começar pelo leg press"$/);
    expect(user.content).toContain(`${main.id}!`);
  });
});

describe("leitura da resposta", () => {
  it("converte as operações e descarta as que não valem (opção de outra vaga, principal removido)", () => {
    const foreign = proposal.skeleton.days[1].slots.find((s) => !second.options.includes(s.options[0]))!.options[0];
    const content = JSON.stringify({
      mudancas: [
        item({ tipo: "mover", vaga: third.id, posicao: "1", principio: "ordem" }),
        item({ tipo: "trocar", vaga: second.id, exercicio: foreign }),
        item({ tipo: "remover", vaga: main.id }),
        item({ tipo: "series", vaga: second.id, series: String(second.setOptions[0]) }),
      ],
      mensagem: "coloquei o exercício na frente.",
    });
    const read = readAdjustResponse(content, proposal)!;
    expect(read.message).toBe("Coloquei o exercício na frente.");
    expect(read.changes.map((c) => c.change)).toEqual([
      { kind: "move", slotId: third.id, toIndex: 0 },
      ...(second.setOptions[0] !== proposal.choices[second.id].sets ? [{ kind: "sets", slotId: second.id, sets: second.setOptions[0] }] : []),
    ]);
  });

  it("no máximo 3 mudanças; JSON quebrado = null", () => {
    const many = Array.from({ length: 6 }, (_, i) => item({ tipo: "mover", vaga: day.slots[i % day.slots.length].id, posicao: String((i % 2) + 1), principio: "ordem" }));
    expect(readAdjustResponse(JSON.stringify({ mudancas: many, mensagem: "ok" }), proposal)!.changes.length).toBeLessThanOrEqual(3);
    expect(readAdjustResponse("{", proposal)).toBeNull();
    expect(readAdjustResponse(JSON.stringify({ mensagem: "x" }), proposal)).toBeNull();
  });
});

describe("foco pedido por texto: a IA escolhe o grupo, as regras calculam o volume", () => {
  it("'foco' vira as mudanças de volume das regras (nunca números da IA), dentro do tempo", () => {
    const content = JSON.stringify({ mudancas: [item({ tipo: "foco", vaga: "-", grupo: "peito", motivo: "quer mais peito.", principio: "volume" })], mensagem: "Reforcei o peito." });
    const read = readAdjustResponse(content, proposal, { profile: PROFILE, exercises: [] })!;
    expect(read.message).toBe("Reforcei o peito.");
    expect(read.changes.length).toBeGreaterThan(0);
    expect(read.changes.length).toBeLessThanOrEqual(16);
    const { proposal: after } = applyChanges(proposal, read.changes);
    const chest = (p: typeof proposal) => effectiveOf(p.skeleton.days.map((d) => ({ slots: d.slots.map((s) => ({ type: s.type, sets: p.choices[s.id].sets })) })), (t) => SLOT_TYPES[t].group, p.skeleton.timesPerWeek).peito;
    expect(chest(after)).toBeGreaterThan(chest(proposal));
    expect(read.changes.every((c) => ["sets", "add", "remove", "move"].includes(c.change.kind))).toBe(true);
  });

  it("sem o contexto do plano ou com grupo inválido, nada acontece; no máximo 2 grupos por pedido", () => {
    const only = (grupo: string) => JSON.stringify({ mudancas: [item({ tipo: "foco", vaga: "-", grupo })], mensagem: "x" });
    expect(readAdjustResponse(only("peito"), proposal)!.changes).toEqual([]);
    expect(readAdjustResponse(only("-"), proposal, { profile: PROFILE, exercises: [] })!.changes).toEqual([]);
    expect(readAdjustResponse(only("tornozelo"), proposal, { profile: PROFILE, exercises: [] })!.changes).toEqual([]);
    const three = JSON.stringify({ mudancas: ["peito", "costas", "ombros"].map((grupo) => item({ tipo: "foco", vaga: "-", grupo })), mensagem: "x" });
    const read = readAdjustResponse(three, proposal, { profile: PROFILE, exercises: [] })!;
    expect(read.changes.length).toBeLessThanOrEqual(16);
  });
});

describe("chamada", () => {
  const fake = (content: string | Error): LlmProvider & { requests: unknown[] } => ({
    name: "fake",
    requests: [],
    async chat(request) {
      this.requests.push(request);
      if (content instanceof Error) throw content;
      return { message: { content, toolCalls: [] }, usage: { inputTokens: 1200, outputTokens: 300 } };
    },
  });

  it("uma chamada só, estrita, com teto baixo de saída; devolve os tokens gastos", async () => {
    const provider = fake(JSON.stringify({ mudancas: [item({ tipo: "mover", vaga: third.id, posicao: "1", principio: "ordem" })], mensagem: "Feito." }));
    const result = await adjustPlan({ ai: { provider, model: "m" }, profile: PROFILE, proposal, exercises: [], text: "x", signal: AbortSignal.timeout(1000) });
    expect(result).toMatchObject({ ok: true, message: "Feito.", usage: { inputTokens: 1200, outputTokens: 300 } });
    expect(result.changes).toHaveLength(1);
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({ maxTokens: ADJUST_MAX_TOKENS, tools: [], responseFormat: { name: "ajuste_do_plano" } });
  });

  it("falha do provedor ou resposta ilegível: sem nova tentativa", async () => {
    const limited = fake(new ProviderError("rate_limited", "429"));
    expect(await adjustPlan({ ai: { provider: limited, model: "m" }, profile: PROFILE, proposal, exercises: [], text: "x", signal: AbortSignal.timeout(1000) })).toMatchObject({ ok: false, failure: "rate_limited" });
    const broken = fake("não é json");
    const result = await adjustPlan({ ai: { provider: broken, model: "m" }, profile: PROFILE, proposal, exercises: [], text: "x", signal: AbortSignal.timeout(1000) });
    expect(result).toMatchObject({ ok: false, failure: "invalid" });
    expect(broken.requests).toHaveLength(1);
  });
});
