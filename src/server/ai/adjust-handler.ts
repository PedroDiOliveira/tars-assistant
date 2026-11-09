import type { SuggestedChange } from "@/domain/training-adjust";
import { parsePlanProposal } from "@/domain/training-proposal";
import type { AuthUser } from "../auth-claims";
import { loadSnapshot, type RpcClient } from "../commands";
import { log } from "../log";
import type { AssistantLimits } from "./handler";
import { ADJUST_PROMPT_VERSION, MAX_ADJUST_TEXT, adjustPlan } from "./plan-adjust";
import type { LlmProvider } from "./provider";

/** Uma chamada só, curta: se a IA não responder nisso, a pessoa usa os chips. */
export const ADJUST_DEADLINE_MS = 20_000;
/** O rascunho inteiro vai no corpo (ele vive no aparelho): ~6–15 KB num plano de 6 treinos. */
const MAX_BODY_BYTES = 48 * 1024;

export interface AdjustHandlerDeps {
  request: Request;
  ai: { provider: LlmProvider; model: string } | null;
  limits: AssistantLimits;
  getUser: () => Promise<AuthUser | null>;
  db: RpcClient;
  isSameOrigin: (request: Request) => boolean;
  now?: () => number;
}

export interface AdjustHandlerResponse {
  status: number;
  body: { changes: SuggestedChange[]; message: string | null; model: string; promptVersion: string } | { error: string; message: string };
}

const reply = (status: number, error: string, message: string): AdjustHandlerResponse => ({ status, body: { error, message } });

const USE_CHIPS = "Por enquanto, use as opções acima.";

/**
 * `POST /api/training/plan/adjust` `{ proposal, text }`: sugestões da IA para o rascunho. Não grava nada (o rascunho
 * vive no aparelho; a pessoa escolhe o que aplicar). O texto livre não vai para log nem banco.
 *
 * Ordem das defesas (o provedor é o ÚLTIMO): origem -> tipo -> tamanho -> sessão -> corpo -> IA ligada -> respostas
 * salvas -> limites -> IA.
 */
export async function handleAdjust(deps: AdjustHandlerDeps): Promise<AdjustHandlerResponse> {
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

  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return reply(413, "too_large", "Pedido grande demais.");
  let body: { proposal?: unknown; text?: unknown } | null;
  try {
    body = JSON.parse(raw) as { proposal?: unknown; text?: unknown } | null;
  } catch {
    return reply(400, "bad_request", "Pedido inválido.");
  }
  const proposal = parsePlanProposal(body?.proposal);
  if (!proposal) return reply(400, "bad_proposal", "Este rascunho não é mais válido. Gere o plano de novo.");
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return reply(400, "empty_text", "Escreva o que você quer mudar.");
  if (text.length > MAX_ADJUST_TEXT) return reply(400, "text_too_long", `Use no máximo ${MAX_ADJUST_TEXT} caracteres.`);

  if (!deps.ai) return reply(409, "ai_off", `A IA não está ligada neste app. ${USE_CHIPS}`);

  const snapshot = await loadSnapshot(db);
  if (!snapshot.ok) {
    log("error", "plan_adjust.snapshot_failed", { code: snapshot.code });
    return reply(503, "data_unavailable", "Não consegui ler seus dados agora. Tente de novo em instantes.");
  }
  const profile = snapshot.value.data.trainingProfile;
  if (!profile) return reply(409, "no_profile", "Responda às perguntas do plano antes de ajustar.");

  // Limites ANTES da chamada paga (os mesmos do assistente e da geração).
  const reserved = await db.rpc("ai_reserve", {
    p_daily_limit: limits.dailyRequests,
    p_monthly_tokens: limits.monthlyTokens,
    p_per_minute: limits.perMinute,
  });
  const verdict = reserved.data as { allowed?: boolean } | null;
  if (reserved.error || verdict?.allowed !== true) {
    log(reserved.error ? "error" : "warn", "plan_adjust.limit", { code: reserved.error?.code ?? "limit" });
    return reserved.error
      ? reply(503, "limits_unavailable", `Não consegui conferir o limite de uso da IA agora. ${USE_CHIPS}`)
      : reply(429, "ai_limit", `A IA atingiu o limite de uso por agora. ${USE_CHIPS}`);
  }

  const result = await adjustPlan({ ai: deps.ai, profile, proposal, exercises: snapshot.value.data.exercises, text, signal: AbortSignal.timeout(ADJUST_DEADLINE_MS) });

  const tokens = result.usage.inputTokens + result.usage.outputTokens;
  if (tokens > 0) {
    const recorded = await db.rpc("ai_record", { p_tokens: tokens });
    if (recorded.error) log("error", "plan_adjust.record_failed", { code: recorded.error.code ?? "unknown" });
  }
  // Só contagens: nada do texto nem do plano.
  log("info", "plan_adjust.done", {
    ok: result.ok,
    failure: result.failure ?? null,
    changes: result.changes.length,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    ms: now() - startedAt,
  });

  if (!result.ok) {
    if (result.failure === "rate_limited") return reply(429, "ai_provider_limit", `A IA está no limite agora. ${USE_CHIPS}`);
    return reply(502, "ai_unavailable", `A IA não conseguiu sugerir agora. Tente de novo ou ${USE_CHIPS.toLowerCase()}`);
  }
  const message =
    result.message ?? (result.changes.length ? null : "Não achei uma mudança que caiba nas opções deste plano. Tente dizer de outro jeito.");
  return { status: 200, body: { changes: result.changes, message, model: deps.ai.model, promptVersion: ADJUST_PROMPT_VERSION } };
}
