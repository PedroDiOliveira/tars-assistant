import type { AssistantReply } from "@/domain/assistant";
import type { AppData } from "@/domain/snapshot";
import type { DateKey } from "@/lib/dates";
import { systemPrompt } from "./prompt";
import { ProviderError, type ChatMessage, type LlmProvider, type ProviderErrorKind } from "./provider";
import { runTool, TOOL_DEFINITIONS } from "./tools";

/** No máximo isto de chamadas ao modelo por pergunta (resposta direta = 1; com ferramenta = 2). */
export const MAX_MODEL_CALLS = 3;
export const MAX_OUTPUT_TOKENS = 500;
const MAX_REPLY_CHARS = 1500;

export const PROPOSAL_TEXT = "Entendi assim. Confira e confirme para eu salvar — nada foi salvo ainda.";
export const MULTIPLE_ENTRIES_TEXT = "Vi mais de um lançamento nessa mensagem. Envie um de cada vez para eu conseguir registrar certo.";

export type AssistantFailureKind = ProviderErrorKind | "too_many_steps" | "empty_reply";

export interface AssistantRun {
  reply?: AssistantReply;
  failure?: { kind: AssistantFailureKind; message: string };
  usage: { inputTokens: number; outputTokens: number };
  /** nomes das ferramentas chamadas (para log; nunca o conteúdo) */
  toolsCalled: string[];
}

export interface AssistantInput {
  provider: LlmProvider;
  data: AppData;
  today: DateKey;
  message: string;
  /** gera o id estável de uma proposta (vira o id do lançamento ao confirmar) */
  newId: () => string;
  signal: AbortSignal;
}

/**
 * Uma pergunta, do início ao fim: o modelo escolhe ferramentas, o servidor as executa com os dados do usuário, o
 * modelo redige. Garantias:
 *  - nada é gravado aqui (só há propostas);
 *  - no máximo MAX_MODEL_CALLS chamadas, sem novas tentativas em caso de erro;
 *  - ao propor um lançamento a conversa ENCERRA: o texto é fixo, o modelo não tem mais a palavra.
 */
export async function runAssistant(input: AssistantInput): Promise<AssistantRun> {
  const { provider, data, today, message, newId, signal } = input;
  const run: AssistantRun = { usage: { inputTokens: 0, outputTokens: 0 }, toolsCalled: [] };
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(today) },
    { role: "user", content: message },
  ];
  let lastPeriod: string | undefined;

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    let result;
    try {
      result = await provider.chat({ messages, tools: TOOL_DEFINITIONS, maxTokens: MAX_OUTPUT_TOKENS, signal });
    } catch (error) {
      if (error instanceof ProviderError) return { ...run, failure: { kind: error.kind, message: error.message } };
      throw error;
    }
    run.usage.inputTokens += result.usage.inputTokens;
    run.usage.outputTokens += result.usage.outputTokens;

    const { content, toolCalls } = result.message;
    if (toolCalls.length === 0) {
      const text = content?.trim();
      if (!text) return { ...run, failure: { kind: "empty_reply", message: "O assistente não devolveu resposta." } };
      return { ...run, reply: { text: text.slice(0, MAX_REPLY_CHARS), ...(lastPeriod ? { period: lastPeriod } : {}) } };
    }

    run.toolsCalled.push(...toolCalls.map((c) => c.name));

    // Vários lançamentos numa mensagem: a spec manda pedir um de cada vez, sem propor nenhum.
    if (toolCalls.filter((c) => c.name === "propose_transaction").length > 1) {
      return { ...run, reply: { text: MULTIPLE_ENTRIES_TEXT } };
    }

    messages.push({ role: "assistant", content, toolCalls });
    for (const toolCall of toolCalls) {
      const outcome = runTool(toolCall.name, toolCall.arguments, { data, today });
      if (outcome.kind === "proposal") {
        return { ...run, reply: { text: PROPOSAL_TEXT, proposal: { ...outcome.proposal, id: newId() } } };
      }
      if (outcome.kind === "result") {
        const label = (outcome.payload as { period?: { label?: unknown } }).period?.label;
        if (typeof label === "string") lastPeriod = label;
      }
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify(outcome.kind === "error" ? { error: outcome.message } : outcome.payload),
      });
    }
  }

  return { ...run, failure: { kind: "too_many_steps", message: "O assistente não conseguiu concluir." } };
}
