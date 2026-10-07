import { useMemo, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DataSnapshot } from "@/domain/summary";
import type { StudyTimer, TxTemplate, WorkoutDraft } from "@/domain/types";
import { answerQuestion, type AssistantReply } from "@/domain/assistant";
import { parseQuickEntry } from "@/domain/quick-entry";
import { todayKey } from "@/lib/dates";
import { uid } from "@/lib/id";
import { ok, type AssistantApi } from "../contract";
import type { Account, DataLayer, StoreStatus } from "../layer";
import { actions, ensureStoreReady, isStoreReady, useTarsStore } from "./store";

function subscribeStoreReady(onReady: () => void) {
  let subscribed = true;
  ensureStoreReady().then(
    () => {
      if (subscribed) onReady();
    },
    // O StoreGate mostra a tela de recuperação se a inicialização falhar.
    () => undefined,
  );
  return () => {
    subscribed = false;
  };
}

const notReadyOnServer = () => false;

const LOADING: StoreStatus = { phase: "loading" };
const READY: StoreStatus = { phase: "ready" };

function useStoreStatus(): StoreStatus {
  // Uma página em streaming pode hidratar depois que o AppLaunch já inicializou o store. A primeira
  // renderização na hidratação precisa casar com o esqueleto do servidor.
  const ready = useSyncExternalStore(subscribeStoreReady, isStoreReady, notReadyOnServer);
  return ready ? READY : LOADING;
}

function useData(): DataSnapshot {
  return useTarsStore(
    useShallow((s) => ({
      categories: s.categories,
      transactions: s.transactions,
      goals: s.goals,
      exercises: s.exercises,
      plans: s.plans,
      sessions: s.sessions,
      subjects: s.subjects,
      studySessions: s.studySessions,
      books: s.books,
      readingSessions: s.readingSessions,
    })),
  );
}

function useAccount(): Account {
  const displayName = useTarsStore((s) => s.displayName);
  return useMemo(() => ({ isLive: false, displayName, email: null, aiEnabled: true, aiProvider: null }), [displayName]);
}

/** Simulação local do assistente (sem rede): as mesmas regras de antes, com uma pequena espera para parecer uma conversa. */
const assistant: AssistantApi = {
  async ask(message) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const state = useTarsStore.getState();
    const today = todayKey();
    const entry = parseQuickEntry(message, today, state.categories);
    let reply: AssistantReply;
    if (entry.kind === "proposal") {
      reply = { text: "Entendi assim. Confira e confirme para eu salvar — nada foi salvo ainda.", proposal: { ...entry.proposal, id: uid() } };
    } else if (entry.kind === "ask") {
      reply = { text: entry.question };
    } else {
      reply = answerQuestion(message, state, today);
    }
    return ok(reply);
  },
};

export const demoLayer: DataLayer = {
  useStoreStatus,
  // Dados locais carregam em milissegundos; a abertura espera por eles (e nunca prende a pessoa em caso de erro).
  useLaunchReady: () => useStoreStatus().phase !== "loading",
  useData,
  useTemplates: (): TxTemplate[] => useTarsStore((s) => s.templates),
  useDraft: (): WorkoutDraft | null => useTarsStore((s) => s.draft),
  useTimer: (): StudyTimer | null => useTarsStore((s) => s.timer),
  useAccount,
  actions,
  assistant,
  // No demo "sair" só volta para a tela de entrada: os dados fictícios ficam neste navegador.
  signOut: async () => ok(),
};
