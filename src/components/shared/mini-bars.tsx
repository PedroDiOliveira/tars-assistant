import { cn } from "cn";

export interface MiniBarItem {
  label: string;
  value: number;
  /** texto sob/sobre a barra, ex.: "1h 20" */
  display: string;
  highlight?: boolean;
  future?: boolean;
}

interface MiniBarsProps {
  items: MiniBarItem[];
  /** descrição para leitores de tela */
  summary: string;
  className?: string;
}

/** Barras por dia da semana na cor do módulo. Os valores sempre aparecem em texto. */
export function MiniBars({ items, summary, className }: MiniBarsProps) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div role="img" aria-label={summary} className={cn("flex items-end gap-1.5", className)}>
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
                  item.value > 0 ? "bg-m" : "bg-muted",
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
