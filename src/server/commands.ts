import "server-only";
import type { Command, Outcome } from "@/domain/commands";
import { parseCommand } from "@/domain/command-schema";
import { fail, ok, type Result } from "@/data/contract";
import { translateDbError, type DbError } from "./db-errors";
import { parseSnapshot, type Snapshot } from "./snapshot";

/** O que usamos de `supabase.rpc`: facilita trocar por um banco de teste. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError | null }>;
}

const OUTCOMES: readonly Outcome[] = ["saved", "too_short", "none"];

function readOutcome(data: unknown): Outcome | null {
  const outcome = (data as { outcome?: unknown } | null)?.outcome;
  return typeof outcome === "string" && (OUTCOMES as readonly string[]).includes(outcome) ? (outcome as Outcome) : null;
}

/**
 * Valida e executa um comando no banco, com os direitos do usuário da requisição. Idempotente: o mesmo
 * comando repetido (toque duplo, nova tentativa depois de uma resposta perdida) não duplica nada.
 * `user_id` nunca vem do comando: o banco usa o do JWT.
 */
export async function executeCommand(client: RpcClient, raw: unknown): Promise<Result<Outcome>> {
  const parsed = parseCommand(raw);
  if (!parsed.ok) return fail(parsed.error, "validation");

  const { data, error } = await client.rpc("apply_command", { p_command: parsed.command satisfies Command });
  if (error) return translateDbError(error);

  const outcome = readOutcome(data);
  // Resposta fora do contrato: não afirmamos que salvou.
  if (!outcome) return fail("Resposta inesperada do servidor. Atualize a tela para conferir.", "unknown");
  return ok(outcome);
}

/** Lê o snapshot completo do usuário (uma ida ao banco) e valida o formato. */
export async function loadSnapshot(client: RpcClient): Promise<Result<Snapshot>> {
  const { data, error } = await client.rpc("get_snapshot");
  if (error) return translateDbError(error);
  try {
    return ok(parseSnapshot(data));
  } catch {
    // O banco devolveu algo que o domínio não entende: erro explícito, nunca dado pela metade.
    return fail("Não foi possível ler seus dados (formato inesperado).", "unknown");
  }
}
