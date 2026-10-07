import { beforeAll, describe, expect, it } from "vitest";
import { uid } from "@/lib/id";
import { TestDb, sqlMessage, sqlState, type Session } from "./harness";

let t: TestDb;
let U: string;
let foodId: string; // categoria de despesa
let salaryId: string; // categoria de receita
let exerciseId: string;

beforeAll(async () => {
  t = await TestDb.create();
  U = await t.createUser();
  const cats = await t.admin<{ id: string; name: string; type: string }>(
    "select id, name, type from public.categories where user_id = $1", [U]);
  foodId = cats.find((c) => c.name === "Alimentação")!.id;
  salaryId = cats.find((c) => c.name === "Salário")!.id;
  [{ id: exerciseId }] = await t.admin<{ id: string }>("select id from public.exercises where user_id = $1 limit 1", [U]);
});

/** Executa como o dono e devolve o SQLSTATE do erro (ou undefined se deu certo). */
const run = (sql: string, params: unknown[] = []) => t.as(U, (s) => sqlState(s.query(sql, params)));
const runOk = (sql: string, params: unknown[] = []) => t.as(U, (s: Session) => s.query(sql, params));

const insertTx = (over: Partial<{ amount: number; category: string; type: string; date: string; description: string }> = {}) =>
  run(
    `insert into public.transactions (id, type, amount_cents, category_id, occurred_on, description)
     values ($1, $2, $3, $4, $5, $6)`,
    [uid(), over.type ?? "expense", over.amount ?? 4200, over.category ?? foodId, over.date ?? "2026-10-07", over.description ?? ""],
  );

// ON DELETE RESTRICT levanta 23001 (restrict_violation); ON UPDATE sem ação levanta 23503 (foreign_key_violation).
// O tradutor de erros da API trata os dois como "registro em uso".
describe("lançamentos", () => {
  it("aceita um lançamento válido (user_id vem do JWT, não do cliente)", async () => {
    expect(await insertTx()).toBeUndefined();
    const rows = await t.admin<{ user_id: string }>("select user_id from public.transactions order by created_at desc limit 1");
    expect(rows[0].user_id).toBe(U);
  });
  it("recusa valor zero, negativo e acima do teto de R$ 99.999.999,99", async () => {
    expect(await insertTx({ amount: 0 })).toBe("23514");
    expect(await insertTx({ amount: -1 })).toBe("23514");
    expect(await insertTx({ amount: 9_999_999_999 })).toBeUndefined();
    expect(await insertTx({ amount: 10_000_000_000 })).toBe("23514");
  });
  it("recusa descrição com mais de 200 caracteres", async () => {
    expect(await insertTx({ description: "x".repeat(200) })).toBeUndefined();
    expect(await insertTx({ description: "x".repeat(201) })).toBe("23514");
  });
  it("recusa data implausível (erro de digitação no ano)", async () => {
    expect(await insertTx({ date: "0202-10-07" })).toBe("23514");
    expect(await insertTx({ date: "2101-01-01" })).toBe("23514");
  });
  it("o tipo do lançamento tem de ser o tipo da categoria", async () => {
    expect(await insertTx({ type: "expense", category: salaryId })).toBe("23503");
    expect(await insertTx({ type: "income", category: salaryId })).toBeUndefined();
  });
  it("categoria em uso não pode ser apagada (arquive)", async () => {
    expect(await t.admin("delete from public.categories where id = $1", [foodId]).catch((e) => e.code)).toBe("23001");
  });
  it("categoria não pode mudar de tipo enquanto tem lançamentos", async () => {
    expect(await t.admin("update public.categories set type = 'income' where id = $1", [foodId]).catch((e) => e.code)).toBe("23503");
  });
  it("nome de categoria ativa é único por tipo, sem diferenciar maiúsculas; arquivada libera o nome", async () => {
    const dup = (name: string, type = "expense") =>
      run("insert into public.categories (id, name, type) values ($1, $2, $3)", [uid(), name, type]);
    expect(await dup("alimentação")).toBe("23505");
    expect(await dup("Alimentação", "income")).toBeUndefined(); // mesmo nome, outro tipo
    await t.admin("update public.categories set archived_at = now() where id = $1", [foodId]).catch(() => undefined);
  });
});

describe("metas", () => {
  const goal = (kind: string, validFrom: string, over: { category?: string | null; subject?: string | null; target?: number } = {}) =>
    run(
      `insert into public.goals (id, kind, category_id, subject_id, valid_from, target) values ($1, $2, $3, $4, $5, $6)`,
      [uid(), kind, over.category ?? null, over.subject ?? null, validFrom, over.target ?? 100],
    );

  it("meta mensal começa no dia 1 e semanal na segunda-feira", async () => {
    expect(await goal("savings", "2026-10-01", { target: 50000 })).toBeUndefined();
    expect(await goal("savings", "2026-10-15")).toBe("23514");
    expect(await goal("workout_sessions", "2026-10-05", { target: 4 })).toBeUndefined(); // segunda
    expect(await goal("workout_sessions", "2026-10-07")).toBe("23514"); // quarta
  });
  it("duas metas gerais da mesma vigência colidem (NULLS NOT DISTINCT); vigência nova convive", async () => {
    expect(await goal("reading_pages", "2026-10-05")).toBeUndefined();
    expect(await goal("reading_pages", "2026-10-05")).toBe("23505");
    expect(await goal("reading_pages", "2026-10-12")).toBeUndefined();
  });
  it("meta 0 ('removida') é permitida; negativa não", async () => {
    expect(await goal("study_minutes", "2026-10-05", { target: 0 })).toBeUndefined();
    expect(await goal("study_minutes", "2026-10-12", { target: -1 })).toBe("23514");
  });
  it("só orçamento tem categoria, e ele exige uma", async () => {
    expect(await goal("category_budget", "2026-10-01")).toBe("23514");
    expect(await goal("savings", "2026-11-01", { category: foodId })).toBe("23514");
    expect(await goal("category_budget", "2026-10-01", { category: foodId })).toBeUndefined();
  });
  it("só meta de estudo tem matéria", async () => {
    const subject = uid();
    await runOk("insert into public.study_subjects (id, name, hue) values ($1, 'Redes', 120)", [subject]);
    expect(await goal("workout_sessions", "2026-10-19", { subject })).toBe("23514");
    expect(await goal("study_minutes", "2026-10-19", { subject })).toBeUndefined();
  });
});

describe("estudos", () => {
  let subject: string;
  beforeAll(async () => {
    subject = uid();
    await runOk("insert into public.study_subjects (id, name, hue) values ($1, 'Segurança', 150)", [subject]);
  });
  const session = (seconds: number) =>
    run(
      `insert into public.study_sessions (id, subject_id, source, occurred_on, duration_seconds)
       values ($1, $2, 'manual', '2026-10-07', $3)`, [uid(), subject, seconds]);

  it("duração entre 1 min e 24 h", async () => {
    expect(await session(59)).toBe("23514");
    expect(await session(60)).toBeUndefined();
    expect(await session(86_400)).toBeUndefined();
    expect(await session(86_401)).toBe("23514");
  });
  it("no máximo UM cronômetro por usuário", async () => {
    expect(await run("insert into public.study_timers (subject_id, started_at) values ($1, now())", [subject])).toBeUndefined();
    expect(await run("insert into public.study_timers (subject_id, started_at) values ($1, now())", [subject])).toBe("23505");
  });
  it("matéria com sessões não pode ser apagada (arquive)", async () => {
    expect(await t.admin("delete from public.study_subjects where id = $1", [subject]).catch((e) => e.code)).toBe("23001");
  });
  it("nome de matéria ativa é único sem diferenciar maiúsculas", async () => {
    expect(await run("insert into public.study_subjects (id, name, hue) values ($1, 'SEGURANÇA', 100)", [uid()])).toBe("23505");
  });
});

describe("treino", () => {
  let plan: string;
  beforeAll(async () => {
    plan = uid();
    await runOk("insert into public.workout_plans (id, name) values ($1, 'Treino X')", [plan]);
  });
  const planExercise = (position: number, sets = 3, min = 8, max = 12) =>
    run(
      `insert into public.workout_plan_exercises (plan_id, exercise_id, position, planned_sets, rep_min, rep_max, rest_seconds)
       values ($1, $2, $3, $4, $5, $6, 60)`, [plan, exerciseId, position, sets, min, max]);

  it("repetições máximas não podem ser menores que as mínimas; séries planejadas >= 1", async () => {
    expect(await planExercise(0, 3, 12, 8)).toBe("23514");
    expect(await planExercise(0, 0)).toBe("23514");
    expect(await planExercise(0)).toBeUndefined();
  });
  it("posição repetida na ficha é recusada, mas trocar a ordem numa instrução só funciona (restrição adiada)", async () => {
    expect(await planExercise(1)).toBeUndefined();
    expect(await planExercise(1)).toBe("23505");
    expect(await run("update public.workout_plan_exercises set position = 1 - position where plan_id = $1", [plan])).toBeUndefined();
  });
  it("apagar a ficha preserva a sessão e zera só plan_id (user_id intacto)", async () => {
    const session = uid();
    await runOk(
      `insert into public.workout_sessions (id, plan_id, name_snapshot, started_at, finished_at, occurred_on)
       values ($1, $2, 'Treino X', now() - interval '1 hour', now(), '2026-10-07')`, [session, plan]);
    await runOk("delete from public.workout_plans where id = $1", [plan]);
    const [row] = await t.admin<{ plan_id: string | null; user_id: string; name_snapshot: string }>(
      "select plan_id, user_id, name_snapshot from public.workout_sessions where id = $1", [session]);
    expect(row).toEqual({ plan_id: null, user_id: U, name_snapshot: "Treino X" });
  });
  it("sessão não termina antes de começar", async () => {
    expect(await run(
      `insert into public.workout_sessions (id, name_snapshot, started_at, finished_at, occurred_on)
       values ($1, 'X', now(), now() - interval '1 minute', '2026-10-07')`, [uid()])).toBe("23514");
  });
  it("exercício usado em ficha ou sessão não pode ser apagado (arquive)", async () => {
    const used = uid();
    const ex = uid();
    await runOk("insert into public.exercises (id, name, muscle_group) values ($1, 'Remada unilateral', 'Costas')", [ex]);
    await runOk("insert into public.workout_plans (id, name) values ($1, 'Y')", [used]);
    await runOk(
      `insert into public.workout_plan_exercises (plan_id, exercise_id, position, planned_sets, rep_min, rep_max, rest_seconds)
       values ($1, $2, 0, 3, 8, 12, 60)`, [used, ex]);
    expect(await t.admin("delete from public.exercises where id = $1", [ex]).catch((e) => e.code)).toBe("23001");
  });
});

describe("leitura", () => {
  let book: string;
  beforeAll(async () => {
    book = uid();
    await runOk("insert into public.books (id, title, total_pages, initial_page) values ($1, 'Livro', 320, 30)", [book]);
  });
  const reading = (start: number, end: number) =>
    run(
      `insert into public.reading_sessions (id, book_id, occurred_on, start_page, end_page)
       values ($1, $2, '2026-10-07', $3, $4)`, [uid(), book, start, end]);

  it("página inicial do cadastro não pode passar do total", async () => {
    expect(await run("insert into public.books (id, title, total_pages, initial_page) values ($1, 'X', 100, 101)", [uid()])).toBe("23514");
    expect(await run("insert into public.books (id, title, total_pages) values ($1, 'X', 0)", [uid()])).toBe("23514");
  });
  it("fim tem de ser maior que o início (30→50 vale 20 páginas)", async () => {
    expect(await reading(30, 50)).toBeUndefined();
    expect(await reading(50, 50)).toBe("23514");
    expect(await reading(60, 50)).toBe("23514");
  });
  it("fim não pode passar do total do livro (gatilho, com a mensagem em português)", async () => {
    expect(await t.as(U, (s) => sqlMessage(s.query(
      `insert into public.reading_sessions (id, book_id, occurred_on, start_page, end_page) values ($1, $2, '2026-10-07', 300, 321)`,
      [uid(), book])))).toBe("O livro tem 320 páginas.");
  });
  it("não dá para reduzir o total de páginas abaixo do que já foi lido", async () => {
    expect(await reading(100, 200)).toBeUndefined();
    expect(await t.as(U, (s) => sqlMessage(s.query("update public.books set total_pages = 150 where id = $1", [book]))))
      .toBe("O livro já tem leituras até a página 200.");
    expect(await run("update public.books set total_pages = 200 where id = $1", [book])).toBeUndefined();
  });
  it("excluir o livro leva as leituras junto", async () => {
    await runOk("delete from public.books where id = $1", [book]);
    const [row] = await t.admin<{ n: number }>("select count(*)::int as n from public.reading_sessions where book_id = $1", [book]);
    expect(row.n).toBe(0);
  });
});

describe("get_snapshot", () => {
  it("uma conta nova devolve só os catálogos e tudo o mais vazio", async () => {
    const fresh = await t.createUser({ email: "nova@tars.example" });
    const snap = await t.as(fresh, (s) => s.snapshot());
    expect(snap.data.categories).toHaveLength(10);
    expect(snap.data.exercises).toHaveLength(17);
    for (const key of ["transactions", "templates", "goals", "plans", "sessions", "subjects", "studySessions", "books", "readingSessions"] as const) {
      expect(snap.data[key], key).toEqual([]);
    }
    expect(snap.data.timer).toBeNull();
    expect(snap.profile).toEqual({ displayName: "nova" });
  });
});
