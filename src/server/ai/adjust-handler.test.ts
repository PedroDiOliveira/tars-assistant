import { describe, expect, it, vi } from "vitest";
import { rulesProposal } from "@/domain/training-proposal";
import type { TrainingProfile } from "@/domain/types";
import type { RpcClient } from "../commands";
import * as logModule from "../log";
import { handleAdjust, type AdjustHandlerDeps } from "./adjust-handler";
import type { LlmProvider } from "./provider";

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
const proposal = rulesProposal(PROFILE, [], "00000000-0000-4000-8000-000000000009", NOW);
const third = proposal.skeleton.days[0].slots[2];

const snapshot = (trainingProfile: unknown) => ({
  serverNow: NOW, schemaVersion: 18, profile: null, categories: [], transactions: [], templates: [], goals: [], exercises: [],
  plans: [], sessions: [], subjects: [], studySessions: [], timer: null, books: [], readingSessions: [], runningSessions: [],
  waterIntakes: [], trainingProfile, trainingPlans: [], trainingPlanChanges: [],
});

function db(options: { reserve?: { data: unknown; error: { code: string; message: string } | null } } = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "get_snapshot") return { data: snapshot(PROFILE), error: null };
      if (fn === "ai_reserve") return options.reserve ?? { data: { allowed: true }, error: null };
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

const answer = JSON.stringify({
  mudancas: [{ tipo: "mover", vaga: third.id, exercicio: "-", series: "-", repeticoes: "-", posicao: "1", motivo: "Começa pelo que você prefere.", principio: "ordem" }],
  mensagem: "Coloquei o exercício no começo.",
});

function provider(): LlmProvider & { calls: number } {
  return {
    name: "fake",
    calls: 0,
    async chat() {
      this.calls++;
      return { message: { content: answer, toolCalls: [] }, usage: { inputTokens: 2000, outputTokens: 250 } };
    },
  };
}

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("https://tars.example/api/training/plan/adjust", { method: "POST", headers, body: JSON.stringify(body) });

function deps(over: Partial<AdjustHandlerDeps> = {}): AdjustHandlerDeps {
  return {
    request: post({ proposal, text: "quero começar pelo terceiro" }),
    ai: { provider: provider(), model: "m" },
    limits: { dailyRequests: 60, perMinute: 10, monthlyTokens: 500_000 },
    getUser: async () => ({ id: "u1", email: null }),
    db: db().client,
    isSameOrigin: () => true,
    now: () => NOW,
    ...over,
  };
}

describe("POST /api/training/plan/adjust", () => {
  it("defesas antes da IA: origem, tipo, sessão, rascunho válido e texto", async () => {
    expect((await handleAdjust(deps({ isSameOrigin: () => false }))).status).toBe(403);
    expect((await handleAdjust(deps({ request: post({}, { "content-type": "text/plain" }) }))).status).toBe(415);
    expect((await handleAdjust(deps({ getUser: async () => null }))).status).toBe(401);
    expect((await handleAdjust(deps({ request: post({ proposal: { ...proposal, id: "x" }, text: "a" }) }))).body).toMatchObject({ error: "bad_proposal" });
    expect((await handleAdjust(deps({ request: post({ proposal, text: "   " }) }))).body).toMatchObject({ error: "empty_text" });
    expect((await handleAdjust(deps({ request: post({ proposal, text: "x".repeat(201) }) }))).body).toMatchObject({ error: "text_too_long" });
  });

  it("IA desligada ou no limite: nenhuma chamada paga, e a mensagem manda usar as opções", async () => {
    expect((await handleAdjust(deps({ ai: null }))).body).toMatchObject({ error: "ai_off" });
    const limited = provider();
    const response = await handleAdjust(deps({ ai: { provider: limited, model: "m" }, db: db({ reserve: { data: { allowed: false }, error: null } }).client }));
    expect(response.status).toBe(429);
    expect(limited.calls).toBe(0);
  });

  it("sucesso: devolve as mudanças válidas, registra os tokens e não loga o texto da pessoa", async () => {
    const spy = vi.spyOn(logModule, "log");
    const { client, calls } = db();
    const response = await handleAdjust(deps({ db: client }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ changes: [{ change: { kind: "move", slotId: third.id, toIndex: 0 }, principle: "ordem" }], message: "Coloquei o exercício no começo." });
    expect(calls.find((c) => c.fn === "ai_record")?.args).toEqual({ p_tokens: 2250 });
    expect(spy).toHaveBeenCalledWith("info", "plan_adjust.done", expect.objectContaining({ inputTokens: 2000, outputTokens: 250, changes: 1 }));
    expect(JSON.stringify(spy.mock.calls)).not.toContain("terceiro");
    spy.mockRestore();
  });
});
