import { cn } from "cn";
import { formatDistance, formatRunDuration, runPaceLabel } from "@/domain/running";
import type { RunningSession } from "@/domain/types";
import { formatDayRelative } from "@/lib/format";

interface RunRowProps {
  run: RunningSession;
  today: string;
  onOpen: (run: RunningSession) => void;
  className?: string;
}

/**
 * Uma corrida na lista: data, distância (ou a indicação clara de que ela não foi informada), duração e ritmo.
 * Distância ausente nunca aparece como "0 km".
 */
export function RunRow({ run, today, onOpen, className }: RunRowProps) {
  const secondary = [
    run.durationSeconds !== undefined ? formatRunDuration(run.durationSeconds) : null,
    runPaceLabel(run),
    run.notes ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(run)}
      aria-haspopup="dialog"
      className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition active:bg-muted/60", className)}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{formatDayRelative(run.occurredOn, today)}</p>
        {secondary ? <p className="truncate text-sm text-muted-foreground tabular-nums">{secondary}</p> : null}
      </div>
      {run.distanceMeters !== undefined ? (
        <p className="shrink-0 font-semibold tabular-nums">{formatDistance(run.distanceMeters)}</p>
      ) : (
        <p className="shrink-0 text-sm text-muted-foreground">Distância não informada</p>
      )}
    </button>
  );
}
