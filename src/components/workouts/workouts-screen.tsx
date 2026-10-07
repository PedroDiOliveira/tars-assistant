"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Dumbbell, Flame, Pencil, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { GoalSheet } from "@/components/goals/goal-sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { WeekDots } from "@/components/shared/week-dots";
import { PlanSheet } from "@/components/workouts/plan-sheet";
import { activeOnly } from "@/domain/catalog";
import { workoutSummary } from "@/domain/summary";
import type { WorkoutPlan } from "@/domain/types";
import {
  daysSinceLastPlan,
  draftProgress,
  exerciseHistory,
  personalRecord,
  sessionSetCount,
  sortSessionsDesc,
} from "@/domain/workouts";
import { useActions, useData, useDraft, useNow, useToday } from "@/data";
import { formatDayRelative, formatMinutes, pluralize } from "@/lib/format";

const TOP_EXERCISES = 4;

function WorkoutsScreenContent() {
  const data = useData();
  const draft = useDraft();
  const today = useToday();
  const router = useRouter();
  const { startWorkout, cancelWorkout } = useActions();

  const week = useMemo(() => workoutSummary(data, today), [data, today]);
  const recent = useMemo(() => sortSessionsDesc(data.sessions).slice(0, 3), [data.sessions]);
  const exerciseById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises]);
  const trained = useMemo(
    () =>
      data.exercises
        .map((exercise) => ({
          exercise,
          count: exerciseHistory(data.sessions, exercise.id).length,
          record: personalRecord(data.sessions, exercise.id),
        }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count),
    [data.exercises, data.sessions],
  );

  const [goalOpen, setGoalOpen] = useState(false);
  const [replacePlan, setReplacePlan] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [allExercises, setAllExercises] = useState(false);
  const [planSheet, setPlanSheet] = useState<{ open: boolean; plan: WorkoutPlan | null }>({ open: false, plan: null });
  const plans = useMemo(() => activeOnly(data.plans), [data.plans]);

  function begin(planId: string) {
    if (draft && draft.planId !== planId) {
      setReplacePlan(planId);
      return;
    }
    if (!draft) startWorkout(planId);
    router.push("/treino/sessao");
  }

  return (
    <div data-module="workout" className="space-y-6 px-4">
      <h1 className="pt-1 text-[1.75rem] leading-tight font-bold tracking-tight">Treino</h1>

      {/* Destaque da semana */}
      <Surface className="p-5">
        <button type="button" className="w-full text-left" onClick={() => setGoalOpen(true)}>
          <p className="text-sm font-medium text-muted-foreground">Esta semana</p>
          <p className="mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums">
            {week.done}
            {week.target ? (
              <span className="text-xl font-semibold text-muted-foreground"> de {week.target}</span>
            ) : null}
            <span className="ml-2 text-base font-medium text-muted-foreground">
              {pluralize(week.target ?? week.done, "treino", "treinos")}
            </span>
          </p>
          {week.target ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {week.remaining === 0
                ? "Meta da semana batida"
                : `Faltam ${week.remaining} ${pluralize(week.remaining, "treino", "treinos")}`}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Toque para definir uma meta semanal</p>
          )}
        </button>
        <WeekDots dots={week.dots} size="lg" className="mt-4" />
        {week.streak.weeks > 0 ? (
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-medium text-m-ink">
            <Flame className="size-4" aria-hidden />
            {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} na meta
          </p>
        ) : null}
      </Surface>

      {/* Em andamento */}
      {draft ? <InProgressCard onContinue={() => router.push("/treino/sessao")} onDiscard={() => setDiscardOpen(true)} /> : null}

      {/* Fichas */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold">Começar treino</h2>
          {plans.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setPlanSheet({ open: true, plan: null })}>
              <Plus aria-hidden /> Nova ficha
            </Button>
          ) : null}
        </div>
        {plans.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="Nenhuma ficha cadastrada"
            description="Crie uma ficha com seus exercícios para começar a registrar treinos."
            action={
              <Button onClick={() => setPlanSheet({ open: true, plan: null })}>
                <Plus aria-hidden /> Criar ficha
              </Button>
            }
          />
        ) : (
          <Surface className="divide-y divide-border/60 overflow-hidden">
            {plans.map((plan) => {
              const since = daysSinceLastPlan(data.sessions, plan.id, today);
              const isDraft = draft?.planId === plan.id;
              const main = plan.exercises
                .slice(0, 2)
                .map((e) => exerciseById.get(e.exerciseId)?.muscleGroup)
                .filter((v, i, arr) => v && arr.indexOf(v) === i)
                .join(" · ");
              return (
                <div key={plan.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{plan.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {main || `${plan.exercises.length} exercícios`} ·{" "}
                      {since === null
                        ? "nunca feito"
                        : since === 0
                          ? "feito hoje"
                          : `há ${since} ${pluralize(since, "dia", "dias")}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${plan.name}`}
                    onClick={() => setPlanSheet({ open: true, plan })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    aria-label={`${isDraft ? "Continuar" : "Iniciar"} ${plan.name}`}
                    onClick={() => begin(plan.id)}
                  >
                    <Play aria-hidden />
                  </Button>
                </div>
              );
            })}
          </Surface>
        )}
      </section>

      {/* Histórico */}
      {recent.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold">Últimos treinos</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/treino/historico">
                Ver tudo <ChevronRight aria-hidden />
              </Link>
            </Button>
          </div>
          <Surface className="divide-y divide-border/60 overflow-hidden">
            {recent.map((s) => (
              <Link
                key={s.id}
                href="/treino/historico"
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition active:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.nameSnapshot}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDayRelative(s.occurredOn, today)} · {sessionSetCount(s)} séries ·{" "}
                    {formatMinutes(Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)))}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
              </Link>
            ))}
          </Surface>
        </section>
      ) : null}

      {/* Evolução */}
      {trained.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-base font-semibold">Evolução por exercício</h2>
          <Surface className="divide-y divide-border/60 overflow-hidden">
            {(allExercises ? trained : trained.slice(0, TOP_EXERCISES)).map(({ exercise, record }) => (
              <Link
                key={exercise.id}
                href={`/treino/exercicio/${exercise.id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition active:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{exercise.name}</p>
                  <p className="text-sm text-muted-foreground">{exercise.muscleGroup}</p>
                </div>
                {record ? (
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {record.weightKg} kg × {record.reps}
                  </p>
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
              </Link>
            ))}
          </Surface>
          {trained.length > TOP_EXERCISES ? (
            <Button variant="ghost" className="w-full" onClick={() => setAllExercises((v) => !v)}>
              {allExercises ? "Mostrar menos" : `Ver todos (${trained.length})`}
            </Button>
          ) : null}
        </section>
      ) : null}

      <PlanSheet open={planSheet.open} plan={planSheet.plan} onOpenChange={(open) => setPlanSheet((s) => ({ ...s, open }))} />

      <GoalSheet
        open={goalOpen}
        onOpenChange={setGoalOpen}
        target={{ kind: "workout_sessions", scopeId: null, title: "Meta semanal de treino", current: week.target }}
      />
      <ConfirmDialog
        open={replacePlan !== null}
        onOpenChange={(o) => !o && setReplacePlan(null)}
        title="Já existe um treino em andamento"
        description="Iniciar outra ficha descarta o progresso do treino atual."
        confirmLabel="Descartar e iniciar"
        cancelLabel="Voltar"
        destructive
        onConfirm={() => {
          if (replacePlan) {
            startWorkout(replacePlan);
            router.push("/treino/sessao");
          }
          setReplacePlan(null);
        }}
      />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Descartar o treino em andamento?"
        description="O progresso desta sessão será perdido e não conta na meta."
        confirmLabel="Descartar treino"
        destructive
        onConfirm={() => {
          cancelWorkout();
          toast.info("Treino descartado");
        }}
      />
    </div>
  );
}

function InProgressCard({ onContinue, onDiscard }: { onContinue: () => void; onDiscard: () => void }) {
  const draft = useDraft();
  const now = useNow(30_000);
  if (!draft) return null;
  const { done, total } = draftProgress(draft);
  const minutes = Math.max(0, Math.floor((now - draft.startedAt) / 60_000));
  return (
    <Surface className="space-y-3 border-0 bg-m-soft p-4 ring-m/30">
      <div>
        <p className="text-sm font-medium text-m-ink">Treino em andamento</p>
        <p className="text-lg font-semibold">{draft.nameSnapshot}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {done} de {total} séries · há {formatMinutes(minutes)}
        </p>
      </div>
      <ProgressBar ratio={total > 0 ? done / total : 0} label="Séries concluídas" className="h-1.5" />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" onClick={onContinue}>
          Continuar
        </Button>
        <Button size="lg" variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </Surface>
  );
}

export const WorkoutsScreen = withStoreGate(WorkoutsScreenContent);
