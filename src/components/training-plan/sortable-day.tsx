"use client";

import { useId } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeftRight, GripVertical } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { SLOT_TYPES, formatRange, type PlanChoices, type PlanDay, type PlanSlot } from "@/domain/training-rules";

/** Só na vertical: a lista é uma coluna, e escorregar para o lado não deve tirar o item do lugar. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

export interface SortableDayProps {
  day: PlanDay;
  choices: PlanChoices;
  nameOf: (exerciseKey: string) => string;
  isKnown: (exerciseKey: string) => boolean;
  /** vagas cujo exercício principal ficou depois dos isolados (aviso, não erro) */
  lateSlots: ReadonlySet<string>;
  /** sem edição (proposta desatualizada): a lista só mostra */
  readOnly?: boolean;
  onMove: (from: number, to: number) => void;
  onOpen: (slotId: string) => void;
  onSwap: (slotId: string) => void;
}

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}min${rest}` : `${minutes} min`;
}

function Row({
  slot,
  position,
  total,
  name,
  sets,
  reps,
  known,
  late,
  readOnly,
  onOpen,
  onSwap,
}: {
  slot: PlanSlot;
  position: number;
  total: number;
  name: string;
  sets: number;
  reps: readonly [number, number];
  known: boolean;
  late: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onSwap: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.id,
    disabled: readOnly,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex items-center gap-1 bg-card py-1.5 pr-2 pl-1", isDragging && "z-10 rounded-xl shadow-lg ring-1 ring-border")}
    >
      {readOnly ? (
        <span className="w-2" aria-hidden />
      ) : (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-roledescription="item reordenável"
          aria-label={`Mudar a posição de ${name} (${position} de ${total})`}
          // `touch-none` só na alça: o resto da linha continua rolando a tela com o dedo.
          className="grid h-11 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground transition active:cursor-grabbing active:bg-muted"
        >
          <GripVertical className="size-5" aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        disabled={readOnly}
        className="min-w-0 flex-1 rounded-xl px-1.5 py-1.5 text-left transition active:bg-muted disabled:active:bg-transparent"
      >
        <span className="block font-medium">{name}</span>
        <span className="block text-sm text-muted-foreground tabular-nums">
          {sets} × {formatRange(reps)} · descanso {formatRest(slot.restSeconds)}
          {known ? " · você já faz" : ""}
        </span>
        {late ? <span className="mt-0.5 block text-sm text-warning-ink">Exercício pesado: costuma render mais no começo.</span> : null}
        <span className="sr-only">{SLOT_TYPES[slot.type].label}</span>
      </button>
      {readOnly ? null : (
        <Button variant="ghost" size="icon-sm" aria-label={`Trocar ${name}`} onClick={onSwap}>
          <ArrowLeftRight aria-hidden />
        </Button>
      )}
    </li>
  );
}

/**
 * Os exercícios de um treino, na ordem de execução. A ordem muda arrastando pela alça (dedo, mouse ou teclado: espaço,
 * setas, espaço) ou pelos botões "Subir"/"Descer" da folha do exercício, que é a alternativa sem arrastar.
 */
export function SortableDay({ day, choices, nameOf, isKnown, lateSlots, readOnly = false, onMove, onOpen, onSwap }: SortableDayProps) {
  const contextId = useId();
  const sensors = useSensors(
    // Um pequeno deslocamento antes de começar: um toque na alça não vira arrasto sem querer.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = day.slots.map((s) => s.id);
  const total = ids.length;
  const label = (id: string | number) => nameOf(choices[String(id)]?.exerciseKey ?? "");
  const position = (id: string | number) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${label(active.id)} selecionado, na posição ${position(active.id)} de ${total}.`,
    onDragOver: ({ active, over }) => (over ? `${label(active.id)} na posição ${position(over.id)} de ${total}.` : `${label(active.id)} fora da lista.`),
    onDragEnd: ({ active, over }) => (over ? `${label(active.id)} ficou na posição ${position(over.id)} de ${total}.` : `${label(active.id)} voltou ao lugar.`),
    onDragCancel: ({ active }) => `Cancelado. ${label(active.id)} voltou ao lugar.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  }

  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Para mudar a posição, aperte espaço, use as setas para cima e para baixo e aperte espaço de novo para soltar. Esc cancela.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-border/60">
          {day.slots.map((slot, i) => {
            const choice = choices[slot.id];
            return (
              <Row
                key={slot.id}
                slot={slot}
                position={i + 1}
                total={total}
                name={nameOf(choice.exerciseKey)}
                sets={choice.sets}
                reps={choice.reps}
                known={isKnown(choice.exerciseKey)}
                late={lateSlots.has(slot.id)}
                readOnly={readOnly}
                onOpen={() => onOpen(slot.id)}
                onSwap={() => onSwap(slot.id)}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
