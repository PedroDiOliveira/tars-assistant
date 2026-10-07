import { HueDot } from "@/components/shared/hue-bubble";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { formatBRL, formatBRLCompact } from "@/domain/money";
import { progressPercent } from "@/domain/progress";
import type { CategoryRow } from "@/domain/summary";
import { cn } from "cn";

interface CategoryBreakdownProps {
  rows: CategoryRow[];
  onSelect: (row: CategoryRow) => void;
}

/** Despesas do mês por categoria: com orçamento, a barra mostra gasto/limite; sem, a participação. */
export function CategoryBreakdown({ rows, onSelect }: CategoryBreakdownProps) {
  return (
    <Surface className="divide-y divide-border/70 overflow-hidden">
      {rows.map((row) => {
        const name = row.category?.name ?? "Sem categoria";
        const percent = row.budget ? progressPercent(row.cents, row.budget) : null;
        const sharePct = Math.round(row.share * 100);
        return (
          <button
            key={row.categoryId}
            type="button"
            data-module="finance"
            onClick={() => onSelect(row)}
            className="block w-full px-4 py-3 text-left transition active:bg-muted/60"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <HueDot hue={row.category?.hue ?? 240} />
                <span className="truncate">{name}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatBRL(row.cents)}</span>
            </div>
            <ProgressBar
              className="mt-2"
              ratio={row.budget ? row.budgetRatio : row.share}
              tone={row.tone}
              label={row.budget ? `${name}: gasto em relação ao limite` : `${name}: participação nas despesas`}
            />
            <p
              className={cn(
                "mt-1.5 text-sm text-muted-foreground",
                row.tone === "warn" && "text-warning-ink",
                row.tone === "over" && "text-danger-ink",
              )}
            >
              {row.budget
                ? row.tone === "over"
                  ? `${percent}% do limite de ${formatBRLCompact(row.budget)} · ${formatBRL(row.cents - row.budget)} acima`
                  : `${percent}% do limite de ${formatBRLCompact(row.budget)}`
                : `${sharePct}% das despesas do mês · definir limite`}
            </p>
          </button>
        );
      })}
    </Surface>
  );
}
