import { splitOption } from "@/domain/training-splits";
import type { FallbackReason, PlanProposal } from "@/domain/training-proposal";
import { todayKey } from "@/lib/dates";
import type { AuthUser } from "../auth-claims";
import { loadSnapshot, type RpcClient } from "../commands";
import { log } from "../log";
import type { AssistantLimits } from "./handler";
import { generatePlan } from "./plan";
import type { LlmProvider } from "./provider";

/** Tempo total da geração com o provedor (vale para a nova tentativa também). */
export const PLAN_DEADLINE_MS = 40_000;
/** O pedido não tem corpo útil: só `{}`. */
const MAX_BODY_BYTES = 256;

export interface PlanHandlerDeps {
  request: Request;
  /** null = IA não configurada: o plano sai do modelo pronto */
  ai: { provider: LlmProvider; model: string } | null;
  limits: AssistantLimits;
  getUser: () => Promise<AuthUser | null>;
  db: RpcClient;
  isSameOrigin: (request: Request) => boolean;
  now?: () => number;
  newId?: () => string;
}

export interface PlanHandlerResponse {
  status: number;
  body: { proposal: PlanProposal } | { error: string; message: string };
}

const reply = (status: number, error: string, message: string): PlanHandlerResponse => ({ status, body: { error, message } });

/**
 * `POST /api/training/plan`: gera uma PROPOSTA de plano a partir das respostas já salvas. Não grava nada no banco além
 * do uso da IA: a proposta volta para o aparelho, e só o plano aceito é salvo (comando `training.applyPlan`).
 *
 * Ordem das defesas (o provedor de IA é o ÚLTIMO): origem -> tipo do conteúdo -> tamanho -> sessão -> dados -> respostas
 * salvas -> limites -> IA. Limite atingido ou IA fora do ar NÃO é erro para a pessoa: o plano sai do modelo pronto.
 */
export async function handlePlan(deps: PlanHandlerDeps): Promise<PlanHandlerResponse> {
  const { request, db, limits } = deps;
  const now = deps.now ?? Date.now;
  const startedAt = now();

  if (!deps.isSameOrigin(request)) return reply(403, "forbidden", "Pedido de origem não permitida.");
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return reply(415, "unsupported_media_type", "Envie o pedido como JSON.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return reply(413, "too_large", "Pedido grande demais.");

  const user = await deps.getUser();
  if (!user) return reply(401, "unauthorized", "Sua sessão expirou. Entre de novo.");

  // Corpo opcional: { split } = a divisão escolhida no rascunho. Qualquer outra coisa é ignorada; divisão que não existe
  // ou que não cabe nos dias vira o padrão das regras (nunca um erro).
  const body: unknown = await request.json().catch(() => null);
  const wanted = (body as { split?: unknown } | null)?.split;
  const split = typeof wanted === "string" && splitOption(wanted) ? wanted : undefined;

  const snapshot = await loadSnapshot(db);
  if (!snapshot.ok) {
    log("error", "plan.snapshot_failed", { code: snapshot.code });
    return reply(503, "data_unavailable", "Não consegui ler seus dados agora. Tente de novo em instantes.");
  }
  const { data } = snapshot.value;
  const profile = data.trainingProfile;
  if (!profile) return reply(409, "no_profile", "Responda às perguntas do plano antes de gerar.");

  // Limites ANTES de qualquer chamada paga. Sem como conferir, ou no limite: modelo pronto, nunca a IA às cegas.
  let ai = deps.ai;
  let blocked: FallbackReason | null = null;
  if (ai) {
    const reserved = await db.rpc("ai_reserve", {
      p_daily_limit: limits.dailyRequests,
      p_monthly_tokens: limits.monthlyTokens,
      p_per_minute: limits.perMinute,
    });
    const verdict = reserved.data as { allowed?: boolean } | null;
    if (reserved.error || verdict?.allowed !== true) {
      log(reserved.error ? "error" : "warn", "plan.limit", { code: reserved.error?.code ?? "limit" });
      ai = null;
      blocked = reserved.error ? "ai_unavailable" : "ai_limit";
    }
  }

  const result = await generatePlan({
    ai,
    profile,
    data,
    today: todayKey(now()),
    id: (deps.newId ?? (() => crypto.randomUUID()))(),
    nowMs: now(),
    signal: AbortSignal.timeout(PLAN_DEADLINE_MS),
    split,
  });
  const proposal = blocked ? { ...result.proposal, fallback: blocked } : result.proposal;

  // O gasto de tokens é registrado mesmo quando o plano saiu do modelo pronto: foi dinheiro gasto.
  const tokens = result.usage.inputTokens + result.usage.outputTokens;
  if (tokens > 0) {
    const recorded = await db.rpc("ai_record", { p_tokens: tokens });
    if (recorded.error) log("error", "plan.record_failed", { code: recorded.error.code ?? "unknown" });
  }

  // Só contagens: o log nunca guarda as respostas da pessoa nem o plano.
  log("info", "plan.generated", {
    source: proposal.source,
    fallback: proposal.fallback ?? null,
    attempts: result.attempts,
    repaired: result.repaired,
    tokens,
    ms: now() - startedAt,
    slots: Object.keys(proposal.choices).length,
    split: proposal.skeleton.option ?? null,
  });
  return { status: 200, body: { proposal } };
}
