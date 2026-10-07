import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Command } from "@/domain/commands";
import { parseSnapshot, type Snapshot } from "@/server/snapshot";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

const SUPABASE_STUB = readFileSync(fileURLToPath(new URL("./supabase-stub.sql", import.meta.url)), "utf8");

export type Row = Record<string, unknown>;

/** Erro do Postgres como o PGlite o devolve: `code` é o SQLSTATE (ex.: 23505, 42501). */
export interface PgError extends Error {
  code?: string;
}

export interface Session {
  /** Consulta com os direitos do usuário (RLS aplicado). */
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Executa um comando como a API faria: `rpc('apply_command', { p_command })`. */
  command(command: Command): Promise<{ outcome: string }>;
  snapshot(): Promise<Snapshot>;
}

export class TestDb {
  private users = 0;

  private constructor(readonly pg: PGlite) {}

  static async create(): Promise<TestDb> {
    const pg = new PGlite();
    await pg.exec(SUPABASE_STUB);
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      try {
        await pg.exec(readFileSync(MIGRATIONS_DIR + file, "utf8"));
      } catch (error) {
        throw new Error(`Migração ${file} falhou: ${(error as Error).message}`, { cause: error });
      }
    }
    return new TestDb(pg);
  }

  /** Como o painel/as migrações: superusuário, ignora o RLS. */
  async admin<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  /** Cria um usuário em auth.users (o gatilho cria perfil e catálogos, como no cadastro real). */
  async createUser(options: { email?: string; displayName?: string } = {}): Promise<string> {
    this.users += 1;
    const email = options.email ?? `usuario${this.users}@tars.example`;
    const meta = options.displayName ? { display_name: options.displayName } : {};
    const rows = await this.admin<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
      [email, JSON.stringify(meta)],
    );
    return rows[0].id;
  }

  /** Fixa o "agora" do servidor (private.app_now). `null` volta ao relógio real. */
  async setNow(at: number | string | null): Promise<void> {
    const value = at === null ? "" : new Date(at).toISOString();
    await this.pg.query("select set_config('app.test_now', $1, false)", [value]);
  }

  /** Executa como um usuário logado: papel `authenticated` + o `sub` do JWT. */
  async as<T>(userId: string, run: (session: Session) => Promise<T>): Promise<T> {
    await this.pg.exec("set role authenticated");
    await this.pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    try {
      return await run(this.session());
    } finally {
      await this.pg.exec("reset role");
      await this.pg.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }

  /** Requisição sem login (papel `anon`). */
  async anon<T>(run: (session: Session) => Promise<T>): Promise<T> {
    await this.pg.exec("set role anon");
    try {
      return await run(this.session());
    } finally {
      await this.pg.exec("reset role");
    }
  }

  private session(): Session {
    const { pg } = this;
    return {
      query: async (sql, params = []) => (await pg.query(sql, params)).rows as never,
      command: async (command) => {
        const { rows } = await pg.query<{ r: { outcome: string } }>(
          "select public.apply_command($1::jsonb) as r",
          [JSON.stringify(command)],
        );
        return rows[0].r;
      },
      snapshot: async () => {
        const { rows } = await pg.query<{ s: unknown }>("select public.get_snapshot() as s");
        return parseSnapshot(rows[0].s);
      },
    };
  }
}

/** Código SQLSTATE de um erro lançado pelo banco, para asserções legíveis. */
export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as PgError).code;
  }
}

/** Mensagem do erro do banco. */
export async function sqlMessage(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}
