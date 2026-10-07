import type { RpcClient } from "@/server/commands";
import type { DbError } from "@/server/db-errors";
import type { PgError, TestDb } from "./harness";

/**
 * Um "supabase.rpc" que fala com o banco de teste como um usuário logado, no formato de erro do PostgREST
 * ({ code, message, status }). `userId = null` simula uma requisição sem sessão válida.
 * Os argumentos nomeados viram `fn(p_nome := $1, ...)`; objetos viram jsonb.
 */
export function rpcClientFor(db: TestDb, userId: string | null): RpcClient {
  return {
    async rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const params = keys.map((k) => (typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k]));
      const call = keys.map((k, i) => `${k} := $${i + 1}${typeof args[k] === "object" && args[k] !== null ? "::jsonb" : ""}`).join(", ");
      try {
        const rows = await db.as(userId ?? "", (s) => s.query<{ r: unknown }>(`select public.${fn}(${call}) as r`, params));
        return { data: rows[0].r, error: null };
      } catch (e) {
        const err = e as PgError;
        const error: DbError = { code: err.code, message: err.message, status: 400 };
        return { data: null, error };
      }
    },
  };
}
