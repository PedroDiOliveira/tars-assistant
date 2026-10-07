/**
 * Leitura das claims do JWT. Fica separada de `auth.ts` (que importa `next/headers` e `server-only`) para poder
 * ser usada no proxy e testada sem o runtime do Next.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

/** Forma mínima do que usamos de `supabase.auth`, para poder testar sem rede. */
export interface ClaimsClient {
  auth: {
    getClaims(): Promise<{
      data: { claims: { sub?: string; email?: string } } | null;
      error: unknown;
    }>;
  };
}

/**
 * Usuário da requisição, ou null. Usa `getClaims()`, que VERIFICA a assinatura do JWT; nunca `getSession()`,
 * que no servidor confiaria em um cookie que o cliente pode forjar.
 */
export async function userFromClaims(client: ClaimsClient): Promise<AuthUser | null> {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string" || claims.sub === "") return null;
  return { id: claims.sub, email: claims.email ?? null };
}
