/**
 * Regras de acesso do proxy, como função pura. O proxy é só uma checagem OTIMISTA (evita mostrar uma tela que
 * vai falhar e cuida do redirecionamento); a autorização de verdade acontece em `requireUser()`, dentro de cada
 * Server Action e Route Handler, perto do dado.
 */

import { isPublicPage } from "@/lib/routes";

/**
 * APIs que cuidam da própria autenticação: o cron exige o segredo no cabeçalho, e o health é público (só diz se está
 * tudo bem; os detalhes dependem de sessão e são decididos no handler).
 */
function isSelfAuthenticatedApi(pathname: string): boolean {
  return pathname.startsWith("/api/cron/") || pathname === "/api/health";
}

export type Access =
  | { action: "next" }
  | { action: "redirect"; to: string }
  | { action: "unauthorized" };

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideAccess(pathname: string, authenticated: boolean): Access {
  const publicPage = isPublicPage(pathname);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (isApi) {
    if (isSelfAuthenticatedApi(pathname)) return { action: "next" };
    return authenticated ? { action: "next" } : { action: "unauthorized" };
  }

  if (!authenticated) return publicPage ? { action: "next" } : { action: "redirect", to: "/login" };

  // Logado não precisa ver o login de novo; redefinir senha continua acessível (é um fluxo próprio).
  if (isUnder(pathname, "/login") || isUnder(pathname, "/esqueci-senha")) return { action: "redirect", to: "/inicio" };
  return { action: "next" };
}
