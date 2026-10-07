import { z } from "zod";
import type { AssistantReply } from "@/domain/assistant";
import { todayKey } from "@/lib/dates";
import type { AuthUser } from "../auth-claims";
import { loadSnapshot, type RpcClient } from "../commands";
import { log } from "../log";
import { runAssistant, type AssistantFailureKind } from "./assistant";
import type { LlmProvider } from "./provider";

export const MAX_MESSAGE_CHARS = 200;
/** Teto do corpo da requisição: a mensagem tem 200 caracteres; o resto é folga para o JSON. */
const MAX_BODY_BYTES = 4096;
/** Tempo total que uma pergunta pode levar com o provedor (vale para todas as chamadas dela). */
export const AI_DEADLINE_MS = 20_000;

export interface AssistantLimits {
  dailyRequests: number;
  perMinute: number;
  monthlyTokens: number;
}

export interface HandlerDeps {
  request: Request;
  /** null = IA não configurada neste deploy */
  provider: LlmProvider | null;
  limits: AssistantLimits;
  /** verifica a sessão (JWT) — sem isso nada acontece */
  getUser: () => Promise<AuthUser | null>;
  /** cliente do banco com os direitos do usuário */
  db: RpcClient;
  isSameOrigin: (request: Request) => boolean;
  now?: () => number;
  newId?: () => string;
}

export interface HandlerResponse {
  status: number;
  body: { reply: AssistantReply } | { error: string; message: string };
}

const bodySchema = z.strictObject({ message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) });

const LIMIT_MESSAGES = {
  rate: "Muitas perguntas em pouco tempo. Aguarde um minuto e tente de novo.",
  daily: "Você atingiu o limite diário do assistente. O resto do app continua funcionando normalmente.",
  monthly: "O orçamento mensal de uso da IA acabou. O resto do app continua funcionando normalmente.",
} as const;

const reply = (status: number, error: string, message: string): HandlerResponse => ({ status, body: { error, message } });

/** Status HTTP e texto para cada tipo de falha do assistente. Nunca repassa detalhes do provedor. */
function failureResponse(kind: AssistantFailureKind): HandlerResponse {
  switch (kind) {
    case "timeout":
      return reply(504, "ai_timeout", "O assistente demorou demais para responder. Tente de novo ou use o formulário.");
    case "unauthorized":
      return reply(502, "ai_misconfigured", "O assistente está mal configurado no servidor. Use o formulário por enquanto.");
    case "rate_limited":
      return reply(502, "ai_provider_limit", "O provedor de IA recusou o pedido por limite de uso. Use o formulário por enquanto.");
    case "too_many_steps":
    case "empty_reply":
      return reply(502, "ai_failed", "Não consegui responder a isso. Tente reformular a pergunta.");
    default:
      return reply(502, "ai_unavailable", "O assistente está indisponível agora. Use o formulário por enquanto.");
  }
}

/**
 * `POST /api/assistant`, com tudo injetado para poder ser testado de ponta a ponta. Ordem das defesas (cada uma só
 * roda se a anterior passou, e o provedor de IA é o ÚLTIMO a ser chamado):
 *   origem -> tipo do conteúdo -> tamanho -> sessão -> IA ligada -> mensagem válida -> limites -> dados -> IA.
 */
export async function handleAssistant(deps: HandlerDeps): Promise<HandlerResponse> {
  const { request, provider, limits, db } = deps;
  const now = deps.now ?? Date.now;
  const startedAt = now();

  if (!deps.isSameOrigin(request)) return reply(403, "forbidden", "Pedido de origem não permitida.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(415, "unsupported_media_type", "Envie o pedido como JSON.");
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(413, "too_large", "Mensagem grande demais.");

  const user = await deps.getUser();
  if (!user) return reply(401, "unauthorized", "Sua sessão expirou. Entre de novo.");

  if (!provider) return reply(503, "ai_disabled", "O assistente não está configurado neste app.");

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return reply(400, "invalid_request", "Pedido inválido.");
  }
  if (raw.length > MAX_BODY_BYTES) return reply(413, "too_large", "Mensagem grande demais.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return reply(400, "invalid_request", "Pedido inválido.");
  }
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return reply(400, "invalid_request", `Escreva uma mensagem de 1 a ${MAX_MESSAGE_CHARS} caracteres.`);
  }

  // Limites ANTES de qualquer chamada paga. Se não der para conferir, NÃO chama (fecha por padrão).
  const reserved = await db.rpc("ai_reserve", {
    p_daily_limit: limits.dailyRequests,
    p_monthly_tokens: limits.monthlyTokens,
    p_per_minute: limits.perMinute,
  });
  const verdict = reserved.data as { allowed?: boolean; reason?: keyof typeof LIMIT_MESSAGES } | null;
  if (reserved.error || typeof verdict?.allowed !== "boolean") {
    log("error", "assistant.limits_unavailable", { code: reserved.error?.code ?? "no_verdict" });
    return reply(503, "limits_unavailable", "Não consegui conferir o limite de uso agora. Tente de novo em instantes.");
  }
  if (!verdict.allowed) {
    const reason = verdict.reason && verdict.reason in LIMIT_MESSAGES ? verdict.reason : "daily";
    log("warn", "assistant.limit_hit", { reason });
    return reply(429, `limit_${reason}`, LIMIT_MESSAGES[reason]);
  }

  const snapshot = await loadSnapshot(db);
  if (!snapshot.ok) {
    log("error", "assistant.snapshot_failed", { code: snapshot.code });
    return reply(503, "data_unavailable", "Não consegui ler seus dados agora. Tente de novo em instantes.");
  }

  const run = await runAssistant({
    provider,
    data: snapshot.value.data,
    today: todayKey(now()),
    message: body.data.message,
    newId: deps.newId ?? (() => crypto.randomUUID()),
    signal: AbortSignal.timeout(AI_DEADLINE_MS),
  });

  // O gasto de tokens é registrado mesmo quando a resposta falhou: foi dinheiro gasto.
  const tokens = run.usage.inputTokens + run.usage.outputTokens;
  if (tokens > 0) {
    const recorded = await db.rpc("ai_record", { p_tokens: tokens });
    if (recorded.error) log("error", "assistant.record_failed", { code: recorded.error.code ?? "unknown" });
  }

  const common = { tokens, ms: now() - startedAt, tools: run.toolsCalled, provider: provider.name };
  if (run.reply) {
    log("info", "assistant.reply", { ...common, status: 200, proposal: Boolean(run.reply.proposal) });
    return { status: 200, body: { reply: run.reply } };
  }
  const failure = failureResponse(run.failure?.kind ?? "bad_response");
  log("warn", "assistant.failed", { ...common, status: failure.status, kind: run.failure?.kind ?? "unknown" });
  return failure;
}
