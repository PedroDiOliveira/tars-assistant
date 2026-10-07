import type { Command, Outcome } from "./commands";
import { upsertGoal } from "./goals";
import { validateReadingSession } from "./reading";
import type { AppData } from "./snapshot";
import { finishTimer, pauseTimer, resumeTimer, startTimer } from "./studies";
import type { WorkoutPlan } from "./types";

/** Resultado de aplicar um comando: o novo estado, ou a mensagem de por que não foi possível. */
export type Applied =
  | { ok: true; data: AppData; outcome: Outcome }
  | { ok: false; error: string };

const saved = (data: AppData): Applied => ({ ok: true, data, outcome: "saved" });

/** Adicionar de novo o mesmo id não duplica: é o que `INSERT ... ON CONFLICT (id) DO NOTHING` faz no banco. */
function addOnce<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list : [...list, item];
}

/** Troca só os campos informados por inteiro; o que não está em `fields` (ex.: uma observação limpa) some. */
function replaceFields<T extends { id: string }, K extends keyof T>(
  list: T[],
  id: string,
  keep: readonly K[],
  fields: NoInfer<Omit<T, "id" | K>>,
): T[] {
  return list.map((x) => {
    if (x.id !== id) return x;
    // Chaves ausentes (ex.: `archived` de um item ativo) continuam ausentes, em vez de virarem `undefined`.
    const kept = Object.fromEntries(keep.filter((key) => x[key] !== undefined).map((key) => [key, x[key]]));
    return { id: x.id, ...kept, ...fields } as T;
  });
}

function patchById<T extends { id: string }>(list: T[], id: string, patch: NoInfer<Partial<Omit<T, "id">>>): T[] {
  return list.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

/** `archived` só existe quando é verdadeiro: um item ativo não carrega a chave (igual ao que o banco devolve). */
function setArchived<T extends { id: string; archived?: boolean }>(list: T[], id: string, archived: boolean): T[] {
  return list.map((x) => {
    if (x.id !== id) return x;
    const { archived: _previous, ...rest } = x;
    void _previous;
    return (archived ? { ...rest, archived: true } : rest) as T;
  });
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Nome já usado por outro item ATIVO? (Arquivar libera o nome; é o que o índice único parcial do banco faz.) */
function nameTaken<T extends { id: string; name: string; archived?: boolean }>(
  list: T[],
  name: string,
  exceptId: string | null,
  sameScope: (item: T) => boolean = () => true,
): boolean {
  return list.some((x) => x.id !== exceptId && !x.archived && sameScope(x) && sameName(x.name, name));
}

export const DUPLICATE_CATEGORY = "Já existe uma categoria com este nome.";
export const DUPLICATE_EXERCISE = "Já existe um exercício com este nome.";
export const DUPLICATE_SUBJECT = "Já existe uma matéria com este nome.";
const NOT_FOUND = { category: "Categoria não encontrada.", exercise: "Exercício não encontrado.", plan: "Ficha não encontrada.", subject: "Matéria não encontrada.", book: "Livro não encontrado.", session: "Sessão de leitura não encontrada." } as const;

const failed = (error: string): Applied => ({ ok: false, error });

/**
 * Reducer puro: não muda `data` e deixa intactas (mesma referência) as listas que o comando não toca,
 * para que seletores com igualdade rasa não re-renderizem à toa.
 *
 * É a única definição de "o que cada comando faz". O modo demo grava o resultado direto; o modo real
 * o usa para a atualização otimista e o banco reproduz a mesma regra (teste de paridade).
 */
export function applyCommand(data: AppData, command: Command): Applied {
  switch (command.type) {
    /* ---------- finanças ---------- */
    case "transaction.add":
      return saved({ ...data, transactions: addOnce(data.transactions, command.transaction) });
    case "transaction.update":
      return saved({ ...data, transactions: replaceFields(data.transactions, command.id, ["source"], command.fields) });
    case "transaction.delete":
      return saved({ ...data, transactions: removeById(data.transactions, command.id) });
    case "template.add":
      return saved({ ...data, templates: addOnce(data.templates, command.template) });
    case "template.delete":
      return saved({ ...data, templates: removeById(data.templates, command.id) });

    /* ---------- metas ---------- */
    case "goal.set": {
      // Mesma meta (tipo, escopo e vigência) = substitui, mantendo o id da linha que já existe.
      const same = (g: { kind: string; scopeId: string | null; validFrom: string }) =>
        g.kind === command.goal.kind &&
        g.scopeId === command.goal.scopeId &&
        g.validFrom === command.goal.validFrom;
      const existing = data.goals.find(same);
      const next = existing ? { ...command.goal, id: existing.id } : command.goal;
      return saved({ ...data, goals: upsertGoal(data.goals, next) });
    }

    /* ---------- treino ---------- */
    case "workout.finish":
      return saved({ ...data, sessions: addOnce(data.sessions, command.session) });
    case "workout.deleteSession":
      return saved({ ...data, sessions: removeById(data.sessions, command.id) });

    /* ---------- estudos ---------- */
    case "study.start":
      // No máximo um cronômetro ativo: iniciar outro é ignorado.
      if (data.timer) return { ok: true, data, outcome: "none" };
      return saved({ ...data, timer: startTimer(command.subjectId, command.nowMs) });
    case "study.pause":
      return data.timer ? saved({ ...data, timer: pauseTimer(data.timer, command.nowMs) }) : saved(data);
    case "study.resume":
      return data.timer ? saved({ ...data, timer: resumeTimer(data.timer, command.nowMs) }) : saved(data);
    case "study.finish": {
      if (!data.timer) {
        // Repetir o comando (nova tentativa depois de uma resposta perdida) devolve o mesmo resultado.
        const replay = data.studySessions.some((s) => s.id === command.sessionId);
        return { ok: true, data, outcome: replay ? "saved" : "none" };
      }
      const session = finishTimer(data.timer, command.nowMs, command.sessionId);
      if (!session) return { ok: true, data: { ...data, timer: null }, outcome: "too_short" };
      return saved({ ...data, timer: null, studySessions: addOnce(data.studySessions, session) });
    }
    case "study.discard":
      return saved({ ...data, timer: null });
    case "studySession.add":
      return saved({ ...data, studySessions: addOnce(data.studySessions, command.session) });
    case "studySession.update":
      return saved({ ...data, studySessions: replaceFields(data.studySessions, command.id, ["source"], command.fields) });
    case "studySession.delete":
      return saved({ ...data, studySessions: removeById(data.studySessions, command.id) });
    case "subject.add":
      if (data.subjects.some((s) => s.id === command.subject.id)) return saved(data);
      if (nameTaken(data.subjects, command.subject.name, null)) return failed(DUPLICATE_SUBJECT);
      return saved({ ...data, subjects: [...data.subjects, command.subject] });
    case "subject.update": {
      if (!data.subjects.some((s) => s.id === command.id)) return failed(NOT_FOUND.subject);
      if (nameTaken(data.subjects, command.fields.name, command.id)) return failed(DUPLICATE_SUBJECT);
      return saved({ ...data, subjects: replaceFields(data.subjects, command.id, ["hue", "archived"], command.fields) });
    }
    case "subject.archive": {
      const target = data.subjects.find((s) => s.id === command.id);
      if (!target) return failed(NOT_FOUND.subject);
      if (!command.archived && nameTaken(data.subjects, target.name, command.id)) return failed(DUPLICATE_SUBJECT);
      return saved({ ...data, subjects: setArchived(data.subjects, command.id, command.archived) });
    }

    /* ---------- catálogos ---------- */
    case "category.add": {
      if (data.categories.some((c) => c.id === command.category.id)) return saved(data);
      const { type } = command.category;
      if (nameTaken(data.categories, command.category.name, null, (c) => c.type === type)) return failed(DUPLICATE_CATEGORY);
      return saved({ ...data, categories: [...data.categories, command.category] });
    }
    case "category.update": {
      const target = data.categories.find((c) => c.id === command.id);
      if (!target) return failed(NOT_FOUND.category);
      if (nameTaken(data.categories, command.fields.name, command.id, (c) => c.type === target.type)) return failed(DUPLICATE_CATEGORY);
      return saved({ ...data, categories: replaceFields(data.categories, command.id, ["type", "archived"], command.fields) });
    }
    case "category.archive": {
      const target = data.categories.find((c) => c.id === command.id);
      if (!target) return failed(NOT_FOUND.category);
      if (!command.archived && nameTaken(data.categories, target.name, command.id, (c) => c.type === target.type)) return failed(DUPLICATE_CATEGORY);
      return saved({ ...data, categories: setArchived(data.categories, command.id, command.archived) });
    }
    case "exercise.add": {
      if (data.exercises.some((e) => e.id === command.exercise.id)) return saved(data);
      if (nameTaken(data.exercises, command.exercise.name, null)) return failed(DUPLICATE_EXERCISE);
      return saved({ ...data, exercises: [...data.exercises, command.exercise] });
    }
    case "exercise.update": {
      if (!data.exercises.some((e) => e.id === command.id)) return failed(NOT_FOUND.exercise);
      if (nameTaken(data.exercises, command.fields.name, command.id)) return failed(DUPLICATE_EXERCISE);
      return saved({ ...data, exercises: replaceFields(data.exercises, command.id, ["archived"], command.fields) });
    }
    case "exercise.archive": {
      const target = data.exercises.find((e) => e.id === command.id);
      if (!target) return failed(NOT_FOUND.exercise);
      if (!command.archived && nameTaken(data.exercises, target.name, command.id)) return failed(DUPLICATE_EXERCISE);
      return saved({ ...data, exercises: setArchived(data.exercises, command.id, command.archived) });
    }
    case "plan.save": {
      const { plan } = command;
      const known = new Set(data.exercises.map((e) => e.id));
      if (plan.exercises.some((e) => !known.has(e.exerciseId))) return failed(NOT_FOUND.exercise);
      const existing = data.plans.find((p) => p.id === plan.id);
      // Só nome, observações e exercícios mudam; o estado de arquivada é preservado. Treinos já feitos têm cópia própria.
      const next: WorkoutPlan = { id: plan.id, name: plan.name, ...(plan.notes ? { notes: plan.notes } : {}), exercises: plan.exercises, ...(existing?.archived ? { archived: true } : {}) };
      return saved({ ...data, plans: existing ? data.plans.map((p) => (p.id === plan.id ? next : p)) : [...data.plans, next] });
    }
    case "plan.archive": {
      if (!data.plans.some((p) => p.id === command.id)) return failed(NOT_FOUND.plan);
      return saved({ ...data, plans: setArchived(data.plans, command.id, command.archived) });
    }

    /* ---------- leitura ---------- */
    case "book.add":
      return saved({ ...data, books: addOnce(data.books, command.book) });
    case "book.update": {
      const book = data.books.find((b) => b.id === command.id);
      if (!book) return failed(NOT_FOUND.book);
      const { totalPages, initialPage } = command.fields;
      if (initialPage > totalPages) return failed("A página inicial passa do total do livro.");
      const furthest = data.readingSessions.filter((s) => s.bookId === book.id).reduce((max, s) => Math.max(max, s.endPage), 0);
      if (totalPages < furthest) return failed(`O livro já tem leituras até a página ${furthest}.`);
      return saved({ ...data, books: replaceFields(data.books, command.id, ["status"], command.fields) });
    }
    case "book.delete":
      return saved({
        ...data,
        books: removeById(data.books, command.id),
        readingSessions: data.readingSessions.some((s) => s.bookId === command.id)
          ? data.readingSessions.filter((s) => s.bookId !== command.id)
          : data.readingSessions,
      });
    case "book.setStatus":
      return saved({ ...data, books: patchById(data.books, command.id, { status: command.status }) });
    case "reading.addSession": {
      const { session } = command;
      if (data.readingSessions.some((s) => s.id === session.id)) return saved(data);
      const book = data.books.find((b) => b.id === session.bookId);
      if (!book) return { ok: false, error: "Livro não encontrado." };
      const error = validateReadingSession(book, session.startPage, session.endPage);
      if (error) return { ok: false, error };
      return saved({
        ...data,
        readingSessions: [...data.readingSessions, session],
        // Terminou o livro: concluído. Leu um livro parado ou da lista de desejos: passa a "lendo".
        books: data.books.map((b) => {
          if (b.id !== book.id) return b;
          if (session.endPage >= book.totalPages) return { ...b, status: "done" };
          return b.status === "want" || b.status === "paused" ? { ...b, status: "reading" } : b;
        }),
      });
    }
    case "reading.updateSession": {
      const current = data.readingSessions.find((s) => s.id === command.id);
      if (!current) return failed(NOT_FOUND.session);
      const book = data.books.find((b) => b.id === current.bookId);
      if (!book) return failed(NOT_FOUND.book);
      const error = validateReadingSession(book, command.fields.startPage, command.fields.endPage);
      if (error) return failed(error);
      return saved({
        ...data,
        readingSessions: replaceFields(data.readingSessions, command.id, ["bookId"], command.fields),
        // Mesmo efeito de registrar: terminar o livro o conclui. (Reduzir o fim NÃO reabre o livro: use a situação.)
        books: command.fields.endPage >= book.totalPages ? data.books.map((b) => (b.id === book.id ? { ...b, status: "done" } : b)) : data.books,
      });
    }
    case "reading.deleteSession":
      return saved({ ...data, readingSessions: removeById(data.readingSessions, command.id) });

    default: {
      const unreachable: never = command;
      throw new Error(`Comando desconhecido: ${JSON.stringify(unreachable)}`);
    }
  }
}
