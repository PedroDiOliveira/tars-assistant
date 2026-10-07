"use client";

import { useMemo, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import { CheckCircle2, Flame, GraduationCap, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { HueBubble, HueDot } from "@/components/shared/hue-bubble";
import { MiniBars } from "@/components/shared/mini-bars";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SectionTitle } from "@/components/shared/section-title";
import { Segmented } from "@/components/shared/segmented";
import { Surface } from "@/components/shared/surface";
import { progressPercent } from "@/domain/progress";
import { secondsBySubject, sortStudySessionsDesc } from "@/domain/studies";
import { studyWeekSummary } from "@/domain/summary";
import type { StudySession } from "@/domain/types";
import { useData, useToday } from "@/data";
import { monthOf, monthPeriod, weekPeriod } from "@/lib/dates";
import {
  formatDayMonth,
  formatDayRelative,
  formatDurationSeconds,
  formatMinutes,
  formatMinutesCompact,
  formatMonthName,
  pluralize,
} from "@/lib/format";
import { WEEK_LABELS } from "@/lib/constants";
import { ManualSessionSheet } from "./manual-session-sheet";
import { TimerCard } from "./timer-card";

type Period = "week" | "month";

function StudyScreenContent() {
  const data = useData();
  const today = useToday();
  const week = useMemo(() => studyWeekSummary(data, today), [data, today]);

  const [period, setPeriod] = useState<Period>("week");
  const [visible, setVisible] = useState(10);
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState<GoalTarget | null>(null);

  const monthRows = useMemo(() => {
    const seconds = secondsBySubject(
      data.studySessions,
      monthPeriod(monthOf(today)),
      data.subjects.map((s) => s.id),
    );
    const total = [...seconds.values()].reduce((a, b) => a + b, 0);
    return {
      total,
      rows: data.subjects
        .map((subject) => ({ subject, seconds: seconds.get(subject.id) ?? 0 }))
        .sort((a, b) => b.seconds - a.seconds),
    };
  }, [data.studySessions, data.subjects, today]);

  const sessions = useMemo(() => sortStudySessionsDesc(data.studySessions), [data.studySessions]);
  const subjectById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects]);

  const weekMinutes = week.seconds / 60;
  const percent = progressPercent(weekMinutes, week.targetMinutes);
  const remainingMinutes = week.targetMinutes ? Math.max(0, week.targetMinutes - weekMinutes) : 0;
  const wk = weekPeriod(today);

  function openGoal(target: GoalTarget) {
    setGoalTarget(target);
    setGoalOpen(true);
  }

  function openManual(session: StudySession | null) {
    setEditing(session);
    setManualOpen(true);
  }

  return (
    <div data-module="study" className="space-y-6 px-4 pb-6">
      <TimerCard />

      {/* Esta semana */}
      <Surface className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Estudo · esta semana</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">
              {formatMinutes(weekMinutes)}
              {week.targetMinutes ? (
                <span className="text-base font-medium text-muted-foreground"> de {formatMinutes(week.targetMinutes)}</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {percent !== null ? (
              <span className="rounded-full bg-m-soft px-2 py-0.5 text-xs font-semibold text-m-ink tabular-nums">
                {percent}%
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Editar meta semanal de estudo"
              onClick={() =>
                openGoal({
                  kind: "study_minutes",
                  scopeId: null,
                  title: "Meta semanal de estudo",
                  current: week.targetMinutes,
                })
              }
            >
              <Pencil aria-hidden />
            </Button>
          </div>
        </div>

        {week.targetMinutes ? (
          <>
            <ProgressBar ratio={week.ratio} label="Progresso da meta semanal de estudo" />
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {remainingMinutes === 0 ? (
                <>
                  <CheckCircle2 className="size-4 text-success-ink" aria-hidden /> Meta da semana batida
                </>
              ) : (
                `Faltam ${formatMinutes(remainingMinutes)} para a meta`
              )}
            </p>
          </>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              openGoal({ kind: "study_minutes", scopeId: null, title: "Meta semanal de estudo", current: null })
            }
          >
            Definir meta semanal
          </Button>
        )}

        <MiniBars
          className="pt-1"
          summary={`Minutos estudados por dia nesta semana: ${week.byDay
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
          <p className="flex items-center gap-1.5 text-sm font-medium text-m-ink">
            <Flame className="size-4" aria-hidden />
            {week.streak.weeks} {pluralize(week.streak.weeks, "semana seguida", "semanas seguidas")} batendo a meta
          </p>
        ) : null}
      </Surface>

      {/* Por matéria */}
      <section className="space-y-3">
        <SectionTitle
          hint={
            period === "week"
              ? `Semana de ${formatDayMonth(wk.start)} a ${formatDayMonth(wk.end)} · toque para definir a meta`
              : `${formatMonthName(monthOf(today))} · total de ${formatMinutes(monthRows.total / 60)}`
          }
        >
          Por matéria
        </SectionTitle>
        <Segmented<Period>
          ariaLabel="Período por matéria"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Semana" },
            { value: "month", label: "Mês" },
          ]}
        />
        <Surface className="divide-y divide-border/70 overflow-hidden">
          {period === "week"
            ? week.bySubject.map(({ subject, seconds, targetMinutes, ratio }) => (
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
                    <span className="flex items-center gap-2 font-medium">
                      <HueDot hue={subject.hue} /> {subject.name}
                    </span>
                    <span className="text-sm tabular-nums">
                      <span className="font-semibold">{formatMinutes(seconds / 60)}</span>
                      <span className="text-muted-foreground">
                        {targetMinutes ? ` de ${formatMinutes(targetMinutes)}` : " · sem meta"}
                      </span>
                    </span>
                  </div>
                  {targetMinutes ? (
                    <ProgressBar className="mt-2" ratio={ratio} label={`${subject.name}: progresso da meta semanal`} />
                  ) : null}
                </button>
              ))
            : monthRows.rows.map(({ subject, seconds }) => (
                <div key={subject.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <HueDot hue={subject.hue} /> {subject.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatMinutes(seconds / 60)}</span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    ratio={monthRows.total > 0 ? seconds / monthRows.total : 0}
                    label={`${subject.name}: participação no tempo estudado no mês`}
                  />
                </div>
              ))}
        </Surface>
      </section>

      {/* Sessões recentes */}
      <section className="space-y-3">
        <SectionTitle
          action={
            <Button variant="secondary" size="sm" onClick={() => openManual(null)}>
              <Plus aria-hidden /> Manual
            </Button>
          }
        >
          Sessões recentes
        </SectionTitle>
        {sessions.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Nenhuma sessão de estudo ainda"
            description="Use o cronômetro ou registre um estudo manualmente."
            action={
              <Button onClick={() => openManual(null)}>
                <Plus aria-hidden /> Registrar estudo
              </Button>
            }
          />
        ) : (
          <>
            <Surface className="p-1">
              {sessions.slice(0, visible).map((s) => {
                const subject = subjectById.get(s.subjectId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openManual(s)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition active:bg-muted/70"
                  >
                    <HueBubble hue={subject?.hue ?? 240} icon={GraduationCap} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{subject?.name ?? "Matéria removida"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDayRelative(s.occurredOn, today)} · {s.source === "timer" ? "cronômetro" : "manual"}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatDurationSeconds(s.durationSeconds)}</p>
                  </button>
                );
              })}
            </Surface>
            {visible < sessions.length ? (
              <Button variant="ghost" className="w-full" onClick={() => setVisible((v) => v + 15)}>
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
