import { Check } from "lucide-react";
import { cn } from "cn";
import { WEEK_LABELS } from "@/lib/constants";
import type { WeekDot } from "@/domain/activity";

interface WeekDotsProps {
  dots: WeekDot[];
  /**
   * O que a bolinha preenchida significa ("treino", "corrida"...). Só alimenta o texto acessível: quem usa o
   * componente diz o que marcou, para a corrida não ser anunciada como musculação (nem o contrário).
   */
  activity: string;
  /** lg mostra o nome abreviado do dia (Seg, Ter...) */
  size?: "sm" | "lg";
  className?: string;
}

/** Sete bolinhas, de segunda a domingo: preenchida = houve ao menos um registro do módulo no dia. */
export function WeekDots({ dots, activity, size = "sm", className }: WeekDotsProps) {
  const done = dots.filter((d) => d.count > 0).length;
  return (
    <ul
      aria-label={`${done} ${done === 1 ? "dia" : "dias"} com ${activity} nesta semana`}
      className={cn("flex items-center", size === "lg" ? "justify-between gap-1" : "gap-1.5", className)}
    >
      {dots.map((dot, i) => {
        const filled = dot.count > 0;
        return (
          <li key={dot.date} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "grid place-items-center rounded-full transition-colors",
                size === "lg" ? "size-10" : "size-5",
                filled ? "bg-m text-black/80" : "bg-muted",
                dot.isToday && !filled && "ring-2 ring-m ring-offset-2 ring-offset-card",
                dot.isFuture && "opacity-50",
              )}
            >
              {filled ? <Check className={size === "lg" ? "size-5" : "size-3"} strokeWidth={3} aria-hidden /> : null}
            </span>
            <span
              className={cn(
                "text-muted-foreground",
                size === "lg" ? "text-xs" : "sr-only",
                dot.isToday && "font-semibold text-foreground",
              )}
            >
              {WEEK_LABELS[i]}
              {filled ? <span className="sr-only">, com {activity}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
