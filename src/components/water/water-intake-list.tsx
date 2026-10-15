"use client";

import { Trash2 } from "lucide-react";
import { Surface } from "@/components/shared/surface";
import { formatLiters } from "@/domain/water";
import type { WaterIntake } from "@/domain/types";
import { clockFromInstant } from "@/lib/dates";

/** Os registros de um dia, um por toque: horário, quantidade e remover. Usada na tela de água e na folha de um dia. */
export function WaterIntakeList({ intakes, onRemove }: { intakes: readonly WaterIntake[]; onRemove: (intake: WaterIntake) => void }) {
  return (
    <Surface className="overflow-hidden">
      <ul className="divide-y divide-border/60">
        {intakes.map((intake) => {
          const time = clockFromInstant(intake.at);
          return (
            <li key={intake.id} className="flex min-h-14 items-center gap-3 pr-1 pl-4">
              <span className="w-12 shrink-0 text-sm text-muted-foreground tabular-nums">{time}</span>
              <span className="min-w-0 flex-1 font-medium tabular-nums">{formatLiters(intake.ml)}</span>
              <button
                type="button"
                onClick={() => onRemove(intake)}
                aria-label={`Remover ${formatLiters(intake.ml)} das ${time}`}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
