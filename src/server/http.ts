import "server-only";
import { NextResponse } from "next/server";
import { IS_LIVE } from "@/lib/app-mode";

/** Respostas com dados do usuário nunca podem ser guardadas por CDN, proxy ou navegador compartilhado. */
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" } as const;

export function json(body: unknown, init: { status?: number } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: PRIVATE_HEADERS });
}

export const unauthorized = () => json({ error: "unauthorized" }, { status: 401 });
export const notFound = () => json({ error: "not_found" }, { status: 404 });

/** O backend só existe no modo live. No demo, estas rotas respondem 404 (não há nada para servir). */
export function liveOnly(): NextResponse | null {
  return IS_LIVE ? null : notFound();
}

/**
 * Route Handlers autenticados por cookie não têm a checagem de CSRF que o Next faz nas Server Actions.
 * Para métodos que mudam estado, exigimos que a origem seja a do próprio site. `Origin` é enviado pelo
 * navegador em todo POST; sua ausência é tratada como suspeita.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
