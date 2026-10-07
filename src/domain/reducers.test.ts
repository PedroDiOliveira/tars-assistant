import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { monthSummary } from "./finance";
import { goalFor } from "./goals";
import { applyCommand } from "./reducers";
import { pagesInPeriod } from "./reading";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import type { Book, Goal, ReadingSession, StudySession, Subject, Transaction, WorkoutSession } from "./types";

/* ---------- apoio ---------- */

const T0 = Date.UTC(2026, 9, 7, 17, 0); // 07/10/2026 14:00 em São Paulo

function ok(data: AppData, command: Command) {
  const applied = applyCommand(data, command);
  if (!applied.ok) throw new Error(`esperava sucesso, veio: ${applied.error}`);
  return applied;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "tx-1",
  type: "expense",
  amountCents: 4200,
  categoryId: "cat-food",
  description: "Outback",
  occurredOn: "2026-10-07",
  source: "manual",
  ...over,
});

const book = (over: Partial<Book> = {}): Book => ({
  id: "book-1",
  title: "Livro",
  totalPages: 320,
  initialPage: 0,
  status: "reading",
  ...over,
});

const reading = (over: Partial<ReadingSession> = {}): ReadingSession => ({
  id: "rd-1",
  bookId: "book-1",
  occurredOn: "2026-10-07",
  startPage: 30,
  endPage: 50,
  ...over,
});

const subject: Subject = { id: "sub-1", name: "SQL", hue: 120 };

const workout: WorkoutSession = {
  id: "ws-1",
  planId: "plan-a",
  nameSnapshot: "Treino A",
  startedAt: T0,
  finishedAt: T0 + 3_600_000,
  occurredOn: "2026-10-07",
  exercises: [],
};

const withTimer = (data: AppData = EMPTY_APP_DATA): AppData =>
  ok(data, { type: "study.start", subjectId: "sub-1", nowMs: T0 }).data;

/* ---------- finanças ---------- */

describe("finanças", () => {
  it("receita de R$ 3.500 e despesa de R$ 42 resultam em R$ 3.458 no mês (spec §15)", () => {
    let data = EMPTY_APP_DATA;
    data = ok(data, { type: "transaction.add", transaction: tx({ id: "a", type: "income", amountCents: 350_000 }) }).data;
    data = ok(data, { type: "transaction.add", transaction: tx({ id: "b" }) }).data;
    expect(monthSummary(data.transactions, "2026-10").resultCents).toBe(345_800);
  });

  it("adicionar o mesmo id duas vezes não duplica (idempotência)", () => {
    const once = ok(EMPTY_APP_DATA, { type: "transaction.add", transaction: tx() }).data;
    const twice = ok(once, { type: "transaction.add", transaction: tx() }).data;
    expect(twice.transactions).toHaveLength(1);
    expect(twice.transactions).toBe(once.transactions); // nem troca a referência
  });

  it("edita e exclui só o lançamento certo", () => {
    let data = EMPTY_APP_DATA;
    data = ok(data, { type: "transaction.add", transaction: tx({ id: "a" }) }).data;
    data = ok(data, { type: "transaction.add", transaction: tx({ id: "b", description: "Uber" }) }).data;
    data = ok(data, {
      type: "transaction.update",
      id: "a",
      fields: { type: "expense", amountCents: 5000, categoryId: "cat-food", description: "Jantar", occurredOn: "2026-10-07" },
    }).data;
    expect(data.transactions.find((t) => t.id === "a")).toMatchObject({ amountCents: 5000, description: "Jantar" });
    expect(data.transactions.find((t) => t.id === "b")?.description).toBe("Uber");
    data = ok(data, { type: "transaction.delete", id: "a" }).data;
    expect(data.transactions.map((t) => t.id)).toEqual(["b"]);
  });

  it("atalhos: adiciona sem duplicar e remove", () => {
    const template = { id: "tpl-1", label: "Almoço", type: "expense" as const, amountCents: 3500, categoryId: "cat-food" };
    let data = ok(EMPTY_APP_DATA, { type: "template.add", template }).data;
    data = ok(data, { type: "template.add", template }).data;
    expect(data.templates).toHaveLength(1);
    data = ok(data, { type: "template.delete", id: "tpl-1" }).data;
    expect(data.templates).toHaveLength(0);
  });
});

/* ---------- metas ---------- */

describe("metas", () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({
    id: "g-new",
    kind: "workout_sessions",
    scopeId: null,
    validFrom: "2026-10-05",
    target: 4,
    ...over,
  });

  it("mesma meta (tipo, escopo, vigência) substitui e mantém o id da linha existente", () => {
    const first = ok(EMPTY_APP_DATA, { type: "goal.set", goal: goal({ id: "g-1", target: 3 }) }).data;
    const second = ok(first, { type: "goal.set", goal: goal({ id: "g-2", target: 5 }) }).data;
    expect(second.goals).toHaveLength(1);
    expect(second.goals[0]).toMatchObject({ id: "g-1", target: 5 });
  });

  it("vigência nova convive com a antiga: o passado não é reescrito", () => {
    let data = ok(EMPTY_APP_DATA, { type: "goal.set", goal: goal({ id: "g-1", validFrom: "2026-09-07", target: 3 }) }).data;
    data = ok(data, { type: "goal.set", goal: goal({ id: "g-2", validFrom: "2026-10-05", target: 5 }) }).data;
    expect(goalFor(data.goals, "workout_sessions", null, "2026-09-14")?.target).toBe(3);
    expect(goalFor(data.goals, "workout_sessions", null, "2026-10-05")?.target).toBe(5);
  });

  it("meta 0 é a 'meta removida': vale daqui para a frente e preserva o passado", () => {
    let data = ok(EMPTY_APP_DATA, { type: "goal.set", goal: goal({ id: "g-1", validFrom: "2026-09-07", target: 3 }) }).data;
    data = ok(data, { type: "goal.set", goal: goal({ id: "g-2", validFrom: "2026-10-05", target: 0 }) }).data;
    expect(goalFor(data.goals, "workout_sessions", null, "2026-09-14")?.target).toBe(3);
    expect(goalFor(data.goals, "workout_sessions", null, "2026-10-05")).toBeNull();
  });

  it("escopo diferente é outra meta", () => {
    let data = ok(EMPTY_APP_DATA, { type: "goal.set", goal: goal({ id: "g-1", kind: "study_minutes", scopeId: "sub-1" }) }).data;
    data = ok(data, { type: "goal.set", goal: goal({ id: "g-2", kind: "study_minutes", scopeId: null }) }).data;
    expect(data.goals).toHaveLength(2);
  });
});

/* ---------- treino ---------- */

describe("treino", () => {
  it("finalizar duas vezes a mesma sessão registra uma só", () => {
    const once = ok(EMPTY_APP_DATA, { type: "workout.finish", session: workout }).data;
    const twice = ok(once, { type: "workout.finish", session: workout }).data;
    expect(twice.sessions).toHaveLength(1);
  });

  it("exclui a sessão pelo id", () => {
    const data = ok(EMPTY_APP_DATA, { type: "workout.finish", session: workout }).data;
    expect(ok(data, { type: "workout.deleteSession", id: "ws-1" }).data.sessions).toHaveLength(0);
  });
});

/* ---------- estudos ---------- */

describe("estudos", () => {
  it("iniciar com um cronômetro ativo é ignorado", () => {
    const running = withTimer();
    const again = ok(running, { type: "study.start", subjectId: "outra", nowMs: T0 + 5000 });
    expect(again.outcome).toBe("none");
    expect(again.data.timer?.subjectId).toBe("sub-1");
  });

  it("pausar duas vezes não soma o tempo em dobro", () => {
    const paused = ok(withTimer(), { type: "study.pause", nowMs: T0 + 600_000 }).data;
    const pausedAgain = ok(paused, { type: "study.pause", nowMs: T0 + 900_000 }).data;
    expect(pausedAgain.timer?.accumulatedSeconds).toBe(600);
  });

  it("retomar depois de pausar volta a contar", () => {
    let data = ok(withTimer(), { type: "study.pause", nowMs: T0 + 60_000 }).data;
    data = ok(data, { type: "study.resume", nowMs: T0 + 120_000 }).data;
    expect(data.timer).toMatchObject({ runningSince: T0 + 120_000, accumulatedSeconds: 60 });
  });

  it("finalizar grava a sessão no dia em que começou e zera o cronômetro", () => {
    const applied = ok(withTimer(), { type: "study.finish", sessionId: "st-new", nowMs: T0 + 1_800_000 });
    expect(applied.outcome).toBe("saved");
    expect(applied.data.timer).toBeNull();
    expect(applied.data.studySessions).toEqual([
      { id: "st-new", subjectId: "sub-1", source: "timer", occurredOn: "2026-10-07", durationSeconds: 1800 },
    ]);
  });

  it("sessão que atravessa a meia-noite pertence ao dia em que começou (fuso de São Paulo)", () => {
    const start = Date.UTC(2026, 9, 8, 2, 50); // 07/10 23:50 em São Paulo
    const running = ok(EMPTY_APP_DATA, { type: "study.start", subjectId: "sub-1", nowMs: start }).data;
    const applied = ok(running, { type: "study.finish", sessionId: "st-x", nowMs: start + 20 * 60_000 });
    expect(applied.data.studySessions[0].occurredOn).toBe("2026-10-07");
  });

  it("menos de 1 minuto é descartado, mas o cronômetro some", () => {
    const applied = ok(withTimer(), { type: "study.finish", sessionId: "st-x", nowMs: T0 + 30_000 });
    expect(applied.outcome).toBe("too_short");
    expect(applied.data.timer).toBeNull();
    expect(applied.data.studySessions).toHaveLength(0);
  });

  it("finalizar sem cronômetro (segundo toque) não duplica a duração", () => {
    const first = ok(withTimer(), { type: "study.finish", sessionId: "st-a", nowMs: T0 + 1_800_000 });
    const second = ok(first.data, { type: "study.finish", sessionId: "st-b", nowMs: T0 + 1_801_000 });
    expect(second.outcome).toBe("none");
    expect(second.data.studySessions).toHaveLength(1);
  });

  it("repetir o mesmo 'finalizar' (resposta perdida) devolve o mesmo resultado, sem duplicar", () => {
    const first = ok(withTimer(), { type: "study.finish", sessionId: "st-a", nowMs: T0 + 1_800_000 });
    const replay = ok(first.data, { type: "study.finish", sessionId: "st-a", nowMs: T0 + 1_801_000 });
    expect(replay.outcome).toBe("saved");
    expect(replay.data.studySessions).toHaveLength(1);
  });

  it("cronômetro esquecido ligado por dias é registrado com o teto de 24 h, não recusado", () => {
    const applied = ok(withTimer(), { type: "study.finish", sessionId: "st-x", nowMs: T0 + 3 * 86_400_000 });
    expect(applied.outcome).toBe("saved");
    expect(applied.data.studySessions[0].durationSeconds).toBe(86_400);
  });

  it("descartar remove o cronômetro sem registrar nada", () => {
    const data = ok(withTimer(), { type: "study.discard" }).data;
    expect(data.timer).toBeNull();
    expect(data.studySessions).toHaveLength(0);
  });

  it("sessão manual: adiciona sem duplicar, edita e exclui", () => {
    const session: StudySession = { id: "st-1", subjectId: "sub-1", source: "manual", occurredOn: "2026-10-06", durationSeconds: 3600 };
    let data = ok(EMPTY_APP_DATA, { type: "studySession.add", session }).data;
    data = ok(data, { type: "studySession.add", session }).data;
    expect(data.studySessions).toHaveLength(1);
    data = ok(data, {
      type: "studySession.update",
      id: "st-1",
      fields: { subjectId: "sub-1", occurredOn: "2026-10-06", durationSeconds: 5400, notes: "Joins" },
    }).data;
    expect(data.studySessions[0]).toMatchObject({ durationSeconds: 5400, notes: "Joins", source: "manual" });
    // omitir a observação a limpa (substituição, não patch parcial)
    data = ok(data, {
      type: "studySession.update",
      id: "st-1",
      fields: { subjectId: "sub-1", occurredOn: "2026-10-06", durationSeconds: 5400 },
    }).data;
    expect(data.studySessions[0]).not.toHaveProperty("notes");
    data = ok(data, { type: "studySession.delete", id: "st-1" }).data;
    expect(data.studySessions).toHaveLength(0);
  });

  it("matéria nova não duplica", () => {
    const once = ok(EMPTY_APP_DATA, { type: "subject.add", subject }).data;
    expect(ok(once, { type: "subject.add", subject }).data.subjects).toHaveLength(1);
  });
});

/* ---------- leitura ---------- */

describe("leitura", () => {
  const withBook = (over: Partial<Book> = {}) => ok(EMPTY_APP_DATA, { type: "book.add", book: book(over) }).data;
  const week = { start: "2026-10-05", end: "2026-10-11" };

  it("ler da posição 30 à 50 registra 20 páginas (spec §15)", () => {
    const data = ok(withBook({ initialPage: 30 }), { type: "reading.addSession", session: reading() }).data;
    expect(pagesInPeriod(data.readingSessions, week)).toBe(20);
  });

  it("a página inicial do cadastro não vira leitura da semana", () => {
    expect(pagesInPeriod(withBook({ initialPage: 200 }).readingSessions, week)).toBe(0);
  });

  it("rejeita fim <= início, além do total e livro inexistente, sem alterar nada", () => {
    const data = withBook();
    const invalid = (session: ReadingSession) => applyCommand(data, { type: "reading.addSession", session });
    expect(invalid(reading({ startPage: 50, endPage: 50 }))).toMatchObject({ ok: false });
    expect(invalid(reading({ endPage: 400 }))).toMatchObject({ ok: false, error: "O livro tem 320 páginas." });
    expect(invalid(reading({ bookId: "nope" }))).toMatchObject({ ok: false, error: "Livro não encontrado." });
  });

  it("registrar duas vezes a mesma sessão não soma páginas em duplicidade", () => {
    const once = ok(withBook(), { type: "reading.addSession", session: reading() }).data;
    const twice = ok(once, { type: "reading.addSession", session: reading() }).data;
    expect(pagesInPeriod(twice.readingSessions, week)).toBe(20);
  });

  it("ler um livro parado ou da lista de desejos passa a 'lendo'", () => {
    for (const status of ["want", "paused"] as const) {
      const data = ok(withBook({ status }), { type: "reading.addSession", session: reading() }).data;
      expect(data.books[0].status).toBe("reading");
    }
  });

  it("chegar à última página conclui o livro", () => {
    const data = ok(withBook(), { type: "reading.addSession", session: reading({ startPage: 300, endPage: 320 }) }).data;
    expect(data.books[0].status).toBe("done");
  });

  it("excluir a sessão recalcula as páginas", () => {
    let data = ok(withBook(), { type: "reading.addSession", session: reading() }).data;
    data = ok(data, { type: "reading.deleteSession", id: "rd-1" }).data;
    expect(pagesInPeriod(data.readingSessions, week)).toBe(0);
  });

  it("muda a situação do livro", () => {
    const data = ok(withBook(), { type: "book.setStatus", id: "book-1", status: "paused" }).data;
    expect(data.books[0].status).toBe("paused");
  });
});

/* ---------- propriedades gerais ---------- */

describe("propriedades gerais", () => {
  const sample: Command[] = [
    { type: "transaction.add", transaction: tx() },
    { type: "transaction.update", id: "tx-1", fields: { type: "expense", amountCents: 1, categoryId: "c", description: "", occurredOn: "2026-10-07" } },
    { type: "transaction.delete", id: "tx-1" },
    { type: "template.add", template: { id: "t", label: "x", type: "expense", amountCents: 1, categoryId: "c" } },
    { type: "template.delete", id: "t" },
    { type: "goal.set", goal: { id: "g", kind: "savings", scopeId: null, validFrom: "2026-10-01", target: 1 } },
    { type: "workout.finish", session: workout },
    { type: "workout.deleteSession", id: "ws-1" },
    { type: "study.start", subjectId: "sub-1", nowMs: T0 },
    { type: "study.pause", nowMs: T0 },
    { type: "study.resume", nowMs: T0 },
    { type: "study.finish", sessionId: "s", nowMs: T0 + 120_000 },
    { type: "study.discard" },
    { type: "studySession.add", session: { id: "s", subjectId: "sub-1", source: "manual", occurredOn: "2026-10-07", durationSeconds: 60 } },
    { type: "studySession.update", id: "s", fields: { subjectId: "sub-1", occurredOn: "2026-10-07", durationSeconds: 120 } },
    { type: "studySession.delete", id: "s" },
    { type: "subject.add", subject },
    { type: "book.add", book: book() },
    { type: "book.setStatus", id: "book-1", status: "done" },
    { type: "reading.addSession", session: reading() },
    { type: "reading.deleteSession", id: "rd-1" },
  ];

  it("nunca muda o estado de entrada (pureza), para nenhum comando", () => {
    // Mutar um objeto congelado lança TypeError em módulo ES, então aplicar todos os comandos sem erro prova a pureza.
    let data = deepFreeze(structuredClone({ ...EMPTY_APP_DATA, books: [book()], subjects: [subject] }));
    for (const command of sample) {
      const applied = applyCommand(data, command);
      expect(applied.ok, command.type).toBe(true);
      if (applied.ok) data = deepFreeze(structuredClone(applied.data));
    }
  });

  it("não troca a referência das listas que o comando não toca", () => {
    const before = ok(EMPTY_APP_DATA, { type: "book.add", book: book() }).data;
    const after = ok(before, { type: "transaction.add", transaction: tx() }).data;
    expect(after.books).toBe(before.books);
    expect(after.goals).toBe(before.goals);
    expect(after.readingSessions).toBe(before.readingSessions);
  });
});
