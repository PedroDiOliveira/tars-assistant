"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Dumbbell, Flame, Footprints, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { GoalSheet } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { WeekDots } from "@/components/shared/week-dots";
import { runningWeekText } from "@/domain/running-text";
import { sortRunsDesc } from "@/domain/running";
import { runningWeekSummary } from "@/domain/summary";
import type { RunningSession } from "@/domain/types";
import { useData, useDraft, useToday } from "@/data";
import { pluralize } from "@/lib/format";
import { RunRow } from "./run-row";
import { RunningSessionSheet } from "./run-sheet";

const RECENT_RUNS = 5;

function RunningScreenContent() {
  const data = useData();
  const draft = useDraft();
  const today = useToday();

  const week = useMemo(() => runningWeekSummary(data, today), [data, today]);
  const text = useMemo(() => runningWeekText(week), [week]);
  const sorted = useMemo(() => sortRunsDesc(data.runningSessions), [data.runningSessions]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RunningSession | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  function openSheet(run: RunningSession | null) {
    setEditing(run);
    setSheetOpen(true);
  }

  return (
    <div data-module="running" className="space-y-6 px-4">
      {/* O cadastro fica no topo: registrar uma corrida nunca depende de rolar a tela, de meta ou de ficha. */}
      <Button size="lg" className="w-full" onClick={() => openSheet(null)}>
        <Plus aria-hidden /> Registrar corrida
      </Button>

      {/* Quem trocou de aba no meio de um treino de musculação continua vendo (e alcançando) o treino. */}
      {draft ? (
        <Link
          href="/treino/sessao"
          data-module="workout"
          className="flex min-h-12 items-center gap-2 rounded-2xl bg-m-soft px-4 text-sm font-medium text-m-ink"
        >
          <Dumbbell className="size-4" aria-hidden />
          Treino de musculação em andamento: {draft.nameSnapshot}
          <ChevronRight className="ml-auto size-4" aria-hidden />
        </Link>
      ) : null}

      {/* Semana */}
      <Surface className="p-5">
        <button type="button" className="w-full text-left" onClick={() => setGoalOpen(true)}>
          <p className="text-sm font-medium text-muted-foreground">Esta semana</p>
          <p className="mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums">
            {text.value}{" "}
            <span className="text-base font-medium text-muted-foreground">{text.unit}</span>
          </p>
          {text.showProgress ? (
            <ProgressBar className="mt-3 h-1.5" ratio={week.ratio} label="Progresso da meta semanal de distância" />
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {text.goalLine ?? "Toque para definir uma meta semanal de distância"}
          </p>
        </button>

        <p className="mt-3 text-sm font-medium tabular-nums">{text.countsLine}</p>
        {text.missingLine ? <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{text.missingLine}</p> : null}

        <WeekDots dots={week.dots} activity="corrida" size="lg" className="mt-4" />

        {week.streak.weeks > 0 ? (
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-medium text-m-ink">
            <Flame className="size-4" aria-hidden />
            {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} na meta de distância
          </p>
        ) : null}
      </Surface>

      {/* Últimas corridas */}
      <section className="space-y-2" aria-labelledby="last-runs-title">
        <h2 id="last-runs-title" className="px-1 text-base font-semibold">
          Últimas corridas
        </h2>
        {sorted.length === 0 ? (
          <EmptyState
            icon={Footprints}
            title="Nenhuma corrida registrada"
            description="Registre a primeira: só a data é necessária, a distância pode ficar para depois."
          />
        ) : (
          <>
            <Surface className="divide-y divide-border/60 overflow-hidden">
              {sorted.slice(0, RECENT_RUNS).map((run) => (
                <RunRow key={run.id} run={run} today={today} onOpen={openSheet} />
              ))}
            </Surface>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/treino/corrida/historico">
                Ver histórico <ChevronRight aria-hidden />
              </Link>
            </Button>
          </>
        )}
      </section>

      <RunningSessionSheet open={sheetOpen} onOpenChange={setSheetOpen} session={editing} />
      <GoalSheet
        open={goalOpen}
        onOpenChange={setGoalOpen}
        target={{ kind: "running_meters", scopeId: null, title: "Meta semanal de corrida", current: week.targetMeters }}
      />
    </div>
  );
}

export const RunningScreen = withStoreGate(RunningScreenContent);
