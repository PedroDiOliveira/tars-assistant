import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uid } from "@/lib/id";
import { executeCommand, loadSnapshot, type RpcClient } from "@/server/commands";
import { TestDb, sqlMessage, sqlState } from "./harness";
import { rpcClientFor } from "./rpc-client";

/**
 * Corrida no banco: constraints, comandos, isolamento entre usuários, idempotência e o relógio do SERVIDOR
 * (fuso do app) decidindo o que é "data futura". O espelho reducer <-> SQL está em parity.test.ts.
 */

let t: TestDb;
let A: string;
let B: string;
let clientA: RpcClient;
let clientB: RpcClient;

// 14/10/2026 12:00 em São Paulo (quarta-feira; a semana é 12..18)
const NOON = Date.UTC(2026, 9, 14, 15, 0);

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

const add = (session: Record<string, unknown> = {}) => ({
  type: "running.addSession",
  nowMs: NOON,
  session: { id: uid(), occurredOn: "2026-10-14", ...session },
});
const rows = (userId: string) =>
  t.admin<{ id: string; occurred_on: string; distance_meters: number | null; duration_seconds: number | null; notes: string | null; user_id: string }>(
    "select id, occurred_on::text, distance_meters, duration_seconds, notes, user_id from public.running_sessions where user_id = $1 order by occurred_on, id",
    [userId],
  );

describe("tabela: constraints", () => {
  const insert = (over: Record<string, unknown> = {}) => {
    const row = { id: uid(), user_id: A, occurred_on: "2026-10-14", distance_meters: null, duration_seconds: null, notes: null, ...over };
    return t.admin(
      "insert into public.running_sessions (id, user_id, occurred_on, distance_meters, duration_seconds, notes) values ($1, $2, $3, $4, $5, $6)",
      [row.id, row.user_id, row.occurred_on, row.distance_meters, row.duration_seconds, row.notes],
    );
  };

  it("distância e duração ausentes são NULL (válido); presentes, só positivas e dentro do teto", async () => {
    await insert();
    await insert({ distance_meters: 1 });
    await insert({ distance_meters: 500_000, duration_seconds: 86_400 });
    for (const bad of [{ distance_meters: 0 }, { distance_meters: -5 }, { distance_meters: 500_001 }, { duration_seconds: 0 }, { duration_seconds: -1 }, { duration_seconds: 86_401 }]) {
      expect(await sqlState(insert(bad)), JSON.stringify(bad)).toBe("23514");
    }
  });

  it("observação até 200 caracteres", async () => {
    await insert({ notes: "x".repeat(200) });
    expect(await sqlState(insert({ notes: "x".repeat(201) }))).toBe("23514");
  });

  it("distância fracionada não existe: a coluna é inteira (metros)", async () => {
    expect(await sqlState(t.admin("insert into public.running_sessions (id, user_id, occurred_on, distance_meters) values ($1, $2, '2026-10-14', 'abc')", [uid(), A]))).toBe("22P02");
    const [{ typ }] = await t.admin<{ typ: string }>(
      "select data_type as typ from information_schema.columns where table_name = 'running_sessions' and column_name = 'distance_meters'");
    expect(typ).toBe("integer");
  });

  it("várias corridas na mesma data são permitidas (não há unicidade por dia)", async () => {
    const day = "2026-10-01";
    await insert({ occurred_on: day, distance_meters: 3000 });
    await insert({ occurred_on: day, distance_meters: 5000 });
    const [{ n }] = await t.admin<{ n: number }>("select count(*)::int as n from public.running_sessions where user_id = $1 and occurred_on = $2", [A, day]);
    expect(n).toBe(2);
  });

  it("datas absurdas (ano 0202) são barradas pelo domínio business_date", async () => {
    expect(await sqlState(insert({ occurred_on: "0202-10-07" }))).toBe("23514");
  });

  it("existe o índice por usuário e data, e o RLS está ligado", async () => {
    const idx = await t.admin<{ indexdef: string }>("select indexdef from pg_indexes where tablename = 'running_sessions' and indexname = 'running_sessions_user_date_idx'");
    expect(idx[0]?.indexdef).toMatch(/\(user_id, occurred_on DESC, id\)/);
    const [{ rowsecurity }] = await t.admin<{ rowsecurity: boolean }>("select rowsecurity from pg_tables where tablename = 'running_sessions'");
    expect(rowsecurity).toBe(true);
  });
});

describe("comando running.addSession", () => {
  it("só a data: cria a corrida sem distância nem duração (NULL, nunca zero) e o snapshot as omite", async () => {
    const command = add();
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    const [row] = (await rows(A)).filter((r) => r.id === command.session.id);
    expect(row).toMatchObject({ distance_meters: null, duration_seconds: null, notes: null, user_id: A });

    const snap = await loadSnapshot(clientA);
    const run = snap.ok && snap.value.data.runningSessions.find((r) => r.id === command.session.id);
    expect(run).toEqual({ id: command.session.id, occurredOn: "2026-10-14" });
  });

  it("5,2 km é gravado como 5200 metros, com duração em segundos e observação", async () => {
    const command = add({ distanceMeters: 5200, durationSeconds: 1800, notes: "Parque" });
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    expect((await rows(A)).find((r) => r.id === command.session.id)).toMatchObject({ distance_meters: 5200, duration_seconds: 1800, notes: "Parque" });
  });

  it("repetir o mesmo id (toque duplo, resposta perdida) não duplica e não altera o que já foi salvo", async () => {
    const command = add({ distanceMeters: 5000 });
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    const other = { ...command, session: { ...command.session, distanceMeters: 9999 } };
    expect(await executeCommand(clientA, other)).toEqual({ ok: true, value: "saved" });
    const mine = (await rows(A)).filter((r) => r.id === command.session.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].distance_meters).toBe(5000);
  });

  it("o id de OUTRO usuário não é aceito como se tivesse salvado, e a linha dele não muda", async () => {
    const command = add({ distanceMeters: 7000 });
    await executeCommand(clientA, command);
    const hijack = { ...command, session: { ...command.session, distanceMeters: 1 } };
    const result = await executeCommand(clientB, hijack);
    expect(result).toMatchObject({ ok: false, error: "Este identificador de corrida já está em uso." });
    expect(await rows(B)).toEqual([]);
    expect((await rows(A)).find((r) => r.id === command.session.id)?.distance_meters).toBe(7000);
  });

  it("valores inválidos nem chegam ao banco (schema) e, se chegassem, a constraint recusaria", async () => {
    expect(await executeCommand(clientA, add({ distanceMeters: 0 }))).toMatchObject({ ok: false, code: "validation", error: "A distância deve ser maior que zero." });
    expect(await executeCommand(clientA, add({ distanceMeters: -3 }))).toMatchObject({ ok: false, code: "validation" });
    expect(await executeCommand(clientA, add({ distanceMeters: 5.5 }))).toMatchObject({ ok: false, code: "validation" });
    expect(await executeCommand(clientA, add({ durationSeconds: 0 }))).toMatchObject({ ok: false, code: "validation" });
    // direto no banco (sem o schema na frente): a constraint barra
    const raw = add({ distanceMeters: 0 });
    expect(await t.as(A, (s) => sqlState(s.command(raw as never)))).toBe("23514");
  });

  it("o user_id nunca vem do comando: um userId plantado é recusado antes do banco", async () => {
    const planted = add();
    (planted.session as Record<string, unknown>).userId = B;
    expect(await executeCommand(clientA, planted)).toMatchObject({ ok: false, code: "validation" });
  });
});

describe("data futura: o relógio e o fuso são os do servidor", () => {
  afterAll(async () => {
    await t.setNow(NOON);
  });

  it("hoje vale; amanhã é recusado, com a mesma mensagem do reducer", async () => {
    await t.setNow(NOON);
    expect(await executeCommand(clientA, add({ occurredOn: "2026-10-14" }))).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, add({ occurredOn: "2026-10-15" }))).toEqual({
      ok: false, code: "validation", error: "Não é possível registrar uma corrida em uma data futura.",
    });
  });

  it("23h30 em São Paulo ainda é o dia 14 (embora já seja dia 15 em UTC)", async () => {
    await t.setNow(Date.UTC(2026, 9, 15, 2, 30));
    expect(await executeCommand(clientA, add({ occurredOn: "2026-10-14" }))).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, add({ occurredOn: "2026-10-15" }))).toMatchObject({ ok: false, error: "Não é possível registrar uma corrida em uma data futura." });
  });

  it("00h30 em São Paulo já é o dia 15", async () => {
    await t.setNow(Date.UTC(2026, 9, 15, 3, 30));
    expect(await executeCommand(clientA, add({ occurredOn: "2026-10-15" }))).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(clientA, add({ occurredOn: "2026-10-16" }))).toMatchObject({ ok: false });
  });

  it("o nowMs do cliente NÃO decide: um relógio do aparelho adiantado não libera uma data futura", async () => {
    await t.setNow(NOON);
    const cheat = { ...add({ occurredOn: "2026-10-20" }), nowMs: Date.UTC(2026, 9, 25, 15) };
    expect(await executeCommand(clientA, cheat)).toMatchObject({ ok: false, error: "Não é possível registrar uma corrida em uma data futura." });
  });

  it("vale também fora dos comandos: inserir direto na tabela com data futura é barrado pelo gatilho", async () => {
    await t.setNow(NOON);
    const state = await t.as(A, (s) => sqlState(s.query(
      "insert into public.running_sessions (id, occurred_on) values ($1, '2026-10-15')", [uid()])));
    expect(state).toBe("23514");
  });

  it("editar: mover a data para o futuro é recusado; corrigir sem mexer na data nunca depende do relógio", async () => {
    await t.setNow(NOON);
    const created = add({ occurredOn: "2026-10-14", distanceMeters: 5000 });
    await executeCommand(clientA, created);
    const edit = (fields: Record<string, unknown>) => executeCommand(clientA, { type: "running.updateSession", id: created.session.id, nowMs: NOON, fields });

    expect(await edit({ occurredOn: "2026-10-16", distanceMeters: 5000 })).toMatchObject({ ok: false, error: "Não é possível registrar uma corrida em uma data futura." });
    expect((await rows(A)).find((r) => r.id === created.session.id)?.occurred_on).toBe("2026-10-14");

    // o relógio do servidor "voltou" (ajuste de hora): a data guardada parece futura, mas corrigir a distância é permitido
    await t.setNow(Date.UTC(2026, 9, 13, 15));
    expect(await edit({ occurredOn: "2026-10-14", distanceMeters: 5500 })).toEqual({ ok: true, value: "saved" });
    expect((await rows(A)).find((r) => r.id === created.session.id)?.distance_meters).toBe(5500);
  });
});

describe("comandos running.updateSession e running.deleteSession", () => {
  const create = async (over: Record<string, unknown> = {}) => {
    const command = add({ occurredOn: "2026-10-13", distanceMeters: 5000, durationSeconds: 1800, notes: "Parque", ...over });
    expect(await executeCommand(clientA, command)).toEqual({ ok: true, value: "saved" });
    return command.session.id as string;
  };
  const update = (client: RpcClient, id: string, fields: Record<string, unknown>) =>
    executeCommand(client, { type: "running.updateSession", id, nowMs: NOON, fields: { occurredOn: "2026-10-13", ...fields } });
  const row = async (id: string) => (await rows(A)).find((r) => r.id === id);

  it("substitui todos os campos: omitir a distância a devolve a NULL (a corrida continua, sem 0 km)", async () => {
    const id = await create();
    expect(await update(clientA, id, { durationSeconds: 1800 })).toEqual({ ok: true, value: "saved" });
    expect(await row(id)).toMatchObject({ distance_meters: null, duration_seconds: 1800, notes: null });
  });

  it("adiciona uma distância que estava ausente, corrige a data e a observação", async () => {
    const id = await create({ distanceMeters: undefined, durationSeconds: undefined, notes: undefined });
    expect(await row(id)).toMatchObject({ distance_meters: null });
    expect(await update(clientA, id, { occurredOn: "2026-10-08", distanceMeters: 7500, notes: "Corrigida" })).toEqual({ ok: true, value: "saved" });
    expect(await row(id)).toMatchObject({ occurred_on: "2026-10-08", distance_meters: 7500, duration_seconds: null, notes: "Corrigida" });
  });

  it("corrida inexistente: 'Corrida não encontrada.'", async () => {
    expect(await update(clientA, uid(), {})).toEqual({ ok: false, code: "validation", error: "Corrida não encontrada." });
  });

  it("B não edita a corrida de A: 'não encontrada', e a linha de A fica intacta", async () => {
    const id = await create({ distanceMeters: 6000 });
    expect(await update(clientB, id, { distanceMeters: 1 })).toEqual({ ok: false, code: "validation", error: "Corrida não encontrada." });
    expect((await row(id))?.distance_meters).toBe(6000);
  });

  it("B não exclui a corrida de A (nada acontece), e A exclui a própria; excluir de novo não é erro", async () => {
    const id = await create();
    expect(await executeCommand(clientB, { type: "running.deleteSession", id })).toEqual({ ok: true, value: "saved" });
    expect(await row(id)).toBeDefined();
    expect(await executeCommand(clientA, { type: "running.deleteSession", id })).toEqual({ ok: true, value: "saved" });
    expect(await row(id)).toBeUndefined();
    expect(await executeCommand(clientA, { type: "running.deleteSession", id })).toEqual({ ok: true, value: "saved" });
  });

  it("o gatilho updated_at é mantido na edição", async () => {
    const id = await create();
    const [before] = await t.admin<{ updated_at: string }>("select updated_at::text from public.running_sessions where id = $1", [id]);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await update(clientA, id, { distanceMeters: 5100 });
    const [after] = await t.admin<{ updated_at: string }>("select updated_at::text from public.running_sessions where id = $1", [id]);
    expect(after.updated_at > before.updated_at).toBe(true);
  });
});

describe("meta semanal de corrida (goal_kind running_meters)", () => {
  const goal = (over: Record<string, unknown> = {}) => ({
    type: "goal.set",
    goal: { id: uid(), kind: "running_meters", scopeId: null, validFrom: "2026-10-12", target: 20_000, ...over },
  });

  it("grava em metros, substitui a mesma vigência mantendo o id e preserva as semanas anteriores", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    const first = goal({ validFrom: "2026-10-05", target: 15_000 });
    const second = goal({ validFrom: "2026-10-12", target: 12_500 });
    expect(await executeCommand(client, first)).toEqual({ ok: true, value: "saved" });
    expect(await executeCommand(client, second)).toEqual({ ok: true, value: "saved" });
    const replace = goal({ validFrom: "2026-10-12", target: 20_000 });
    expect(await executeCommand(client, replace)).toEqual({ ok: true, value: "saved" });

    const snap = await loadSnapshot(client);
    const goals = snap.ok ? snap.value.data.goals.filter((g) => g.kind === "running_meters") : [];
    expect(goals).toEqual([
      { id: first.goal.id, kind: "running_meters", scopeId: null, validFrom: "2026-10-05", target: 15_000 },
      { id: second.goal.id, kind: "running_meters", scopeId: null, validFrom: "2026-10-12", target: 20_000 },
    ]);
  });

  it("remover = alvo 0 a partir da vigência (convenção das outras metas)", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    await executeCommand(client, goal({ validFrom: "2026-10-05", target: 15_000 }));
    await executeCommand(client, goal({ validFrom: "2026-10-12", target: 0 }));
    const snap = await loadSnapshot(client);
    expect(snap.ok && snap.value.data.goals.map((g) => g.target)).toEqual([15_000, 0]);
  });

  it("a vigência tem de ser uma segunda-feira (constraint do banco)", async () => {
    const raw = goal({ validFrom: "2026-10-14" });
    expect(await t.as(A, (s) => sqlState(s.command(raw as never)))).toBe("23514");
  });

  it("não tem escopo: uma matéria ou categoria não se aplica", async () => {
    expect(await executeCommand(clientA, goal({ scopeId: uid() }))).toMatchObject({ ok: false, error: "Esta meta não tem escopo." });
  });
});

describe("get_snapshot", () => {
  it("devolve só as corridas do usuário, da mais antiga para a mais recente, no formato do domínio", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    const [x, y, z] = [add({ occurredOn: "2026-10-10", distanceMeters: 3000 }), add({ occurredOn: "2026-10-08" }), add({ occurredOn: "2026-10-10", durationSeconds: 600 })];
    for (const command of [x, y, z]) await executeCommand(client, command);
    const snap = await loadSnapshot(client);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    const runs = snap.value.data.runningSessions;
    expect(runs).toHaveLength(3);
    expect(runs[0]).toEqual({ id: y.session.id, occurredOn: "2026-10-08" });
    expect(runs.map((r) => r.occurredOn)).toEqual(["2026-10-08", "2026-10-10", "2026-10-10"]);
    expect(JSON.stringify(runs)).not.toMatch(/user_?id|"distanceMeters":null|"durationSeconds":null/i);
  });

  it("compatibilidade de implantação: sem meta de corrida, o snapshot só traz tipos de meta que o app ANTERIOR entende", async () => {
    const user = await t.createUser();
    const client = rpcClientFor(t, user);
    await executeCommand(client, { type: "goal.set", goal: { id: uid(), kind: "workout_sessions", scopeId: null, validFrom: "2026-10-12", target: 4 } });
    await executeCommand(client, add({ distanceMeters: 5000 }));
    const snap = await loadSnapshot(client);
    const kinds = snap.ok ? new Set(snap.value.data.goals.map((g) => g.kind)) : new Set<string>();
    const knownByPreviousRelease = new Set(["savings", "category_budget", "workout_sessions", "study_minutes", "reading_pages"]);
    expect([...kinds].every((k) => knownByPreviousRelease.has(k))).toBe(true);
  });

  it("a mensagem do gatilho é a mesma que a interface mostra", async () => {
    await t.setNow(NOON);
    const message = await t.as(A, (s) => sqlMessage(s.command(add({ occurredOn: "2026-12-31" }) as never)));
    expect(message).toBe("Não é possível registrar uma corrida em uma data futura.");
  });
});
