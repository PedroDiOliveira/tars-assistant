"use client";

import { useMemo, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Dumbbell, Flame, Pencil, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalSheet } from "@/components/goals/goal-sheet";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SectionTitle } from "@/components/shared/section-title";
import { Surface } from "@/components/shared/surface";
import { WeekDots } from "@/components/shared/week-dots";
import { progressPercent } from "@/domain/progress";
import { workoutSummary } from "@/domain/summary";
import {
  daysSinceLastPlan,
  draftProgress,
  exerciseHistory,
  personalRecord,
  sessionSetCount,
  sessionVolume,
  sortSessionsDesc,
} from "@/domain/workouts";
import { useActions, useData, useDraft, useNow, useToday } from "@/data";
import { formatDayRelative, formatMinutes, pluralize } from "@/lib/format";
import { formatVolume } from "./format-sets";

function WorkoutsScreenContent() {
  const data = useData();
  const draft = useDraft();
  const today = useToday();
  const router = useRouter();
  const { startWorkout, cancelWorkout } = useActions();

  const week = useMemo(() => workoutSummary(data, today), [data, today]);
  const recent = useMemo(() => sortSessionsDesc(data.sessions).slice(0, 4), [data.sessions]);
  const exerciseById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises]);
  const trained = useMemo(() => {
    return data.exercises
      .map((exercise) => ({
        exercise,
        count: exerciseHistory(data.sessions, exercise.id).length,
        record: personalRecord(data.sessions, exercise.id),
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [data.exercises, data.sessions]);

  const [goalOpen, setGoalOpen] = useState(false);
  const [replacePlan, setReplacePlan] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const percent = progressPercent(week.done, week.target);

  function begin(planId: string) {
    if (draft && draft.planId !== planId) {
      setReplacePlan(planId);
      return;
    }
    if (!draft) startWorkout(planId);
    router.push("/treino/sessao");
  }

  return (
    <div data-module="workout" className="space-y-6 px-0 pb-6">
      <PageTitle title="Treino" />

      <div className="space-y-6 px-4">
        {/* Semana */}
        <Surface className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Treino · esta semana</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums">
                {week.target ? (
                  <>
                    {week.done} de {week.target}{" "}
                    <span className="text-base font-medium text-muted-foreground">
                      {pluralize(week.target, "treino", "treinos")}
                    </span>
                  </>
                ) : (
                  <>
                    {week.done}{" "}
                    <span className="text-base font-medium text-muted-foreground">
                      {pluralize(week.done, "treino", "treinos")} · sem meta
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {percent !== null ? (
                <span className="rounded-full bg-m-soft px-2 py-0.5 text-xs font-semibold text-m-ink tabular-nums">
                  {percent}%
                </span>
              ) : null}
              <Button variant="ghost" size="icon" aria-label="Editar meta semanal de treino" onClick={() => setGoalOpen(true)}>
                <Pencil aria-hidden />
              </Button>
            </div>
          </div>
          <WeekDots dots={week.dots} size="lg" />
          {week.target ? (
            <>
              <ProgressBar ratio={week.ratio} label="Progresso da meta semanal de treino" />
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {week.remaining === 0 ? (
                  <>
                    <CheckCircle2 className="size-4 text-success-ink" aria-hidden /> Meta da semana batida
                  </>
                ) : (
                  `Faltam ${week.remaining} ${pluralize(week.remaining, "treino", "treinos")} para a meta`
                )}
              </p>
            </>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setGoalOpen(true)}>
              Definir meta semanal
            </Button>
          )}
          {week.streak.weeks > 0 ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-m-ink">
              <Flame className="size-4" aria-hidden />
              {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} batendo a meta
            </p>
          ) : null}
        </Surface>

        {/* Em andamento */}
        {draft ? <InProgressCard onContinue={() => router.push("/treino/sessao")} onDiscard={() => setDiscardOpen(true)} /> : null}

        {/* Fichas */}
        <section className="space-y-3">
          <SectionTitle hint="Escolha uma ficha para começar">Fichas</SectionTitle>
          {data.plans.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="Nenhuma ficha cadastrada"
              description="Crie sua primeira ficha de treino para começar a registrar."
            />
          ) : (
            data.plans.map((plan) => {
              const sets = plan.exercises.reduce((sum, e) => sum + e.plannedSets, 0);
              const since = daysSinceLastPlan(data.sessions, plan.id, today);
              const names = plan.exercises.map((e) => exerciseById.get(e.exerciseId)?.name ?? "Exercício");
              const isDraft = draft?.planId === plan.id;
              return (
                <Surface key={plan.id} className="space-y-3 p-4">
                  <div>
                    <h3 className="text-base font-semibold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {plan.exercises.length} exercícios · {sets} séries ·{" "}
                      {since === null ? "ainda não feito" : since === 0 ? "feito hoje" : `último há ${since} ${pluralize(since, "dia", "dias")}`}
                    </p>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {names.slice(0, 4).join(" · ")}
                    {names.length > 4 ? ` · +${names.length - 4}` : ""}
                  </p>
                  <Button size="lg" className="w-full" onClick={() => begin(plan.id)}>
                    <Play aria-hidden /> {isDraft ? "Continuar treino" : "Iniciar treino"}
                  </Button>
                </Surface>
              );
            })
          )}
        </section>

        {/* Histórico recente */}
        <section className="space-y-3">
          <SectionTitle
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/treino/historico">
                  Ver tudo <ChevronRight aria-hidden />
                </Link>
              </Button>
            }
          >
            Últimos treinos
          </SectionTitle>
          {recent.length === 0 ? (
            <EmptyState icon={Dumbbell} title="Sem treinos concluídos ainda" description="Finalize um treino para ele aparecer aqui." />
          ) : (
            <Surface className="divide-y divide-border/70 overflow-hidden">
              {recent.map((s) => (
                <Link
                  key={s.id}
                  href="/treino/historico"
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.nameSnapshot}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDayRelative(s.occurredOn, today)} · {sessionSetCount(s)} séries ·{" "}
                      {formatMinutes(Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)))}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-muted-foreground tabular-nums">{formatVolume(sessionVolume(s))}</p>
                </Link>
              ))}
            </Surface>
          )}
        </section>

        {/* Evolução por exercício */}
        {trained.length > 0 ? (
          <section className="space-y-3">
            <SectionTitle hint="Recorde de carga e histórico de cada exercício">Evolução por exercício</SectionTitle>
            <Surface className="divide-y divide-border/70 overflow-hidden">
              {trained.map(({ exercise, count, record }) => (
                <Link
                  key={exercise.id}
                  href={`/treino/exercicio/${exercise.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{exercise.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {exercise.muscleGroup} · {count} {pluralize(count, "sessão", "sessões")}
                    </p>
                  </div>
                  {record ? (
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="text-xs text-muted-foreground">Recorde</p>
                      <p className="text-sm font-semibold">
                        {record.weightKg} kg × {record.reps}
                      </p>
                    </div>
                  ) : null}
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
                </Link>
              ))}
            </Surface>
          </section>
        ) : null}
      </div>

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
          {done} de {total} séries · começou há {formatMinutes(minutes)}
        </p>
      </div>
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
