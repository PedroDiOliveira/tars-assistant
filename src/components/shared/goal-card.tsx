import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { ProgressRing } from "./progress-ring";

interface GoalCardProps {
  module: ModuleKey;
  /** ex.: "Treino · esta semana" */
  title: string;
  /** frase principal com numerador, denominador e período, ex.: "2 de 4 treinos" */
  headline: ReactNode;
  detail?: ReactNode;
  ratio: number;
  ringLabel: string;
  /** percentual real (pode passar de 100) mostrado como texto; omitido sem meta */
  percentText?: string;
  href?: string;
}

/** Cartão de meta da Início: anel + frase de progresso + detalhe. Todo o cartão é um link. */
export function GoalCard({
  module,
  title,
  headline,
  detail,
  ratio,
  ringLabel,
  percentText,
  href,
}: GoalCardProps) {
  const meta = MODULES[module];
  const Icon = meta.icon;
  return (
    <Link
      href={href ?? meta.href}
      data-module={module}
      className="group flex min-h-24 items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-border/70 transition active:scale-[0.99] active:bg-muted/60"
    >
      <ProgressRing ratio={ratio} label={ringLabel} size={64} stroke={7}>
        <Icon className="size-6 text-m-ink" aria-hidden />
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
          {percentText ? (
            <span className="shrink-0 rounded-full bg-m-soft px-2 py-0.5 text-xs font-semibold text-m-ink tabular-nums">
              {percentText}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-lg leading-snug font-semibold tabular-nums">{headline}</p>
        {detail ? <div className="mt-0.5 text-sm text-muted-foreground">{detail}</div> : null}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />
    </Link>
  );
}
