import { describe, expect, it } from "vitest";
import { createDataActions, type ActionHost } from "@/data/actions";
import { ok } from "@/data/contract";
import { uid } from "@/lib/id";
import type { Command, Outcome } from "./commands";
import { parseCommand } from "./command-schema";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import type { WorkoutDraft } from "./types";

const NOW = Date.UTC(2026, 9, 7, 17, 0);
const [CAT, SUBJECT, EXERCISE, BOOK, PLAN] = [uid(), uid(), uid(), uid(), uid()];

const draft: WorkoutDraft = {
  id: uid(),
  planId: PLAN,
  nameSnapshot: "Treino A — Peito e tríceps",
  startedAt: NOW - 3_600_000,
  exercises: [
    {
      exerciseId: EXERCISE, nameSnapshot: "Supino reto", loadType: "external",
      plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 120,
      sets: [{ weightKg: 62.5, reps: 8, done: true }, { weightKg: 60, reps: 6, done: false }],
    },
  ],
  notes: "Pesado",
};

/** Roda cada ação do app com um host que só captura o comando que ela gera. */
async function commandsGeneratedByTheApp(): Promise<Command[]> {
  const captured: Command[] = [];
  const data: AppData = {
    ...EMPTY_APP_DATA,
    subjects: [{ id: SUBJECT, name: "SQL", hue: 120 }],
    timer: { subjectId: SUBJECT, startedAt: NOW - 1_800_000, runningSince: NOW - 1_800_000, accumulatedSeconds: 0 },
  };
  const host: ActionHost = {
    read: () => ({ data, draft }),
    dispatch: async (command) => {
      captured.push(command);
      return ok<Outcome>("saved");
    },
    clearDraft: () => undefined,
    now: () => NOW,
    newId: uid,
  };
  const a = createDataActions(host);
  const id = uid();
  await a.addTransaction({ type: "expense", amountCents: 4200, categoryId: CAT, description: "Outback", occurredOn: "2026-10-07", source: "ai" });
  await a.addTransaction({ type: "income", amountCents: 350_000, categoryId: CAT, description: "", occurredOn: "2026-10-05" });
  await a.updateTransaction(id, { type: "expense", amountCents: 100, categoryId: CAT, description: "x", occurredOn: "2026-10-07" });
  await a.deleteTransaction(id);
  await a.addTemplate({ label: "Almoço", type: "expense", amountCents: 3500, categoryId: CAT });
  await a.deleteTemplate(id);
  await a.setGoal({ kind: "savings", scopeId: null, validFrom: "2026-10-01", target: 50_000 });
  await a.setGoal({ kind: "workout_sessions", scopeId: null, validFrom: "2026-10-05", target: 0 });
  await a.setGoal({ kind: "category_budget", scopeId: CAT, validFrom: "2026-10-01", target: 80_000 });
  await a.setGoal({ kind: "study_minutes", scopeId: SUBJECT, validFrom: "2026-10-05", target: 120 });
  await a.finishWorkout();
  await a.deleteWorkoutSession(id);
  await a.startStudy(SUBJECT);
  await a.pauseStudy();
  await a.resumeStudy();
  await a.finishStudy();
  await a.discardStudy();
  await a.addStudySession({ subjectId: SUBJECT, occurredOn: "2026-10-06", durationSeconds: 3600, notes: "Joins" });
  await a.addStudySession({ subjectId: SUBJECT, occurredOn: "2026-10-06", durationSeconds: 3600 });
  await a.updateStudySession(id, { subjectId: SUBJECT, occurredOn: "2026-10-06", durationSeconds: 5400 });
  await a.deleteStudySession(id);
  await a.addSubject("  Redes  ", "Banco do Brasil");
  await a.addBook({ title: "Livro", author: "Autora", totalPages: 320, initialPage: 30, status: "reading" });
  await a.addBook({ title: "Outro", totalPages: 100, initialPage: 0, status: "want" });
  await a.setBookStatus(BOOK, "paused");
  await a.addReadingSession({ bookId: BOOK, occurredOn: "2026-10-07", startPage: 30, endPage: 50 });
  await a.deleteReadingSession(id);
  // catálogos e edições
  await a.updateSubject(SUBJECT, { name: "SQL avançado", objective: "Banco do Brasil" });
  await a.updateSubject(SUBJECT, { name: "SQL" });
  await a.archiveSubject(SUBJECT, true);
  await a.addCategory({ name: "Pets", type: "expense", icon: "dots" });
  await a.updateCategory(CAT, { name: "Mercado", icon: "bag", hue: 120 });
  await a.archiveCategory(CAT, true);
  await a.addExercise({ name: "Supino reto", muscleGroup: "Peito", loadType: "external" });
  await a.updateExercise(EXERCISE, { name: "Barra fixa", muscleGroup: "Costas", loadType: "bodyweight" });
  await a.archiveExercise(EXERCISE, false);
  await a.savePlan({ name: "Treino A", notes: "Peito", exercises: [{ exerciseId: EXERCISE, plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90 }] });
  await a.savePlan({ id: PLAN, name: "Treino B", exercises: [{ exerciseId: EXERCISE, plannedSets: 4, repMin: 8, repMax: 12, restSeconds: 60 }] });
  await a.archivePlan(PLAN, true);
  await a.updateBook(BOOK, { title: "Livro revisado", author: "Autora", totalPages: 400, initialPage: 10 });
  await a.deleteBook(BOOK);
  await a.updateReadingSession(id, { occurredOn: "2026-10-07", startPage: 50, endPage: 80, notes: "Capítulo 3" });
  return captured;
}

describe("o que o app gera passa no schema", () => {
  it("cada ação do app produz um comando aceito (e igual ao original, sem campos perdidos)", async () => {
    const commands = await commandsGeneratedByTheApp();
    expect(commands.length).toBeGreaterThanOrEqual(40);
    for (const command of commands) {
      const parsed = parseCommand(command);
      expect(parsed, `${command.type}: ${JSON.stringify(command)}`).toMatchObject({ ok: true });
      // passar pelo JSON da rede e pelo schema não pode alterar nada (nem descartar campo em silêncio)
      if (parsed.ok) expect(parsed.command).toEqual(JSON.parse(JSON.stringify(command)));
    }
  });

  it("cobre todos os tipos de comando existentes", async () => {
    const types = new Set((await commandsGeneratedByTheApp()).map((c) => c.type));
    expect([...types].sort()).toEqual([
      "book.add", "book.delete", "book.setStatus", "book.update", "category.add", "category.archive", "category.update",
      "exercise.add", "exercise.archive", "exercise.update", "goal.set", "plan.archive", "plan.save",
      "reading.addSession", "reading.deleteSession", "reading.updateSession", "study.discard", "study.finish",
      "study.pause", "study.resume", "study.start", "studySession.add", "studySession.delete", "studySession.update",
      "subject.add", "subject.archive", "subject.update", "template.add", "template.delete", "transaction.add",
      "transaction.delete", "transaction.update", "workout.deleteSession", "workout.finish",
    ].sort());
  });
});

const reject = (command: unknown) => parseCommand(command);

describe("recusa o que é inválido", () => {
  const tx = (over: Record<string, unknown> = {}) => ({
    type: "transaction.add",
    transaction: { id: uid(), type: "expense", amountCents: 4200, categoryId: CAT, description: "x", occurredOn: "2026-10-07", source: "manual", ...over },
  });

  it("lixo, tipo desconhecido e estrutura errada: mensagem genérica, sem vazar detalhes", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { type: "drop.table" }, { type: 5 }]) {
      expect(reject(bad)).toEqual({ ok: false, error: "Pedido inválido." });
    }
  });

  it("campo desconhecido é recusado, nunca ignorado (ex.: userId plantado)", () => {
    expect(reject({ ...tx(), userId: uid() })).toMatchObject({ ok: false });
    expect(reject(tx({ userId: uid() }))).toMatchObject({ ok: false });
  });

  it("valores em reais, zero, negativo e acima do teto", () => {
    expect(reject(tx({ amountCents: 42.5 }))).toMatchObject({ ok: false, error: "Valor inválido." });
    expect(reject(tx({ amountCents: 0 }))).toMatchObject({ ok: false, error: "O valor deve ser maior que zero." });
    expect(reject(tx({ amountCents: -5 }))).toMatchObject({ ok: false });
    expect(reject(tx({ amountCents: 10_000_000_000 }))).toMatchObject({ ok: false, error: "Valor alto demais." });
    expect(reject(tx({ amountCents: 9_999_999_999 }))).toMatchObject({ ok: true });
  });

  it("ids que não são UUID (um id curto do protótipo antigo não passa)", () => {
    expect(reject(tx({ id: "tx_abc123" }))).toMatchObject({ ok: false, error: "Identificador inválido." });
    expect(reject(tx({ categoryId: "cat-food" }))).toMatchObject({ ok: false });
  });

  it("datas impossíveis ou implausíveis", () => {
    for (const occurredOn of ["2026-02-30", "2026-13-01", "26-10-07", "0202-10-07", "2101-01-01", ""]) {
      expect(reject(tx({ occurredOn })), occurredOn).toMatchObject({ ok: false, error: "Data inválida." });
    }
  });

  it("descrição acima de 200 caracteres", () => {
    expect(reject(tx({ description: "x".repeat(201) }))).toMatchObject({ ok: false });
    expect(reject(tx({ description: "x".repeat(200) }))).toMatchObject({ ok: true });
  });

  describe("metas", () => {
    const goal = (over: Record<string, unknown>) => ({
      type: "goal.set",
      goal: { id: uid(), kind: "savings", scopeId: null, validFrom: "2026-10-01", target: 1000, ...over },
    });
    it("vigência alinhada ao período", () => {
      expect(reject(goal({ validFrom: "2026-10-15" }))).toMatchObject({ ok: false, error: "A vigência deve começar no dia 1 do mês." });
      expect(reject(goal({ kind: "workout_sessions", validFrom: "2026-10-07" }))).toMatchObject({ ok: false, error: "A vigência deve começar numa segunda-feira." });
      expect(reject(goal({ kind: "workout_sessions", validFrom: "2026-10-05" }))).toMatchObject({ ok: true });
    });
    it("meta 0 (removida) vale; negativa não", () => {
      expect(reject(goal({ target: 0 }))).toMatchObject({ ok: true });
      expect(reject(goal({ target: -1 }))).toMatchObject({ ok: false });
    });
    it("escopo coerente com o tipo", () => {
      expect(reject(goal({ kind: "category_budget", scopeId: null }))).toMatchObject({ ok: false, error: "O orçamento precisa de uma categoria." });
      expect(reject(goal({ kind: "savings", scopeId: uid() }))).toMatchObject({ ok: false, error: "Esta meta não tem escopo." });
      expect(reject(goal({ kind: "study_minutes", scopeId: uid(), validFrom: "2026-10-05" }))).toMatchObject({ ok: true });
    });
  });

  describe("treino", () => {
    const session = (over: Record<string, unknown> = {}) => ({
      type: "workout.finish",
      session: {
        id: uid(), planId: null, nameSnapshot: "Treino A", startedAt: NOW - 3_000_000, finishedAt: NOW, occurredOn: "2026-10-07",
        exercises: [{ exerciseId: EXERCISE, nameSnapshot: "Supino", loadType: "external", plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90, sets: [{ weightKg: 60, reps: 8, done: true }] }],
        ...over,
      },
    });
    it("válido", () => expect(reject(session())).toMatchObject({ ok: true }));
    it("sem exercícios concluídos", () => {
      expect(reject(session({ exercises: [] }))).toMatchObject({ ok: false, error: "Conclua ao menos uma série para salvar o treino." });
    });
    it("termina antes de começar", () => {
      expect(reject(session({ startedAt: NOW, finishedAt: NOW - 1 }))).toMatchObject({ ok: false, error: "O treino não pode terminar antes de começar." });
    });
    it("série não concluída, repetições zero e carga absurda", () => {
      const withSet = (set: Record<string, unknown>) => session({
        exercises: [{ exerciseId: EXERCISE, nameSnapshot: "S", loadType: "external", plannedSets: 1, repMin: 1, repMax: 2, restSeconds: 0, sets: [set] }],
      });
      expect(reject(withSet({ weightKg: 60, reps: 8, done: false }))).toMatchObject({ ok: false });
      expect(reject(withSet({ weightKg: 60, reps: 0, done: true }))).toMatchObject({ ok: false });
      expect(reject(withSet({ weightKg: 10_000, reps: 5, done: true }))).toMatchObject({ ok: false });
      expect(reject(withSet({ weightKg: 62.5, reps: 5, done: true }))).toMatchObject({ ok: true });
      expect(reject(withSet({ weightKg: 62.555, reps: 5, done: true }))).toMatchObject({ ok: false });
    });
  });

  describe("catálogos e edições", () => {
    const planWith = (over: Record<string, unknown> = {}) => ({
      type: "plan.save",
      plan: {
        id: uid(), name: "Treino A",
        exercises: [{ exerciseId: EXERCISE, plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90 }],
        ...over,
      },
    });
    it("ficha válida", () => expect(reject(planWith())).toMatchObject({ ok: true }));
    it("ficha sem exercícios, com exercício repetido, ou séries fora do limite", () => {
      expect(reject(planWith({ exercises: [] }))).toMatchObject({ ok: false, error: "Adicione ao menos um exercício à ficha." });
      const item = { exerciseId: EXERCISE, plannedSets: 3, repMin: 6, repMax: 10, restSeconds: 90 };
      expect(reject(planWith({ exercises: [item, item] }))).toMatchObject({ ok: false, error: "Há exercícios repetidos na ficha." });
      expect(reject(planWith({ exercises: [{ ...item, plannedSets: 0 }] }))).toMatchObject({ ok: false, error: "Informe ao menos 1 série." });
      expect(reject(planWith({ exercises: [{ ...item, plannedSets: 21 }] }))).toMatchObject({ ok: false, error: "No máximo 20 séries por exercício." });
      expect(reject(planWith({ exercises: [{ ...item, repMin: 12, repMax: 8 }] }))).toMatchObject({ ok: false });
    });
    it("a ficha não aceita o campo 'archived' (arquivar tem comando próprio)", () => {
      expect(reject(planWith({ archived: true }))).toMatchObject({ ok: false });
    });
    it("categoria: nome, ícone e matiz; o tipo nunca muda numa edição", () => {
      expect(reject({ type: "category.update", id: CAT, fields: { name: "Mercado", icon: "bag", hue: 120 } })).toMatchObject({ ok: true });
      expect(reject({ type: "category.update", id: CAT, fields: { name: "Mercado", icon: "bag", hue: 120, type: "income" } })).toMatchObject({ ok: false });
      expect(reject({ type: "category.update", id: CAT, fields: { name: "  ", icon: "bag", hue: 120 } })).toMatchObject({ ok: false });
      expect(reject({ type: "category.update", id: CAT, fields: { name: "X", icon: "Bag-1", hue: 120 } })).toMatchObject({ ok: false, error: "Ícone inválido." });
      expect(reject({ type: "category.update", id: CAT, fields: { name: "X", icon: "bag", hue: 361 } })).toMatchObject({ ok: false });
    });
    it("arquivar exige um booleano explícito", () => {
      expect(reject({ type: "plan.archive", id: PLAN, archived: true })).toMatchObject({ ok: true });
      expect(reject({ type: "plan.archive", id: PLAN })).toMatchObject({ ok: false });
      expect(reject({ type: "plan.archive", id: PLAN, archived: "sim" })).toMatchObject({ ok: false });
    });
    it("livro: página inicial dentro do total, na edição também", () => {
      const update = (fields: Record<string, unknown>) => ({ type: "book.update", id: BOOK, fields });
      expect(reject(update({ title: "L", totalPages: 100, initialPage: 100 }))).toMatchObject({ ok: true });
      expect(reject(update({ title: "L", totalPages: 100, initialPage: 101 }))).toMatchObject({ ok: false, error: "A página inicial passa do total do livro." });
    });
    it("exercício e matéria: nomes obrigatórios", () => {
      expect(reject({ type: "exercise.add", exercise: { id: uid(), name: "", muscleGroup: "Peito", loadType: "external" } })).toMatchObject({ ok: false });
      expect(reject({ type: "subject.update", id: SUBJECT, fields: { name: "" } })).toMatchObject({ ok: false });
    });
  });

  describe("estudos e leitura", () => {
    it("sessão manual: 1 min a 24 h", () => {
      const add = (durationSeconds: number) => ({ type: "studySession.add", session: { id: uid(), source: "manual", subjectId: SUBJECT, occurredOn: "2026-10-07", durationSeconds } });
      expect(reject(add(59))).toMatchObject({ ok: false, error: "Mínimo de 1 minuto." });
      expect(reject(add(86_401))).toMatchObject({ ok: false, error: "Máximo de 24 horas por sessão." });
      expect(reject(add(86_400))).toMatchObject({ ok: true });
    });
    it("livro: total positivo e página inicial dentro do total", () => {
      const add = (over: Record<string, unknown>) => ({ type: "book.add", book: { id: uid(), title: "L", totalPages: 100, initialPage: 0, status: "reading", ...over } });
      expect(reject(add({ totalPages: 0 }))).toMatchObject({ ok: false });
      expect(reject(add({ initialPage: 101 }))).toMatchObject({ ok: false, error: "A página inicial passa do total do livro." });
      expect(reject(add({ title: "   " }))).toMatchObject({ ok: false });
    });
    it("leitura com páginas fracionadas usa a mesma mensagem do domínio", () => {
      expect(reject({ type: "reading.addSession", session: { id: uid(), bookId: BOOK, occurredOn: "2026-10-07", startPage: 1.5, endPage: 10 } }))
        .toMatchObject({ ok: false, error: "Use números inteiros nas páginas." });
    });
    it("a ordem das páginas NÃO é validada aqui: quem decide é o domínio/banco, com a mesma mensagem", () => {
      expect(reject({ type: "reading.addSession", session: { id: uid(), bookId: BOOK, occurredOn: "2026-10-07", startPage: 50, endPage: 40 } }))
        .toMatchObject({ ok: true });
    });
  });
});
