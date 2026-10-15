"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Sheet } from "@/components/shared/sheet";
import { useData } from "@/data";
import { formatLiters, formatTotal, waterGoalFor, waterIntakesOn } from "@/domain/water";
import type { WaterIntake } from "@/domain/types";
import { addDays, clockFromInstant, type DateKey } from "@/lib/dates";
import { capitalize, formatDayLong } from "@/lib/format";
import { WaterIntakeList } from "./water-intake-list";
import { useWaterRemoval } from "./water-remove";

interface WaterDaySheetProps {
  /** o dia aberto; null = fechada */
  day: DateKey | null;
  today: DateKey;
  onClose: () => void;
}

/** Os registros de um dia do calendário: o total, a meta daquele dia e a lista, com remoção. */
export function WaterDaySheet({ day, today, onClose }: WaterDaySheetProps) {
  return (
    <Sheet
      open={day !== null}
      onOpenChange={(open) => !open && onClose()}
      title={day ? capitalize(formatDayLong(day)) : "Dia"}
      description="Registros de água deste dia."
      module="water"
    >
      {day ? <DayBody day={day} today={today} /> : null}
    </Sheet>
  );
}

function DayBody({ day, today }: { day: DateKey; today: DateKey }) {
  const data = useData();
  const { remove, restore } = useWaterRemoval();
  const intakes = useMemo(() => waterIntakesOn(data.waterIntakes, day).reverse(), [data.waterIntakes, day]);
  const [confirming, setConfirming] = useState<WaterIntake | null>(null);
  // O último removido, para o "Desfazer" DENTRO da folha (um toast não recebe toque com o modal aberto).
  const [removed, setRemoved] = useState<{ intake: WaterIntake; undoable: boolean } | null>(null);

  const totalMl = intakes.reduce((sum, i) => sum + i.ml, 0);
  const targetMl = waterGoalFor(data.goals, day);
  // O servidor só cria registros de hoje e de ontem: fora disso, remover é definitivo e pede confirmação.
  const undoable = day >= addDays(today, -1);

  async function removeIntake(intake: WaterIntake) {
    if (await remove(intake, { toast: false })) setRemoved({ intake, undoable });
  }

  async function undo() {
    if (!removed) return;
    const { intake } = removed;
    setRemoved(null);
    await restore(intake);
  }

  return (
    <div className="space-y-4 pb-2">
      <div>
        <p className="text-[2rem] leading-none font-bold tabular-nums">{formatTotal(totalMl)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {targetMl
            ? totalMl >= targetMl
              ? `Meta de ${formatLiters(targetMl)} batida`
              : `Meta de ${formatLiters(targetMl)}: ficou faltando ${formatLiters(targetMl - totalMl)}`
            : "Sem meta definida neste dia"}
        </p>
      </div>
      {intakes.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum registro neste dia.</p>
      ) : (
        <WaterIntakeList intakes={intakes} onRemove={(intake) => (undoable ? void removeIntake(intake) : setConfirming(intake))} />
      )}
      {removed ? (
        <div role="status" className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-m-soft pl-3 text-sm text-m-ink">
          <span className="tabular-nums">
            Removido: {formatLiters(removed.intake.ml)} das {clockFromInstant(removed.intake.at)}
          </span>
          {removed.undoable ? (
            <button
              type="button"
              onClick={() => void undo()}
              className="min-h-11 rounded-xl px-4 font-semibold underline underline-offset-2 transition active:bg-black/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Desfazer
            </button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Remover este registro?"
        description="Como é de um dia antigo, não dá para desfazer depois."
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (confirming) void removeIntake(confirming);
          setConfirming(null);
        }}
      />
    </div>
  );
}
