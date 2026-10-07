import type { CookieOptions } from "@supabase/ssr";

/**
 * Atributos dos cookies de sessão. O @supabase/ssr grava `httpOnly: false` por padrão porque o cliente de navegador
 * precisa lê-los; este app NÃO tem cliente Supabase no navegador (todo acesso é no servidor), então o JavaScript da
 * página não tem motivo para enxergar o token: com `httpOnly` uma falha de XSS não consegue roubá-lo.
 *
 * `secure` segue o protocolo da requisição, não o ambiente: na Vercel (https) o cookie nunca trafega em texto puro, e
 * quem abre o app por http na rede local (celular → `next start` no PC) continua conseguindo entrar, porque o navegador
 * descartaria um cookie `Secure` vindo de uma página http.
 */
export function sessionCookieOptions(options: CookieOptions, https: boolean): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: https };
}

/** A Vercel (e proxies em geral) informam o protocolo original em `x-forwarded-proto`. */
export function isHttps(headers: Pick<Headers, "get">): boolean {
  return headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}
