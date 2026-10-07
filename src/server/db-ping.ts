import type { RpcClient } from "./commands";

/** Ping de 1 consulta barata (`select now()`) com prazo. Nunca lança: falha vira `ok: false`. */
export async function pingDatabase(client: RpcClient, timeoutMs = 5000, now: () => number = Date.now): Promise<{ ok: boolean; ms: number }> {
  const started = now();
  try {
    const result = await Promise.race([
      Promise.resolve(client.rpc("ping")),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return { ok: !result.error, ms: now() - started };
  } catch {
    return { ok: false, ms: now() - started };
  }
}
