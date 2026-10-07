import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { IS_LIVE } from "@/lib/app-mode";
import { decideAccess } from "@/server/access";
import { userFromClaims } from "@/server/auth-claims";
import { isHttps, sessionCookieOptions } from "@/server/session-cookie";

/**
 * Renova a sessão do Supabase a cada requisição (Server Components não conseguem gravar cookies) e faz o
 * redirecionamento otimista de quem não está logado. NÃO é autorização: veja `requireUser()`.
 *
 * Em modo demo não há login nem servidor de dados: passa direto.
 */
export async function proxy(request: NextRequest) {
  if (!IS_LIVE) return NextResponse.next();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // O deploy está mal configurado (instrumentation.ts já derruba a subida; isto é só o cinto de segurança).
    return new NextResponse("Servidor mal configurado.", { status: 500 });
  }

  const https = isHttps(request.headers);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        // 1) o resto desta requisição enxerga o token renovado; 2) o navegador recebe os cookies novos.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, sessionCookieOptions(options, https));
        // Cabeçalhos de cache privado: sem eles uma CDN poderia servir o token de uma pessoa a outra.
        for (const [header, value] of Object.entries(headers)) response.headers.set(header, value);
      },
    },
  });

  const user = await userFromClaims(supabase);
  const access = decideAccess(request.nextUrl.pathname, user !== null);

  if (access.action === "next") return response;

  const blocked =
    access.action === "unauthorized"
      ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL(access.to, request.url));
  // A resposta bloqueada também leva os cookies renovados (ex.: sessão expirada que acabou de ser limpa).
  for (const cookie of response.cookies.getAll()) blocked.cookies.set(cookie);
  blocked.headers.set("Cache-Control", "private, no-store");
  return blocked;
}

export const config = {
  // Fora do proxy: arquivos estáticos e metadados públicos (nunca carregam dados).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon|apple-icon|startup/|sw\\.js|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
