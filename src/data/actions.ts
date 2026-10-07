import { dateKeyFromInstant } from "@/lib/dates";
import { greenHue } from "@/lib/hues";
import type { Command, Outcome } from "@/domain/commands";
import type { AppData } from "@/domain/snapshot";
import type { Subject, WorkoutDraft } from "@/domain/types";
import { finalizeDraft } from "@/domain/workouts";
import {
  ok,
  type DataActions,
  type FinishStudyOutcome,
  type FinishWorkoutOutcome,
  type Result,
} from "./contract";

/**
 * O que um adapter (demo ou servidor) fornece. Todo o resto — montar o comando, gerar ids,
 * decidir desfechos, travar toque duplo — é igual nos dois e vive em `createDataActions`.
 */
export interface ActionHost {
  /** Estado atual, para decisões como a matiz de uma matéria nova ou "há cronômetro?". */
  read(): { data: AppData; draft: WorkoutDraft | null };
  /** Aplica o comando (de forma otimista e/ou persistindo) e só então resolve. */
  dispatch(command: Command): Promise<Result<Outcome>>;
  /** Apaga o rascunho de treino. Só é chamado depois que a sessão foi salva. */
  clearDraft(): void;
  now(): number;
  newId(): string;
}

export function createDataActions(host: ActionHost): DataActions {
  // Chaves de operações em andamento. Um segundo toque enquanto a primeira ainda espera o servidor
  // não pode disparar outra: no cronômetro duplicaria a duração, no treino criaria outra sessão.
  const inflight = new Set<string>();

  async function once<T>(key: string, whenBusy: T, run: () => Promise<T>): Promise<T> {
    if (inflight.has(key)) return whenBusy;
    inflight.add(key);
    try {
      return await run();
    } finally {
      inflight.delete(key);
    }
  }

  /** Envia o comando e descarta o desfecho, para as ações que só respondem "deu certo ou não". */
  async function send(command: Command): Promise<Result> {
    const sent = await host.dispatch(command);
    return sent.ok ? ok() : sent;
  }

  return {
    /* ---------- finanças ---------- */
    async addTransaction(input) {
      const id = input.id ?? host.newId();
      const sent = await host.dispatch({
        type: "transaction.add",
        transaction: { source: "manual", ...input, id },
      });
      return sent.ok ? ok({ id }) : sent;
    },
    updateTransaction: (id, fields) => send({ type: "transaction.update", id, fields }),
    deleteTransaction: (id) => send({ type: "transaction.delete", id }),
    addTemplate: (input) => send({ type: "template.add", template: { ...input, id: host.newId() } }),
    deleteTemplate: (id) => send({ type: "template.delete", id }),

    /* ---------- metas ---------- */
    setGoal: (input) => send({ type: "goal.set", goal: { id: host.newId(), ...input } }),

    /* ---------- treino ---------- */
    finishWorkout: () =>
      once<Result<FinishWorkoutOutcome>>("workout.finish", ok("none"), async () => {
        const { draft } = host.read();
        if (!draft) return ok("none");
        // O id vem do rascunho: reenviar (toque duplo, nova tentativa) é a mesma sessão, nunca outra.
        const session = finalizeDraft(draft, draft.id, host.now(), dateKeyFromInstant(draft.startedAt));
        if (!session) return ok("empty");
        const sent = await host.dispatch({ type: "workout.finish", session });
        if (!sent.ok) return sent; // falhou: o rascunho fica, para tentar de novo sem perder o treino
        host.clearDraft();
        return ok("saved");
      }),
    deleteWorkoutSession: (id) => send({ type: "workout.deleteSession", id }),

    /* ---------- estudos ---------- */
    startStudy: (subjectId) => send({ type: "study.start", subjectId, nowMs: host.now() }),
    pauseStudy: () => send({ type: "study.pause", nowMs: host.now() }),
    resumeStudy: () => send({ type: "study.resume", nowMs: host.now() }),
    finishStudy: () =>
      once<Result<FinishStudyOutcome>>("study.finish", ok("none"), async () => {
        if (!host.read().data.timer) return ok("none");
        return host.dispatch({ type: "study.finish", sessionId: host.newId(), nowMs: host.now() });
      }),
    discardStudy: () => send({ type: "study.discard" }),
    addStudySession: (input) =>
      send({ type: "studySession.add", session: { source: "manual", ...input, id: host.newId() } }),
    updateStudySession: (id, fields) => send({ type: "studySession.update", id, fields }),
    deleteStudySession: (id) => send({ type: "studySession.delete", id }),
    async addSubject(name, objective) {
      const subject: Subject = {
        id: host.newId(),
        name: name.trim(),
        objective,
        hue: greenHue(host.read().data.subjects.length),
      };
      const sent = await host.dispatch({ type: "subject.add", subject });
      return sent.ok ? ok({ id: subject.id }) : sent;
    },

    updateSubject: (id, fields) => send({ type: "subject.update", id, fields }),
    archiveSubject: (id, archived) => send({ type: "subject.archive", id, archived }),

    /* ---------- catálogos ---------- */
    async addCategory(input) {
      const { categories } = host.read().data;
      const sameType = categories.filter((c) => c.type === input.type).length;
      const category = { id: host.newId(), name: input.name.trim(), type: input.type, icon: input.icon, hue: greenHue(sameType) };
      const sent = await host.dispatch({ type: "category.add", category });
      return sent.ok ? ok({ id: category.id }) : sent;
    },
    updateCategory: (id, fields) => send({ type: "category.update", id, fields }),
    archiveCategory: (id, archived) => send({ type: "category.archive", id, archived }),
    async addExercise(input) {
      const exercise = { ...input, id: host.newId(), name: input.name.trim() };
      const sent = await host.dispatch({ type: "exercise.add", exercise });
      return sent.ok ? ok({ id: exercise.id }) : sent;
    },
    updateExercise: (id, fields) => send({ type: "exercise.update", id, fields }),
    archiveExercise: (id, archived) => send({ type: "exercise.archive", id, archived }),
    async savePlan(input) {
      const plan = { ...input, id: input.id ?? host.newId() };
      const sent = await host.dispatch({ type: "plan.save", plan });
      return sent.ok ? ok({ id: plan.id }) : sent;
    },
    archivePlan: (id, archived) => send({ type: "plan.archive", id, archived }),

    /* ---------- leitura ---------- */
    async addBook(input) {
      const book = { ...input, id: host.newId() };
      const sent = await host.dispatch({ type: "book.add", book });
      return sent.ok ? ok({ id: book.id }) : sent;
    },
    updateBook: (id, fields) => send({ type: "book.update", id, fields }),
    deleteBook: (id) => send({ type: "book.delete", id }),
    setBookStatus: (id, status) => send({ type: "book.setStatus", id, status }),
    addReadingSession: (input) =>
      send({ type: "reading.addSession", session: { ...input, id: host.newId() } }),
    updateReadingSession: (id, fields) => send({ type: "reading.updateSession", id, fields }),
    deleteReadingSession: (id) => send({ type: "reading.deleteSession", id }),
  };
}
