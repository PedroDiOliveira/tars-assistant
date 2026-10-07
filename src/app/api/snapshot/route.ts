import type { SnapshotPayload } from "@/data/remote/payload";
import { userFromClaims } from "@/server/auth-claims";
import { loadSnapshot } from "@/server/commands";
import { providerLabel } from "@/server/ai/factory";
import { aiEnabled, getEnv } from "@/server/env";
import { json, liveOnly, unauthorized } from "@/server/http";
import { createSupabase } from "@/server/supabase";

/** Estado completo do usuário logado: uma ida ao banco (`get_snapshot`), sob o RLS dele. */
export async function GET() {
  const off = liveOnly();
  if (off) return off;

  const supabase = await createSupabase();
  const user = await userFromClaims(supabase);
  if (!user) return unauthorized();

  const result = await loadSnapshot(supabase);
  if (!result.ok) {
    const status = result.code === "unauthorized" ? 401 : result.code === "offline" ? 503 : 500;
    return json({ error: result.code, message: result.error }, { status });
  }

  const payload: SnapshotPayload = {
    data: result.value.data,
    profile: result.value.profile,
    user: { email: user.email },
    serverNow: result.value.serverNow,
    capabilities: { ai: aiEnabled(), aiProvider: providerLabel(getEnv().AI_PROVIDER) },
  };
  return json(payload);
}
