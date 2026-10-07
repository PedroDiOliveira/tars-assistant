import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { WorkoutDraft } from "@/domain/types";

/**
 * Treino em andamento (decisão B): vive só neste aparelho até ser finalizado, porque academia tem sinal ruim.
 * É a única coisa do modo real guardada em localStorage, e é apagada ao sair da conta (spec §13).
 */
export const DRAFT_STORAGE_KEY = "tars-draft-v1";

interface DraftState {
  draft: WorkoutDraft | null;
}

export const useDraftStore = create<DraftState>()(
  persist<DraftState>(() => ({ draft: null }), {
    name: DRAFT_STORAGE_KEY,
    version: 1,
    storage: createJSONStorage(() => localStorage),
    // O Next renderiza no servidor: a reidratação é disparada manualmente no navegador.
    skipHydration: true,
  }),
);

let hydrated = false;
const listeners = new Set<() => void>();

export function isDraftHydrated(): boolean {
  return hydrated;
}

export function subscribeDraftHydrated(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Carrega o rascunho salvo. localStorage indisponível (janela anônima) não trava o app: segue só em memória. */
export async function hydrateDraft(): Promise<void> {
  if (hydrated) return;
  try {
    await useDraftStore.persist.rehydrate();
  } catch {
    // sem armazenamento local: o treino em andamento só sobrevive enquanto a aba estiver aberta
  }
  hydrated = true;
  listeners.forEach((l) => l());
}

/** Apaga o rascunho da memória E do armazenamento (sair da conta). */
export function wipeDraft(): void {
  useDraftStore.setState({ draft: null });
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // nada a apagar
  }
}
