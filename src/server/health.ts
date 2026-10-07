export interface HealthInput {
  /** o banco respondeu ao ping? `ms` é a latência */
  database: { ok: boolean; ms: number };
  aiConfigured: boolean;
  /** só quem está logado vê os detalhes */
  authenticated: boolean;
}

export type HealthBody =
  | { status: "ok" | "degraded" }
  | { status: "ok" | "degraded"; database: { ok: boolean; ms: number }; ai: "configured" | "off" };

/**
 * Corpo do /api/health. Público ele diz só se está tudo bem; os detalhes (latência do banco, IA ligada ou não)
 * só aparecem para quem está logado. Nunca devolve valores de configuração, chaves nem URLs.
 */
export function healthBody({ database, aiConfigured, authenticated }: HealthInput): HealthBody {
  const status = database.ok ? "ok" : "degraded";
  if (!authenticated) return { status };
  return { status, database: { ok: database.ok, ms: Math.round(database.ms) }, ai: aiConfigured ? "configured" : "off" };
}
