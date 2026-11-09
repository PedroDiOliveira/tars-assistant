import { describe, expect, it } from "vitest";
import { buildSkeleton, defaultChoices } from "@/domain/training-rules";
import type { TrainingProfile } from "@/domain/types";
import type { RpcClient } from "../commands";
import { handlePlan, type PlanHandlerDeps } from "./plan-handler";
import type { LlmProvider } from "./provider";

const NOW = Date.UTC(2026, 9, 28, 15, 0);
const PROFILE: TrainingProfile = {
  goal: "saude",
  experience: "iniciante",
  daysPerWeek: 3,
  sessionMinutes: 45,
  location: "casa-halteres",
  limitations: [],
  screening: "nao-respondida",
  priorities: [],
  updatedAt: NOW,
};

const snapshot = (trainingProfile: unknown) => ({
  serverNow: NOW, schemaVersion: 18, profile: null, categories: [], transactions: [], templates: [], goals: [], exercises: [],
  plans: [], sessions: [], subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [],
  waterIntakes: [], trainingProfile, trainingPlans: [], trainingPlanChanges: [],
});

function db(options: { profile?: unknown; reserve?: { data: unknown; error: { code: string; message: string } | null } } = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "get_snapshot") return { data: snapshot(options.profile === undefined ? PROFILE : options.profile), error: null };
      if (fn === "ai_reserve") return options.reserve ?? { data: { allowed: true }, error: null };
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

function answer(): string {
  const skeleton = buildSkeleton(PROFILE, []);
  const choices = defaultChoices(skeleton);
  const treinos = Object.fromEntries(skeleton.days.map((d) => [d.id, Object.fromEntries(d.slots.map((s) => [s.id, {
    exercicio: choices[s.id].exerciseKey, motivo: "Ok.",
  }]))]));
  return JSON.stringify({ treinos, resumo: "Corpo inteiro, 3 dias." });
}

function provider(): LlmProvider & { calls: number } {
  return {
    name: "fake",
    calls: 0,
    async chat() {
      this.calls++;
      return { message: { content: answer(), toolCalls: [] }, usage: { inputTokens: 900, outputTokens: 400 } };
    },
  };
}

const post = (headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("https://tars.example/api/training/plan", { method: "POST", headers, body: "{}" });

function deps(over: Partial<PlanHandlerDeps> & { client?: RpcClient } = {}): PlanHandlerDeps {
  return {
    request: post(),
    ai: null,
    limits: { dailyRequests: 60, perMinute: 10, monthlyTokens: 500_000 },
    getUser: async () => ({ id: "u1", email: null }),
    db: over.client ?? db().client,
    isSameOrigin: () => true,
    now: () => NOW,
    newId: () => "00000000-0000-4000-8000-000000000001",
    ...over,
  };
}

describe("POST /api/training/plan", () => {
  it("defesas antes de tudo: origem, tipo do conteúdo e sessão", async () => {
    expect((await handlePlan(deps({ isSameOrigin: () => false }))).status).toBe(403);
    expect((await handlePlan(deps({ request: post({ "content-type": "text/plain" }) }))).status).toBe(415);
    expect((await handlePlan(deps({ getUser: async () => null }))).status).toBe(401);
  });

  it("sem respostas salvas: 409 com a mensagem, sem chamar a IA nem o limite", async () => {
    const { client, calls } = db({ profile: null });
    const ai = provider();
    const res = await handlePlan(deps({ client, ai: { provider: ai, model: "m" } }));
    expect(res).toEqual({ status: 409, body: { error: "no_profile", message: "Responda às perguntas do plano antes de gerar." } });
    expect(ai.calls).toBe(0);
    expect(calls.map((c) => c.fn)).toEqual(["get_snapshot"]);
  });

  it("com IA: reserva o limite ANTES, gera e registra os tokens gastos", async () => {
    const { client, calls } = db();
    const ai = provider();
    const res = await handlePlan(deps({ client, ai: { provider: ai, model: "openai/gpt-oss-20b" } }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ proposal: { source: "ai", model: "openai/gpt-oss-20b" } });
    expect(calls.map((c) => c.fn)).toEqual(["get_snapshot", "ai_reserve", "ai_record"]);
    expect(calls[2].args).toEqual({ p_tokens: 1300 });
  });

  it("limite atingido: modelo pronto (ai_limit), sem chamar a IA nem registrar tokens", async () => {
    const { client, calls } = db({ reserve: { data: { allowed: false, reason: "daily" }, error: null } });
    const ai = provider();
    const res = await handlePlan(deps({ client, ai: { provider: ai, model: "m" } }));
    expect(res.body).toMatchObject({ proposal: { source: "rules", fallback: "ai_limit" } });
    expect(ai.calls).toBe(0);
    expect(calls.map((c) => c.fn)).toEqual(["get_snapshot", "ai_reserve"]);
  });

  it("sem como conferir o limite: não chama a IA às cegas (ai_unavailable)", async () => {
    const { client } = db({ reserve: { data: null, error: { code: "XX000", message: "falhou" } } });
    const ai = provider();
    const res = await handlePlan(deps({ client, ai: { provider: ai, model: "m" } }));
    expect(res.body).toMatchObject({ proposal: { source: "rules", fallback: "ai_unavailable" } });
    expect(ai.calls).toBe(0);
  });

  it("IA desligada no servidor: modelo pronto (ai_off), sem reservar limite", async () => {
    const { client, calls } = db();
    const res = await handlePlan(deps({ client }));
    expect(res.body).toMatchObject({ proposal: { source: "rules", fallback: "ai_off" } });
    expect(calls.map((c) => c.fn)).toEqual(["get_snapshot"]);
  });
});
