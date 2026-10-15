"use client";

import { toast } from "sonner";
import { notify } from "@/components/shared/notify";
import { useActions } from "@/data";
import type { WaterIntake } from "@/domain/types";

/**
 * Remover um registro e devolvê-lo (desfazer). O desfazer registra de novo no MESMO instante e quantidade, o que só
 * funciona dentro da janela em que o servidor aceita criar (hoje e ontem); para um dia antigo quem chama deve
 * confirmar ANTES e não oferecer desfazer.
 *
 * Com `toast: true` o aviso (com o botão "Desfazer") vem num toast: serve às telas sem modal. Com uma folha aberta o
 * toast não recebe toque (o modal bloqueia o ponteiro), então quem está numa folha usa `toast: false` e mostra o
 * próprio "Desfazer" dentro dela.
 */
export function useWaterRemoval() {
  const { addWater, removeWater } = useActions();

  async function restore(intake: WaterIntake): Promise<boolean> {
    return notify(await addWater({ ml: intake.ml, at: intake.at }));
  }

  async function remove(intake: WaterIntake, options: { toast: boolean; undoable?: boolean }): Promise<boolean> {
    if (!notify(await removeWater(intake.id))) return false;
    if (options.toast) {
      toast("Registro removido", {
        ...(options.undoable === false ? {} : { action: { label: "Desfazer", onClick: () => void restore(intake) } }),
        duration: 6000,
      });
    }
    return true;
  }

  return { remove, restore };
}
