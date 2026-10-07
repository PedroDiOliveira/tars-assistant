"use server";

import type { Outcome } from "@/domain/commands";
import { fail, type Result } from "@/data/contract";
import { IS_LIVE } from "@/lib/app-mode";
import { userFromClaims } from "../auth-claims";
import { executeCommand } from "../commands";
import { createSupabase } from "../supabase";

/**
 * Único ponto de escrita do app em modo live. O Next já checa a origem (CSRF) das Server Actions.
 * Autoriza SEMPRE aqui, mesmo com o proxy na frente: o proxy é só otimização.
 */
export async function runCommand(raw: unknown): Promise<Result<Outcome>> {
  if (!IS_LIVE) return fail("O servidor de dados não está ativo neste modo.", "unknown");
  const supabase = await createSupabase();
  if (!(await userFromClaims(supabase))) {
    return fail("Sua sessão expirou. Entre de novo.", "unauthorized");
  }
  return executeCommand(supabase, raw);
}
