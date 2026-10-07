import { cn } from "cn";
import type { ProgressTone } from "@/domain/progress";

interface ProgressBarProps {
  /** fração 0..1 (já limitada); o valor real deve aparecer em texto junto da barra */
  ratio: number;
  /** ok = cor do módulo; warn = perto do limite; over = estourou */
  tone?: ProgressTone;
  label: string;
  className?: string;
  trackClassName?: string;
}

const FILL: Record<ProgressTone, string> = {
  ok: "bg-m",
  warn: "bg-warning",
  over: "bg-destructive",
};

export function ProgressBar({ ratio, tone = "ok", label, className, trackClassName }: ProgressBarProps) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", trackClassName, className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", FILL[tone])}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
