"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Droplet } from "lucide-react";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { useData, useToday } from "@/data";
import { waterTodaySummary } from "@/domain/summary";
import { formatLiters, formatTotal } from "@/domain/water";
import { pluralize } from "@/lib/format";
import { PortionPicker, UndoPill, useWaterTap, WaterAnnouncer, WaterDropButton } from "./water-tap";
import { WaterPortionsSheet } from "./water-portions-sheet";

/**
 * O card de água da Início: o total de hoje, a meta, o contador de um toque e as três porções.
 * O cabeçalho é um link para a tela de água; os botões são IRMÃOS dele (um botão dentro de um link não é válido).
 */
export function WaterCard() {
  const data = useData();
  const today = useToday();
  const summary = useMemo(() => waterTodaySummary(data, today), [data, today]);
  const tap = useWaterTap({ todayMl: summary.ml, targetMl: summary.targetMl });

  const [goalOpen, setGoalOpen] = useState(false);
  const [portionsOpen, setPortionsOpen] = useState(false);
  const goalTarget: GoalTarget = { kind: "water_ml", scopeId: null, title: "Meta de água por dia", current: summary.targetMl };

  const { targetMl } = summary;
  return (
    <section data-module="water" aria-label="Água de hoje">
      <Surface className="space-y-3 p-4">
        <div className="flex items-center gap-1">
          <Link
            href="/agua"
            className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 transition active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
              <Droplet className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">Água · hoje</span>
            {tap.last || !targetMl ? null : (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{summary.daysMet} de 7 dias na meta</span>
            )}
            {tap.last ? null : <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />}
          </Link>
          {tap.last ? <UndoPill last={tap.last} onUndo={() => void tap.undo()} /> : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
              <span className="text-[2.25rem] leading-none font-bold tracking-tight">{formatTotal(summary.ml)}</span>
              {targetMl ? <span className="text-sm text-muted-foreground">de {formatLiters(targetMl)}</span> : null}
            </p>
            {targetMl ? (
              <>
                <ProgressBar className="mt-3" ratio={summary.ratio} label="Progresso da meta diária de água" />
                <p className="mt-2 text-sm font-medium">
                  {summary.met
                    ? `Meta batida${summary.overMl > 0 ? ` · ${formatLiters(summary.overMl)} acima` : ""}`
                    : `Faltam ${formatLiters(summary.remainingMl)}`}
                </p>
                {summary.streak.days >= 2 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {summary.streak.days} {pluralize(summary.streak.days, "dia", "dias")} seguidos na meta
                  </p>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setGoalOpen(true)}
                className="mt-1 min-h-11 text-left text-sm text-muted-foreground underline underline-offset-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Toque para definir uma meta de água
              </button>
            )}
          </div>
          <WaterDropButton ml={tap.ml} pulse={tap.pulse} onTap={() => void tap.tap()} />
        </div>

        <PortionPicker portions={tap.portions} selected={tap.selected} onSelect={tap.select} onEdit={() => setPortionsOpen(true)} />
        <WaterAnnouncer text={tap.announcement} />
      </Surface>

      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
      <WaterPortionsSheet open={portionsOpen} onOpenChange={setPortionsOpen} />
    </section>
  );
}
