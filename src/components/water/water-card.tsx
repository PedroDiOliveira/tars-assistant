"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Droplet } from "lucide-react";
import { cn } from "cn";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { useData, useToday } from "@/data";
import { waterTodaySummary } from "@/domain/summary";
import { formatLiters, formatTotal } from "@/domain/water";
import { pluralize } from "@/lib/format";
import { PortionPicker, UndoPill, useWaterTap, WaterAddButton, WaterAnnouncer } from "./water-tap";
import { WaterPortionsSheet } from "./water-portions-sheet";

/**
 * O card de água da Início. Nasce RECOLHIDO, numa faixa só (o total, a meta e a barra): a água é o hábito mais
 * frequente, mas não precisa de metade da tela o tempo todo. Um toque na faixa abre o card inteiro: o total, a meta,
 * o botão "+" e as três porções. O cabeçalho do card aberto é um link para a tela de água; os botões são IRMÃOS dele
 * (um botão dentro de um link não é válido).
 *
 * O estado aberto/recolhido não é guardado: ao voltar para a Início a faixa está de novo recolhida.
 */
export function WaterCard() {
  const data = useData();
  const today = useToday();
  const summary = useMemo(() => waterTodaySummary(data, today), [data, today]);
  const tap = useWaterTap({ todayMl: summary.ml, targetMl: summary.targetMl });

  const [open, setOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [portionsOpen, setPortionsOpen] = useState(false);
  const goalTarget: GoalTarget = { kind: "water_ml", scopeId: null, title: "Meta de água por dia", current: summary.targetMl };

  // O botão que recebeu o toque sai da tela quando o card troca de forma: o foco vai para o que o substitui, e o
  // teclado e o leitor de tela não ficam perdidos. Só depois de um toque (nunca na montagem).
  const stripRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"strip" | "collapse" | null>(null);
  useEffect(() => {
    const target = focusNext.current === "collapse" ? collapseRef : focusNext.current === "strip" ? stripRef : null;
    focusNext.current = null;
    target?.current?.focus();
  }, [open]);
  function toggle(next: boolean) {
    focusNext.current = next ? "collapse" : "strip";
    setOpen(next);
  }

  const { targetMl } = summary;
  return (
    <section data-module="water" aria-label="Água de hoje">
      {open ? (
        <Surface className="animate-in space-y-3 p-4 duration-200 fade-in-0 motion-reduce:animate-none">
          <div className="flex items-center gap-1">
            <Link
              href="/agua"
              className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 transition active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
                <Droplet className="size-5" aria-hidden />
              </span>
              {/* Com o "Desfazer" no cabeçalho não sobra espaço para o texto: fica só para o leitor de tela. */}
              <span className={cn("min-w-0 truncate text-sm font-medium text-muted-foreground", tap.last && "sr-only")}>
                Água · hoje
              </span>
              {tap.last ? null : <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />}
            </Link>
            {tap.last ? <UndoPill last={tap.last} onUndo={() => void tap.undo()} /> : null}
            <button
              ref={collapseRef}
              type="button"
              onClick={() => toggle(false)}
              aria-label="Recolher água de hoje"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground transition active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronUp className="size-5" aria-hidden />
            </button>
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
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {summary.daysMet} de 7 dias na meta
                    {summary.streak.days >= 2
                      ? ` · ${summary.streak.days} ${pluralize(summary.streak.days, "dia seguido", "dias seguidos")}`
                      : ""}
                  </p>
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
            <WaterAddButton ml={tap.ml} pulse={tap.pulse} onTap={() => void tap.tap()} />
          </div>

          <PortionPicker portions={tap.portions} selected={tap.selected} onSelect={tap.select} onEdit={() => setPortionsOpen(true)} />
          <WaterAnnouncer text={tap.announcement} />
        </Surface>
      ) : (
        <Surface>
          <button
            ref={stripRef}
            type="button"
            onClick={() => toggle(true)}
            aria-expanded={false}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition active:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
              <Droplet className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2 tabular-nums">
                <span className="truncate text-sm font-medium text-muted-foreground">Água · hoje</span>
                <span className="shrink-0 text-sm font-semibold">
                  {formatTotal(summary.ml)}
                  {targetMl ? <span className="font-normal text-muted-foreground"> de {formatLiters(targetMl)}</span> : null}
                </span>
              </span>
              {targetMl ? <ProgressBar className="mt-1.5 h-1.5" ratio={summary.ratio} label="Progresso da meta diária de água" /> : null}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
          </button>
        </Surface>
      )}

      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
      <WaterPortionsSheet open={portionsOpen} onOpenChange={setPortionsOpen} />
    </section>
  );
}
