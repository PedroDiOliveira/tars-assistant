import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { moveSlot, parsePlanProposal, setPrescription, swapExercise, type PlanProposal } from "@/domain/training-proposal";
import type { RepRange } from "@/domain/training-rules";
import { applyChanges, type SuggestedChange } from "@/domain/training-adjust";

/**
 * A proposta de plano em REVISÃO. Vive só neste aparelho (como o treino em andamento): gerar e trocar exercícios não
 * grava nada no banco; só o plano aceito vai para lá. Sobrevive a fechar o app e é apagada ao sair da conta.
 * Vale nos dois modos (demo e real).
 */
export const PLAN_PROPOSAL_KEY = "tars-plan-proposal-v1";

interface PlanProposalState {
  proposal: PlanProposal | null;
  /** A proposta antes da última edição, para o "Desfazer" (um nível; some ao gerar outra ou descartar). */
  previous: PlanProposal | null;
  set(proposal: PlanProposal): void;
  /** Troca o exercício de uma vaga. false = troca não permitida (nada muda). */
  swap(slotId: string, exerciseKey: string): boolean;
  /** Muda a posição de um exercício no treino. false = nada mudou. */
  move(dayId: string, from: number, to: number): boolean;
  /** Muda séries e/ou repetições de uma vaga (só entre as opções das regras). false = nada mudou. */
  prescribe(slotId: string, change: { sets?: number; reps?: RepRange }): boolean;
  /** Aplica um ajuste (várias mudanças) de uma vez; um "Desfazer" volta todas. Devolve quantas valeram. */
  adjust(changes: readonly SuggestedChange[]): number;
  /** Volta para antes da última edição. false = não há o que desfazer. */
  undo(): boolean;
  clear(): void;
}

export const usePlanProposal = create<PlanProposalState>()(
  persist<PlanProposalState, [], [], { proposal: PlanProposal | null }>(
    (set, get) => {
      /** Aplica uma edição pura; guarda o estado anterior para o "Desfazer". */
      const edit = (change: (proposal: PlanProposal) => PlanProposal | null): boolean => {
        const current = get().proposal;
        const next = current ? change(current) : null;
        if (!current || !next) return false;
        set({ proposal: next, previous: current });
        return true;
      };
      return {
        proposal: null,
        previous: null,
        set: (proposal) => set({ proposal, previous: null }),
        swap: (slotId, exerciseKey) => edit((p) => swapExercise(p, slotId, exerciseKey)),
        move: (dayId, from, to) => edit((p) => moveSlot(p, dayId, from, to)),
        prescribe: (slotId, change) => edit((p) => setPrescription(p, slotId, change)),
        adjust: (changes) => {
          let count = 0;
          edit((p) => {
            const result = applyChanges(p, changes);
            count = result.applied.length;
            return count > 0 ? result.proposal : null;
          });
          return count;
        },
        undo: () => {
          const { proposal, previous } = get();
          // Só desfaz sobre a MESMA proposta (gerar outra no meio do caminho zera o "anterior").
          if (!proposal || !previous || previous.id !== proposal.id) return false;
          set({ proposal: previous, previous: null });
          return true;
        },
        clear: () => set({ proposal: null, previous: null }),
      };
    },
    {
      name: PLAN_PROPOSAL_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ proposal }) => ({ proposal }),
      // O que veio do armazenamento pode estar velho ou adulterado: só entra uma proposta válida nesta versão do app.
      merge: (persisted, current) => ({ ...current, proposal: parsePlanProposal((persisted as { proposal?: unknown } | null)?.proposal) }),
      skipHydration: true,
    },
  ),
);

/** Carrega a proposta salva. Sem armazenamento local (janela anônima), ela só dura enquanto a aba estiver aberta. */
export async function hydratePlanProposal(): Promise<void> {
  try {
    await usePlanProposal.persist.rehydrate();
  } catch {
    // sem armazenamento local
  }
}

/** Apaga a proposta deste aparelho (sair da conta). */
export function wipePlanProposal(): void {
  usePlanProposal.setState({ proposal: null, previous: null });
  try {
    localStorage.removeItem(PLAN_PROPOSAL_KEY);
  } catch {
    // nada a apagar
  }
}
