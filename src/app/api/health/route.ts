import { userFromClaims } from "@/server/auth-claims";
import { pingDatabase } from "@/server/db-ping";
import { aiEnabled } from "@/server/env";
import { healthBody } from "@/server/health";
import { json, liveOnly } from "@/server/http";
import { createSupabase } from "@/server/supabase";

/** Público e mínimo (status); quem está logado vê também a latência do banco e se a IA está ligada. */
export async function GET() {
  const off = liveOnly();
  if (off) return off;

  const supabase = await createSupabase();
  const [database, user] = await Promise.all([pingDatabase(supabase), userFromClaims(supabase)]);
  const body = healthBody({ database, aiConfigured: aiEnabled(), authenticated: user !== null });
  return json(body, { status: database.ok ? 200 : 503 });
}
