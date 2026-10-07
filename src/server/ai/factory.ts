import type { Env } from "../env-schema";
import { createOpenAiCompatibleProvider } from "./openai-compatible";
import type { LlmProvider } from "./provider";

type ConfiguredProvider = Exclude<Env["AI_PROVIDER"], "none">;

/** Padrões de cada provedor. Todos falam a API de chat completions da OpenAI. */
const PROVIDERS: Record<ConfiguredProvider, { label: string; baseUrl: string }> = {
  xai: { label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
};

/** Nome mostrado ao usuário no aviso de consentimento (para QUEM as mensagens são enviadas). */
export function providerLabel(provider: Env["AI_PROVIDER"]): string | null {
  return provider === "none" ? null : PROVIDERS[provider].label;
}

/**
 * Parâmetros próprios de cada provedor/modelo. Modelos de RACIOCÍNIO gastam parte do limite de tokens "pensando"; com
 * o teto curto do assistente, isso pode esgotar o limite antes de qualquer resposta. Pedimos o menor esforço.
 */
export function extraBodyFor(provider: Env["AI_PROVIDER"], model: string): Record<string, unknown> {
  if (provider === "groq" && model.startsWith("openai/gpt-oss")) {
    return { reasoning_effort: "low", include_reasoning: false };
  }
  return {};
}

/** `null` = IA desligada ou incompleta; o resto do app não depende dela. */
export function createProvider(env: Env, fetchImpl?: typeof fetch): LlmProvider | null {
  if (env.AI_PROVIDER === "none" || !env.AI_API_KEY || !env.AI_MODEL) return null;
  return createOpenAiCompatibleProvider({
    name: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL ?? PROVIDERS[env.AI_PROVIDER].baseUrl,
    extraBody: extraBodyFor(env.AI_PROVIDER, env.AI_MODEL),
    fetchImpl,
  });
}
