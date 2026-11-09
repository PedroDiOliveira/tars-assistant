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

/**
 * Provedor para gerar o plano de treino: o mesmo do chat ou, se configurado, outro modelo (`AI_PLAN_MODEL`). Devolve
 * também o nome do modelo, que fica gravado no plano aceito. O raciocínio continua no mínimo: com "medium", o
 * gpt-oss gastava o teto de saída pensando e o JSON de 5 dias saía cortado; e na camada gratuita da Groq o teto de
 * saída conta no limite de 8 mil tokens por minuto, então não dá para simplesmente aumentá-lo.
 */
export function createPlanProvider(env: Env, fetchImpl?: typeof fetch): { provider: LlmProvider; model: string } | null {
  const model = env.AI_PLAN_MODEL ?? env.AI_MODEL;
  if (env.AI_PROVIDER === "none" || !env.AI_API_KEY || !model) return null;
  const provider = createOpenAiCompatibleProvider({
    name: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    model,
    baseUrl: env.AI_BASE_URL ?? PROVIDERS[env.AI_PROVIDER].baseUrl,
    extraBody: extraBodyFor(env.AI_PROVIDER, model),
    fetchImpl,
  });
  return { provider, model };
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
