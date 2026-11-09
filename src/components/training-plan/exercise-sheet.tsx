"use client";

import { ArrowDown, ArrowLeftRight, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/shared/sheet";
import { SEGMENT_TRACK, segmentItem } from "@/components/shared/segmented-styles";
import { libraryEntry, EQUIPMENT_LABELS } from "@/domain/exercise-library";
import type { PlanProposal } from "@/domain/training-proposal";
import { SLOT_TYPES, dayMinutes, dayOverBudget, formatRange, type RepRange } from "@/domain/training-rules";
import { usePlanProposal } from "@/data";

const sameRange = (a: RepRange, b: RepRange) => a[0] === b[0] && a[1] === b[1];

function Choices<T>({
  label,
  options,
  isActive,
  format,
  onPick,
}: {
  label: string;
  options: readonly T[];
  isActive: (option: T) => boolean;
  format: (option: T) => string;
  onPick: (option: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div role="radiogroup" aria-label={label} className={SEGMENT_TRACK}>
        {options.map((option) => (
          <button
            key={format(option)}
            type="button"
            role="radio"
            aria-checked={isActive(option)}
            onClick={() => onPick(option)}
            className={segmentItem(isActive(option))}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Detalhes de um exercício do rascunho: séries e repetições (só as opções que as regras permitem para a vaga), a
 * posição no treino (a alternativa sem arrastar) e a troca. As mudanças valem na hora; o tempo do treino acompanha.
 */
export function ExerciseSheet({
  proposal,
  slotId,
  nameOf,
  sessionMinutes,
  onClose,
  onSwap,
}: {
  proposal: PlanProposal;
  slotId: string | null;
  nameOf: (exerciseKey: string) => string;
  sessionMinutes: number | null;
  onClose: () => void;
  onSwap: (slotId: string) => void;
}) {
  const move = usePlanProposal((s) => s.move);
  const prescribe = usePlanProposal((s) => s.prescribe);
  const day = slotId ? proposal.skeleton.days.find((d) => d.slots.some((s) => s.id === slotId)) : undefined;
  const index = day && slotId ? day.slots.findIndex((s) => s.id === slotId) : -1;
  const slot = day?.slots[index];
  const choice = slotId ? proposal.choices[slotId] : undefined;
  const entry = choice ? libraryEntry(choice.exerciseKey) : undefined;
  const over = day ? dayOverBudget(proposal.skeleton, day, proposal.choices) : false;

  return (
    <Sheet
      open={Boolean(slot && choice)}
      onOpenChange={(open) => (open ? undefined : onClose())}
      module="workout"
      title={choice ? nameOf(choice.exerciseKey) : "Exercício"}
      description={slot && day ? `${SLOT_TYPES[slot.type].label}${entry ? ` · ${EQUIPMENT_LABELS[entry.equipment]}` : ""} · ${day.name}` : undefined}
    >
      {slot && choice && day ? (
        <div className="space-y-5">
          {choice.reason ? (
            <div className="rounded-2xl bg-muted/60 p-3 text-sm">
              <p className="font-medium">Por que este</p>
              <p className="mt-0.5 text-muted-foreground">{choice.reason}</p>
            </div>
          ) : null}

          {slot.setOptions.length > 1 ? (
            <Choices
              label="Séries"
              options={slot.setOptions}
              isActive={(sets) => sets === choice.sets}
              format={String}
              onPick={(sets) => prescribe(slot.id, { sets })}
            />
          ) : null}
          {slot.repOptions.length > 1 ? (
            <Choices
              label="Repetições"
              options={slot.repOptions}
              isActive={(reps) => sameRange(reps, choice.reps)}
              format={formatRange}
              onPick={(reps) => prescribe(slot.id, { reps })}
            />
          ) : null}

          <p className={over ? "text-sm text-warning-ink" : "text-sm text-muted-foreground"} aria-live="polite">
            {day.name}: cerca de {dayMinutes(day, proposal.choices)} min
            {over && sessionMinutes ? ` · passa do seu tempo (${sessionMinutes} min)` : ""}
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              Posição no treino: {index + 1} de {day.slots.length}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={index === 0} onClick={() => move(day.id, index, index - 1)}>
                <ArrowUp aria-hidden /> Subir
              </Button>
              <Button variant="outline" disabled={index === day.slots.length - 1} onClick={() => move(day.id, index, index + 1)}>
                <ArrowDown aria-hidden /> Descer
              </Button>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => onSwap(slot.id)}>
            <ArrowLeftRight aria-hidden /> Trocar exercício
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
