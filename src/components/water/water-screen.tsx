"use client";

import { useMemo, useState } from "react";
import { Droplet, Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { withStoreGate } from "@/components/layout/store-gate";
import { SubHeader } from "@/components/layout/sub-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MiniBars } from "@/components/shared/mini-bars";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { waterBestStreak, waterTodaySummary, waterWeekStats } from "@/domain/summary";
import { dayRhythm, formatLiters, formatTotal, waterDayTotals, waterIntakesOn } from "@/domain/water";
import { useData, useToday } from "@/data";
import { WEEK_LABELS } from "@/lib/constants";
import type { DateKey } from "@/lib/dates";
import { pluralize } from "@/lib/format";
import { PortionPicker, UndoChip, useWaterTap, WaterAnnouncer, WaterDropButton } from "./water-tap";
import { WaterDaySheet } from "./water-day-sheet";
import { WaterEntrySheet } from "./water-entry-sheet";
import { WaterIntakeList } from "./water-intake-list";
import { WaterMonth } from "./water-month";
import { WaterPortionsSheet } from "./water-portions-sheet";
import { useWaterRemoval } from "./water-remove";
import { WaterRhythm } from "./water-rhythm";
import { WaterTank } from "./water-tank";

function WaterScreenContent() {
  const data = useData();
  const today = useToday();
  const { remove } = useWaterRemoval();

  const summary = useMemo(() => waterTodaySummary(data, today), [data, today]);
  const stats = useMemo(() => waterWeekStats(summary.week), [summary.week]);
  // Do mais novo para o mais antigo: o que acabou de tocar fica no alto da lista.
  const intakes = useMemo(() => waterIntakesOn(data.waterIntakes, today).reverse(), [data.waterIntakes, today]);
  const bestStreak = useMemo(() => waterBestStreak(data, today), [data, today]);
  const rhythm = useMemo(() => dayRhythm(data.waterIntakes, today), [data.waterIntakes, today]);
  const earliestDay = useMemo<DateKey | null>(() => {
    let earliest: DateKey | null = null;
    for (const day of waterDayTotals(data.waterIntakes).keys()) if (earliest === null || day < earliest) earliest = day;
    return earliest;
  }, [data.waterIntakes]);
  const tap = useWaterTap({ todayMl: summary.ml, targetMl: summary.targetMl });

  const [goalOpen, setGoalOpen] = useState(false);
  const [portionsOpen, setPortionsOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [openDay, setOpenDay] = useState<DateKey | null>(null);
  const { targetMl } = summary;
  const goalTarget: GoalTarget = { kind: "water_ml", scopeId: null, title: "Meta de água por dia", current: targetMl };

  const percent = Math.round(summary.ratio * 100);

  return (
    <div data-module="water" className="pb-8">
      <SubHeader title="Água" backHref="/inicio" backLabel="Voltar para Início" />
      <div className="space-y-6 px-4 pt-2">
        {/* Hoje */}
        <Surface className="p-5">
          <div className="flex items-center gap-4">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setGoalOpen(true)}>
              <p className="text-sm font-medium text-muted-foreground">Hoje</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span className="text-[2.5rem] leading-none font-bold tracking-tight">{formatTotal(summary.ml)}</span>
                {targetMl ? <span className="text-base font-medium text-muted-foreground">de {formatLiters(targetMl)}</span> : null}
              </p>
              {targetMl ? <ProgressBar className="mt-3 h-1.5" ratio={summary.ratio} label="Progresso da meta diária de água" /> : null}
              <p className="mt-2 text-sm text-muted-foreground">
                {targetMl
                  ? summary.met
                    ? `Meta batida${summary.overMl > 0 ? ` · ${formatLiters(summary.overMl)} acima` : ""}`
                    : `Faltam ${formatLiters(summary.remainingMl)}`
                  : "Toque para definir uma meta diária de água"}
              </p>
            </button>
            {targetMl ? (
              <WaterTank
                ratio={summary.ratio}
                label={`Copo com ${percent}% da meta de hoje`}
                className="h-28 w-[4.2rem] shrink-0 text-m"
              />
            ) : null}
          </div>

          {summary.streak.days >= 2 || bestStreak >= 2 ? (
            <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm font-medium text-m-ink">
              <Flame className="size-4" aria-hidden />
              {summary.streak.days >= 2
                ? `${summary.streak.days} ${pluralize(summary.streak.days, "dia seguido", "dias seguidos")} na meta`
                : "Sem sequência em andamento"}
              {bestStreak > summary.streak.days ? <span className="font-normal text-muted-foreground">· melhor: {bestStreak} {pluralize(bestStreak, "dia", "dias")}</span> : null}
            </p>
          ) : null}
        </Surface>

        {/* Contador */}
        <Surface className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Cada toque soma</p>
              <p className="text-2xl font-bold tabular-nums">{formatLiters(tap.ml)}</p>
            </div>
            <WaterDropButton ml={tap.ml} pulse={tap.pulse} onTap={() => void tap.tap()} />
          </div>
          <PortionPicker portions={tap.portions} selected={tap.selected} onSelect={tap.select} onEdit={() => setPortionsOpen(true)} />
          <UndoChip last={tap.last} onUndo={() => void tap.undo()} />
          <WaterAnnouncer text={tap.announcement} />
        </Surface>

        {/* Registros de hoje */}
        <section className="space-y-2" aria-labelledby="water-log-title">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 id="water-log-title" className="text-base font-semibold">
              Registros de hoje
            </h2>
            <Button variant="ghost" size="sm" className="h-11 gap-1.5 px-3" onClick={() => setEntryOpen(true)}>
              <Plus aria-hidden />
              Outra quantidade
            </Button>
          </div>
          {intakes.length === 0 ? (
            <EmptyState
              icon={Droplet}
              title="Nenhum registro hoje"
              description="Toque na gota para registrar o primeiro gole."
            />
          ) : (
            <WaterIntakeList intakes={intakes} onRemove={(intake) => void remove(intake, { toast: true })} />
          )}
        </section>

        {/* Semana */}
        <section className="space-y-2" aria-labelledby="water-week-title">
          <h2 id="water-week-title" className="px-1 text-base font-semibold">
            Semana
          </h2>
          <Surface className="p-5">
            <MiniBars
              summary={`Água por dia nesta semana: ${summary.week
                .map((d, i) => `${WEEK_LABELS[i]} ${formatLiters(d.ml)}`)
                .join(", ")}${targetMl ? `. Meta de ${formatLiters(targetMl)} por dia` : ""}`}
              goalLine={targetMl ?? undefined}
              items={summary.week.map((d, i) => ({
                label: WEEK_LABELS[i],
                value: d.ml,
                display: formatLiters(d.ml),
                highlight: d.isToday,
                future: d.isFuture,
                under: targetMl !== null && !d.met,
              }))}
            />
            {targetMl ? (
              <p className="mt-2 text-xs text-muted-foreground">Linha tracejada: meta de {formatLiters(targetMl)} por dia</p>
            ) : null}

            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="Dias na meta" value={targetMl ? `${summary.daysMet} de 7` : "—"} note={targetMl ? undefined : "sem meta"} />
              <Stat label="Média por dia" value={stats.averageMl !== null ? formatLiters(stats.averageMl) : "—"} note={stats.daysWithRecord > 0 ? `${stats.daysWithRecord} ${pluralize(stats.daysWithRecord, "dia", "dias")}` : undefined} />
              <Stat
                label="Melhor dia"
                value={stats.best ? formatLiters(stats.best.ml) : "—"}
                note={stats.best ? WEEK_LABELS[summary.week.findIndex((d) => d.date === stats.best?.date)] : undefined}
              />
            </dl>
          </Surface>
        </section>

        <WaterMonth data={data} today={today} earliestDay={earliestDay} onOpenDay={setOpenDay} />

        <WaterRhythm rhythm={rhythm} />
      </div>

      <WaterDaySheet day={openDay} today={today} onClose={() => setOpenDay(null)} />
      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
      <WaterPortionsSheet open={portionsOpen} onOpenChange={setPortionsOpen} />
      <WaterEntrySheet open={entryOpen} onOpenChange={setEntryOpen} />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg leading-tight font-semibold tabular-nums">{value}</dd>
      <dd className="min-h-4 text-xs text-muted-foreground">{note ?? ""}</dd>
    </div>
  );
}

export const WaterScreen = withStoreGate(WaterScreenContent);
