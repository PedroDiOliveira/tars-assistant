/**
 * Contrato entre o assistente e QUALQUER provedor de LLM. O assistente só conhece isto; trocar de Grok para outro
 * provedor (ou de modelo) é escrever um adaptador novo, sem mexer em ferramentas, regras ou telas.
 */

export interface ToolCall {
  id: string;
  name: string;
  /** JSON em texto, como o provedor enviou. Quem usa valida com Zod: o modelo pode errar o formato. */
  arguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema dos argumentos. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
  signal: AbortSignal;
}

export interface ChatResult {
  message: { content: string | null; toolCalls: ToolCall[] };
  usage: { inputTokens: number; outputTokens: number };
}

export type ProviderErrorKind =
  | "timeout" // não respondeu a tempo
  | "rate_limited" // o provedor recusou por excesso de chamadas ou falta de crédito
  | "unauthorized" // chave inválida ou sem permissão
  | "unavailable" // fora do ar ou erro do lado dele
  | "bad_response"; // resposta que não segue o formato esperado

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface LlmProvider {
  readonly name: string;
  /** Uma única chamada, SEM novas tentativas: repetir poderia duplicar ações ou gastar sem controle. */
  chat(request: ChatRequest): Promise<ChatResult>;
}
