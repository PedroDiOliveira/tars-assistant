"use client";

import { useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Dumbbell, Minus, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { SubHeader } from "@/components/layout/sub-header";
import { workoutSummary } from "@/domain/summary";
import { draftProgress, lastPerformance } from "@/domain/workouts";
import { useActions, useData, useDraft, useNow, useToday } from "@/data";
import { formatClock, pluralize } from "@/lib/format";
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
  const [confirmFinish, setConfirmFinish] = useState(false);
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

  async function finish() {
    const result = await finishWorkout();
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
    } else if (pending > 0) {
      setConfirmFinish(true);
    } else {
      finish();
    }
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

      <ConfirmDialog
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title="Finalizar com séries pendentes?"
        description={`${pending} ${pluralize(pending, "série não foi concluída e não será salva", "séries não foram concluídas e não serão salvas")}.`}
        confirmLabel="Finalizar treino"
        onConfirm={finish}
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

export const SessionScreen = withStoreGate(SessionScreenContent);
