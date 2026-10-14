"use server";

import { fail, type Result } from "@/data/contract";
import { IS_LIVE } from "@/lib/app-mode";
import { userFromClaims } from "../auth-claims";
import { saveDisplayName } from "../profile";
import { createSupabase } from "../supabase";

/**
 * Altera o nome de exibição da conta. O Next já confere a origem (CSRF) das Server Actions; a sessão é verificada
 * aqui mesmo com o proxy na frente (o proxy é só otimização) e o argumento é tratado como entrada não confiável.
 */
export async function updateDisplayName(raw: unknown): Promise<Result<{ displayName: string }>> {
  if (!IS_LIVE) return fail("O servidor de dados não está ativo neste modo.", "unknown");
  const supabase = await createSupabase();
  if (!(await userFromClaims(supabase))) {
    return fail("Sua sessão expirou. Entre de novo.", "unauthorized");
  }
  return saveDisplayName(supabase, raw);
}
