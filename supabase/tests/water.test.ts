import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uid } from "@/lib/id";
import { executeCommand, loadSnapshot, type RpcClient } from "@/server/commands";
import { TestDb, sqlMessage, sqlState } from "./harness";
import { rpcClientFor } from "./rpc-client";

/**
 * Água no banco: constraints, comandos, isolamento entre usuários, idempotência, imutabilidade e o relógio do
 * SERVIDOR (fuso do app) decidindo o dia e a janela "hoje e ontem". O espelho reducer <-> SQL está em parity.test.ts.
 */

let t: TestDb;
let A: string;
let B: string;
let clientA: RpcClient;
let clientB: RpcClient;

// 14/10/2026 12:00 em São Paulo (quarta-feira; a semana é 12..18)
const NOON = Date.UTC(2026, 9, 14, 15, 0);
/** Instante de "dia + hora" em São Paulo (UTC-3, sem horário de verão). */
const at = (day: string, hour: number, minute = 0) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);

beforeAll(async () => {
  t = await TestDb.create();
  A = await t.createUser({ email: "ana@tars.example" });
  B = await t.createUser({ email: "bruno@tars.example" });
  clientA = rpcClientFor(t, A);
  clientB = rpcClientFor(t, B);
  await t.setNow(NOON);
});
afterAll(async () => {
  await t.setNow(null);
});

const add = (intake: Record<string, unknown> = {}, nowMs = NOON) => ({
  type: "water.add",
  nowMs,
  intake: { id: uid(), at: NOON, ml: 500, ...intake },
});
const rows = (userId: string) =>
  t.admin<{ id: string; ml: number; user_id: string; ms: string; day: string }>(
    `select id, ml, user_id, (extract(epoch from occurred_at) * 1000)::bigint::text as ms,
            (occurred_at at time zone public.app_tz())::date::text as day
     from public.water_intakes where user_id = $1 order by occurred_at, id`,
    [userId],
  );

describe("tabela: constraints", () => {
  const insert = (over: Record<string, unknown> = {}) => {
    const row = { id: uid(), user_id: A, occurred_at: new Date(NOON).toISOString(), ml: 500, ...over };
    return t.admin("insert into public.water_intakes (id, user_id, occurred_at, ml) values ($1, $2, $3, $4)", [row.id, row.user_id, row.occurred_at, row.ml]);
  };

  it("ml: inteiro de 1 a 5000", async () => {
    await insert({ ml: 1 });
    await insert({ ml: 5000 });
    for (const bad of [0, -1, 5001]) expect(await sqlState(insert({ ml: bad })), String(bad)).toBe("23514");
    expect(await sqlState(insert({ ml: null }))).toBe("23502");
    expect(await sqlState(t.admin("insert into public.water_intakes (id, user_id, occurred_at, ml) values ($1, $2, $3, 'abc')", [uid(), A, new Date(NOON).toISOString()]))).toBe("22P02");
  });

  it("o instante é obrigatório", async () => {
    expect(await sqlState(insert({ occurred_at: null }))).toBe("23502");
  });

  it("vários registros no mesmo instante são permitidos (toques em rajada não colidem)", async () => {
    await insert();
    await insert();
    const [{ n }] = await t.admin<{ n: number }>("select count(*)::int as n from public.water_intakes where user_id = $1 and occurred_at = $2", [A, new Date(NOON).toISOString()]);
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("existe o índice por usuário e instante, e o RLS está ligado", async () => {
    const idx = await t.admin<{ indexdef: string }>("select indexdef from pg_indexes where tablename = 'water_intakes' and indexname = 'water_intakes_user_time_idx'");
    expect(idx[0]?.indexdef).toMatch(/\(user_id, occurred_at DESC, id\)/);
    const [{ rowsecurity }] = await t.admin<{ rowsecurity: boolean }>("select rowsecurity from pg_tables where tablename = 'water_intakes'");
    expect(rowsecurity).toBe(true);
  });

  it("o registro é imutável: não existe UPDATE nem coluna updated_at", async () => {
    const cols = await t.admin<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'water_intakes'");
    expect(cols.map((c) => c.column_name).sort()).toEqual(["created_at", "id", "ml", "occurred_at", "user_id"]);
    const privileges = await t.admin<{ privilege_type: string }>(
      "select privilege_type from information_schema.role_table_grants where table_name = 'water_intakes' and grantee = 'authenticated' order by 1");
    expect(privileges.map((p) => p.privilege_type)).toEqual(["DELETE", "INSERT", "SELECT"]);
  });
});

describe("comando water.add", () => {
  it("grava o instante EXATO em ms e o snapshot devolve o mesmo número (sem perder 1 ms)", async () => {
    const odd = 1_791_000_123_457; // ms terminado em 457: pegaria um arredondamento errado
    await t.setNow(odd + 5_000);
    const command = add({ at: odd, ml: 350 }, odd + 5_000);
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    const [row] = (await rows(A)).filter((r) => r.id === command.intake.id);
    expect(row).toMatchObject({ ml: 350, user_id: A, ms: String(odd) });
    const snap = await loadSnapshot(clientA);
    expect(snap.ok && snap.value.data.waterIntakes.find((w) => w.id === command.intake.id)).toEqual({ id: command.intake.id, at: odd, ml: 350 });
    await t.setNow(NOON);
  });

  it("o dono vem do login, nunca do comando", async () => {
    const command = add();
    await executeCommand(clientA, command);
    const [row] = (await rows(A)).filter((r) => r.id === command.intake.id);
    expect(row.user_id).toBe(A);
    expect((await rows(B)).some((r) => r.id === command.intake.id)).toBe(false);
  });

  it("repetir o MESMO id (toque duplo, resposta perdida) responde 'saved' sem duplicar nem alterar", async () => {
    const command = add({ ml: 500 });
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, add({ id: command.intake.id, ml: 1000 }))).toEqual({ ok: true, value: "saved" });
    const mine = (await rows(A)).filter((r) => r.id === command.intake.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].ml).toBe(500); // o primeiro vale
  });

  it("o id de OUTRO usuário nunca finge ter salvo: falha, e a linha do dono não muda", async () => {
    const command = add({ ml: 200 });
    await executeCommand(clientA, command);
    const result = await executeCommand(clientB, add({ id: command.intake.id, ml: 999 }));
    expect(result).toMatchObject({ ok: false, error: "Este identificador de registro de água já está em uso." });
    expect((await rows(A)).find((r) => r.id === command.intake.id)?.ml).toBe(200);
    expect((await rows(B)).some((r) => r.id === command.intake.id)).toBe(false);
  });

  it("a quantidade inválida é recusada com a mensagem do reducer (e nada é gravado)", async () => {
    const before = (await rows(A)).length;
    for (const ml of [0, -3, 5001]) {
      const message = await t.as(A, (s) => sqlMessage(s.command(add({ ml }) as never)));
      expect(message, String(ml)).toBe("Quantidade de água inválida.");
    }
    expect((await rows(A)).length).toBe(before);
  });
});

describe("a janela de horário e o fuso são os do servidor", () => {
  afterAll(async () => {
    await t.setNow(NOON);
  });

  const stateOf = (command: object) => executeCommand(clientA, command);

  it("até 5 min no futuro vale; além disso é recusado, com a mesma mensagem do reducer", async () => {
    await t.setNow(NOON);
    expect(await stateOf(add({ at: NOON + 5 * 60_000 }))).toEqual({ ok: true, value: "saved" });
    expect(await stateOf(add({ at: NOON + 5 * 60_000 + 1 }))).toEqual({ ok: false, code: "validation", error: "Horário no futuro." });
  });

  it("hoje e ontem valem; anteontem não", async () => {
    await t.setNow(NOON);
    expect(await stateOf(add({ at: at("2026-10-14", 0, 0) }))).toEqual({ ok: true, value: "saved" });
    expect(await stateOf(add({ at: at("2026-10-13", 0, 0) }))).toEqual({ ok: true, value: "saved" });
    expect(await stateOf(add({ at: at("2026-10-12", 23, 59) }))).toEqual({
      ok: false, code: "validation", error: "Só é possível registrar água de hoje e de ontem.",
    });
  });

  it("23h30 em São Paulo ainda é o dia 14 (embora já seja dia 15 em UTC): ontem é o dia 13", async () => {
    const late = Date.UTC(2026, 9, 15, 2, 30);
    await t.setNow(late);
    expect(await stateOf(add({ at: at("2026-10-13", 0, 0) }, late))).toEqual({ ok: true, value: "saved" });
    expect(await stateOf(add({ at: at("2026-10-12", 23, 59) }, late))).toMatchObject({ ok: false, error: "Só é possível registrar água de hoje e de ontem." });
  });

  it("00h30 em São Paulo já é o dia 15: ontem passa a ser o dia 14", async () => {
    const after = Date.UTC(2026, 9, 15, 3, 30);
    await t.setNow(after);
    expect(await stateOf(add({ at: at("2026-10-14", 0, 0) }, after))).toEqual({ ok: true, value: "saved" });
    expect(await stateOf(add({ at: at("2026-10-13", 23, 59) }, after))).toMatchObject({ ok: false });
  });

  it("o dia do registro é derivado do instante no fuso do app: 23h30 cai num dia, 00h30 no seguinte", async () => {
    await t.setNow(Date.UTC(2026, 9, 15, 12, 0));
    const [evening, morning] = [add({ at: at("2026-10-14", 23, 30) }), add({ at: at("2026-10-15", 0, 30) })];
    await stateOf(evening);
    await stateOf(morning);
    const all = await rows(A);
    expect(all.find((r) => r.id === evening.intake.id)?.day).toBe("2026-10-14");
    expect(all.find((r) => r.id === morning.intake.id)?.day).toBe("2026-10-15");
  });

  it("o nowMs do cliente NÃO decide: um relógio do aparelho adiantado não libera um horário futuro", async () => {
    await t.setNow(NOON);
    const cheat = { ...add({ at: NOON + 3_600_000 }), nowMs: NOON + 10 * 3_600_000 };
    expect(await stateOf(cheat)).toMatchObject({ ok: false, error: "Horário no futuro." });
  });

  it("vale também fora dos comandos: inserir direto na tabela com horário inválido é barrado pelo gatilho", async () => {
    await t.setNow(NOON);
    const insert = (when: number) => t.as(A, (s) => sqlState(s.query("insert into public.water_intakes (id, occurred_at, ml) values ($1, $2, 100)", [uid(), new Date(when).toISOString()])));
    expect(await insert(NOON + 3_600_000)).toBe("23514");
    expect(await insert(at("2026-10-12", 12))).toBe("23514");
    expect(await insert(NOON)).toBeUndefined();
  });

  it("registro retroativo de ontem não é barrado pelo relógio; o antigo continua podendo ser REMOVIDO", async () => {
    await t.setNow(NOON);
    const old = add({ at: at("2026-10-13", 20) });
    await stateOf(old);
    await t.setNow(Date.UTC(2026, 9, 30, 12)); // semanas depois: o registro já é "antigo demais" para criar
    expect(await stateOf({ type: "water.remove", id: old.intake.id })).toEqual({ ok: true, value: "saved" });
    expect((await rows(A)).some((r) => r.id === old.intake.id)).toBe(false);
  });
});

describe("comando water.remove", () => {
  it("remove só o registro do dono, e remover o que não existe não é erro", async () => {
    await t.setNow(NOON);
    const [x, y] = [add({ ml: 100 }), add({ ml: 200 })];
    await executeCommand(clientA, x);
    await executeCommand(clientA, y);
    expect(await executeCommand(clientA, { type: "water.remove", id: x.intake.id })).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, { type: "water.remove", id: x.intake.id })).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, { type: "water.remove", id: uid() })).toEqual({ ok: true, value: "saved" });
    const ids = (await rows(A)).map((r) => r.id);
    expect(ids).not.toContain(x.intake.id);
    expect(ids).toContain(y.intake.id);
  });

  it("B não remove o registro de A", async () => {
    const mine = add({ ml: 300 });
    await executeCommand(clientA, mine);
    expect(await executeCommand(clientB, { type: "water.remove", id: mine.intake.id })).toEqual({ ok: true, value: "saved" }); // no-op para B
    expect((await rows(A)).some((r) => r.id === mine.intake.id)).toBe(true);
  });
});

describe("meta diária de água (goal_kind water_ml)", () => {
  const goal = (over: Record<string, unknown> = {}) => ({
    type: "goal.set",
    goal: { id: uid(), kind: "water_ml", scopeId: null, validFrom: "2026-10-12", target: 2500, ...over },
  });
  const goals = (userId: string) =>
    t.admin<{ id: string; valid_from: string; target: string }>(
      "select id, valid_from::text, target::text from public.goals where user_id = $1 and kind::text = 'water_ml' order by valid_from", [userId]);

  it("grava o alvo em ml POR DIA com vigência numa segunda-feira", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    expect(await executeCommand(client, goal())).toEqual({ ok: true, value: "saved" });
    expect(await goals(user)).toEqual([expect.objectContaining({ valid_from: "2026-10-12", target: "2500" })]);
  });

  it("uma vigência fora da segunda-feira é recusada (pelo schema e pelo check do banco)", async () => {
    expect(await executeCommand(clientA, goal({ validFrom: "2026-10-14" }))).toMatchObject({ ok: false, error: "A vigência deve começar numa segunda-feira." });
    const direct = await t.as(A, (s) => sqlState(s.query(
      "insert into public.goals (id, kind, valid_from, target) values ($1, 'water_ml', '2026-10-14', 2500)", [uid()])));
    expect(direct).toBe("23514");
  });

  it("substituir a mesma vigência mantém uma linha só; nova vigência cria outra; 0 remove daí em diante", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    await executeCommand(client, goal({ validFrom: "2026-10-12", target: 2500 }));
    await executeCommand(client, goal({ validFrom: "2026-10-12", target: 3000 }));
    await executeCommand(client, goal({ validFrom: "2026-10-19", target: 2000 }));
    await executeCommand(client, goal({ validFrom: "2026-10-26", target: 0 }));
    expect((await goals(user)).map((g) => [g.valid_from, g.target])).toEqual([
      ["2026-10-12", "3000"], ["2026-10-19", "2000"], ["2026-10-26", "0"],
    ]);
  });

  it("a meta de água não interfere nas demais metas do mesmo dia", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    await executeCommand(client, goal());
    await executeCommand(client, { type: "goal.set", goal: { id: uid(), kind: "running_meters", scopeId: null, validFrom: "2026-10-12", target: 20_000 } });
    const snap = await loadSnapshot(client);
    expect(snap.ok && snap.value.data.goals.map((g) => g.kind).sort()).toEqual(["running_meters", "water_ml"]);
  });
});

describe("get_snapshot", () => {
  it("devolve só a água do usuário, do registro mais antigo para o mais novo, no formato do domínio", async () => {
    await t.setNow(NOON);
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    const [x, y, z] = [add({ at: at("2026-10-14", 10), ml: 300 }), add({ at: at("2026-10-13", 22), ml: 200 }), add({ at: at("2026-10-14", 8), ml: 100 })];
    for (const command of [x, y, z]) await executeCommand(client, command);
    const snap = await loadSnapshot(client);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    const water = snap.value.data.waterIntakes;
    expect(water.map((w) => w.id)).toEqual([y.intake.id, z.intake.id, x.intake.id]);
    expect(water[0]).toEqual({ id: y.intake.id, at: at("2026-10-13", 22), ml: 200 });
    expect(JSON.stringify(water)).not.toMatch(/user_?id|occurred|created/i);
  });

  it("conta nova: lista vazia (a chave existe, nunca ausente)", async () => {
    const user = await t.createUser();
    const snap = await loadSnapshot(rpcClientFor(t, user));
    expect(snap.ok && snap.value.data.waterIntakes).toEqual([]);
  });

  it("compatibilidade de implantação: sem meta de água, o snapshot só traz tipos de meta que o app ANTERIOR entende", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    await executeCommand(client, { type: "goal.set", goal: { id: uid(), kind: "workout_sessions", scopeId: null, validFrom: "2026-10-12", target: 4 } });
    await executeCommand(client, add({ ml: 500 }));
    const snap = await loadSnapshot(client);
    const kinds = snap.ok ? new Set(snap.value.data.goals.map((g) => g.kind)) : new Set<string>();
    const knownByPreviousRelease = new Set(["savings", "category_budget", "workout_sessions", "study_minutes", "reading_pages", "running_meters"]);
    expect([...kinds].every((k) => knownByPreviousRelease.has(k))).toBe(true);
  });

  it("a mensagem do gatilho é a mesma que a interface mostra", async () => {
    await t.setNow(NOON);
    const message = await t.as(A, (s) => sqlMessage(s.query("insert into public.water_intakes (id, occurred_at, ml) values ($1, $2, 100)", [uid(), new Date(NOON + 3_600_000).toISOString()])));
    expect(message).toBe("Horário no futuro.");
  });
});
