import { beforeAll, describe, expect, it } from "vitest";
import { TestDb, sqlMessage, sqlState, type Session } from "./harness";

let t: TestDb;
let A: string;
let B: string;

beforeAll(async () => {
  t = await TestDb.create();
  A = await t.createUser();
  B = await t.createUser();
});

type Reserve = { allowed: boolean; reason: "rate" | "daily" | "monthly" | null };
const reserve = (s: Session, daily = 5, monthly = 1000, perMinute = 100) =>
  s.query<{ r: Reserve }>("select public.ai_reserve($1, $2, $3) as r", [daily, monthly, perMinute]).then((rows) => rows[0].r);
const record = (s: Session, tokens: number) => s.query("select public.ai_record($1)", [tokens]);

const T0 = Date.UTC(2026, 9, 7, 15, 0); // 07/10/2026 12:00 em São Paulo

describe("limite diário", () => {
  it("permite até o teto e recusa a partir dele, dizendo o motivo", async () => {
    await t.setNow(T0);
    const out = await t.as(A, async (s) => {
      const results: Reserve[] = [];
      for (let i = 0; i < 7; i++) results.push(await reserve(s, 5, 1_000_000, 100));
      return results;
    });
    expect(out.map((r) => r.allowed)).toEqual([true, true, true, true, true, false, false]);
    expect(out[5]).toEqual({ allowed: false, reason: "daily" });
  });

  it("o contador é por usuário: B não é afetado pelo uso de A", async () => {
    await t.setNow(T0);
    expect(await t.as(B, (s) => reserve(s, 5, 1_000_000, 100))).toEqual({ allowed: true, reason: null });
  });

  it("vira no dia seguinte (fuso de São Paulo, não UTC)", async () => {
    // 08/10 02:30 UTC = 07/10 23:30 em São Paulo: ainda é o MESMO dia, o teto continua valendo
    await t.setNow(Date.UTC(2026, 9, 8, 2, 30));
    expect(await t.as(A, (s) => reserve(s, 5, 1_000_000, 100))).toEqual({ allowed: false, reason: "daily" });
    // 08/10 03:30 UTC = 08/10 00:30 em São Paulo: dia novo
    await t.setNow(Date.UTC(2026, 9, 8, 3, 30));
    expect(await t.as(A, (s) => reserve(s, 5, 1_000_000, 100))).toEqual({ allowed: true, reason: null });
  });
});

describe("limite por minuto", () => {
  it("recusa rajadas e libera quando a janela de 1 minuto passa", async () => {
    const C = await t.createUser();
    await t.setNow(T0);
    const burst = await t.as(C, async (s) => [await reserve(s, 100, 1e9, 3), await reserve(s, 100, 1e9, 3), await reserve(s, 100, 1e9, 3), await reserve(s, 100, 1e9, 3)]);
    expect(burst.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(burst[3].reason).toBe("rate");
    await t.setNow(T0 + 59_000);
    expect((await t.as(C, (s) => reserve(s, 100, 1e9, 3))).allowed).toBe(false);
    await t.setNow(T0 + 60_000);
    expect((await t.as(C, (s) => reserve(s, 100, 1e9, 3))).allowed).toBe(true);
  });

  it("uma chamada recusada NÃO consome o contador (só as permitidas contam)", async () => {
    const D = await t.createUser();
    await t.setNow(T0);
    await t.as(D, async (s) => {
      await reserve(s, 2, 1e9, 100);
      await reserve(s, 2, 1e9, 100);
      await reserve(s, 2, 1e9, 100); // recusada
      await reserve(s, 2, 1e9, 100); // recusada
    });
    const [row] = await t.admin<{ requests: number }>("select requests from public.ai_usage where user_id = $1", [D]);
    expect(row.requests).toBe(2);
  });
});

describe("orçamento mensal de tokens", () => {
  it("recusa quando o mês já gastou o orçamento, somando todos os dias do mês", async () => {
    const E = await t.createUser();
    await t.setNow(Date.UTC(2026, 9, 5, 15, 0));
    await t.as(E, async (s) => { await reserve(s, 100, 1000, 100); await record(s, 600); });
    await t.setNow(Date.UTC(2026, 9, 6, 15, 0));
    await t.as(E, async (s) => { await reserve(s, 100, 1000, 100); await record(s, 500); });
    await t.setNow(Date.UTC(2026, 9, 7, 15, 0));
    expect(await t.as(E, (s) => reserve(s, 100, 1000, 100))).toEqual({ allowed: false, reason: "monthly" });
  });

  it("o mês seguinte começa do zero", async () => {
    const F = await t.createUser();
    await t.setNow(Date.UTC(2026, 9, 28, 15, 0));
    await t.as(F, async (s) => { await reserve(s, 100, 1000, 100); await record(s, 5000); });
    expect((await t.as(F, (s) => reserve(s, 100, 1000, 100))).reason).toBe("monthly");
    await t.setNow(Date.UTC(2026, 10, 2, 15, 0));
    expect((await t.as(F, (s) => reserve(s, 100, 1000, 100))).allowed).toBe(true);
  });

  it("registrar tokens soma no dia, ignora negativos e limita valores absurdos", async () => {
    const G = await t.createUser();
    await t.setNow(T0);
    await t.as(G, async (s) => { await record(s, 100); await record(s, 50); await record(s, -999); await record(s, 99_999_999_999); });
    const [row] = await t.admin<{ tokens: string }>("select tokens from public.ai_usage where user_id = $1", [G]);
    expect(Number(row.tokens)).toBe(100 + 50 + 0 + 10_000_000);
  });
});

describe("segurança", () => {
  it("o usuário NÃO consegue zerar nem alterar os próprios contadores direto nas tabelas", async () => {
    await t.setNow(T0);
    await t.as(A, (s) => reserve(s, 100, 1e9, 100));
    for (const sql of [
      "update public.ai_usage set requests = 0",
      "delete from public.ai_usage",
      "insert into public.ai_usage (day, requests) values ('2026-10-07', 0)",
      "select * from public.ai_rate",
      "update public.ai_rate set calls = 0",
    ]) {
      expect(await t.as(A, (s) => sqlState(s.query(sql))), sql).toBe("42501");
    }
  });

  it("lê só o próprio uso (RLS), e anônimo não lê nada", async () => {
    await t.setNow(T0);
    await t.as(B, (s) => reserve(s, 100, 1e9, 100));
    const seenByA = await t.as(A, (s) => s.query<{ user_id: string }>("select user_id from public.ai_usage"));
    expect(seenByA.every((r) => r.user_id === A)).toBe(true);
    expect(await t.anon((s) => sqlState(s.query("select * from public.ai_usage")))).toBe("42501");
  });

  it("sem login não reserva nem registra", async () => {
    expect(await t.anon((s) => sqlState(s.query("select public.ai_reserve(1, 1, 1)")))).toBe("42501");
    expect(await t.anon((s) => sqlState(s.query("select public.ai_record(1)")))).toBe("42501");
    await t.pg.exec("set role authenticated");
    try {
      expect(await sqlMessage(t.pg.query("select public.ai_reserve(1, 1, 1)"))).toBe("Não autenticado.");
    } finally {
      await t.pg.exec("reset role");
    }
  });

  it("limites inválidos são recusados (não dá para desligar o teto com zero ou negativo)", async () => {
    await t.setNow(T0);
    expect(await t.as(A, (s) => sqlState(s.query("select public.ai_reserve(0, 100, 10)")))).toBe("22023");
    expect(await t.as(A, (s) => sqlState(s.query("select public.ai_reserve(10, -1, 10)")))).toBe("22023");
    expect(await t.as(A, (s) => sqlState(s.query("select public.ai_reserve(10, 100, 0)")))).toBe("22023");
  });
});
