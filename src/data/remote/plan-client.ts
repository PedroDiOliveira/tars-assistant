import { PRINCIPLE_IDS } from "@/domain/training-evidence";
import { validSuggestions, type SuggestedChange } from "@/domain/training-adjust";
import { parsePlanProposal } from "@/domain/training-proposal";
import { fail, ok, type FailureCode, type TrainingPlanApi } from "../contract";
import { goToLogin } from "./query";

/** Pede uma proposta de plano ao servidor. Nunca lança: toda falha vira uma mensagem em português para a tela. */
export const remoteTrainingPlan: TrainingPlanApi = {
  async generate(options = {}) {
    let response: Response;
    try {
      response = await fetch("/api/training/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(options.split ? { split: options.split } : {}),
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      return fail("Sem conexão com o servidor. Tente de novo quando estiver online.", "offline");
    }

    const body: unknown = await response.json().catch(() => null);
    const proposal = response.ok ? parsePlanProposal((body as { proposal?: unknown } | null)?.proposal) : null;
    if (proposal) return ok(proposal);

    if (response.status === 401) {
      goToLogin();
      return fail("Sua sessão expirou. Entre de novo.", "unauthorized");
    }
    const serverMessage = (body as { message?: unknown } | null)?.message;
    const code: FailureCode = response.status === 503 ? "offline" : "unknown";
    return fail(typeof serverMessage === "string" ? serverMessage : "Não consegui montar o plano agora. Tente de novo.", code);
  },

  async adjust(proposal, text) {
    let response: Response;
    try {
      response = await fetch("/api/training/plan/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal, text }),
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      return fail("Sem conexão com o servidor. Tente de novo quando estiver online.", "offline");
    }
    const body = (await response.json().catch(() => null)) as { changes?: unknown; message?: unknown; model?: unknown; promptVersion?: unknown } | null;
    if (response.status === 401) {
      goToLogin();
      return fail("Sua sessão expirou. Entre de novo.", "unauthorized");
    }
    const message = typeof body?.message === "string" ? body.message : null;
    if (!response.ok || !Array.isArray(body?.changes)) return fail(message ?? "Não consegui sugerir agora. Tente de novo.", "unknown");
    // O que veio do servidor passa de novo pelas regras do aparelho: só entra o que vale NESTE rascunho.
    const shaped = (body.changes as SuggestedChange[]).filter(
      (c) => c && typeof c.reason === "string" && PRINCIPLE_IDS.includes(c.principle) && c.change && typeof c.change.slotId === "string",
    );
    return ok({
      changes: validSuggestions(proposal, shaped).slice(0, 3),
      message,
      ...(typeof body.model === "string" ? { model: body.model.slice(0, 100) } : {}),
      promptVersion: typeof body.promptVersion === "string" ? body.promptVersion.slice(0, 40) : "ajuste",
    });
  },
};
