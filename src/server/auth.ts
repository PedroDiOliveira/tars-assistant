import "server-only";
import { userFromClaims, type AuthUser } from "./auth-claims";
import { createSupabase } from "./supabase";

export type { AuthUser, ClaimsClient } from "./auth-claims";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sessão ausente ou expirada.");
    this.name = "UnauthorizedError";
  }
}

export async function getUser(): Promise<AuthUser | null> {
  return userFromClaims(await createSupabase());
}

/**
 * Porta de entrada de TODA action e handler que toca dados. O proxy só faz uma checagem otimista de
 * redirecionamento; é aqui que a autorização de fato acontece (guia de autenticação do Next).
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
