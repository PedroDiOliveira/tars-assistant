import { isAuthorizedCron } from "@/server/cron";
import { pingDatabase } from "@/server/db-ping";
import { getEnv } from "@/server/env";
import { json, liveOnly, unauthorized } from "@/server/http";
import { log } from "@/server/log";
import { createSupabase } from "@/server/supabase";

/**
 * Chamado uma vez por dia pelo cron da Vercel (vercel.json). O Supabase gratuito PAUSA o projeto depois de cerca de
 * 1 semana sem atividade; esta chamada conta como atividade. Só aceita o `CRON_SECRET`.
 */
export async function GET(request: Request) {
  const off = liveOnly();
  if (off) return off;
  if (!isAuthorizedCron(request, getEnv().CRON_SECRET)) return unauthorized();

  const database = await pingDatabase(await createSupabase());
  log(database.ok ? "info" : "error", "cron.keep_alive", { ok: database.ok, ms: Math.round(database.ms) });
  return json({ ok: database.ok }, { status: database.ok ? 200 : 503 });
}
