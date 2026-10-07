import type { AssistantReply } from "@/domain/assistant";
import { fail, ok, type AssistantApi, type FailureCode } from "../contract";
import { goToLogin } from "./query";

const REPLY_SHAPE = (value: unknown): value is { reply: AssistantReply } =>
  typeof value === "object" && value !== null && typeof (value as { reply?: { text?: unknown } }).reply?.text === "string";

/** Pergunta ao assistente no servidor. Nunca lança: toda falha vira uma mensagem em português para a tela. */
export const remoteAssistant: AssistantApi = {
  async ask(message) {
    let response: Response;
    try {
      response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      return fail("Sem conexão com o servidor. Use o formulário para lançar manualmente.", "offline");
    }

    const body: unknown = await response.json().catch(() => null);
    if (response.ok && REPLY_SHAPE(body)) return ok(body.reply);

    if (response.status === 401) {
      goToLogin();
      return fail("Sua sessão expirou. Entre de novo.", "unauthorized");
    }
    const serverMessage = (body as { message?: unknown } | null)?.message;
    const code: FailureCode = response.status === 504 || response.status === 503 ? "offline" : "unknown";
    return fail(typeof serverMessage === "string" ? serverMessage : "O assistente não respondeu. Use o formulário por enquanto.", code);
  },
};
