import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_STORAGE_KEY } from "@/lib/constants";
import { dateKeyFromInstant, todayKey, type DateKey } from "@/lib/dates";
import { greenHue } from "@/lib/hues";
import { uid } from "@/lib/id";
import { upsertGoal } from "@/domain/goals";
import { buildDraft, finalizeDraft } from "@/domain/workouts";
import { finishTimer, pauseTimer, resumeTimer, startTimer } from "@/domain/studies";
import { validateReadingSession } from "@/domain/reading";
import type {
  Book,
  BookStatus,
  Category,
  Exercise,
  Goal,
  GoalKind,
  ReadingSession,
  SetLog,
  StudySession,
  StudyTimer,
  Subject,
  Transaction,
  TxTemplate,
  WorkoutDraft,
  WorkoutPlan,
  WorkoutSession,
} from "@/domain/types";
import { buildSeed } from "./seed";

interface Data {
  /** false até o primeiro seed: distingue "nunca abriu" de "dados apagados" */
  seeded: boolean;
  displayName: string;
  categories: Category[];
  transactions: Transaction[];
  templates: TxTemplate[];
  goals: Goal[];
  exercises: Exercise[];
  plans: WorkoutPlan[];
  sessions: WorkoutSession[];
  draft: WorkoutDraft | null;
  subjects: Subject[];
  studySessions: StudySession[];
  timer: StudyTimer | null;
  books: Book[];
  readingSessions: ReadingSession[];
}

export type NewTransaction = Omit<Transaction, "id" | "source"> & { source?: Transaction["source"] };
export type FinishStudyResult = "saved" | "too_short" | "none";
export type FinishWorkoutResult = "saved" | "empty" | "none";

export interface Actions {
  /* finanças */
  addTransaction: (input: NewTransaction) => string;
  updateTransaction: (id: string, patch: Partial<Omit<Transaction, "id">>) => void;
  deleteTransaction: (id: string) => void;
  addTemplate: (input: Omit<TxTemplate, "id">) => void;
  deleteTemplate: (id: string) => void;
  /* metas */
  setGoal: (input: { kind: GoalKind; scopeId: string | null; validFrom: DateKey; target: number }) => void;
  /* treino */
  startWorkout: (planId: string) => void;
  updateDraftSet: (exerciseIndex: number, setIndex: number, patch: Partial<SetLog>) => void;
  addDraftSet: (exerciseIndex: number) => void;
  removeDraftSet: (exerciseIndex: number, setIndex: number) => void;
  setDraftNotes: (notes: string) => void;
  finishWorkout: () => FinishWorkoutResult;
  cancelWorkout: () => void;
  deleteWorkoutSession: (id: string) => void;
  /* estudos */
  startStudy: (subjectId: string) => void;
  pauseStudy: () => void;
  resumeStudy: () => void;
  finishStudy: () => FinishStudyResult;
  discardStudy: () => void;
  addStudySession: (input: Omit<StudySession, "id" | "source"> & { source?: StudySession["source"] }) => void;
  updateStudySession: (id: string, patch: Partial<Omit<StudySession, "id">>) => void;
  deleteStudySession: (id: string) => void;
  addSubject: (name: string, objective?: string) => string;
  /* leitura */
  addBook: (input: Omit<Book, "id">) => string;
  setBookStatus: (id: string, status: BookStatus) => void;
  /** Devolve a mensagem de erro de validação, ou null se gravou. */
  addReadingSession: (input: Omit<ReadingSession, "id">) => string | null;
  deleteReadingSession: (id: string) => void;
  /* geral */
  resetDemo: () => void;
}

export type TarsState = Data & Actions;

const EMPTY: Data = {
  seeded: false,
  displayName: "Pedro",
  categories: [],
  transactions: [],
  templates: [],
  goals: [],
  exercises: [],
  plans: [],
  sessions: [],
  draft: null,
  subjects: [],
  studySessions: [],
  timer: null,
  books: [],
  readingSessions: [],
};

function seededData(): Data {
  return { ...EMPTY, ...buildSeed(todayKey()), seeded: true, draft: null, timer: null };
}

export const useTarsStore = create<TarsState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      /* ---------- finanças ---------- */
      addTransaction: (input) => {
        const id = uid("tx");
        set((s) => ({
          transactions: [...s.transactions, { source: "manual", ...input, id }],
        }));
        return id;
      },
      updateTransaction: (id, patch) =>
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      deleteTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      addTemplate: (input) =>
        set((s) => ({ templates: [...s.templates, { ...input, id: uid("tpl") }] })),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      /* ---------- metas ---------- */
      setGoal: ({ kind, scopeId, validFrom, target }) =>
        set((s) => ({
          goals: upsertGoal(s.goals, { id: uid("goal"), kind, scopeId, validFrom, target }),
        })),

      /* ---------- treino (rascunho local-first) ---------- */
      startWorkout: (planId) => {
        const { plans, exercises, sessions } = get();
        const plan = plans.find((p) => p.id === planId);
        if (!plan) return;
        set({ draft: buildDraft(plan, exercises, sessions, Date.now()) });
      },
      updateDraftSet: (exerciseIndex, setIndex, patch) =>
        set((s) => {
          if (!s.draft) return s;
          const exercises = s.draft.exercises.map((e, i) =>
            i !== exerciseIndex
              ? e
              : { ...e, sets: e.sets.map((set, j) => (j === setIndex ? { ...set, ...patch } : set)) },
          );
          return { draft: { ...s.draft, exercises } };
        }),
      addDraftSet: (exerciseIndex) =>
        set((s) => {
          if (!s.draft) return s;
          const exercises = s.draft.exercises.map((e, i) => {
            if (i !== exerciseIndex) return e;
            const last = e.sets[e.sets.length - 1];
            return {
              ...e,
              sets: [...e.sets, { weightKg: last?.weightKg ?? 0, reps: last?.reps ?? e.repMax, done: false }],
            };
          });
          return { draft: { ...s.draft, exercises } };
        }),
      removeDraftSet: (exerciseIndex, setIndex) =>
        set((s) => {
          if (!s.draft) return s;
          const exercises = s.draft.exercises.map((e, i) =>
            i !== exerciseIndex ? e : { ...e, sets: e.sets.filter((_, j) => j !== setIndex) },
          );
          return { draft: { ...s.draft, exercises } };
        }),
      setDraftNotes: (notes) =>
        set((s) => (s.draft ? { draft: { ...s.draft, notes } } : s)),
      finishWorkout: () => {
        const { draft } = get();
        if (!draft) return "none";
        const now = Date.now();
        const session = finalizeDraft(draft, uid("ws"), now, dateKeyFromInstant(draft.startedAt));
        if (!session) return "empty";
        set((s) => ({ sessions: [...s.sessions, session], draft: null }));
        return "saved";
      },
      cancelWorkout: () => set({ draft: null }),
      deleteWorkoutSession: (id) =>
        set((s) => ({ sessions: s.sessions.filter((w) => w.id !== id) })),

      /* ---------- estudos (cronômetro por timestamps) ---------- */
      startStudy: (subjectId) => {
        // No máximo um cronômetro ativo: iniciar outro é ignorado.
        if (get().timer) return;
        set({ timer: startTimer(subjectId, Date.now()) });
      },
      pauseStudy: () => set((s) => (s.timer ? { timer: pauseTimer(s.timer, Date.now()) } : s)),
      resumeStudy: () => set((s) => (s.timer ? { timer: resumeTimer(s.timer, Date.now()) } : s)),
      finishStudy: () => {
        const { timer } = get();
        if (!timer) return "none";
        // Limpa o cronômetro no mesmo set: uma segunda chamada cai em "none" e não duplica a duração.
        const session = finishTimer(timer, Date.now(), uid("st"));
        if (!session) {
          set({ timer: null });
          return "too_short";
        }
        set((s) => ({ studySessions: [...s.studySessions, session], timer: null }));
        return "saved";
      },
      discardStudy: () => set({ timer: null }),
      addStudySession: (input) =>
        set((s) => ({
          studySessions: [...s.studySessions, { source: "manual", ...input, id: uid("st") }],
        })),
      updateStudySession: (id, patch) =>
        set((s) => ({
          studySessions: s.studySessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      deleteStudySession: (id) =>
        set((s) => ({ studySessions: s.studySessions.filter((x) => x.id !== id) })),
      addSubject: (name, objective) => {
        const id = uid("sub");
        set((s) => ({
          subjects: [
            ...s.subjects,
            { id, name: name.trim(), objective, hue: greenHue(s.subjects.length) },
          ],
        }));
        return id;
      },

      /* ---------- leitura ---------- */
      addBook: (input) => {
        const id = uid("book");
        set((s) => ({ books: [...s.books, { ...input, id }] }));
        return id;
      },
      setBookStatus: (id, status) =>
        set((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, status } : b)) })),
      addReadingSession: (input) => {
        const book = get().books.find((b) => b.id === input.bookId);
        if (!book) return "Livro não encontrado.";
        const error = validateReadingSession(book, input.startPage, input.endPage);
        if (error) return error;
        set((s) => ({
          readingSessions: [...s.readingSessions, { ...input, id: uid("rd") }],
          // Terminou o livro: concluído. Leu um livro parado ou da lista de desejos: passa a "lendo".
          books: s.books.map((b) => {
            if (b.id !== book.id) return b;
            if (input.endPage >= book.totalPages) return { ...b, status: "done" };
            return b.status === "want" || b.status === "paused" ? { ...b, status: "reading" } : b;
          }),
        }));
        return null;
      },
      deleteReadingSession: (id) =>
        set((s) => ({ readingSessions: s.readingSessions.filter((r) => r.id !== id) })),

      /* ---------- geral ---------- */
      resetDemo: () => set(seededData()),
    }),
    {
      name: DEMO_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // O Next renderiza no servidor: a reidratação é disparada manualmente no cliente.
      skipHydration: true,
    },
  ),
);

/**
 * As ações são criadas uma vez com o store e nunca mudam de referência, então podem ser
 * entregues como um objeto estável, sem assinar o estado.
 */
export const actions = Object.fromEntries(
  Object.entries(useTarsStore.getState()).filter(([, value]) => typeof value === "function"),
) as unknown as Actions;

let readyPromise: Promise<void> | null = null;
let ready = false;

/** Leitura síncrona: true depois que os dados locais foram carregados nesta sessão do navegador. */
export function isStoreReady(): boolean {
  return ready;
}

/** Reidrata do localStorage uma única vez e gera o seed se for a primeira abertura. */
export function ensureStoreReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = Promise.resolve(useTarsStore.persist.rehydrate())
      // localStorage indisponível (aba privativa, por exemplo): segue só em memória.
      .catch(() => undefined)
      .then(() => {
        if (!useTarsStore.getState().seeded) useTarsStore.getState().resetDemo();
        ready = true;
      });
  }
  return readyPromise;
}
