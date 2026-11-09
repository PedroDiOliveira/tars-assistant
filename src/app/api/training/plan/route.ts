import { userFromClaims } from "@/server/auth-claims";
import { createPlanProvider } from "@/server/ai/factory";
import { handlePlan } from "@/server/ai/plan-handler";
import { getEnv } from "@/server/env";
import { isSameOrigin, json, liveOnly } from "@/server/http";
import { createSupabase } from "@/server/supabase";

/** Até 2 chamadas ao modelo (a segunda só se a primeira vier fora das regras); o limite do servidor sobra de folga. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const off = liveOnly();
  if (off) return off;

  const env = getEnv();
  const supabase = await createSupabase();

  const { status, body } = await handlePlan({
    request,
    ai: createPlanProvider(env),
    limits: { dailyRequests: env.AI_DAILY_REQUEST_LIMIT, perMinute: env.AI_PER_MINUTE_LIMIT, monthlyTokens: env.AI_MONTHLY_TOKEN_BUDGET },
    getUser: () => userFromClaims(supabase),
    db: supabase,
    isSameOrigin,
  });
  return json(body, { status });
}
