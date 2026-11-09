"use client";

import { useMemo } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { scienceSummary } from "@/domain/training-evidence";
import type { PlanProposal } from "@/domain/training-proposal";
import type { TrainingProfile } from "@/domain/types";

/**
 * "Por que este treino funciona", recolhida por padrão (o rascunho fica curto para quem não quer ler): poucas frases
 * simples, ligadas às respostas e ao plano como ele está (as edições da pessoa entram na conta), e as referências, em
 * letra pequena, para quem quiser ir a fundo. Sai das regras e de uma lista revisada de princípios
 * (domain/training-evidence.ts): sem IA e sem custo, por isso abre na hora.
 */
export function ScienceSection({ proposal, profile }: { proposal: PlanProposal; profile: TrainingProfile }) {
  const summary = useMemo(() => scienceSummary(profile, proposal.skeleton, proposal.choices), [profile, proposal.skeleton, proposal.choices]);
  const count = summary.references.length;
  return (
    <section aria-labelledby="science-title">
      {/* Recolhida por padrão, só pelo visual: abre na hora, porque não há nada para gerar (sem IA, sem custo). */}
      <details className="group/science rounded-2xl bg-card text-card-foreground ring-1 ring-border/70">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <BookOpen className="size-5 shrink-0 text-m-ink" aria-hidden />
          <span className="min-w-0 flex-1">
            <span id="science-title" className="block font-semibold">
              Por que este treino funciona
            </span>
            <span className="block text-sm text-muted-foreground">
              O que a ciência diz, baseado em {count} {count === 1 ? "estudo" : "estudos"}
            </span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition group-open/science:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t px-4 pt-3 pb-4">
          <ul className="space-y-3 text-sm">
            {summary.points.map((point) => (
              <li key={point.principle}>
                <span className="font-medium">{point.title}.</span> <span className="text-muted-foreground">{point.text}</span>
              </li>
            ))}
          </ul>
          <details className="group border-t pt-3">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              Ver as referências
              <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden />
            </summary>
            <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
              {summary.references.map((ref) => (
                <li key={ref.doi}>
                  {ref.full}{" "}
                  <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-2">
                    doi:{ref.doi}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </div>
      </details>
    </section>
  );
}
