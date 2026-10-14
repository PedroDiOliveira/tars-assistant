import "server-only";
import { fail, ok, type Result } from "@/data/contract";
import { parseDisplayName } from "@/domain/profile";
import { translateDbError } from "./db-errors";
import type { RpcClient } from "./commands";

/**
 * Valida e grava o nome de exibição do usuário da requisição. A validação aqui é a que vale (o formulário só dá
 * feedback mais cedo): o argumento de uma Server Action é entrada não confiável, qualquer um pode chamá-la com o
 * que quiser. O dono da linha nunca vem do argumento: o banco usa o `auth.uid()` do JWT. Idempotente: repetir o
 * mesmo nome grava o mesmo valor.
 *
 * Devolve o nome COMO FICOU gravado (já normalizado), para a tela mostrar exatamente o que o servidor guardou.
 */
export async function saveDisplayName(client: RpcClient, raw: unknown): Promise<Result<{ displayName: string }>> {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) return fail(parsed.error, "validation");

  const { data, error } = await client.rpc("set_display_name", { p_name: parsed.name });
  if (error) return translateDbError(error);

  // Resposta fora do contrato: não afirmamos que salvou.
  if (typeof data !== "string" || data === "") {
    return fail("Resposta inesperada do servidor. Atualize a tela para conferir.", "unknown");
  }
  return ok({ displayName: data });
}
