import { z } from "zod";
import { isValidDateKey } from "@/lib/dates";
import type { AssistantReply } from "./assistant";
import { parseCardRefs } from "./assistant-cards";

/**
 * A proposta vem do servidor e vira um lançamento quando o usuário confirma: confere a forma antes de mostrar.
 * Os limites são os da ferramenta `propose_transaction` (valor até R$ 99.999.999,99; descrição até 200 caracteres).
 */
const proposalSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  type: z.enum(["income", "expense"]),
  amountCents: z.number().int().positive().max(9_999_999_999),
  description: z.string().max(200),
  occurredOn: z.string().refine((value) => isValidDateKey(value), { error: "Data inválida." }),
  categoryId: z.string().min(1).max(64),
});

/**
 * Lê a resposta do servidor. `null` = resposta inválida (o app mostra o erro genérico). Proposta malformada invalida a
 * resposta inteira (mostrar "confirme" sem um lançamento utilizável seria pior que falhar); referências de card
 * inválidas só são descartadas, e o texto continua valendo.
 */
export function parseAssistantReply(raw: unknown): AssistantReply | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.text !== "string") return null;

  const reply: AssistantReply = { text: value.text };
  if (typeof value.period === "string") reply.period = value.period;
  if (value.proposal !== undefined) {
    const proposal = proposalSchema.safeParse(value.proposal);
    if (!proposal.success) return null;
    reply.proposal = proposal.data;
  }
  const cards = parseCardRefs(value.cards);
  if (cards.length > 0) reply.cards = cards;
  return reply;
}
