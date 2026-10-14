import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { HueDot } from "@/components/shared/hue-bubble";
import { MiniBars } from "@/components/shared/mini-bars";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import type { AssistantCard } from "@/domain/assistant-cards";
import { pluralize } from "@/lib/format";
import { MODULES } from "@/lib/modules";

/**
 * Um card para todos os tipos: o builder (`domain/assistant-cards.ts`) entrega sempre o mesmo formato, e o ícone, o
 * título e a rota saem do mapa fixo de módulos do app, nunca de texto que veio do servidor. Todo valor aparece em
 * texto; as barras só reforçam.
 */
export function SummaryCard({ card }: { card: AssistantCard }) {
  const meta = MODULES[card.module];
  const Icon = meta.icon;
  const { headline, progress, series } = card;

  return (
    <Surface
      role="group"
      aria-label={`Resumo de ${meta.label}, ${card.periodLabel}`}
      data-module={card.module}
      className="overflow-hidden"
    >
      <div className="space-y-4 p-4">
        <header className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{meta.label}</h3>
            <p className="truncate text-xs text-muted-foreground">Período: {card.periodLabel}</p>
          </div>
        </header>

        <div>
          <p className="tabular-nums">
            <span className="text-3xl font-semibold tracking-tight">{headline.value}</span>
            {headline.unit ? <span className="text-sm text-muted-foreground"> {headline.unit}</span> : null}
          </p>
          {headline.notes.map((note) => (
            <p key={note} className="text-sm text-muted-foreground">
              {note}
            </p>
          ))}
        </div>

        {progress ? (
          <div className="space-y-1.5">
            <ProgressBar ratio={progress.ratio} tone={progress.tone} label={progress.label} />
            {progress.caption ? <p className="text-xs text-muted-foreground">{progress.caption}</p> : null}
          </div>
        ) : null}

        {series ? (
          <div>
            <MiniBars items={series.items} summary={series.summary} />
            {series.note ? <p className="mt-2 text-xs text-muted-foreground">{series.note}</p> : null}
          </div>
        ) : null}

        {card.rows.length > 0 ? (
          <div>
            {card.rowsTitle ? <h4 className="mb-2 text-xs font-medium text-muted-foreground">{card.rowsTitle}</h4> : null}
            <ul className="space-y-3">
              {card.rows.map((row) => (
                <li key={row.key} className={cn(row.focused && "-mx-2 rounded-lg bg-muted/70 px-2 py-1.5")}>
                  <div className="flex items-center gap-2">
                    {row.hue !== undefined ? <HueDot hue={row.hue} /> : null}
                    <span className={cn("min-w-0 flex-1 truncate text-sm", row.focused && "font-semibold")}>{row.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{row.valueText}</span>
                  </div>
                  <ProgressBar className="mt-1.5 h-1.5" ratio={row.ratio} tone={row.tone} label={row.barLabel} />
                  {row.note ? <p className="mt-1 text-xs text-muted-foreground">{row.note}</p> : null}
                </li>
              ))}
            </ul>
            {card.hiddenRows > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                + {card.hiddenRows} {pluralize(card.hiddenRows, "outro item", "outros itens")} na tela do módulo
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link
        href={meta.href}
        className="flex min-h-11 items-center justify-between border-t border-border/60 px-4 text-sm font-medium text-m-ink transition active:bg-muted/60"
      >
        Abrir em {meta.label}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </Surface>
  );
}
