import "server-only";
import { parseEnv, type Env } from "./env-schema";

export { EnvError, parseEnv, type Env } from "./env-schema";

let cached: Env | undefined;

/** Lê `process.env` uma única vez. Chamada na subida do servidor (instrumentation.ts) para falhar cedo. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** A IA só existe se o provedor estiver configurado; o resto do app nunca depende dela. */
export function aiEnabled(env: Env = getEnv()): boolean {
  return env.AI_PROVIDER !== "none";
}
