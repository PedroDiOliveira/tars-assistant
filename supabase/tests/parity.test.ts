import { beforeAll, describe, expect, it } from "vitest";
import type { Command } from "@/domain/commands";
import { applyCommand } from "@/domain/reducers";
import type { AppData } from "@/domain/snapshot";
import type { Book, SessionExercise, WorkoutSession } from "@/domain/types";
import { dateKeyFromInstant } from "@/lib/dates";
import { uid } from "@/lib/id";
import { TestDb } from "./harness";

/**
 * PARIDADE: o reducer TypeScript (`applyCommand`) e o banco (`apply_command`) são duas implementações da
 * mesma regra. Aqui cada comando roda nas duas, e depois de CADA passo o estado inteiro tem de ser igual
 * e o desfecho (ou a mensagem de erro) também. Se alguém mudar uma regra só de um lado, isto quebra.
 */

let t: TestDb;

beforeAll(async () => {
  t = await TestDb.create();
});

/** Arrays com `id` são ordenados por id (o banco e o reducer ordenam diferente); o resto fica como está. */
function normalize<T>(value: T): T {
  if (Array.isArray(value)) {
    const items = value.map(normalize);
    const hasId = items.length > 0 && items.every((i) => i && typeof i === "object" && "id" in i);
    return (hasId ? [...items].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id))) : items) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)])) as T;
  }
  return value;
}

class Scenario {
  private constructor(readonly user: string, private expected: AppData, readonly base: AppData) {}

  static async start(): Promise<Scenario> {
    const user = await t.createUser();
    const base = (await t.as(user, (s) => s.snapshot())).data;
    return new Scenario(user, base, base);
  }

  category(name: string, type: "income" | "expense") {
    return this.base.categories.find((c) => c.name === name && c.type === type)!.id;
  }
  exercise(name: string) {
    return this.base.exercises.find((e) => e.name === name)!;
  }
  get state() {
    return this.expected;
  }

  /** Roda o comando no reducer e no banco; confere desfecho/erro e o estado inteiro. */
  async step(command: Command): Promise<{ outcome?: string; error?: string }> {
    if ("nowMs" in command) await t.setNow(command.nowMs);
    const reduced = applyCommand(this.expected, command);

    let dbOutcome: string | undefined;
    let dbError: string | undefined;
    try {
      dbOutcome = (await t.as(this.user, (s) => s.command(command))).outcome;
    } catch (error) {
      dbError = (error as Error).message;
    }

    if (reduced.ok) {
      expect(dbError, `${command.type}: o banco recusou o que o reducer aceitou`).toBeUndefined();
      expect(dbOutcome, `${command.type}: desfecho`).toBe(reduced.outcome);
      this.expected = reduced.data;
    } else {
      expect(dbError, `${command.type}: o banco deveria recusar com a mesma mensagem`).toBe(reduced.error);
    }

    const actual = (await t.as(this.user, (s) => s.snapshot())).data;
    expect(normalize(actual), `${command.type}: estado do banco ≠ estado do reducer`).toEqual(normalize(this.expected));
    return reduced.ok ? { outcome: reduced.outcome } : { error: reduced.error };
  }
}

/* ---------- finanças ---------- */

describe("paridade — finanças", () => {
  it("lançamentos: adicionar, repetir, editar (substituindo campos), excluir, excluir de novo", async () => {
    const s = await Scenario.start();
    const food = s.category("Alimentação", "expense");
    const transport = s.category("Transporte", "expense");
    const salary = s.category("Salário", "income");
    const [income, expense] = [uid(), uid()];

    await s.step({ type: "transaction.add", transaction: { id: income, type: "income", amountCents: 350_000, categoryId: salary, description: "Salário", occurredOn: "2026-10-05", source: "manual" } });
    const add: Command = { type: "transaction.add", transaction: { id: expense, type: "expense", amountCents: 4200, categoryId: food, description: "Outback", occurredOn: "2026-10-07", source: "ai" } };
    await s.step(add);
    await s.step(add); // repetição (toque duplo): não duplica
    expect(s.state.transactions).toHaveLength(2);

    await s.step({ type: "transaction.update", id: expense, fields: { type: "expense", amountCents: 5000, categoryId: transport, description: "", occurredOn: "2026-10-06" } });
    expect(s.state.transactions.find((x) => x.id === expense)).toMatchObject({ source: "ai", description: "", categoryId: transport });

    await s.step({ type: "transaction.delete", id: expense });
    await s.step({ type: "transaction.delete", id: expense }); // já não existe: não é erro
    expect(s.state.transactions).toHaveLength(1);
  });

  it("atalhos: adicionar, repetir e remover", async () => {
    const s = await Scenario.start();
    const template = { id: uid(), label: "Almoço", type: "expense" as const, amountCents: 3500, categoryId: s.category("Alimentação", "expense") };
    await s.step({ type: "template.add", template });
    await s.step({ type: "template.add", template });
    await s.step({ type: "template.delete", id: template.id });
    expect(s.state.templates).toHaveLength(0);
  });
});

/* ---------- metas ---------- */

describe("paridade — metas por vigência", () => {
  it("nova, substituição (mantém o id), vigência futura, remoção (0) e escopos", async () => {
    const s = await Scenario.start();
    const subject = uid();
    await s.step({ type: "subject.add", subject: { id: subject, name: "SQL", hue: 120 } });

    const goal = (over: Partial<{ id: string; kind: "savings" | "category_budget" | "workout_sessions" | "study_minutes" | "reading_pages"; scopeId: string | null; validFrom: string; target: number }>) =>
      ({ type: "goal.set", goal: { id: uid(), kind: "savings", scopeId: null, validFrom: "2026-10-01", target: 100_000, ...over } }) as Command;

    await s.step(goal({}));
    await s.step(goal({ target: 150_000 })); // mesma chave, id novo: atualiza e mantém o id da linha
    expect(s.state.goals).toHaveLength(1);
    await s.step(goal({ validFrom: "2026-11-01", target: 0 })); // "meta removida" daqui para a frente
    await s.step(goal({ kind: "category_budget", scopeId: s.category("Alimentação", "expense"), target: 80_000 }));
    await s.step(goal({ kind: "workout_sessions", validFrom: "2026-10-05", target: 4 }));
    await s.step(goal({ kind: "study_minutes", validFrom: "2026-10-05", target: 600 }));
    await s.step(goal({ kind: "study_minutes", scopeId: subject, validFrom: "2026-10-05", target: 120 }));
    await s.step(goal({ kind: "reading_pages", validFrom: "2026-10-05", target: 70 }));
    expect(s.state.goals).toHaveLength(7);
  });
});

/* ---------- treino ---------- */

function session(s: Scenario, startedAt: number, over: Partial<WorkoutSession> = {}): WorkoutSession {
  const supino = s.exercise("Supino reto");
  const barra = s.exercise("Barra fixa");
  const exercises: SessionExercise[] = [
    { exerciseId: supino.id, nameSnapshot: supino.name, loadType: "external", plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90, sets: [{ weightKg: 60, reps: 8, done: true }, { weightKg: 62.5, reps: 6, done: true }] },
    { exerciseId: barra.id, nameSnapshot: barra.name, loadType: "bodyweight", plannedSets: 2, repMin: 5, repMax: 10, restSeconds: 120, sets: [{ weightKg: 0, reps: 9, done: true }] },
  ];
  return {
    id: uid(), planId: null, nameSnapshot: "Treino A — Peito", startedAt, finishedAt: startedAt + 3_000_000,
    // Quem decide é o domínio no cliente e o banco no servidor: o teste prova que decidem igual.
    occurredOn: dateKeyFromInstant(startedAt), exercises, ...over,
  };
}

describe("paridade — treino", () => {
  it("finalizar guarda snapshots e séries, repetir não duplica, excluir apaga tudo", async () => {
    const s = await Scenario.start();
    const w = session(s, Date.UTC(2026, 9, 7, 17, 0), { notes: "Pesado hoje" });
    await s.step({ type: "workout.finish", session: w });
    await s.step({ type: "workout.finish", session: w });
    expect(s.state.sessions).toHaveLength(1);
    await s.step({ type: "workout.deleteSession", id: w.id });
    const rows = await t.admin<{ n: number }>("select (select count(*) from public.session_exercises where user_id = $1) + (select count(*) from public.exercise_sets where user_id = $1) as n", [s.user]);
    expect(Number(rows[0].n)).toBe(0); // cascata: nenhuma série órfã
  });

  it("treino que começa às 23:50 (São Paulo) e termina depois da meia-noite pertence ao dia em que COMEÇOU", async () => {
    const s = await Scenario.start();
    const startedAt = Date.UTC(2026, 9, 8, 2, 50); // 07/10 23:50 em São Paulo
    const w = session(s, startedAt, { finishedAt: startedAt + 40 * 60_000 });
    await s.step({ type: "workout.finish", session: w });
    expect(s.state.sessions[0].occurredOn).toBe("2026-10-07");
  });

  it("sessão sem nenhuma série concluída é recusada pelo banco", async () => {
    const s = await Scenario.start();
    const empty = session(s, Date.UTC(2026, 9, 7, 17, 0));
    empty.exercises = [];
    await expect(t.as(s.user, (x) => x.command({ type: "workout.finish", session: empty }))).rejects.toThrow("Conclua ao menos uma série para salvar o treino.");
  });
});

/* ---------- estudos ---------- */

describe("paridade — cronômetro e estudos", () => {
  const T0 = Date.UTC(2026, 9, 7, 17, 0); // 07/10/2026 14:00 em São Paulo
  const min = (n: number) => n * 60_000;

  async function withSubject() {
    const s = await Scenario.start();
    const subject = uid();
    await s.step({ type: "subject.add", subject: { id: subject, name: "Redes", objective: "Banco do Brasil", hue: 150 } });
    return { s, subject };
  }

  it("iniciar, ignorar o 2º iniciar, pausar (2x sem somar em dobro), retomar e finalizar", async () => {
    const { s, subject } = await withSubject();
    expect((await s.step({ type: "study.start", subjectId: subject, nowMs: T0 })).outcome).toBe("saved");
    expect((await s.step({ type: "study.start", subjectId: subject, nowMs: T0 + 5_000 })).outcome).toBe("none");
    await s.step({ type: "study.pause", nowMs: T0 + min(10) });
    await s.step({ type: "study.pause", nowMs: T0 + min(15) });
    await s.step({ type: "study.resume", nowMs: T0 + min(20) });
    await s.step({ type: "study.resume", nowMs: T0 + min(21) });
    const done = await s.step({ type: "study.finish", sessionId: uid(), nowMs: T0 + min(20) + min(30) });
    expect(done.outcome).toBe("saved");
    expect(s.state.studySessions[0].durationSeconds).toBe(10 * 60 + 30 * 60);
    expect(s.state.timer).toBeNull();
  });

  it("menos de 1 minuto é descartado; finalizar sem cronômetro responde 'none'", async () => {
    const { s, subject } = await withSubject();
    await s.step({ type: "study.start", subjectId: subject, nowMs: T0 });
    expect((await s.step({ type: "study.finish", sessionId: uid(), nowMs: T0 + 30_000 })).outcome).toBe("too_short");
    expect((await s.step({ type: "study.finish", sessionId: uid(), nowMs: T0 + 31_000 })).outcome).toBe("none");
    expect(s.state.studySessions).toHaveLength(0);
  });

  it("repetir o mesmo 'finalizar' (resposta perdida) devolve o mesmo resultado sem duplicar", async () => {
    const { s, subject } = await withSubject();
    const sessionId = uid();
    await s.step({ type: "study.start", subjectId: subject, nowMs: T0 });
    await s.step({ type: "study.finish", sessionId, nowMs: T0 + min(45) });
    expect((await s.step({ type: "study.finish", sessionId, nowMs: T0 + min(46) })).outcome).toBe("saved");
    expect(s.state.studySessions).toHaveLength(1);
  });

  it("cronômetro esquecido por 3 dias é registrado com o teto de 24 h, não recusado", async () => {
    const { s, subject } = await withSubject();
    await s.step({ type: "study.start", subjectId: subject, nowMs: T0 });
    await s.step({ type: "study.finish", sessionId: uid(), nowMs: T0 + 3 * 86_400_000 });
    expect(s.state.studySessions[0].durationSeconds).toBe(86_400);
  });

  it("sessão que cruza a meia-noite pertence ao dia em que começou (fuso de São Paulo)", async () => {
    const { s, subject } = await withSubject();
    const start = Date.UTC(2026, 9, 8, 2, 50); // 07/10 23:50 em São Paulo
    await s.step({ type: "study.start", subjectId: subject, nowMs: start });
    await s.step({ type: "study.finish", sessionId: uid(), nowMs: start + min(20) });
    expect(s.state.studySessions[0].occurredOn).toBe("2026-10-07");
  });

  it("descartar remove o cronômetro sem registrar nada", async () => {
    const { s, subject } = await withSubject();
    await s.step({ type: "study.start", subjectId: subject, nowMs: T0 });
    await s.step({ type: "study.discard" });
    expect(s.state.timer).toBeNull();
    expect(s.state.studySessions).toHaveLength(0);
  });

  it("sessão manual: adicionar, repetir, editar (omitir a observação a limpa) e excluir", async () => {
    const { s, subject } = await withSubject();
    const add: Command = { type: "studySession.add", session: { id: uid(), subjectId: subject, source: "manual", occurredOn: "2026-10-06", durationSeconds: 3600, notes: "Joins" } };
    await s.step(add);
    await s.step(add);
    const id = (add as Extract<Command, { type: "studySession.add" }>).session.id;
    await s.step({ type: "studySession.update", id, fields: { subjectId: subject, occurredOn: "2026-10-05", durationSeconds: 5400 } });
    expect(s.state.studySessions[0]).not.toHaveProperty("notes");
    await s.step({ type: "studySession.delete", id });
    expect(s.state.studySessions).toHaveLength(0);
  });
});

/* ---------- leitura ---------- */

describe("paridade — leitura", () => {
  const book = (over: Partial<Book> = {}): Book => ({ id: uid(), title: "Livro", author: "Autora", totalPages: 320, initialPage: 0, status: "reading", ...over });
  const reading = (bookId: string, startPage: number, endPage: number) =>
    ({ type: "reading.addSession", session: { id: uid(), bookId, occurredOn: "2026-10-07", startPage, endPage } }) as Command;

  it("30→50 registra 20 páginas; chegar à última página conclui o livro", async () => {
    const s = await Scenario.start();
    const b = book({ initialPage: 30 });
    await s.step({ type: "book.add", book: b });
    await s.step({ type: "book.add", book: b }); // repetição
    await s.step(reading(b.id, 30, 50));
    expect(s.state.readingSessions).toHaveLength(1);
    expect(s.state.books[0].status).toBe("reading");
    await s.step(reading(b.id, 300, 320));
    expect(s.state.books[0].status).toBe("done");
  });

  it("ler um livro da lista de desejos ou pausado passa a 'lendo'", async () => {
    const s = await Scenario.start();
    const [want, paused] = [book({ status: "want" }), book({ status: "paused", title: "Outro" })];
    await s.step({ type: "book.add", book: want });
    await s.step({ type: "book.add", book: paused });
    await s.step(reading(want.id, 0, 10));
    await s.step(reading(paused.id, 0, 10));
    expect(s.state.books.map((b) => b.status)).toEqual(["reading", "reading"]);
  });

  it("mensagens de erro IDÊNTICAS nos dois lados, sem alterar o estado", async () => {
    const s = await Scenario.start();
    const b = book();
    await s.step({ type: "book.add", book: b });
    expect((await s.step(reading(b.id, 40, 40))).error).toBe("A página final deve ser maior que a inicial.");
    expect((await s.step(reading(b.id, 60, 50))).error).toBe("A página final deve ser maior que a inicial.");
    expect((await s.step(reading(b.id, 300, 400))).error).toBe("O livro tem 320 páginas.");
    expect((await s.step(reading(b.id, -5, 10))).error).toBe("As páginas não podem ser negativas.");
    expect((await s.step(reading(uid(), 0, 10))).error).toBe("Livro não encontrado.");
    expect(s.state.readingSessions).toHaveLength(0);
  });

  it("repetir a mesma sessão não soma páginas; situação e exclusão", async () => {
    const s = await Scenario.start();
    const b = book();
    await s.step({ type: "book.add", book: b });
    const add = reading(b.id, 0, 20);
    await s.step(add);
    await s.step(add);
    expect(s.state.readingSessions).toHaveLength(1);
    await s.step({ type: "book.setStatus", id: b.id, status: "paused" });
    await s.step({ type: "reading.deleteSession", id: (add as Extract<Command, { type: "reading.addSession" }>).session.id });
    expect(s.state.readingSessions).toHaveLength(0);
  });
});

/* ---------- catálogos e edições (migração 0011) ---------- */

describe("paridade — catálogos", () => {
  it("categorias: adicionar, repetir, nome repetido, editar, arquivar/desarquivar (a mesma mensagem nos dois lados)", async () => {
    const s = await Scenario.start();
    const id = uid();
    const add: Command = { type: "category.add", category: { id, name: "Pets", type: "expense", icon: "dots", hue: 130 } };
    await s.step(add);
    await s.step(add); // repetir: idempotente
    expect((await s.step({ type: "category.add", category: { id: uid(), name: "  pets ", type: "expense", icon: "dots", hue: 1 } })).error).toBe("Já existe uma categoria com este nome.");
    // Maiúsculas/minúsculas só são comparadas de forma idêntica para ASCII: `lower()` com acento depende do
    // collation do banco (no Supabase, UTF-8, funciona; no PGlite de teste, não). Por isso não há asserção com acento.
    expect((await s.step({ type: "category.add", category: { id: uid(), name: "TRANSPORTE", type: "expense", icon: "dots", hue: 1 } })).error).toBe("Já existe uma categoria com este nome.");
    await s.step({ type: "category.add", category: { id: uid(), name: "Pets", type: "income", icon: "plus", hue: 2 } }); // outro tipo: permitido
    await s.step({ type: "category.update", id, fields: { name: "Animais", icon: "heart", hue: 111 } });
    expect((await s.step({ type: "category.update", id, fields: { name: "transporte", icon: "car", hue: 1 } })).error).toBe("Já existe uma categoria com este nome.");
    await s.step({ type: "category.archive", id, archived: true });
    await s.step({ type: "category.archive", id, archived: true }); // arquivar de novo: nada muda
    await s.step({ type: "category.add", category: { id: uid(), name: "Animais", type: "expense", icon: "dots", hue: 3 } }); // nome liberado
    expect((await s.step({ type: "category.archive", id, archived: false })).error).toBe("Já existe uma categoria com este nome.");
    expect((await s.step({ type: "category.update", id: uid(), fields: { name: "X", icon: "bag", hue: 1 } })).error).toBe("Categoria não encontrada.");
  });

  it("categoria arquivada continua nos lançamentos antigos e some só das escolhas", async () => {
    const s = await Scenario.start();
    const food = s.category("Alimentação", "expense");
    await s.step({ type: "transaction.add", transaction: { id: uid(), type: "expense", amountCents: 500, categoryId: food, description: "", occurredOn: "2026-10-07", source: "manual" } });
    await s.step({ type: "category.archive", id: food, archived: true });
    expect(s.state.transactions).toHaveLength(1);
    expect(s.state.categories.find((c) => c.id === food)).toMatchObject({ archived: true });
  });

  it("exercícios: adicionar, repetir, nome repetido, editar, arquivar", async () => {
    const s = await Scenario.start();
    const id = uid();
    const add: Command = { type: "exercise.add", exercise: { id, name: "Remada unilateral", muscleGroup: "Costas", loadType: "external" } };
    await s.step(add);
    await s.step(add);
    expect((await s.step({ type: "exercise.add", exercise: { id: uid(), name: "remada unilateral", muscleGroup: "x", loadType: "external" } })).error).toBe("Já existe um exercício com este nome.");
    await s.step({ type: "exercise.update", id, fields: { name: "Remada serrote", muscleGroup: "Costas", loadType: "external" } });
    expect((await s.step({ type: "exercise.update", id, fields: { name: "Supino reto", muscleGroup: "Peito", loadType: "external" } })).error).toBe("Já existe um exercício com este nome.");
    await s.step({ type: "exercise.archive", id, archived: true });
    await s.step({ type: "exercise.archive", id, archived: false });
    expect((await s.step({ type: "exercise.archive", id: uid(), archived: true })).error).toBe("Exercício não encontrado.");
  });

  it("matérias: nome repetido, editar (omitir o objetivo o limpa), arquivar e desarquivar", async () => {
    const s = await Scenario.start();
    const id = uid();
    await s.step({ type: "subject.add", subject: { id, name: "Redes", objective: "BB", hue: 120 } });
    expect((await s.step({ type: "subject.add", subject: { id: uid(), name: "REDES", hue: 1 } })).error).toBe("Já existe uma matéria com este nome.");
    await s.step({ type: "subject.update", id, fields: { name: "Redes de computadores" } });
    expect(s.state.subjects[0]).not.toHaveProperty("objective");
    await s.step({ type: "subject.archive", id, archived: true });
    await s.step({ type: "subject.add", subject: { id: uid(), name: "Redes de computadores", hue: 2 } });
    expect((await s.step({ type: "subject.archive", id, archived: false })).error).toBe("Já existe uma matéria com este nome.");
    expect((await s.step({ type: "subject.update", id: uid(), fields: { name: "X" } })).error).toBe("Matéria não encontrada.");
  });
});

describe("paridade — fichas", () => {
  const item = (exerciseId: string, over = {}) => ({ exerciseId, plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90, ...over });

  it("criar, substituir (ordem dos exercícios), observações vazias, arquivar e editar arquivada", async () => {
    const s = await Scenario.start();
    const [supino, barra, remada] = [s.exercise("Supino reto").id, s.exercise("Barra fixa").id, s.exercise("Remada curvada").id];
    const id = uid();
    await s.step({ type: "plan.save", plan: { id, name: "Treino A", notes: "Peito", exercises: [item(supino), item(barra)] } });
    await s.step({ type: "plan.save", plan: { id, name: "Treino A", exercises: [item(barra, { plannedSets: 5 }), item(remada), item(supino, { restSeconds: 45 })] } });
    expect(s.state.plans).toHaveLength(1);
    expect(s.state.plans[0].exercises.map((e) => e.exerciseId)).toEqual([barra, remada, supino]);
    expect(s.state.plans[0]).not.toHaveProperty("notes");
    await s.step({ type: "plan.archive", id, archived: true });
    await s.step({ type: "plan.save", plan: { id, name: "Treino A v2", exercises: [item(supino)] } });
    expect(s.state.plans[0]).toMatchObject({ name: "Treino A v2", archived: true });
    await s.step({ type: "plan.archive", id, archived: false });
    expect(s.state.plans[0]).not.toHaveProperty("archived");
    expect((await s.step({ type: "plan.archive", id: uid(), archived: true })).error).toBe("Ficha não encontrada.");
  });

  it("exercício inexistente na ficha é recusado com a mesma mensagem, sem criar a ficha", async () => {
    const s = await Scenario.start();
    expect((await s.step({ type: "plan.save", plan: { id: uid(), name: "Fantasma", exercises: [item(uid())] } })).error).toBe("Exercício não encontrado.");
    expect(s.state.plans).toHaveLength(0);
  });

  it("editar a ficha ou renomear o exercício NÃO reescreve um treino já feito", async () => {
    const s = await Scenario.start();
    const supino = s.exercise("Supino reto");
    const id = uid();
    await s.step({ type: "plan.save", plan: { id, name: "Treino A", exercises: [item(supino.id)] } });
    const w = session(s, Date.UTC(2026, 9, 7, 17, 0), { planId: id });
    await s.step({ type: "workout.finish", session: w });
    await s.step({ type: "plan.save", plan: { id, name: "Outra coisa", exercises: [item(s.exercise("Barra fixa").id)] } });
    await s.step({ type: "exercise.update", id: supino.id, fields: { name: "Supino (renomeado)", muscleGroup: "Peito", loadType: "external" } });
    expect(s.state.sessions[0].nameSnapshot).toBe("Treino A — Peito");
    expect(s.state.sessions[0].exercises[0].nameSnapshot).toBe("Supino reto");
  });

  it("apagar o catálogo não é possível: arquivar o exercício mantém o histórico e a ficha", async () => {
    const s = await Scenario.start();
    const supino = s.exercise("Supino reto").id;
    const id = uid();
    await s.step({ type: "plan.save", plan: { id, name: "Treino A", exercises: [item(supino)] } });
    await s.step({ type: "exercise.archive", id: supino, archived: true });
    expect(s.state.plans[0].exercises).toHaveLength(1);
  });
});

describe("paridade — livros e leituras (edição)", () => {
  const book = (over: Partial<Book> = {}): Book => ({ id: uid(), title: "Livro", totalPages: 320, initialPage: 30, status: "reading", ...over });
  const reading = (bookId: string, startPage: number, endPage: number, id = uid()) =>
    ({ type: "reading.addSession", session: { id, bookId, occurredOn: "2026-10-07", startPage, endPage } }) as Command;

  it("editar o livro mantém a situação; reduzir o total abaixo do lido é recusado com a mesma mensagem", async () => {
    const s = await Scenario.start();
    const b = book({ author: "Autora", status: "paused" });
    await s.step({ type: "book.add", book: b });
    await s.step(reading(b.id, 30, 50));
    await s.step({ type: "book.update", id: b.id, fields: { title: "Novo título", totalPages: 400, initialPage: 30 } });
    expect(s.state.books[0]).toMatchObject({ title: "Novo título", status: "reading" });
    expect(s.state.books[0]).not.toHaveProperty("author");
    expect((await s.step({ type: "book.update", id: b.id, fields: { title: "L", totalPages: 40, initialPage: 0 } })).error).toBe("O livro já tem leituras até a página 50.");
    expect((await s.step({ type: "book.update", id: b.id, fields: { title: "L", totalPages: 100, initialPage: 101 } })).error).toBe("A página inicial passa do total do livro.");
    await s.step({ type: "book.update", id: b.id, fields: { title: "L", totalPages: 50, initialPage: 0 } });
    expect((await s.step({ type: "book.update", id: uid(), fields: { title: "L", totalPages: 10, initialPage: 0 } })).error).toBe("Livro não encontrado.");
  });

  it("excluir o livro apaga as leituras dele (e só as dele); repetir não faz nada", async () => {
    const s = await Scenario.start();
    const [a, b] = [book(), book({ title: "Outro", initialPage: 0 })];
    await s.step({ type: "book.add", book: a });
    await s.step({ type: "book.add", book: b });
    await s.step(reading(a.id, 30, 50));
    await s.step(reading(b.id, 0, 10));
    await s.step({ type: "book.delete", id: a.id });
    await s.step({ type: "book.delete", id: a.id });
    expect(s.state.books.map((x) => x.id)).toEqual([b.id]);
    expect(s.state.readingSessions).toHaveLength(1);
  });

  it("editar uma leitura: mesmas regras e mensagens do registro, e chegar ao fim conclui o livro", async () => {
    const s = await Scenario.start();
    const b = book();
    const rid = uid();
    await s.step({ type: "book.add", book: b });
    await s.step(reading(b.id, 30, 50, rid));
    const edit = (startPage: number, endPage: number) => s.step({ type: "reading.updateSession", id: rid, fields: { occurredOn: "2026-10-08", startPage, endPage } });
    expect((await edit(50, 40)).error).toBe("A página final deve ser maior que a inicial.");
    expect((await edit(10, 999)).error).toBe("O livro tem 320 páginas.");
    expect((await edit(-5, 10)).error).toBe("As páginas não podem ser negativas.");
    await edit(30, 80);
    expect(s.state.readingSessions[0]).toMatchObject({ startPage: 30, endPage: 80, occurredOn: "2026-10-08" });
    await edit(30, 320);
    expect(s.state.books[0].status).toBe("done");
    expect((await s.step({ type: "reading.updateSession", id: uid(), fields: { occurredOn: "2026-10-08", startPage: 0, endPage: 1 } })).error).toBe("Sessão de leitura não encontrada.");
  });
});

describe("snapshot", () => {
  it("devolve o relógio do servidor (para corrigir a diferença do relógio do aparelho)", async () => {
    const s = await Scenario.start();
    const at = Date.UTC(2026, 9, 7, 12, 0);
    await t.setNow(at);
    const snap = await t.as(s.user, (x) => x.snapshot());
    expect(snap.serverNow).toBe(at);
    await t.setNow(null);
  });
});
