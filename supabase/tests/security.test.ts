import { beforeAll, describe, expect, it } from "vitest";
import { uid } from "@/lib/id";
import { CATEGORIES, EXERCISES } from "@/data/demo/seed";
import { TestDb, sqlMessage, sqlState } from "./harness";

let t: TestDb;
let A: string;
let B: string;

/** Uma linha em CADA tabela de A, inseridas como administrador para não depender das regras testadas. */
async function populate(userId: string) {
  const [cat] = await t.admin<{ id: string }>(
    "select id from public.categories where user_id = $1 and name = 'Alimentação'", [userId]);
  const [ex] = await t.admin<{ id: string }>(
    "select id from public.exercises where user_id = $1 limit 1", [userId]);
  const ids = {
    category: cat.id, exercise: ex.id, tx: uid(), tpl: uid(), subject: uid(), studySession: uid(),
    goal: uid(), plan: uid(), session: uid(), book: uid(), reading: uid(),
  };
  const SE = "00000000-0000-4000-8000-0000000000aa";
  const statements: [string, unknown[]][] = [
    [`insert into public.transactions (id, user_id, type, amount_cents, category_id, occurred_on)
      values ($1, $2, 'expense', 4200, $3, '2026-10-07')`, [ids.tx, userId, ids.category]],
    [`insert into public.tx_templates (id, user_id, label, type, amount_cents, category_id)
      values ($1, $2, 'Almoço', 'expense', 3500, $3)`, [ids.tpl, userId, ids.category]],
    [`insert into public.study_subjects (id, user_id, name, hue) values ($1, $2, 'SQL', 120)`, [ids.subject, userId]],
    [`insert into public.study_sessions (id, user_id, subject_id, source, occurred_on, duration_seconds)
      values ($1, $2, $3, 'manual', '2026-10-07', 3600)`, [ids.studySession, userId, ids.subject]],
    [`insert into public.study_timers (user_id, subject_id, started_at, running_since)
      values ($1, $2, now(), now())`, [userId, ids.subject]],
    [`insert into public.goals (id, user_id, kind, valid_from, target)
      values ($1, $2, 'workout_sessions', '2026-10-05', 4)`, [ids.goal, userId]],
    [`insert into public.workout_plans (id, user_id, name) values ($1, $2, 'Treino A')`, [ids.plan, userId]],
    [`insert into public.workout_plan_exercises (user_id, plan_id, exercise_id, position, planned_sets, rep_min, rep_max, rest_seconds)
      values ($1, $2, $3, 0, 3, 8, 12, 90)`, [userId, ids.plan, ids.exercise]],
    [`insert into public.workout_sessions (id, user_id, plan_id, name_snapshot, started_at, finished_at, occurred_on)
      values ($1, $2, $3, 'Treino A', now() - interval '1 hour', now(), '2026-10-07')`, [ids.session, userId, ids.plan]],
    [`insert into public.session_exercises (id, user_id, session_id, exercise_id, position, name_snapshot, load_type, planned_sets, rep_min, rep_max, rest_seconds)
      values ($1, $2, $3, $4, 0, 'Supino', 'external', 3, 8, 12, 90)`, [SE, userId, ids.session, ids.exercise]],
    [`insert into public.exercise_sets (user_id, session_exercise_id, set_number, weight_kg, reps)
      values ($1, $2, 1, 60, 8)`, [userId, SE]],
    [`insert into public.books (id, user_id, title, total_pages) values ($1, $2, 'Livro', 300)`, [ids.book, userId]],
    [`insert into public.reading_sessions (id, user_id, book_id, occurred_on, start_page, end_page)
      values ($1, $2, $3, '2026-10-07', 0, 20)`, [ids.reading, userId, ids.book]],
  ];
  for (const [sql, params] of statements) await t.admin(sql, params);
  return ids;
}

type Ids = Awaited<ReturnType<typeof populate>>;
let a: Ids;

beforeAll(async () => {
  t = await TestDb.create();
  A = await t.createUser({ email: "ana@tars.example", displayName: "Ana" });
  B = await t.createUser({ email: "bruno@tars.example" });
  a = await populate(A);
});

describe("cadastro do dono", () => {
  it("cria o perfil com o nome dos metadados, ou da parte local do e-mail", async () => {
    const profiles = await t.admin<{ id: string; display_name: string }>("select * from public.profiles");
    expect(profiles.find((p) => p.id === A)?.display_name).toBe("Ana");
    expect(profiles.find((p) => p.id === B)?.display_name).toBe("bruno");
  });

  it("semeia os mesmos catálogos PT-BR do modo demo (categorias e exercícios)", async () => {
    const categories = await t.admin<{ name: string; type: string; icon: string; hue: number }>(
      "select name, type, icon, hue from public.categories where user_id = $1 order by type, name", [B]);
    const wantCategories = CATEGORIES.map(({ name, type, icon, hue }) => ({ name, type, icon, hue }))
      .sort((x, y) => x.type.localeCompare(y.type) || x.name.localeCompare(y.name, "pt-BR"));
    expect(categories.map(({ name, type, icon, hue }) => ({ name, type, icon, hue })).sort(
      (x, y) => x.type.localeCompare(y.type) || x.name.localeCompare(y.name, "pt-BR"))).toEqual(wantCategories);

    const exercises = await t.admin<{ name: string; muscle_group: string; load_type: string }>(
      "select name, muscle_group, load_type from public.exercises where user_id = $1", [B]);
    expect(exercises.map((e) => `${e.name}|${e.muscle_group}|${e.load_type}`).sort()).toEqual(
      EXERCISES.map((e) => `${e.name}|${e.muscleGroup}|${e.loadType}`).sort());
  });

  it("a conta real começa SEM fichas, lançamentos nem outros dados fictícios", async () => {
    const empty = await t.admin<{ n: number }>(
      `select (select count(*) from public.workout_plans where user_id = $1)
            + (select count(*) from public.transactions where user_id = $1)
            + (select count(*) from public.study_subjects where user_id = $1)
            + (select count(*) from public.books where user_id = $1) as n`, [B]);
    expect(Number(empty[0].n)).toBe(0);
  });

  it("seed_defaults é idempotente", async () => {
    await t.admin("select private.seed_defaults($1)", [B]);
    const [{ n }] = await t.admin<{ n: number }>("select count(*)::int as n from public.categories where user_id = $1", [B]);
    expect(n).toBe(10);
  });
});

describe("isolamento entre usuários (RLS)", () => {
  const TABLES = [
    "categories", "transactions", "tx_templates", "goals", "exercises", "workout_plans",
    "workout_plan_exercises", "workout_sessions", "session_exercises", "exercise_sets",
    "study_subjects", "study_sessions", "study_timers", "books", "reading_sessions",
  ];

  it.each(TABLES)("%s: B não enxerga nenhuma linha de A", async (table) => {
    const owned = await t.admin<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [A]);
    expect(owned[0].n).toBeGreaterThan(0); // o teste só vale se A realmente tem dados nesta tabela
    const seenByB = await t.as(B, (s) => s.query<{ n: number }>(`select count(*)::int as n from public.${table} where user_id = $1`, [A]));
    expect(seenByB[0].n).toBe(0);
  });

  it("profiles: B não lê o perfil de A", async () => {
    const rows = await t.as(B, (s) => s.query("select id from public.profiles where id = $1", [A]));
    expect(rows).toHaveLength(0);
  });

  it("B não consegue inserir uma linha em nome de A (WITH CHECK)", async () => {
    const state = await t.as(B, (s) => sqlState(s.query(
      `insert into public.books (id, user_id, title, total_pages) values ($1, $2, 'Invasor', 100)`, [uid(), A])));
    expect(state).toBe("42501");
  });

  it("B não altera nem apaga linhas de A (a linha é invisível, nada é afetado)", async () => {
    await t.as(B, async (s) => {
      expect(await s.query("update public.transactions set amount_cents = 1 where id = $1 returning id", [a.tx])).toHaveLength(0);
      expect(await s.query("delete from public.transactions where id = $1 returning id", [a.tx])).toHaveLength(0);
      expect(await s.query("update public.books set title = 'x' where id = $1 returning id", [a.book])).toHaveLength(0);
    });
    const [tx] = await t.admin<{ amount_cents: string }>("select amount_cents from public.transactions where id = $1", [a.tx]);
    expect(Number(tx.amount_cents)).toBe(4200);
  });

  it("B não troca o dono de uma linha própria para A (WITH CHECK no UPDATE)", async () => {
    const [mine] = await t.as(B, (s) => s.query<{ id: string }>("select id from public.categories limit 1"));
    const state = await t.as(B, (s) => sqlState(s.query("update public.categories set user_id = $1 where id = $2", [A, mine.id])));
    expect(state).toBe("42501");
  });

  describe("integridade pai/filho: FK composta barra referência a dados de outro usuário", () => {
    it("lançamento de B apontando para a categoria de A", async () => {
      const state = await t.as(B, (s) => sqlState(s.query(
        `insert into public.transactions (id, type, amount_cents, category_id, occurred_on)
         values ($1, 'expense', 100, $2, '2026-10-07')`, [uid(), a.category])));
      expect(state).toBe("23503");
    });
    it("sessão de estudo de B apontando para a matéria de A", async () => {
      const state = await t.as(B, (s) => sqlState(s.query(
        `insert into public.study_sessions (id, subject_id, source, occurred_on, duration_seconds)
         values ($1, $2, 'manual', '2026-10-07', 600)`, [uid(), a.subject])));
      expect(state).toBe("23503");
    });
    it("leitura de B apontando para o livro de A", async () => {
      const state = await t.as(B, (s) => sqlState(s.query(
        `insert into public.reading_sessions (id, book_id, occurred_on, start_page, end_page)
         values ($1, $2, '2026-10-07', 0, 10)`, [uid(), a.book])));
      expect(state).toBe("23503");
    });
    it("meta de B apontando para a categoria de A", async () => {
      const state = await t.as(B, (s) => sqlState(s.query(
        `insert into public.goals (id, kind, category_id, valid_from, target)
         values ($1, 'category_budget', $2, '2026-10-01', 1000)`, [uid(), a.category])));
      expect(state).toBe("23503");
    });
    it("cronômetro de B com a matéria de A", async () => {
      const state = await t.as(B, (s) => sqlState(s.query(
        `insert into public.study_timers (subject_id, started_at) values ($1, now())`, [a.subject])));
      expect(state).toBe("23503");
    });
  });

  it("o snapshot de B não contém nada de A", async () => {
    const snap = await t.as(B, (s) => s.snapshot());
    const serialized = JSON.stringify(snap);
    for (const id of [a.tx, a.subject, a.book, a.plan, a.session, a.goal, a.tpl]) {
      expect(serialized).not.toContain(id);
    }
    expect(snap.data.transactions).toHaveLength(0);
    expect(snap.data.timer).toBeNull();
    expect(snap.profile?.displayName).toBe("bruno");
  });

  it("comando de B não afeta A: excluir o lançamento de A com o id dele não apaga nada", async () => {
    await t.as(B, (s) => s.command({ type: "transaction.delete", id: a.tx }));
    const [row] = await t.admin<{ n: number }>("select count(*)::int as n from public.transactions where id = $1", [a.tx]);
    expect(row.n).toBe(1);
  });
});

describe("sem login (papel anon)", () => {
  it.each(["transactions", "profiles", "categories", "study_timers"])("não lê %s", async (table) => {
    expect(await t.anon((s) => sqlState(s.query(`select * from public.${table}`)))).toBe("42501");
  });

  it("não chama get_snapshot nem apply_command", async () => {
    expect(await t.anon((s) => sqlState(s.query("select public.get_snapshot()")))).toBe("42501");
    expect(await t.anon((s) => sqlState(s.query("select public.apply_command('{}'::jsonb)")))).toBe("42501");
  });

  it("só o ping() (keep-alive) é público, e devolve só a hora", async () => {
    const [row] = await t.anon((s) => s.query<{ ping: string }>("select public.ping() as ping"));
    expect(new Date(row.ping).getTime()).toBeGreaterThan(0);
  });
});

describe("o usuário logado não escreve onde não deve", () => {
  it("não cria nem apaga perfis (só o gatilho de cadastro cria)", async () => {
    expect(await t.as(A, (s) => sqlState(s.query("insert into public.profiles (id) values (gen_random_uuid())")))).toBe("42501");
    expect(await t.as(A, (s) => sqlState(s.query("delete from public.profiles")))).toBe("42501");
  });

  it("edita o próprio perfil", async () => {
    await t.as(A, (s) => s.query("update public.profiles set display_name = 'Ana M.'"));
    const [row] = await t.admin<{ display_name: string }>("select display_name from public.profiles where id = $1", [A]);
    expect(row.display_name).toBe("Ana M.");
  });

  it("não executa as funções de cadastro (security definer)", async () => {
    expect(await t.as(A, (s) => sqlState(s.query("select private.seed_defaults($1)", [B])))).toBe("42501");
  });

  it("apply_command exige usuário: sem sub no JWT é recusado com mensagem clara", async () => {
    await t.pg.exec("set role authenticated");
    try {
      const message = await sqlMessage(t.pg.query("select public.apply_command('{\"type\":\"study.discard\"}'::jsonb)"));
      expect(message).toBe("Não autenticado.");
    } finally {
      await t.pg.exec("reset role");
    }
  });

  it("comando desconhecido é recusado", async () => {
    const message = await t.as(A, (s) => sqlMessage(s.query("select public.apply_command('{\"type\":\"nope\"}'::jsonb)")));
    expect(message).toContain("Comando desconhecido: nope");
  });
});

describe("permissões de execução (trava contra função nova esquecida)", () => {
  type Fn = { schema: string; name: string; anon: boolean; authenticated: boolean };
  let fns: Fn[];
  beforeAll(async () => {
    fns = await t.admin<Fn>(`
      select n.nspname as schema, p.proname as name,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prokind = 'f'
      order by 1, 2`);
  });

  it("existem funções de verdade para conferir (o teste não é vazio)", () => {
    expect(fns.length).toBeGreaterThan(30);
  });

  it("sem login (anon / PUBLIC): NENHUMA função é executável, exceto ping()", () => {
    const open = fns.filter((f) => f.anon).map((f) => `${f.schema}.${f.name}`);
    expect(open).toEqual(["public.ping"]);
  });

  it("logado: só a API pública e os comandos; nada de funções internas (cadastro, gatilhos)", () => {
    const allowed = fns.filter((f) => f.authenticated).map((f) => `${f.schema}.${f.name}`);
    const commands = allowed.filter((n) => n.startsWith("private.cmd_"));
    const rest = allowed.filter((n) => !n.startsWith("private.cmd_")).sort();
    expect(rest).toEqual([
      "private.app_now", "private.epoch_ms", "private.outcome", "public.ai_record", "public.ai_reserve",
      "public.app_tz", "public.apply_command", "public.get_snapshot", "public.ping",
    ]);
    // todo comando existente é executável (senão o despachante falharia só em produção)
    const allCommands = fns.filter((f) => f.name.startsWith("cmd_")).length;
    expect(commands).toHaveLength(allCommands);
    expect(allCommands).toBeGreaterThanOrEqual(33);
  });

  it("só as funções `security definer` CONHECIDAS existem (cada uma é uma elevação de privilégio consciente)", async () => {
    // security definer roda com os direitos do dono da função, ignorando o RLS: nenhuma pode aparecer sem revisão.
    const definers = await t.admin<{ name: string; schema: string }>(
      `select n.nspname as schema, p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef order by 1, 2`);
    expect(definers.map((d) => `${d.schema}.${d.name}`)).toEqual([
      "private.handle_new_user", // gatilho do cadastro (cria perfil e catálogos; auth.uid() é nulo ali)
      "private.seed_defaults", // idem
      "public.ai_record", // contador de uso da IA (estado do servidor, não do usuário)
      "public.ai_reserve", // idem
    ]);
  });

  it("toda função `security definer` fixa o search_path (evita sequestro por objeto com o mesmo nome)", async () => {
    const loose = await t.admin<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(loose).toEqual([]);
  });

  it("as funções de cadastro e os gatilhos NÃO são executáveis por quem está logado", () => {
    const internal = ["seed_defaults", "handle_new_user", "set_updated_at", "reading_session_within_book", "book_pages_cover_readings"];
    for (const name of internal) {
      const fn = fns.find((f) => f.name === name);
      expect(fn, name).toBeDefined();
      expect(fn!.authenticated, name).toBe(false);
      expect(fn!.anon, name).toBe(false);
    }
  });
});
