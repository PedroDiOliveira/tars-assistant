"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { Surface } from "@/components/shared/surface";
import { SPLIT_LABELS } from "@/domain/training-profile";
import { currentTrainingPlan } from "@/domain/training-proposal";
import { hydratePlanProposal, useData, usePlanProposal } from "@/data";
import { dateKeyFromInstant } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import { usePlanGeneration } from "./generate";

/** Atalho para o plano de treino em Musculação: montar, revisar a proposta ou ver o plano atual. */
export function PlanCard() {
  const data = useData();
  const proposal = usePlanProposal((s) => s.proposal);
  const generating = usePlanGeneration((s) => s.generating);
  const current = useMemo(() => currentTrainingPlan(data.trainingPlans), [data.trainingPlans]);

  useEffect(() => {
    void hydratePlanProposal();
  }, []);

  const [title, detail] = generating
    ? ["Plano de treino", "Montando seu plano…"]
    : proposal
      ? ["Plano pronto para revisar", `${SPLIT_LABELS[proposal.skeleton.split]}: revise antes de usar`]
      : current
        ? ["Plano de treino", `${SPLIT_LABELS[current.split]} · desde ${formatDayMonth(dateKeyFromInstant(current.acceptedAt))}`]
        : ["Montar meu plano", "Perguntas rápidas e um plano em fichas para você"];

  return (
    <Surface className="overflow-hidden">
      <Link href="/treino/plano" className="flex min-h-14 items-center gap-3 px-4 py-3 transition active:bg-muted/60">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
          <Sparkles className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block truncate text-sm text-muted-foreground">{detail}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
      </Link>
    </Surface>
  );
}
