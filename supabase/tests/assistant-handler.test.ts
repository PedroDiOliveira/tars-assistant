import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { call, scripted, type Step } from "@/server/ai/fixtures";
import { handleAssistant, type AssistantLimits, type HandlerResponse } from "@/server/ai/handler";
import { ProviderError } from "@/server/ai/provider";
import { executeCommand, type RpcClient } from "@/server/commands";
import { isSameOrigin } from "@/server/http";
import { TestDb } from "./harness";
import { rpcClientFor } from "./rpc-client";

let t: TestDb;
let A: string;
let B: string;

const NOW = Date.UTC(2026, 9, 7, 17, 0); // 07/10/2026 14:00 em São Paulo (quarta-feira)

beforeAll(async () => {
  t = await TestDb.create();
  A = await t.createUser({ email: "ana@tars.example" });
  B = await t.createUser({ email: "bruno@tars.example" });
  await t.setNow(NOW);
  // dados da Ana: R$ 3.500 de salário e R$ 42 de despesa em outubro
  const snap = await rpcClientFor(t, A).rpc("get_snapshot");
  const cats = (snap.data as { categories: { id: string; name: string; type: string }[] }).categories;
  const food = cats.find((c) => c.name === "Alimentação")!.id;
  const salary = cats.find((c) => c.name === "Salário")!.id;
  const add = (id: string, type: string, amountCents: number, categoryId: string, occurredOn: string) =>
    executeCommand(rpcClientFor(t, A), { type: "transaction.add", transaction: { id, type, amountCents, categoryId, description: "SEGREDO-DA-ANA", occurredOn, source: "manual" } });
  await add("11111111-1111-4111-8111-000000000001", "income", 350_000, salary, "2026-10-05");
  await add("11111111-1111-4111-8111-000000000002", "expense", 4_200, food, "2026-10-06");
});

afterEach(async () => {
  await t.setNow(NOW);
  vi.restoreAllMocks();
});

const LIMITS: AssistantLimits = { dailyRequests: 100, perMinute: 100, monthlyTokens: 1_000_000 };

interface Opts {
  steps?: Step[];
  user?: string | null;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  limits?: Partial<AssistantLimits>;
  db?: RpcClient;
  noProvider?: boolean;
  sessionUser?: string | null;
}

async function post(o: Opts = {}): Promise<{ res: HandlerResponse; provider: ReturnType<typeof scripted> }> {
  const provider = scripted(o.steps ?? [{ content: "Resposta." }]);
  const user = o.user === undefined ? A : o.user;
  const payload = o.rawBody ?? JSON.stringify(o.body ?? { message: "Quanto gastei este mês?" });
  const request = new Request("https://tars.example/api/assistant", {
    method: "POST",
    headers: { origin: "https://tars.example", host: "tars.example", "content-type": "application/json", ...o.headers },
    body: payload,
  });
  const res = await handleAssistant({
    request,
    provider: o.noProvider ? null : provider,
    limits: { ...LIMITS, ...o.limits },
    getUser: async () => (user ? { id: user, email: null } : null),
    db: o.db ?? rpcClientFor(t, user),
    isSameOrigin,
    now: () => NOW,
    newId: () => "22222222-2222-4222-8222-222222222222",
  });
  return { res, provider };
}

const usage = async (userId: string) =>
  (await t.admin<{ requests: number; tokens: string }>("select coalesce(sum(requests), 0)::int as requests, coalesce(sum(tokens), 0) as tokens from public.ai_usage where user_id = $1", [userId]))[0];

describe("caminho feliz", () => {
  it("responde a uma pergunta com dados REAIS do banco (sob o RLS da Ana) e conta o uso", async () => {
    const before = await usage(A);
    const { res, provider } = await post({
      steps: [
        { toolCalls: [call("c1", "get_financial_summary", { month: "2026-10" })], usage: { inputTokens: 700, outputTokens: 40 } },
        { content: "Em outubro, receitas de R$ 3.500,00 e despesas de R$ 42,00.", usage: { inputTokens: 900, outputTokens: 30 } },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: { text: "Em outubro, receitas de R$ 3.500,00 e despesas de R$ 42,00.", period: "Outubro de 2026" } });

    const toolMessage = provider.requests[1].messages.find((m) => m.role === "tool") as { content: string };
    const result = JSON.parse(toolMessage.content);
    expect(result.resultText.replace(/[  ]/g, " ")).toBe("R$ 3.458,00"); // o número da spec §15
    const after = await usage(A);
    expect(after.requests - before.requests).toBe(1);
    expect(Number(after.tokens) - Number(before.tokens)).toBe(700 + 40 + 900 + 30);
  });

  it("a descrição do lançamento (texto livre da Ana) NUNCA é enviada ao modelo", async () => {
    const { provider } = await post({
      steps: [{ toolCalls: [call("c1", "get_financial_summary", { month: "2026-10" })] }, { content: "ok" }],
    });
    expect(JSON.stringify(provider.requests)).not.toContain("SEGREDO-DA-ANA");
  });

  it("isolamento: o assistente do Bruno não enxerga NADA da Ana", async () => {
    const { provider } = await post({
      user: B,
      steps: [{ toolCalls: [call("c1", "get_financial_summary", { month: "2026-10" })] }, { content: "Sem registros." }],
    });
    const result = JSON.parse((provider.requests[1].messages.find((m) => m.role === "tool") as { content: string }).content);
    expect(result).toMatchObject({ hasRecords: false, transactionCount: 0, topExpenseCategories: [] });
    expect(JSON.stringify(provider.requests)).not.toContain(A);
  });
});

describe("proposta de lançamento: a IA propõe, só você salva", () => {
  const propose = { toolCalls: [call("c1", "propose_transaction", { type: "expense", amount_brl: 42, description: "Outback", date: "2026-10-06", category_name: "Alimentação" })] };

  it("devolve a proposta com id estável e NÃO grava nada", async () => {
    const before = (await t.admin<{ n: number }>("select count(*)::int as n from public.transactions where user_id = $1", [A]))[0].n;
    const { res } = await post({ steps: [propose], body: { message: "Gastei 42 reais no Outback ontem" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reply: { proposal: { id: "22222222-2222-4222-8222-222222222222", type: "expense", amountCents: 4200, occurredOn: "2026-10-06" } } });
    expect((await t.admin<{ n: number }>("select count(*)::int as n from public.transactions where user_id = $1", [A]))[0].n).toBe(before);
  });

  it("confirmar a proposta DUAS vezes (toque duplo / nova tentativa) cria um único lançamento", async () => {
    const { res } = await post({ steps: [propose], body: { message: "Gastei 42 reais no Outback ontem" } });
    const proposal = (res.body as { reply: { proposal: { id: string; categoryId: string; amountCents: number; occurredOn: string } } }).reply.proposal;
    const confirm = () => executeCommand(rpcClientFor(t, A), {
      type: "transaction.add",
      transaction: { id: proposal.id, type: "expense", amountCents: proposal.amountCents, categoryId: proposal.categoryId, description: "Outback", occurredOn: proposal.occurredOn, source: "ai" },
    });
    expect(await confirm()).toEqual({ ok: true, value: "saved" });
    expect(await confirm()).toEqual({ ok: true, value: "saved" });
    const rows = await t.admin<{ source: string }>("select source from public.transactions where id = $1", [proposal.id]);
    expect(rows).toEqual([{ source: "ai" }]);
  });
});

describe("defesas na porta (o provedor de IA é o ÚLTIMO a ser chamado)", () => {
  const untouched = async (provider: ReturnType<typeof scripted>, before: { requests: number }) => {
    expect(provider.requests).toHaveLength(0); // não chamou o modelo
    expect((await usage(A)).requests).toBe(before.requests); // e não gastou do limite
  };

  it("origem diferente (CSRF) -> 403", async () => {
    const before = await usage(A);
    const { res, provider } = await post({ headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    await untouched(provider, before);
  });

  it("sem cabeçalho Origin -> 403", async () => {
    const before = await usage(A);
    const request = new Request("https://tars.example/api/assistant", { method: "POST", headers: { host: "tars.example", "content-type": "application/json" }, body: '{"message":"oi"}' });
    const provider = scripted([{ content: "x" }]);
    const res = await handleAssistant({ request, provider, limits: LIMITS, getUser: async () => ({ id: A, email: null }), db: rpcClientFor(t, A), isSameOrigin });
    expect(res.status).toBe(403);
    await untouched(provider, before);
  });

  it("tipo de conteúdo que não é JSON -> 415", async () => {
    const before = await usage(A);
    const { res, provider } = await post({ headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(415);
    await untouched(provider, before);
  });

  it("sem sessão -> 401", async () => {
    const before = await usage(A);
    const { res, provider } = await post({ user: null });
    expect(res.status).toBe(401);
    await untouched(provider, before);
  });

  it("IA não configurada neste deploy -> 503, e o resto do app não é afetado", async () => {
    const before = await usage(A);
    const { res } = await post({ noProvider: true });
    expect(res).toMatchObject({ status: 503, body: { error: "ai_disabled" } });
    expect((await usage(A)).requests).toBe(before.requests);
  });

  it("mensagem inválida (vazia, longa demais, campo extra, não-JSON, corpo enorme) -> 400/413", async () => {
    const before = await usage(A);
    const cases: [Opts, number][] = [
      [{ body: { message: "" } }, 400],
      [{ body: { message: "   " } }, 400],
      [{ body: { message: "a".repeat(201) } }, 400],
      [{ body: { message: "oi", userId: A } }, 400],
      [{ body: { message: 42 } }, 400],
      [{ body: {} }, 400],
      [{ rawBody: "não é json" }, 400],
      [{ rawBody: JSON.stringify({ message: "x".repeat(10_000) }) }, 413],
      [{ headers: { "content-length": "999999" } }, 413],
    ];
    for (const [opts, status] of cases) {
      const { res, provider } = await post(opts);
      expect(res.status, JSON.stringify(opts).slice(0, 60)).toBe(status);
      expect(provider.requests).toHaveLength(0);
    }
    expect((await usage(A)).requests).toBe(before.requests);
  });

  it("mensagem de exatamente 200 caracteres é aceita", async () => {
    const { res } = await post({ body: { message: "a".repeat(200) } });
    expect(res.status).toBe(200);
  });
});

describe("limites de uso (a IA custa dinheiro)", () => {
  it("teto diário: a pergunta seguinte é recusada com 429 e o modelo NÃO é chamado", async () => {
    const C = await t.createUser();
    const limits = { dailyRequests: 2 };
    expect((await post({ user: C, limits })).res.status).toBe(200);
    expect((await post({ user: C, limits })).res.status).toBe(200);
    const { res, provider } = await post({ user: C, limits });
    expect(res).toMatchObject({ status: 429, body: { error: "limit_daily" } });
    expect(provider.requests).toHaveLength(0);
  });

  it("limite por minuto e depois a janela libera", async () => {
    const D = await t.createUser();
    const limits = { perMinute: 2 };
    await post({ user: D, limits });
    await post({ user: D, limits });
    expect((await post({ user: D, limits })).res).toMatchObject({ status: 429, body: { error: "limit_rate" } });
    await t.setNow(NOW + 61_000);
    expect((await post({ user: D, limits })).res.status).toBe(200);
  });

  it("orçamento mensal de tokens", async () => {
    const E = await t.createUser();
    const limits = { monthlyTokens: 500 };
    expect((await post({ user: E, limits, steps: [{ content: "ok", usage: { inputTokens: 400, outputTokens: 200 } }] })).res.status).toBe(200);
    expect((await post({ user: E, limits })).res).toMatchObject({ status: 429, body: { error: "limit_monthly" } });
  });

  it("o limite de um usuário não afeta o outro", async () => {
    const F = await t.createUser();
    const G = await t.createUser();
    await post({ user: F, limits: { dailyRequests: 1 } });
    expect((await post({ user: F, limits: { dailyRequests: 1 } })).res.status).toBe(429);
    expect((await post({ user: G, limits: { dailyRequests: 1 } })).res.status).toBe(200);
  });

  it("FALHA FECHADA: se não dá para conferir o limite, a IA não é chamada", async () => {
    const down: RpcClient = { rpc: async () => ({ data: null, error: { code: "57P01", message: "terminating connection" } }) };
    const { res, provider } = await post({ db: down });
    expect(res).toMatchObject({ status: 503, body: { error: "limits_unavailable" } });
    expect(provider.requests).toHaveLength(0);
    // resposta fora do contrato também não libera
    const odd: RpcClient = { rpc: async () => ({ data: { allowed: "sim" }, error: null }) };
    const second = await post({ db: odd });
    expect(second.res.status).toBe(503);
    expect(second.provider.requests).toHaveLength(0);
  });
});

describe("falhas do provedor", () => {
  const fails = (kind: "timeout" | "rate_limited" | "unauthorized" | "unavailable" | "bad_response"): Step[] => [() => { throw new ProviderError(kind, "detalhe interno xai-segredo"); }];
  const cases: [Parameters<typeof fails>[0], number, string][] = [
    ["timeout", 504, "ai_timeout"], ["rate_limited", 502, "ai_provider_limit"], ["unauthorized", 502, "ai_misconfigured"],
    ["unavailable", 502, "ai_unavailable"], ["bad_response", 502, "ai_unavailable"],
  ];
  it.each(cases)("%s -> HTTP %i (%s), sem repassar o detalhe do provedor", async (kind, status, code) => {
    const { res } = await post({ steps: fails(kind) });
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({ error: code });
    expect(JSON.stringify(res.body)).not.toContain("xai-segredo");
  });

  it("o gasto de tokens é registrado mesmo quando a resposta falha (foi dinheiro gasto)", async () => {
    const H = await t.createUser();
    const { res } = await post({
      user: H,
      steps: [{ toolCalls: [call("c1", "get_financial_summary", { month: "2026-10" })], usage: { inputTokens: 800, outputTokens: 25 } }, () => { throw new ProviderError("timeout", "x"); }],
    });
    expect(res.status).toBe(504);
    const row = await usage(H);
    expect(row.requests).toBe(1);
    expect(Number(row.tokens)).toBe(825);
  });

  it("dados indisponíveis depois de reservar: 503, o modelo não é chamado", async () => {
    const real = rpcClientFor(t, A);
    const flaky: RpcClient = { rpc: (fn, args) => (fn === "get_snapshot" ? Promise.resolve({ data: null, error: { code: "57P01", message: "x" } }) : real.rpc(fn, args)) };
    const { res, provider } = await post({ db: flaky });
    expect(res).toMatchObject({ status: 503, body: { error: "data_unavailable" } });
    expect(provider.requests).toHaveLength(0);
  });
});

describe("privacidade dos logs", () => {
  it("nenhum log contém o texto da pergunta, da resposta ou da proposta", async () => {
    const lines: string[] = [];
    for (const method of ["log", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((line: unknown) => void lines.push(String(line)));
    }
    await post({ steps: [{ toolCalls: [call("c1", "propose_transaction", { type: "expense", amount_brl: 77, description: "TEXTO-SECRETO-DA-DESCRICAO" })] }], body: { message: "PERGUNTA-SECRETA 77 reais" } });
    await post({ steps: [{ content: "RESPOSTA-SECRETA" }], body: { message: "OUTRA-PERGUNTA-SECRETA" } });
    await post({ steps: [() => { throw new ProviderError("unavailable", "x"); }] });
    const all = lines.join("\n");
    expect(lines.length).toBeGreaterThan(0); // houve log (o teste não é vazio)
    expect(all).not.toMatch(/SECRET|77 reais|ana@tars/);
    expect(all).toContain("assistant.reply");
  });
});
