import { userFromClaims } from "@/server/auth-claims";
import { handleAssistant } from "@/server/ai/handler";
import { createProvider } from "@/server/ai/factory";
import { getEnv } from "@/server/env";
import { isSameOrigin, json, liveOnly } from "@/server/http";
import { createSupabase } from "@/server/supabase";

/** Cada pergunta pode envolver até 3 chamadas ao modelo; o limite do servidor sobra de folga. */
export const maxDuration = 30;

export async function POST(request: Request) {
  const off = liveOnly();
  if (off) return off;

  const env = getEnv();
  const supabase = await createSupabase();

  const { status, body } = await handleAssistant({
    request,
    provider: createProvider(env),
    limits: { dailyRequests: env.AI_DAILY_REQUEST_LIMIT, perMinute: env.AI_PER_MINUTE_LIMIT, monthlyTokens: env.AI_MONTHLY_TOKEN_BUDGET },
    getUser: () => userFromClaims(supabase),
    db: supabase,
    isSameOrigin,
  });
  return json(body, { status });
}
