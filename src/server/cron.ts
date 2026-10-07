import { createHash, timingSafeEqual } from "node:crypto";

/**
 * A Vercel chama os crons com `Authorization: Bearer <CRON_SECRET>`. Sem o segredo certo ninguém dispara o job (ele
 * toca o banco). A comparação é em tempo constante e esconde até o tamanho do segredo (compara hashes SHA-256).
 */
export function isAuthorizedCron(request: Request, secret: string | undefined): boolean {
  if (!secret) return false; // sem segredo configurado, o endpoint fica fechado
  const header = request.headers.get("authorization") ?? "";
  const given = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}
