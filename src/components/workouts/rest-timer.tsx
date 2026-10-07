"use client";

import { Minus, Plus, SkipForward, Timer } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useNow } from "@/data";
import { formatClock } from "@/lib/format";

export interface RestState {
  /** instante (epoch ms) em que o descanso termina */
  endsAt: number;
  total: number;
}

interface RestTimerProps {
  rest: RestState;
  onAdjust: (deltaSeconds: number) => void;
  onDismiss: () => void;
}

/** Descanso entre séries: contagem regressiva por timestamp, com ajuste de 15 s. */
export function RestTimer({ rest, onAdjust, onDismiss }: RestTimerProps) {
  const now = useNow(250);
  const remaining = Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const done = remaining === 0;
  const ratio = rest.total > 0 ? Math.min(1, remaining / rest.total) : 0;

  return (
    <div
      role="timer"
      aria-label="Descanso entre séries"
      className={cn(
        "relative overflow-hidden rounded-2xl p-3 ring-1",
        done ? "bg-success-soft ring-success/40" : "bg-m-soft ring-border",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 bg-m/15 transition-[width] duration-300"
        style={{ width: `${ratio * 100}%` }}
      />
      <div className="relative flex items-center gap-2">
        <Timer className="size-5 shrink-0 text-m-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-m-ink">{done ? "Descanso concluído" : "Descansando"}</p>
          <p className="text-2xl leading-none font-bold tabular-nums">{formatClock(remaining)}</p>
        </div>
        <Button variant="secondary" size="icon" aria-label="Menos 15 segundos" onClick={() => onAdjust(-15)}>
          <Minus aria-hidden />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Mais 15 segundos" onClick={() => onAdjust(15)}>
          <Plus aria-hidden />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Pular descanso" onClick={onDismiss}>
          <SkipForward aria-hidden />
        </Button>
      </div>
    </div>
  );
}
