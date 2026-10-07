"use client";

import { useMemo, useState } from "react";
import { Flame, GraduationCap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { HueDot } from "@/components/shared/hue-bubble";
import { MiniBars } from "@/components/shared/mini-bars";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { sortStudySessionsDesc } from "@/domain/studies";
import { studyWeekSummary } from "@/domain/summary";
import type { StudySession } from "@/domain/types";
import { useData, useToday } from "@/data";
import { WEEK_LABELS } from "@/lib/constants";
import {
  formatDayRelative,
  formatDurationSeconds,
  formatMinutes,
  formatMinutesCompact,
  pluralize,
} from "@/lib/format";
import { ManualSessionSheet } from "./manual-session-sheet";
import { TimerCard } from "./timer-card";

const SESSIONS_STEP = 5;

function StudyScreenContent() {
  const data = useData();
  const today = useToday();
  const week = useMemo(() => studyWeekSummary(data, today), [data, today]);
  const sessions = useMemo(() => sortStudySessionsDesc(data.studySessions), [data.studySessions]);
  const subjectById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects]);

  const [visible, setVisible] = useState(SESSIONS_STEP);
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState<GoalTarget | null>(null);

  const weekMinutes = week.seconds / 60;
  const remaining = week.targetMinutes ? Math.max(0, week.targetMinutes - weekMinutes) : 0;

  function openGoal(target: GoalTarget) {
    setGoalTarget(target);
    setGoalOpen(true);
  }

  function openManual(session: StudySession | null) {
    setEditing(session);
    setManualOpen(true);
  }

  return (
    <div data-module="study" className="space-y-6 px-4">
      <TimerCard />

      {/* Semana */}
      <Surface className="p-5">
        <button
          type="button"
          className="w-full text-left"
          onClick={() =>
            openGoal({
              kind: "study_minutes",
              scopeId: null,
              title: "Meta semanal de estudo",
              current: week.targetMinutes,
            })
          }
        >
          <p className="text-sm font-medium text-muted-foreground">Esta semana</p>
          <p className="mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums">
            {formatMinutes(weekMinutes)}
            {week.targetMinutes ? (
              <span className="text-xl font-semibold text-muted-foreground"> de {formatMinutes(week.targetMinutes)}</span>
            ) : null}
          </p>
          {week.targetMinutes ? (
            <ProgressBar
              className="mt-3 h-1.5"
              ratio={week.ratio}
              label="Progresso da meta semanal de estudo"
            />
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            {week.targetMinutes
              ? remaining === 0
                ? "Meta da semana batida"
                : `Faltam ${formatMinutes(remaining)}`
              : "Toque para definir uma meta semanal"}
          </p>
        </button>

        <MiniBars
          className="mt-4"
          summary={`Minutos por dia nesta semana: ${week.byDay
            .map((d, i) => `${WEEK_LABELS[i]} ${formatMinutes(d.seconds / 60)}`)
            .join(", ")}`}
          items={week.byDay.map((d, i) => ({
            label: WEEK_LABELS[i],
            value: d.seconds,
            display: formatMinutesCompact(d.seconds / 60),
            highlight: d.date === today,
            future: d.date > today,
          }))}
        />

        {week.streak.weeks > 0 ? (
          <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-medium text-m-ink">
            <Flame className="size-4" aria-hidden />
            {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} na meta
          </p>
        ) : null}
      </Surface>

      {/* Matérias */}
      <section className="space-y-2">
        <h2 className="px-1 text-base font-semibold">Por matéria</h2>
        <Surface className="divide-y divide-border/60 overflow-hidden">
          {week.bySubject.map(({ subject, seconds, targetMinutes, ratio }) => (
            <button
              key={subject.id}
              type="button"
              onClick={() =>
                openGoal({
                  kind: "study_minutes",
                  scopeId: subject.id,
                  title: `Meta semanal · ${subject.name}`,
                  current: targetMinutes,
                })
              }
              className="block w-full px-4 py-3 text-left transition active:bg-muted/60"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <HueDot hue={subject.hue} />
                  <span className="truncate">{subject.name}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  <span className="font-semibold">{formatMinutes(seconds / 60)}</span>
                  {targetMinutes ? (
                    <span className="text-muted-foreground"> de {formatMinutes(targetMinutes)}</span>
                  ) : null}
                </span>
              </div>
              {targetMinutes ? (
                <ProgressBar className="mt-2 h-1.5" ratio={ratio} label={`${subject.name}: meta semanal`} />
              ) : null}
            </button>
          ))}
        </Surface>
      </section>

      {/* Sessões */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold">Sessões recentes</h2>
          <Button variant="ghost" size="sm" onClick={() => openManual(null)}>
            <Plus aria-hidden /> Manual
          </Button>
        </div>
        {sessions.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Nenhuma sessão ainda"
            description="Use o cronômetro ou registre manualmente."
            action={
              <Button onClick={() => openManual(null)}>
                <Plus aria-hidden /> Registrar estudo
              </Button>
            }
          />
        ) : (
          <>
            <Surface className="divide-y divide-border/60 overflow-hidden">
              {sessions.slice(0, visible).map((s) => {
                const subject = subjectById.get(s.subjectId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openManual(s)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60"
                  >
                    <HueDot hue={subject?.hue ?? 150} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{subject?.name ?? "Matéria removida"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDayRelative(s.occurredOn, today)}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatDurationSeconds(s.durationSeconds)}</p>
                  </button>
                );
              })}
            </Surface>
            {visible < sessions.length ? (
              <Button variant="ghost" className="w-full" onClick={() => setVisible((v) => v + 10)}>
                Mostrar mais
              </Button>
            ) : null}
          </>
        )}
      </section>

      <ManualSessionSheet open={manualOpen} onOpenChange={setManualOpen} session={editing} />
      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
    </div>
  );
}

export const StudyScreen = withStoreGate(StudyScreenContent);
