import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { applyCommand, DUPLICATE_CATEGORY, DUPLICATE_EXERCISE, DUPLICATE_SUBJECT } from "./reducers";
import { pagesInPeriod } from "./reading";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import type { Category, Exercise, ReadingSession, Subject, WorkoutPlan } from "./types";

const ok = (data: AppData, command: Command) => {
  const applied = applyCommand(data, command);
  if (!applied.ok) throw new Error(`esperava sucesso: ${applied.error}`);
  return applied.data;
};
const fails = (data: AppData, command: Command) => {
  const applied = applyCommand(data, command);
  if (applied.ok) throw new Error("esperava falha");
  return applied.error;
};

const food: Category = { id: "c-food", name: "Alimentação", type: "expense", icon: "utensils", hue: 100 };
const salary: Category = { id: "c-salary", name: "Salário", type: "income", icon: "wage", hue: 150 };
const supino: Exercise = { id: "e-supino", name: "Supino reto", muscleGroup: "Peito", loadType: "external" };
const barra: Exercise = { id: "e-barra", name: "Barra fixa", muscleGroup: "Costas", loadType: "bodyweight" };
const sql: Subject = { id: "s-sql", name: "SQL", hue: 120, objective: "BB" };

const base: AppData = { ...EMPTY_APP_DATA, categories: [food, salary], exercises: [supino, barra], subjects: [sql] };

describe("categorias", () => {
  it("adicionar, repetir (idempotente) e recusar nome repetido do mesmo tipo (sem diferenciar maiúsculas)", () => {
    const add: Command = { type: "category.add", category: { id: "c-pets", name: "Pets", type: "expense", icon: "dots", hue: 130 } };
    const once = ok(base, add);
    expect(ok(once, add).categories).toHaveLength(3);
    expect(fails(once, { type: "category.add", category: { id: "c-x", name: "  pets ", type: "expense", icon: "dots", hue: 1 } })).toBe(DUPLICATE_CATEGORY);
    // mesmo nome em outro tipo é permitido (existe "Outros" de receita e de despesa)
    expect(ok(once, { type: "category.add", category: { id: "c-x", name: "Pets", type: "income", icon: "dots", hue: 1 } }).categories).toHaveLength(4);
  });

  it("editar troca nome/ícone/matiz e preserva o tipo; não permite o nome de outra categoria", () => {
    const data = ok(base, { type: "category.update", id: "c-food", fields: { name: "Mercado", icon: "bag", hue: 111 } });
    expect(data.categories[0]).toEqual({ id: "c-food", name: "Mercado", type: "expense", icon: "bag", hue: 111 });
    const two = ok(base, { type: "category.add", category: { id: "c2", name: "Lazer", type: "expense", icon: "fun", hue: 1 } });
    expect(fails(two, { type: "category.update", id: "c2", fields: { name: "alimentação", icon: "fun", hue: 1 } })).toBe(DUPLICATE_CATEGORY);
    expect(ok(two, { type: "category.update", id: "c2", fields: { name: "Lazer", icon: "bag", hue: 2 } }).categories[2].icon).toBe("bag");
  });

  it("arquivar esconde sem apagar, libera o nome, e desarquivar volta a checar o nome", () => {
    let data = ok(base, { type: "category.archive", id: "c-food", archived: true });
    expect(data.categories[0]).toMatchObject({ id: "c-food", archived: true });
    // o nome ficou livre para uma categoria nova
    data = ok(data, { type: "category.add", category: { id: "c-new", name: "Alimentação", type: "expense", icon: "utensils", hue: 5 } });
    // agora desarquivar a antiga colidiria
    expect(fails(data, { type: "category.archive", id: "c-food", archived: false })).toBe(DUPLICATE_CATEGORY);
    data = ok(data, { type: "category.archive", id: "c-new", archived: true });
    data = ok(data, { type: "category.archive", id: "c-food", archived: false });
    expect(data.categories[0]).not.toHaveProperty("archived"); // ativo = sem a chave
  });

  it("categoria arquivada continua dando nome aos lançamentos antigos", () => {
    const withTx = ok(base, { type: "transaction.add", transaction: { id: "t1", type: "expense", amountCents: 100, categoryId: "c-food", description: "", occurredOn: "2026-10-07", source: "manual" } });
    const archived = ok(withTx, { type: "category.archive", id: "c-food", archived: true });
    expect(archived.transactions).toHaveLength(1);
    expect(archived.categories.find((c) => c.id === "c-food")?.name).toBe("Alimentação");
  });

  it("id inexistente: erro claro", () => {
    expect(fails(base, { type: "category.update", id: "nope", fields: { name: "X", icon: "bag", hue: 1 } })).toBe("Categoria não encontrada.");
    expect(fails(base, { type: "category.archive", id: "nope", archived: true })).toBe("Categoria não encontrada.");
  });
});

describe("exercícios", () => {
  it("adicionar, repetir, editar e recusar nome repetido", () => {
    const add: Command = { type: "exercise.add", exercise: { id: "e-new", name: "Remada", muscleGroup: "Costas", loadType: "external" } };
    const once = ok(base, add);
    expect(ok(once, add).exercises).toHaveLength(3);
    expect(fails(once, { type: "exercise.add", exercise: { id: "e-y", name: "REMADA", muscleGroup: "x", loadType: "external" } })).toBe(DUPLICATE_EXERCISE);
    const edited = ok(once, { type: "exercise.update", id: "e-new", fields: { name: "Remada curvada", muscleGroup: "Costas", loadType: "external" } });
    expect(edited.exercises[2].name).toBe("Remada curvada");
    expect(fails(once, { type: "exercise.update", id: "e-new", fields: { name: "supino reto", muscleGroup: "x", loadType: "external" } })).toBe(DUPLICATE_EXERCISE);
  });

  it("arquivar não remove o exercício das sessões nem do histórico", () => {
    const archived = ok(base, { type: "exercise.archive", id: "e-supino", archived: true });
    expect(archived.exercises.find((e) => e.id === "e-supino")).toMatchObject({ archived: true });
    expect(archived.exercises).toHaveLength(2);
  });
});

describe("fichas", () => {
  const item = (exerciseId: string, over = {}) => ({ exerciseId, plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90, ...over });
  const plan = (over: Partial<WorkoutPlan> = {}): WorkoutPlan => ({ id: "p-a", name: "Treino A", exercises: [item("e-supino"), item("e-barra")], ...over });

  it("cria a ficha; salvar de novo o mesmo id substitui (não duplica), mantendo a ordem dos exercícios", () => {
    let data = ok(base, { type: "plan.save", plan: plan() });
    data = ok(data, { type: "plan.save", plan: plan({ name: "Treino A — Peito", notes: "Pesado", exercises: [item("e-barra"), item("e-supino", { plannedSets: 5 })] }) });
    expect(data.plans).toHaveLength(1);
    expect(data.plans[0]).toEqual({ id: "p-a", name: "Treino A — Peito", notes: "Pesado", exercises: [item("e-barra"), item("e-supino", { plannedSets: 5 })] });
  });

  it("observações vazias não deixam a chave; ficha arquivada continua arquivada ao ser editada", () => {
    let data = ok(base, { type: "plan.save", plan: plan({ notes: "x" }) });
    data = ok(data, { type: "plan.save", plan: plan({ notes: undefined }) });
    expect(data.plans[0]).not.toHaveProperty("notes");
    data = ok(data, { type: "plan.archive", id: "p-a", archived: true });
    data = ok(data, { type: "plan.save", plan: plan({ name: "Renomeada" }) });
    expect(data.plans[0]).toMatchObject({ name: "Renomeada", archived: true });
    data = ok(data, { type: "plan.archive", id: "p-a", archived: false });
    expect(data.plans[0]).not.toHaveProperty("archived");
  });

  it("recusa ficha com exercício que não existe", () => {
    expect(fails(base, { type: "plan.save", plan: plan({ exercises: [item("e-fantasma")] }) })).toBe("Exercício não encontrado.");
  });

  it("editar a ficha NÃO reescreve treinos já feitos (cópia própria na sessão)", () => {
    let data = ok(base, { type: "plan.save", plan: plan() });
    const session = { id: "ws-1", planId: "p-a", nameSnapshot: "Treino A", startedAt: 0, finishedAt: 1, occurredOn: "2026-10-07", exercises: [{ exerciseId: "e-supino", nameSnapshot: "Supino reto", loadType: "external" as const, plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90, sets: [{ weightKg: 60, reps: 8, done: true as const }] }] };
    data = ok(data, { type: "workout.finish", session });
    data = ok(data, { type: "plan.save", plan: plan({ name: "Totalmente outra", exercises: [item("e-barra")] }) });
    data = ok(data, { type: "exercise.update", id: "e-supino", fields: { name: "Supino reto (renomeado)", muscleGroup: "Peito", loadType: "external" } });
    expect(data.sessions[0].nameSnapshot).toBe("Treino A");
    expect(data.sessions[0].exercises[0].nameSnapshot).toBe("Supino reto");
  });
});

describe("matérias", () => {
  it("nome repetido entre ativas é recusado; editar preserva a cor; arquivar libera o nome", () => {
    expect(fails(base, { type: "subject.add", subject: { id: "s2", name: "sql", hue: 1 } })).toBe(DUPLICATE_SUBJECT);
    const edited = ok(base, { type: "subject.update", id: "s-sql", fields: { name: "SQL avançado" } });
    expect(edited.subjects[0]).toEqual({ id: "s-sql", name: "SQL avançado", hue: 120 }); // sem objetivo: limpou
    const archived = ok(base, { type: "subject.archive", id: "s-sql", archived: true });
    expect(ok(archived, { type: "subject.add", subject: { id: "s2", name: "SQL", hue: 1 } }).subjects).toHaveLength(2);
  });

  it("arquivar a matéria mantém as sessões de estudo dela", () => {
    const withSession = ok(base, { type: "studySession.add", session: { id: "ss", subjectId: "s-sql", source: "manual", occurredOn: "2026-10-07", durationSeconds: 3600 } });
    const archived = ok(withSession, { type: "subject.archive", id: "s-sql", archived: true });
    expect(archived.studySessions).toHaveLength(1);
  });
});

describe("livros e leituras", () => {
  const book = { id: "b1", title: "Livro", totalPages: 320, initialPage: 30, status: "reading" as const };
  const reading = (over: Partial<ReadingSession> = {}): ReadingSession => ({ id: "r1", bookId: "b1", occurredOn: "2026-10-07", startPage: 30, endPage: 50, ...over });
  const withBook = () => ok(base, { type: "book.add", book });
  const withReading = () => ok(withBook(), { type: "reading.addSession", session: reading() });
  const week = { start: "2026-10-05", end: "2026-10-11" };

  it("editar o livro preserva a situação; autor omitido é limpo", () => {
    const data = ok({ ...withBook(), books: [{ ...book, author: "Autora", status: "paused" }] }, { type: "book.update", id: "b1", fields: { title: "Novo título", totalPages: 400, initialPage: 30 } });
    expect(data.books[0]).toEqual({ id: "b1", title: "Novo título", totalPages: 400, initialPage: 30, status: "paused" });
  });

  it("não deixa reduzir o total abaixo do que já foi lido, nem a página inicial acima do total", () => {
    const data = withReading();
    expect(fails(data, { type: "book.update", id: "b1", fields: { title: "L", totalPages: 40, initialPage: 0 } })).toBe("O livro já tem leituras até a página 50.");
    expect(ok(data, { type: "book.update", id: "b1", fields: { title: "L", totalPages: 50, initialPage: 0 } }).books[0].totalPages).toBe(50);
    expect(fails(data, { type: "book.update", id: "b1", fields: { title: "L", totalPages: 100, initialPage: 101 } })).toBe("A página inicial passa do total do livro.");
  });

  it("excluir o livro apaga as leituras dele e só as dele", () => {
    let data = withReading();
    data = ok(data, { type: "book.add", book: { ...book, id: "b2", title: "Outro", initialPage: 0 } });
    data = ok(data, { type: "reading.addSession", session: reading({ id: "r2", bookId: "b2", startPage: 0, endPage: 10 }) });
    data = ok(data, { type: "book.delete", id: "b1" });
    expect(data.books.map((b) => b.id)).toEqual(["b2"]);
    expect(data.readingSessions.map((s) => s.id)).toEqual(["r2"]);
    const again = ok(data, { type: "book.delete", id: "b1" });
    expect(again).toEqual(data); // repetir não muda nada
    expect(again.readingSessions).toBe(data.readingSessions); // nem troca a referência da lista
  });

  it("editar uma leitura recalcula as páginas sem somar em duplicidade", () => {
    const data = ok(withReading(), { type: "reading.updateSession", id: "r1", fields: { occurredOn: "2026-10-08", startPage: 30, endPage: 80 } });
    expect(data.readingSessions).toHaveLength(1);
    expect(pagesInPeriod(data.readingSessions, week)).toBe(50);
    expect(data.readingSessions[0].bookId).toBe("b1");
  });

  it("a edição respeita as mesmas regras do registro (mesmas mensagens)", () => {
    const data = withReading();
    const edit = (startPage: number, endPage: number) => fails(data, { type: "reading.updateSession", id: "r1", fields: { occurredOn: "2026-10-07", startPage, endPage } });
    expect(edit(50, 40)).toBe("A página final deve ser maior que a inicial.");
    expect(edit(10, 999)).toBe("O livro tem 320 páginas.");
    expect(fails(data, { type: "reading.updateSession", id: "nope", fields: { occurredOn: "2026-10-07", startPage: 0, endPage: 1 } })).toBe("Sessão de leitura não encontrada.");
  });

  it("editar a leitura até a última página conclui o livro", () => {
    const data = ok(withReading(), { type: "reading.updateSession", id: "r1", fields: { occurredOn: "2026-10-07", startPage: 30, endPage: 320 } });
    expect(data.books[0].status).toBe("done");
  });
});
