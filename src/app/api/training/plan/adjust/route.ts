import { userFromClaims } from "@/server/auth-claims";
import { handleAdjust } from "@/server/ai/adjust-handler";
import { createPlanProvider } from "@/server/ai/factory";
import { getEnv } from "@/server/env";
import { isSameOrigin, json, liveOnly } from "@/server/http";
import { createSupabase } from "@/server/supabase";

/** Uma chamada curta ao modelo (até 20 s); o limite do servidor sobra de folga. */
export const maxDuration = 30;

export async function POST(request: Request) {
  const off = liveOnly();
  if (off) return off;

  const env = getEnv();
  const supabase = await createSupabase();

  const { status, body } = await handleAdjust({
    request,
    ai: createPlanProvider(env),
    limits: { dailyRequests: env.AI_DAILY_REQUEST_LIMIT, perMinute: env.AI_PER_MINUTE_LIMIT, monthlyTokens: env.AI_MONTHLY_TOKEN_BUDGET },
    getUser: () => userFromClaims(supabase),
    db: supabase,
    isSameOrigin,
  });
  return json(body, { status });
}
