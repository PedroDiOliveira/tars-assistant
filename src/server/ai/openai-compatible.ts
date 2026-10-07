import "server-only";
import { z } from "zod";
import { ProviderError, type ChatMessage, type ChatRequest, type ChatResult, type LlmProvider } from "./provider";

export interface OpenAiCompatibleOptions {
  /** nome curto do provedor, para logs ("xai", "groq") */
  name: string;
  apiKey: string;
  model: string;
  /** ex.: https://api.x.ai/v1 ou https://api.groq.com/openai/v1 */
  baseUrl: string;
  /** parâmetros próprios do provedor/modelo, mesclados ao corpo (ex.: esforço de raciocínio) */
  extraBody?: Record<string, unknown>;
  /** injetável para teste */
  fetchImpl?: typeof fetch;
}

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }).partial().nullish(),
});

function toWireMessage(message: ChatMessage) {
  switch (message.role) {
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolCalls?.length
          ? { tool_calls: message.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) }
          : {}),
      };
    case "tool":
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    default:
      return { role: message.role, content: message.content };
  }
}

/**
 * Adaptador para qualquer provedor com a API compatível com a da OpenAI (`POST {baseUrl}/chat/completions`), como
 * xAI (Grok) e Groq.
 * - Uma chamada, nenhuma nova tentativa automática.
 * - A chave só vai no cabeçalho `Authorization`; nunca aparece em mensagens de erro nem em logs.
 * - O corpo de erro do provedor não é repassado: pode conter trechos do que foi enviado.
 */
export function createOpenAiCompatibleProvider({ name, apiKey, model, baseUrl, extraBody = {}, fetchImpl = fetch }: OpenAiCompatibleOptions): LlmProvider {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    name,
    async chat(request: ChatRequest): Promise<ChatResult> {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: request.messages.map(toWireMessage),
            tools: request.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
            tool_choice: "auto",
            max_tokens: request.maxTokens,
            temperature: 0.2,
            ...extraBody,
          }),
          signal: request.signal,
          cache: "no-store",
        });
      } catch (error) {
        const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
        throw new ProviderError(aborted ? "timeout" : "unavailable", aborted ? "O provedor de IA demorou demais." : "Não foi possível falar com o provedor de IA.");
      }

      if (!response.ok) {
        const { status } = response;
        if (status === 401 || status === 403) throw new ProviderError("unauthorized", "O provedor de IA recusou a chave configurada.", status);
        if (status === 402 || status === 429) throw new ProviderError("rate_limited", "O provedor de IA recusou por limite de uso ou crédito.", status);
        if (status === 408 || status === 504) throw new ProviderError("timeout", "O provedor de IA demorou demais.", status);
        if (status >= 500) throw new ProviderError("unavailable", "O provedor de IA está indisponível.", status);
        throw new ProviderError("bad_response", `O provedor de IA recusou o pedido (HTTP ${status}).`, status);
      }

      const parsed = responseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new ProviderError("bad_response", "Resposta do provedor de IA fora do formato esperado.");

      const { message } = parsed.data.choices[0];
      return {
        message: {
          content: message.content ?? null,
          toolCalls: (message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
        },
        usage: {
          inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
          outputTokens: parsed.data.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}
