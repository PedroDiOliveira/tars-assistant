import { cn } from "cn";

export interface MiniBarItem {
  label: string;
  value: number;
  /** texto sob/sobre a barra, ex.: "1h 20" */
  display: string;
  highlight?: boolean;
  future?: boolean;
  /** barra mais fraca: o dia existe, mas não chegou à meta (a meta aparece na linha tracejada) */
  under?: boolean;
}

interface MiniBarsProps {
  items: MiniBarItem[];
  /** descrição para leitores de tela */
  summary: string;
  /** valor da meta na mesma unidade das barras: desenha uma linha tracejada na altura dela */
  goalLine?: number;
  className?: string;
}

/** Barras por dia da semana na cor do módulo. Os valores sempre aparecem em texto. */
export function MiniBars({ items, summary, goalLine, className }: MiniBarsProps) {
  // A meta entra na escala: uma barra nunca passa do alto do gráfico e a linha da meta sempre cabe nele.
  const max = Math.max(...items.map((i) => i.value), goalLine ?? 0, 1);
  return (
    <div role="img" aria-label={summary} className={cn("relative flex items-end gap-1.5", className)}>
      {goalLine ? (
        // 20px = rótulo de valor (16) + folga (4) abaixo da área das barras (56px); a linha fica na altura da meta.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-m-ink/50"
          style={{ bottom: `calc(20px + ${(goalLine / max) * 56}px)` }}
        />
      ) : null}
      {items.map((item) => {
        const height = item.value > 0 ? Math.max((item.value / max) * 56, 6) : 4;
        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="h-4 text-[11px] leading-4 font-medium text-muted-foreground tabular-nums">
              {item.value > 0 ? item.display : ""}
            </span>
            <div className="flex h-14 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-md transition-[height] duration-500",
                  item.value > 0 ? (item.under ? "bg-m/45" : "bg-m") : "bg-muted",
                  item.future && "opacity-40",
                )}
                style={{ height }}
              />
            </div>
            <span
              className={cn(
                "text-xs",
                item.highlight ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
