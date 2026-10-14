import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEMO_STORAGE_KEY } from "@/lib/constants";
import { todayKey } from "@/lib/dates";
import { uid } from "@/lib/id";
import { applyCommand } from "@/domain/reducers";
import { EMPTY_APP_DATA, type AppData } from "@/domain/snapshot";
import type { WorkoutDraft } from "@/domain/types";
import { addDraftSet, buildDraft, removeDraftSet, setDraftNotes, updateDraftSet } from "@/domain/workouts";
import { createDataActions, type ActionHost } from "../actions";
import { fail, ok, type Actions, type LocalActions } from "../contract";
import { migrateDemoState } from "./migrate";
import { buildSeed } from "./seed";

/** Estado que só existe no aparelho (não é um dado de negócio). */
interface Local {
  /** false até o primeiro seed: distingue "nunca abriu" de "dados apagados" */
  seeded: boolean;
  displayName: string;
  /** Treino em andamento: rascunho local, só vai ao banco ao finalizar (decisão B). */
  draft: WorkoutDraft | null;
}

export type TarsState = AppData & Local;

const EMPTY: TarsState = { ...EMPTY_APP_DATA, seeded: false, displayName: "Pedro", draft: null };

function seededData(): TarsState {
  return { ...EMPTY, ...buildSeed(todayKey()), seeded: true, draft: null, timer: null };
}

function pickAppData(s: TarsState): AppData {
  return {
    categories: s.categories,
    transactions: s.transactions,
    templates: s.templates,
    goals: s.goals,
    exercises: s.exercises,
    plans: s.plans,
    sessions: s.sessions,
    subjects: s.subjects,
    studySessions: s.studySessions,
    timer: s.timer,
    books: s.books,
    readingSessions: s.readingSessions,
    runningSessions: s.runningSessions,
  };
}

export const useTarsStore = create<TarsState>()(
  persist(() => EMPTY, {
    name: DEMO_STORAGE_KEY,
    // v3: corridas. Ver `migrateDemoState` para o histórico de versões.
    version: 3,
    migrate: migrateDemoState,
    storage: createJSONStorage(() => localStorage),
    // O Next renderiza no servidor: a reidratação é disparada manualmente no cliente.
    skipHydration: true,
  }),
);

/* ---------- adapter: o "servidor" do demo é o próprio localStorage ---------- */

const host: ActionHost = {
  read: () => {
    const s = useTarsStore.getState();
    return { data: pickAppData(s), draft: s.draft };
  },
  // Sem `await` antes de aplicar: o efeito é síncrono, então um segundo toque já enxerga o estado novo.
  async dispatch(command) {
    const applied = applyCommand(pickAppData(useTarsStore.getState()), command);
    if (!applied.ok) return fail(applied.error, "validation");
    useTarsStore.setState(applied.data);
    return ok(applied.outcome);
  },
  clearDraft: () => useTarsStore.setState({ draft: null }),
  now: () => Date.now(),
  newId: uid,
};

function editDraft(change: (draft: WorkoutDraft) => WorkoutDraft) {
  useTarsStore.setState((s) => (s.draft ? { draft: change(s.draft) } : s));
}

const localActions: LocalActions = {
  startWorkout(planId) {
    const { plans, exercises, sessions } = useTarsStore.getState();
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    useTarsStore.setState({ draft: buildDraft(plan, exercises, sessions, Date.now(), uid()) });
  },
  updateDraftSet(exerciseIndex, setIndex, patch) {
    editDraft((d) => updateDraftSet(d, exerciseIndex, setIndex, patch));
  },
  addDraftSet(exerciseIndex) {
    editDraft((d) => addDraftSet(d, exerciseIndex));
  },
  removeDraftSet(exerciseIndex, setIndex) {
    editDraft((d) => removeDraftSet(d, exerciseIndex, setIndex));
  },
  setDraftNotes(notes) {
    editDraft((d) => setDraftNotes(d, notes));
  },
  cancelWorkout: () => useTarsStore.setState({ draft: null }),
  resetDemo: () => useTarsStore.setState(seededData()),
};

/** Criadas uma vez: as referências nunca mudam, então podem ser entregues sem assinar o estado. */
export const actions: Actions = { ...createDataActions(host), ...localActions };

/* ---------- carregamento ---------- */

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
        if (!useTarsStore.getState().seeded) actions.resetDemo();
        ready = true;
      });
  }
  return readyPromise;
}
