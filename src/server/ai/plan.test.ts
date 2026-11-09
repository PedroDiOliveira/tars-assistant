import { describe, expect, it } from "vitest";
import { EMPTY_APP_DATA, type AppData } from "@/domain/snapshot";
import { buildSkeleton, defaultChoices, type PlanSkeleton } from "@/domain/training-rules";
import { RULES_VERSION } from "@/domain/training-proposal";
import type { TrainingProfile } from "@/domain/types";
import { PLAN_PROMPT_VERSION, generatePlan, planMessages, planResponseSchema, readPlanResponse } from "./plan";
import { ProviderError, type ChatRequest, type ChatResult, type LlmProvider } from "./provider";

const NOW = Date.UTC(2026, 9, 28, 15, 0);
const ID = "00000000-0000-4000-8000-000000000009";
const PROFILE: TrainingProfile = {
  goal: "massa",
  experience: "intermediario",
  daysPerWeek: 4,
  sessionMinutes: 60,
  location: "academia",
  limitations: ["joelho"],
  screening: "liberado",
  healthConsentAt: NOW - 1000,
  priorities: ["costas"],
  notes: "Gosto de remada",
  updatedAt: NOW,
};
const DATA: AppData = {
  ...EMPTY_APP_DATA,
  exercises: [{ id: "e1", name: "Supino reto", muscleGroup: "Peito", loadType: "external", libraryKey: "supino-reto-barra" }],
};

/** A resposta que o modelo daria escolhendo o padrão das regras (válida por construção). */
function validAnswer(skeleton: PlanSkeleton, tweak?: (answer: Record<string, Record<string, Record<string, string>>>) => void): string {
  const choices = defaultChoices(skeleton);
  const treinos = Object.fromEntries(
    skeleton.days.map((day) => [
      day.id,
      Object.fromEntries(
        day.slots.map((slot) => [
          slot.id,
          { exercicio: choices[slot.id].exerciseKey, motivo: "  base do treino,   mantém a evolução. " },
        ]),
      ),
    ]),
  );
  tweak?.(treinos);
  return JSON.stringify({ treinos, resumo: "Superior e inferior, 4 dias. Costas com mais séries." });
}

function fakeProvider(answers: (string | Error)[]): LlmProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    name: "fake",
    requests,
    async chat(request): Promise<ChatResult> {
      requests.push(structuredClone({ ...request, signal: undefined as unknown as AbortSignal }));
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { message: { content: next ?? null, toolCalls: [] }, usage: { inputTokens: 1000, outputTokens: 500 } };
    },
  };
}

const run = (provider: LlmProvider | null) =>
  generatePlan({
    ai: provider ? { provider, model: "openai/gpt-oss-20b" } : null,
    profile: PROFILE,
    data: DATA,
    today: "2026-10-28",
    id: ID,
    nowMs: NOW,
    signal: new AbortController().signal,
  });

const skeleton = buildSkeleton(PROFILE, DATA.exercises);

describe("schema da resposta (saída estruturada estrita)", () => {
  it("objetos fechados, tudo obrigatório e as opções de cada vaga como enum", () => {
    const schema = planResponseSchema(skeleton) as {
      additionalProperties: boolean;
      required: string[];
      properties: { treinos: { properties: Record<string, { required: string[]; properties: Record<string, { properties: Record<string, { enum?: string[] }> }> }> } };
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["treinos", "resumo"]);
    const day = skeleton.days[0];
    const slot = day.slots[0];
    const slotSchema = schema.properties.treinos.properties[day.id].properties[slot.id];
    expect(schema.properties.treinos.properties[day.id].required).toEqual(day.slots.map((s) => s.id));
    expect(slotSchema.properties.exercicio.enum).toEqual(slot.options);
    // O volume é das regras: a IA só escolhe o exercício (e escreve o motivo). Menos saída, e nenhum jeito de errar o volume.
    expect(Object.keys(slotSchema.properties)).toEqual(["exercicio", "motivo"]);
  });
});

describe("leitura da resposta", () => {
  it("converte em escolhas e limpa os textos", () => {
    const read = readPlanResponse(validAnswer(skeleton), skeleton);
    if (!read.ok) throw new Error(read.errors.join());
    const first = skeleton.days[0].slots[0];
    // Espaços sobrando somem e a frase começa com maiúscula (o modelo às vezes escreve tudo em minúsculas).
    expect(read.choices[first.id]).toMatchObject({ sets: first.sets, reps: first.reps, reason: "Base do treino, mantém a evolução." });
    expect(read.summary).toBe("Superior e inferior, 4 dias. Costas com mais séries.");
  });

  it("JSON quebrado, vaga faltando ou resumo vazio viram erros (nunca um plano pela metade)", () => {
    expect(readPlanResponse("{ não é json", skeleton)).toEqual({ ok: false, errors: ["A resposta não é um JSON válido."] });
    const missing = validAnswer(skeleton, (t) => {
      delete t[skeleton.days[0].id][skeleton.days[0].slots[0].id];
    });
    expect(readPlanResponse(missing, skeleton)).toMatchObject({ ok: false, errors: [expect.stringContaining("vaga sem resposta")] });
    const noSummary = JSON.stringify({ ...JSON.parse(validAnswer(skeleton)), resumo: "   " });
    expect(readPlanResponse(noSummary, skeleton)).toMatchObject({ ok: false, errors: ['Faltou o "resumo".'] });
  });
});

describe("prompt", () => {
  it("leva as respostas, as vagas com as opções e marca o que a pessoa já faz; nada de nome ou e-mail", () => {
    const [system, user] = planMessages(PROFILE, skeleton, DATA, "2026-10-28");
    expect(system.role).toBe("system");
    const text = user.content as string;
    expect(text).toContain("Objetivo: Ganhar massa.");
    expect(text).toContain("Dores ou limitações: joelho");
    expect(text).toContain("Priorizar: costas.");
    expect(text).toContain('Texto livre da pessoa: "Gosto de remada"');
    expect(text).toMatch(/: supino-reto-barra\*, /);
    expect(text).toContain("Sem treinos registrados no app ainda.");
    expect(text).not.toMatch(/@|Pedro/);
  });

  it("quem pulou a parte de saúde aparece assim no prompt (e sem limitações)", () => {
    const skipped = { ...PROFILE, screening: "nao-respondida" as const, limitations: [], healthConsentAt: undefined };
    const text = planMessages(skipped, buildSkeleton(skipped, []), DATA, "2026-10-28")[1].content as string;
    expect(text).toContain("Não respondeu às perguntas de saúde.");
  });
});

describe("generatePlan", () => {
  it("resposta válida na 1ª tentativa: plano da IA, com modelo, versões e o uso somado", async () => {
    const provider = fakeProvider([validAnswer(skeleton)]);
    const result = await run(provider);
    expect(result.attempts).toBe(1);
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(result.proposal).toMatchObject({ id: ID, source: "ai", model: "openai/gpt-oss-20b", promptVersion: `${PLAN_PROMPT_VERSION}/${RULES_VERSION}`, profileUpdatedAt: NOW });
    expect(result.proposal).not.toHaveProperty("fallback");
    const [request] = provider.requests;
    expect(request.tools).toEqual([]);
    expect(request.responseFormat?.name).toBe("plano_de_treino");
    expect(request.responseFormat?.schema).toEqual(planResponseSchema(skeleton));
  });

  it("exercício repetido no treino: as regras consertam, SEM nova chamada (e contam o conserto)", async () => {
    const day = skeleton.days[0];
    const [first, second] = day.slots;
    const repeated = validAnswer(skeleton, (t) => {
      t[day.id][second.id].exercicio = t[day.id][first.id].exercicio;
    });
    const provider = fakeProvider([repeated]);
    const result = await run(provider);
    expect(provider.requests).toHaveLength(1);
    expect(result).toMatchObject({ attempts: 1, repaired: 1, proposal: { source: "ai" } });
    const choices = result.proposal.choices;
    expect(choices[second.id].exerciseKey).not.toBe(choices[first.id].exerciseKey);
    expect(choices[second.id]).not.toHaveProperty("reason"); // o motivo era de outra escolha
  });

  it("resposta incompleta (formato): tenta de novo mostrando os erros", async () => {
    const day = skeleton.days[0];
    const incomplete = validAnswer(skeleton, (t) => {
      delete t[day.id][day.slots[0].id];
    });
    const provider = fakeProvider([incomplete, validAnswer(skeleton)]);
    const result = await run(provider);
    expect(result).toMatchObject({ attempts: 2, repaired: 0, proposal: { source: "ai" } });
    expect(result.usage).toEqual({ inputTokens: 2000, outputTokens: 1000 });
    const retry = provider.requests[1].messages;
    expect(retry.at(-2)).toMatchObject({ role: "assistant", content: incomplete });
    expect(retry.at(-1)?.content).toMatch(/A resposta tem problemas/);
  });

  it("duas respostas inválidas: o plano sai do modelo pronto (ai_invalid), e o gasto continua contado", async () => {
    const result = await run(fakeProvider(["{}", "nada"]));
    expect(result.proposal).toMatchObject({ source: "rules", fallback: "ai_invalid" });
    expect(result.attempts).toBe(2);
    expect(result.usage.inputTokens).toBe(2000);
  });

  it("o provedor recusa a geração (JSON fora do schema, HTTP 400): uma nova tentativa, e só então o modelo pronto", async () => {
    const recovered = fakeProvider([new ProviderError("bad_response", "x", 400), validAnswer(skeleton)]);
    expect(await run(recovered)).toMatchObject({ attempts: 2, proposal: { source: "ai" } });
    const twice = await run(fakeProvider([new ProviderError("bad_response", "x", 400), new ProviderError("bad_response", "x", 400)]));
    expect(twice).toMatchObject({ attempts: 2, proposal: { source: "rules", fallback: "ai_unavailable" } });
  });

  it("provedor no limite vira ai_limit; fora do ar ou lento vira ai_unavailable", async () => {
    expect((await run(fakeProvider([new ProviderError("rate_limited", "x", 429)]))).proposal).toMatchObject({ source: "rules", fallback: "ai_limit" });
    expect((await run(fakeProvider([new ProviderError("timeout", "x")]))).proposal).toMatchObject({ source: "rules", fallback: "ai_unavailable" });
    expect((await run(fakeProvider([new Error("rede")]))).proposal).toMatchObject({ source: "rules", fallback: "ai_unavailable" });
  });

  it("sem IA: modelo pronto, sem chamada nenhuma", async () => {
    const result = await run(null);
    expect(result).toMatchObject({ attempts: 0, usage: { inputTokens: 0, outputTokens: 0 }, proposal: { source: "rules", fallback: "ai_off" } });
  });
});
