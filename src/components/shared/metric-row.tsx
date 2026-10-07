import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { ProgressBar } from "./progress-bar";

interface MetricRowProps {
  href: string;
  module: string;
  icon: LucideIcon;
  label: string;
  /** o número que importa, ex.: "1 de 4" */
  value: string;
  /** complemento curto à direita do valor, ex.: "treinos" */
  unit?: string;
  ratio: number;
  progressLabel: string;
  className?: string;
}

/** Linha de meta: ícone, rótulo, número e barra fina. Uma informação por linha. */
export function MetricRow({
  href,
  module,
  icon: Icon,
  label,
  value,
  unit,
  ratio,
  progressLabel,
  className,
}: MetricRowProps) {
  return (
    <Link
      href={href}
      data-module={module}
      className={cn("block px-4 py-3.5 transition active:bg-muted/60", className)}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="font-semibold">{value}</span>
          {unit ? <span className="text-sm text-muted-foreground"> {unit}</span> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
      </div>
      <ProgressBar className="mt-2.5 h-1.5" ratio={ratio} label={progressLabel} />
    </Link>
  );
}
