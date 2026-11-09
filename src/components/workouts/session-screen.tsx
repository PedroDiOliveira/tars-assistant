"use client";

import { useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Dumbbell, Minus, Plus, TrendingUp, Undo2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Sheet } from "@/components/shared/sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { SubHeader } from "@/components/layout/sub-header";
import { libraryEntry } from "@/domain/exercise-library";
import { suggestLoad, suggestionApplied, type LoadSuggestion } from "@/domain/progression";
import { workoutSummary } from "@/domain/summary";
import type { SessionEffort } from "@/domain/types";
import { EFFORT_LABELS, EFFORT_LEVELS, draftProgress, lastPerformance } from "@/domain/workouts";
import { useActions, useData, useDraft, useNow, useToday } from "@/data";
import { formatClock, formatNumber, pluralize } from "@/lib/format";
import { summarizeSets } from "./format-sets";
import { NumberField } from "./number-field";
import { RestTimer, type RestState } from "./rest-timer";
import { notify } from "@/components/shared/notify";

function SessionScreenContent() {
  const draft = useDraft();

  if (!draft) {
    return (
      <div data-module="workout">
        <SubHeader title="Treino" backHref="/treino" />
        <div className="px-4 pt-4">
          <EmptyState
            icon={Dumbbell}
            title="Nenhum treino em andamento"
            description="Escolha uma ficha para começar."
            action={
              <Button asChild>
                <Link href="/treino">Escolher treino</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }
  return <ActiveSession />;
}

function ActiveSession() {
  const data = useData();
  const draft = useDraft();
  const today = useToday();
  const router = useRouter();
  const now = useNow(1000);
  const { updateDraftSet, addDraftSet, removeDraftSet, setDraftNotes, finishWorkout, cancelWorkout } = useActions();

  const [rest, setRest] = useState<RestState | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!draft) return null;
  const { done, total } = draftProgress(draft);
  const pending = total - done;
  const week = workoutSummary(data, today);

  function toggleSet(exerciseIndex: number, setIndex: number) {
    if (!draft) return;
    const exercise = draft.exercises[exerciseIndex];
    const set = exercise.sets[setIndex];
    const nextDone = !set.done;
    updateDraftSet(exerciseIndex, setIndex, { done: nextDone });
    if (nextDone) {
      const isLast = setIndex === exercise.sets.length - 1 && exerciseIndex === draft.exercises.length - 1;
      setRest(isLast ? null : { endsAt: Date.now() + exercise.restSeconds * 1000, total: exercise.restSeconds });
    }
  }

  async function finish(effort?: SessionEffort) {
    const result = await finishWorkout(effort);
    // Se falhar, o treino continua salvo no aparelho e dá para tentar de novo.
    if (!notify(result)) return;
    if (result.value === "saved") {
      const count = week.done + 1;
      toast.success(
        week.target
          ? `Treino concluído · ${count} de ${week.target} ${pluralize(week.target, "treino", "treinos")} nesta semana`
          : "Treino concluído",
      );
      router.push("/treino");
    } else if (result.value === "empty") {
      toast.error("Conclua ao menos uma série para salvar o treino.");
    }
  }

  function requestFinish() {
    if (done === 0) {
      toast.error("Conclua ao menos uma série para salvar o treino.");
    } else {
      setFinishing(true);
    }
  }

  /** Aplica (ou desfaz) a carga sugerida nas séries que ainda não foram feitas. */
  function setPendingWeight(exerciseIndex: number, weightKg: number) {
    if (!draft) return;
    draft.exercises[exerciseIndex].sets.forEach((set, si) => {
      if (!set.done) updateDraftSet(exerciseIndex, si, { weightKg });
    });
  }

  return (
    <div data-module="workout" className="pb-56">
      <SubHeader
        title={draft.nameSnapshot}
        backHref="/treino"
        backLabel="Voltar aos treinos (o treino continua salvo)"
        right={
          <span className="pr-3 text-sm font-semibold tabular-nums text-muted-foreground" aria-label="Tempo de treino">
            {formatClock((now - draft.startedAt) / 1000)}
          </span>
        }
      />

      <div className="space-y-4 px-4 pt-2">
        <Surface className="space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <p className="font-medium">
              {done} de {total} séries concluídas
            </p>
            <p className="text-muted-foreground">Salvo neste aparelho</p>
          </div>
          <ProgressBar ratio={total > 0 ? done / total : 0} label="Séries concluídas no treino" />
        </Surface>

        {draft.exercises.map((exercise, ei) => {
          const last = lastPerformance(data.sessions, exercise.exerciseId);
          const libraryKey = data.exercises.find((e) => e.id === exercise.exerciseId)?.libraryKey;
          const suggestion = suggestLoad({
            last,
            plannedSets: exercise.plannedSets,
            repMax: exercise.repMax,
            loadType: exercise.loadType,
            equipment: libraryEntry(libraryKey)?.equipment,
          });
          return (
            <Surface key={`${exercise.exerciseId}-${ei}`} className="p-4">
              <div className="space-y-0.5">
                <h2 className="text-base font-semibold">{exercise.nameSnapshot}</h2>
                <p className="text-sm text-muted-foreground">
                  {exercise.plannedSets} séries · {exercise.repMin}–{exercise.repMax} reps · descanso {exercise.restSeconds}s
                </p>
                <p className="text-sm text-m-ink">
                  {last ? `Última vez: ${summarizeSets(last.sets)}` : "Primeira vez neste exercício"}
                </p>
              </div>

              {suggestion ? (
                <LoadSuggestionChip
                  exerciseName={exercise.nameSnapshot}
                  suggestion={suggestion}
                  applied={suggestionApplied(exercise.sets, suggestion)}
                  onApply={() => setPendingWeight(ei, suggestion.toKg)}
                  onUndo={() => setPendingWeight(ei, suggestion.fromKg)}
                />
              ) : null}

              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
                  <span>#</span>
                  <span className="text-center">{exercise.loadType === "bodyweight" ? "kg extra" : "kg"}</span>
                  <span className="text-center">reps</span>
                  <span className="sr-only">Concluída</span>
                </div>
                {exercise.sets.map((set, si) => (
                  <div
                    key={si}
                    className={cn(
                      "grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 rounded-xl px-1 py-1 transition-colors",
                      set.done && "bg-m-soft",
                    )}
                  >
                    <span className="text-center text-sm font-semibold text-muted-foreground tabular-nums">{si + 1}</span>
                    <NumberField
                      decimal
                      label={`Carga da série ${si + 1} de ${exercise.nameSnapshot}, em quilos`}
                      value={set.weightKg}
                      onChange={(weightKg) => updateDraftSet(ei, si, { weightKg })}
                    />
                    <NumberField
                      label={`Repetições da série ${si + 1} de ${exercise.nameSnapshot}`}
                      value={set.reps}
                      onChange={(reps) => updateDraftSet(ei, si, { reps })}
                    />
                    <button
                      type="button"
                      aria-pressed={set.done}
                      aria-label={`${set.done ? "Desmarcar" : "Concluir"} série ${si + 1} de ${exercise.nameSnapshot}`}
                      onClick={() => toggleSet(ei, si)}
                      className={cn(
                        "grid size-11 place-items-center rounded-full border transition active:scale-95",
                        set.done ? "border-transparent bg-m text-black/80" : "bg-card text-muted-foreground",
                      )}
                    >
                      <Check className="size-5" strokeWidth={3} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => addDraftSet(ei)}>
                  <Plus aria-hidden /> Série
                </Button>
                <Button
                  variant="ghost"
                  disabled={exercise.sets.length <= 1}
                  onClick={() => removeDraftSet(ei, exercise.sets.length - 1)}
                >
                  <Minus aria-hidden /> Remover última
                </Button>
              </div>
            </Surface>
          );
        })}

        <label className="block space-y-2">
          <span className="text-sm font-medium">
            Observações <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <Textarea
            rows={2}
            value={draft.notes ?? ""}
            maxLength={300}
            placeholder="Como foi o treino?"
            onChange={(e) => setDraftNotes(e.target.value)}
          />
        </label>
      </div>

      {/* Barra inferior: descanso + finalizar. Some com o teclado aberto: ela subiria junto e cobriria o campo digitado. */}
      <div className="kb-hide fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-md space-y-2 border-t bg-background/95 p-3 pb-[max(0.75rem,var(--safe-bottom))] backdrop-blur-xl">
          {rest ? (
            <RestTimer
              rest={rest}
              onAdjust={(delta) =>
                setRest((r) => (r ? { ...r, endsAt: r.endsAt + delta * 1000, total: Math.max(r.total + delta, 1) } : r))
              }
              onDismiss={() => setRest(null)}
            />
          ) : null}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button size="lg" onClick={requestFinish}>
              Finalizar treino
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setConfirmCancel(true)}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>

      <FinishSheet
        open={finishing}
        onOpenChange={setFinishing}
        pending={pending}
        onFinish={(effort) => {
          setFinishing(false);
          finish(effort);
        }}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar este treino?"
        description="O progresso desta sessão será descartado e não conta na meta da semana."
        confirmLabel="Descartar treino"
        cancelLabel="Continuar treinando"
        destructive
        onConfirm={() => {
          cancelWorkout();
          toast.info("Treino descartado");
          router.push("/treino");
        }}
      />
    </div>
  );
}

const EFFORT_HINTS: Record<SessionEffort, string> = {
  1: "Sobrou energia",
  2: "Cansou, mas no ponto",
  3: "Exigiu bastante",
  4: "No limite",
};

/**
 * "Como foi o treino?": aparece ao finalizar, e escolher já salva (um toque). Pular também salva, sem avaliação. É o
 * sinal que, junto das cargas, mostra se o treino está leve ou pesado demais ao longo do mês.
 */
function FinishSheet({
  open,
  onOpenChange,
  pending,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: number;
  onFinish: (effort?: SessionEffort) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      module="workout"
      title="Como foi o treino?"
      description={
        pending > 0
          ? `${pending} ${pluralize(pending, "série não foi concluída e não será salva", "séries não foram concluídas e não serão salvas")}.`
          : "Toque para finalizar. Isso ajuda a acompanhar sua evolução no mês."
      }
      footer={
        <Button variant="ghost" onClick={() => onFinish(undefined)}>
          Finalizar sem avaliar
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Como foi o treino">
        {EFFORT_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onFinish(level)}
            className="flex min-h-20 flex-col items-start justify-center gap-0.5 rounded-2xl border bg-card px-4 py-3 text-left transition active:scale-[0.98] active:bg-m-soft"
          >
            <span className="font-semibold">{EFFORT_LABELS[level]}</span>
            <span className="text-sm text-muted-foreground">{EFFORT_HINTS[level]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Progressão dupla: bateu o topo da faixa em todas as séries da última vez, então sugere subir a carga. */
function LoadSuggestionChip({
  exerciseName,
  suggestion,
  applied,
  onApply,
  onUndo,
}: {
  exerciseName: string;
  suggestion: LoadSuggestion;
  applied: boolean;
  onApply: () => void;
  onUndo: () => void;
}) {
  const to = `${formatNumber(suggestion.toKg, 2)} kg`;
  const from = `${formatNumber(suggestion.fromKg, 2)} kg`;
  if (applied) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-m-soft px-3 py-2 text-sm text-m-ink">
        <Check className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">Carga ajustada para {to}</span>
        <button
          type="button"
          onClick={onUndo}
          aria-label={`Voltar ${exerciseName} para ${from}`}
          className="-my-1 flex items-center gap-1 rounded-lg px-2 py-1.5 font-medium active:bg-black/5"
        >
          <Undo2 className="size-4" aria-hidden /> {from}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onApply}
      aria-label={`Subir ${exerciseName} para ${to}`}
      className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-m/60 px-3 py-2.5 text-left transition active:bg-m-soft"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
        <TrendingUp className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Hora de subir: {to}</span>
        <span className="block text-xs text-muted-foreground">
          Você fez {suggestion.reps}+ reps em todas as séries com {from}
        </span>
      </span>
      <span className="text-sm font-semibold text-m-ink">Aplicar</span>
    </button>
  );
}

export const SessionScreen = withStoreGate(SessionScreenContent);
