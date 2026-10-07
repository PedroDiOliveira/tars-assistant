import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getEnv } from "./env";
import { isHttps, sessionCookieOptions } from "./session-cookie";

/** URL e chave publishable do Supabase; só existem (e só são exigidas) no modo live. */
export function supabaseConfig(): { url: string; key: string } {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY };
}

/**
 * Cliente Supabase da requisição atual, autenticado pelos cookies de sessão do usuário (JWT dele): o RLS
 * vale em tudo. É criado por requisição, nunca compartilhado; usa só a chave publishable, jamais a secret.
 *
 * Em Route Handlers e Server Actions os cookies podem ser gravados (renovação de token). Em um Server
 * Component não podem; nesse caso o proxy já renovou a sessão, então o erro é ignorado.
 */
export async function createSupabase() {
  // `cookies()` primeiro: ler dados da requisição encerra a prerenderização no build, então nenhuma rota que use
  // este cliente é gerada estaticamente (nem depende de variáveis de ambiente estarem presentes no build).
  const store = await cookies();
  const https = isHttps(await headers());
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, sessionCookieOptions(options, https));
        } catch {
          // Server Component: somente leitura. O proxy renova a sessão.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createSupabase>>;
