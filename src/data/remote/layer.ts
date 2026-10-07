import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Command, Outcome } from "@/domain/commands";
import { applyCommand } from "@/domain/reducers";
import { EMPTY_APP_DATA } from "@/domain/snapshot";
import type { DataSnapshot } from "@/domain/summary";
import type { WorkoutDraft } from "@/domain/types";
import { addDraftSet, buildDraft, removeDraftSet, setDraftNotes, updateDraftSet } from "@/domain/workouts";
import { uid } from "@/lib/id";
import { runCommand } from "@/server/actions/commands";
import { signOut as signOutAction } from "@/server/actions/auth";
import { createDataActions, type ActionHost } from "../actions";
import { fail, ok, type Actions, type LocalActions, type Result } from "../contract";
import type { Account, DataLayer, StoreStatus } from "../layer";
import { isDraftHydrated, subscribeDraftHydrated, useDraftStore } from "./draft-store";
import { remoteAssistant } from "./assistant-client";
import { wipeLocalUserData } from "./local-data";
import type { SnapshotPayload } from "./payload";
import { fetchSnapshot, goToLogin, queryClient, SNAPSHOT_KEY } from "./query";

const snapshotQuery = { queryKey: SNAPSHOT_KEY, queryFn: fetchSnapshot } as const;

/* ---------- escrita: otimista, confirmada pelo servidor ---------- */

/** Comandos ainda esperando o servidor. Só reconciliamos com o servidor quando não há nenhum, para uma leitura
 *  antiga não desfazer na tela uma ação que ainda está a caminho. */
let inflight = 0;

function cachedPayload(): SnapshotPayload | undefined {
  return queryClient.getQueryData<SnapshotPayload>(SNAPSHOT_KEY);
}

async function dispatch(command: Command): Promise<Result<Outcome>> {
  const before = cachedPayload();
  if (!before) return fail("Seus dados ainda não carregaram. Tente de novo.", "unknown");

  // O domínio decide primeiro: a mesma regra (e a mesma mensagem) que o banco aplicaria, sem ida à rede.
  const applied = applyCommand(before.data, command);
  if (!applied.ok) return fail(applied.error, "validation");

  inflight += 1;
  try {
    // Uma leitura em andamento devolveria o estado ANTIGO por cima do otimista.
    await queryClient.cancelQueries({ queryKey: SNAPSHOT_KEY });
    queryClient.setQueryData<SnapshotPayload>(SNAPSHOT_KEY, (old) => {
      if (!old) return old;
      const next = applyCommand(old.data, command);
      return next.ok ? { ...old, data: next.data } : old;
    });

    let result: Result<Outcome>;
    try {
      result = await runCommand(command);
    } catch {
      result = fail("Sem conexão com o servidor. Nada foi salvo.", "offline");
    }
    if (!result.ok && result.code === "unauthorized") goToLogin();
    return result;
  } finally {
    inflight -= 1;
    // Sucesso: o servidor é a verdade (relógio do cronômetro, desfecho). Falha: isto desfaz o efeito otimista.
    if (inflight === 0) void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
  }
}

const host: ActionHost = {
  read: () => ({ data: cachedPayload()?.data ?? EMPTY_APP_DATA, draft: useDraftStore.getState().draft }),
  dispatch,
  clearDraft: () => useDraftStore.setState({ draft: null }),
  now: () => Date.now(),
  newId: uid,
};

function editDraft(change: (draft: WorkoutDraft) => WorkoutDraft) {
  useDraftStore.setState((s) => (s.draft ? { draft: change(s.draft) } : s));
}

const localActions: LocalActions = {
  startWorkout(planId) {
    const data = cachedPayload()?.data;
    const plan = data?.plans.find((p) => p.id === planId);
    if (!data || !plan) return;
    useDraftStore.setState({ draft: buildDraft(plan, data.exercises, data.sessions, Date.now(), uid()) });
  },
  updateDraftSet: (exerciseIndex, setIndex, patch) => editDraft((d) => updateDraftSet(d, exerciseIndex, setIndex, patch)),
  addDraftSet: (exerciseIndex) => editDraft((d) => addDraftSet(d, exerciseIndex)),
  removeDraftSet: (exerciseIndex, setIndex) => editDraft((d) => removeDraftSet(d, exerciseIndex, setIndex)),
  setDraftNotes: (notes) => editDraft((d) => setDraftNotes(d, notes)),
  cancelWorkout: () => useDraftStore.setState({ draft: null }),
  resetDemo: () => undefined, // não existe no modo real: nunca apaga dados do usuário
};

const actions: Actions = { ...createDataActions(host), ...localActions };

/* ---------- leitura ---------- */

const EMPTY_SNAPSHOT: DataSnapshot = { ...EMPTY_APP_DATA };

/** Estável (definida uma vez): o TanStack só refaz a seleção quando os dados mudam. */
function selectData({ data }: SnapshotPayload): DataSnapshot {
  return {
    categories: data.categories,
    transactions: data.transactions,
    goals: data.goals,
    exercises: data.exercises,
    plans: data.plans,
    sessions: data.sessions,
    subjects: data.subjects,
    studySessions: data.studySessions,
    books: data.books,
    readingSessions: data.readingSessions,
  };
}

const selectTemplates = (p: SnapshotPayload) => p.data.templates;
const selectTimer = (p: SnapshotPayload) => p.data.timer;

const LOADING: StoreStatus = { phase: "loading" };
const READY: StoreStatus = { phase: "ready" };

function useStoreStatus(): StoreStatus {
  const query = useQuery(snapshotQuery);
  // No servidor e na primeira renderização no navegador é sempre false: a hidratação precisa casar.
  const draftReady = useSyncExternalStore(subscribeDraftHydrated, isDraftHydrated, () => false);

  if (query.data && draftReady) return READY;
  if (query.isError && !query.data) {
    return { phase: "error", message: query.error.message, retry: () => void query.refetch() };
  }
  return LOADING;
}

function useAccount(): Account {
  const payload = useQuery(snapshotQuery).data;
  return useMemo(() => {
    const email = payload?.user.email ?? null;
    return {
      isLive: true,
      displayName: payload?.profile?.displayName || email?.split("@")[0] || "",
      email,
      aiEnabled: payload?.capabilities.ai ?? false,
      aiProvider: payload?.capabilities.aiProvider ?? null,
    };
  }, [payload]);
}

async function signOut(): Promise<Result> {
  let outcome: { ok: boolean };
  try {
    outcome = await signOutAction();
  } catch {
    return fail("Sem conexão com o servidor. Não foi possível sair.", "offline");
  }
  // Se o servidor não encerrou a sessão, NÃO apagamos nada local: a conta continua aberta.
  if (!outcome.ok) return fail("Não foi possível sair. Tente de novo.", "unknown");
  queryClient.clear();
  wipeLocalUserData();
  goToLogin();
  return ok();
}

export const remoteLayer: DataLayer = {
  useStoreStatus,
  // No modo real a abertura não espera os dados: cada tela mostra o próprio esqueleto (StoreGate). Assim o layout
  // raiz nunca toca nos dados, e páginas públicas (login) nunca disparam a leitura de `/api/snapshot`.
  useLaunchReady: () => true,
  useData: () => useQuery({ ...snapshotQuery, select: selectData }).data ?? EMPTY_SNAPSHOT,
  useTemplates: () => useQuery({ ...snapshotQuery, select: selectTemplates }).data ?? EMPTY_APP_DATA.templates,
  useDraft: () => useDraftStore((s) => s.draft),
  useTimer: () => useQuery({ ...snapshotQuery, select: selectTimer }).data ?? null,
  useAccount,
  actions,
  assistant: remoteAssistant,
  signOut,
};
