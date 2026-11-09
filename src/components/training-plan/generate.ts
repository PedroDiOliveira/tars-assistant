"use client";

import { toast } from "sonner";
import { create } from "zustand";
import { trainingPlan, usePlanProposal } from "@/data";

/** "Montando seu plano": vale para o app inteiro, para a geração continuar se a pessoa trocar de tela. */
export const usePlanGeneration = create<{ generating: boolean }>(() => ({ generating: false }));

/**
 * Pede uma proposta a partir das respostas JÁ salvas e a guarda no aparelho. Fora do ciclo de vida das telas: o
 * formulário pode navegar para a tela do plano enquanto o servidor responde. Uma geração por vez.
 */
export async function generateProposal(options: { split?: string } = {}): Promise<boolean> {
  if (usePlanGeneration.getState().generating) return false;
  usePlanGeneration.setState({ generating: true });
  try {
    const result = await trainingPlan.generate(options);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    usePlanProposal.getState().set(result.value);
    return true;
  } finally {
    usePlanGeneration.setState({ generating: false });
  }
}
