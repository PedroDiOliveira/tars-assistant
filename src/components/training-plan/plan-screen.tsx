"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubHeader } from "@/components/layout/sub-header";
import { withStoreGate } from "@/components/layout/store-gate";
import { Surface } from "@/components/shared/surface";
import { currentTrainingPlan } from "@/domain/training-proposal";
import { hydratePlanProposal, useData, usePlanProposal } from "@/data";
import { generateProposal, usePlanGeneration } from "./generate";
import { CurrentPlan } from "./current-plan";
import { ProposalMenu, ProposalReview } from "./proposal-review";

const GENERATING_STEPS = ["Lendo suas respostas e seu histórico", "Montando os treinos", "Conferindo tempo, volume e segurança"];

function Generating() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, GENERATING_STEPS.length - 1)), 1400);
    return () => clearInterval(timer);
  }, []);
  return (
    <Surface className="p-5" role="status" aria-live="polite">
      <p className="font-semibold">Montando seu plano…</p>
      <ul className="mt-3 space-y-2 text-sm">
        {GENERATING_STEPS.map((label, i) => (
          <li key={label} className={i > step ? "flex items-center gap-2 text-muted-foreground/60" : "flex items-center gap-2"}>
            {i < step ? (
              <Check className="size-4 text-m-ink" aria-hidden />
            ) : i === step ? (
              <LoaderCircle className="size-4 animate-spin text-m-ink" aria-hidden />
            ) : (
              <span className="size-4" aria-hidden />
            )}
            {label}
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function Intro({ hasProfile }: { hasProfile: boolean }) {
  return (
    <div className="space-y-4">
      <Surface className="space-y-3 p-5">
        <span className="grid size-10 place-items-center rounded-full bg-m-soft text-m-ink">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">Um plano de treino feito para você</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Responda umas perguntas rápidas: objetivo, dias, tempo e onde treina.</li>
          <li>As regras do app cuidam do tempo de cada treino, do volume e dos exercícios que você deve evitar.</li>
          <li>Você revisa, troca o que quiser e só então o plano vira as suas fichas.</li>
        </ul>
      </Surface>
      {hasProfile ? (
        <Button size="lg" className="w-full" onClick={() => void generateProposal()}>
          <Sparkles aria-hidden /> Gerar meu plano
        </Button>
      ) : null}
      <Button size="lg" variant={hasProfile ? "ghost" : "default"} className="w-full" asChild>
        <Link href="/treino/plano/perguntas">{hasProfile ? "Refazer as perguntas" : "Começar"}</Link>
      </Button>
    </div>
  );
}

/**
 * Plano de treino: a apresentação, a proposta em revisão (só no aparelho) e o plano aceito. Os números (tempo,
 * séries, faixas) vêm das regras; da IA vêm só as escolhas dentro das opções e os textos.
 */
function PlanScreenContent() {
  const data = useData();
  const proposal = usePlanProposal((s) => s.proposal);
  const generating = usePlanGeneration((s) => s.generating);
  // Sem armazenamento local (bloqueado), o store nasce sem `persist`: não há o que carregar.
  const [hydrated, setHydrated] = useState(() => usePlanProposal.persist?.hasHydrated() ?? true);

  useEffect(() => {
    if (hydrated) return;
    void hydratePlanProposal().then(() => setHydrated(true));
  }, [hydrated]);

  const current = useMemo(() => currentTrainingPlan(data.trainingPlans), [data.trainingPlans]);
  const stale = Boolean(proposal && data.trainingProfile && proposal.profileUpdatedAt !== data.trainingProfile.updatedAt);

  let content;
  if (!hydrated) content = null;
  else if (generating) content = <Generating />;
  else if (proposal) content = <ProposalReview proposal={proposal} stale={stale} />;
  else if (current) content = <CurrentPlan record={current} />;
  else content = <Intro hasProfile={data.trainingProfile !== null} />;

  return (
    <div data-module="workout" className="pb-10">
      <SubHeader
        title="Plano de treino"
        backHref="/treino"
        backLabel="Voltar para Musculação"
        right={hydrated && !generating && proposal ? <ProposalMenu /> : undefined}
      />
      <div className="px-4 pt-2">{content}</div>
    </div>
  );
}

export const PlanScreen = withStoreGate(PlanScreenContent);
