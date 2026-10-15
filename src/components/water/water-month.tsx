"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/shared/surface";
import { waterMonthSummary, type WaterLevel, type WaterMonthCell } from "@/domain/summary";
import { formatLiters } from "@/domain/water";
import type { DataSnapshot } from "@/domain/summary";
import { WEEK_LABELS } from "@/lib/constants";
import { addMonths, monthOf, type DateKey } from "@/lib/dates";
import { formatDayShort, formatMonthLabel } from "@/lib/format";

/** Mais escuro = mais perto da meta. Sem registro fica quase vazio; o tom do "dia de hoje" é o anel. */
const LEVEL_CLASS: Record<WaterLevel, string> = {
  0: "bg-muted/60 text-muted-foreground",
  1: "bg-m/25 text-foreground",
  2: "bg-m/55 text-foreground",
  3: "bg-m text-water-on",
};

const LEVEL_TEXT: Record<WaterLevel, string> = { 0: "sem registro", 1: "abaixo da metade da meta", 2: "perto da meta", 3: "meta batida" };

function cellLabel(cell: WaterMonthCell): string {
  const base = formatDayShort(cell.date);
  if (cell.isFuture) return `${base}, ainda não chegou`;
  if (cell.level === 0) return `${base}, sem registro`;
  return `${base}: ${formatLiters(cell.ml)}${cell.targetMl ? `, ${LEVEL_TEXT[cell.level]}` : ""}`;
}

/** Calendário do mês: um quadrado por dia, mais escuro quanto mais perto da meta. Tocar abre os registros do dia. */
export function WaterMonth({
  data,
  today,
  earliestDay,
  onOpenDay,
}: {
  data: DataSnapshot;
  today: DateKey;
  /** o dia do registro mais antigo (limita a volta no tempo); null sem registros */
  earliestDay: DateKey | null;
  onOpenDay: (day: DateKey) => void;
}) {
  const currentMonth = monthOf(today);
  const [month, setMonth] = useState(currentMonth);
  const summary = useMemo(() => waterMonthSummary(data, month, today), [data, month, today]);
  const earliestMonth = earliestDay ? monthOf(earliestDay) : currentMonth;

  return (
    <section className="space-y-2" aria-labelledby="water-month-title">
      <div className="flex items-center justify-between px-1">
        <h2 id="water-month-title" className="text-base font-semibold">
          Mês
        </h2>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={month <= earliestMonth} onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium" aria-live="polite">
            {formatMonthLabel(month)}
          </span>
          <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={month >= currentMonth} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <Surface className="p-3">
        <div className="grid grid-cols-7 pb-1" aria-hidden>
          {WEEK_LABELS.map((label) => (
            <span key={label} className="text-center text-[11px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {summary.weeks.flat().map((cell, index) =>
            cell === null ? (
              <span key={`blank-${index}`} aria-hidden />
            ) : cell.isFuture ? (
              <span key={cell.date} aria-label={cellLabel(cell)} role="img" className="grid h-11 place-items-center text-xs text-muted-foreground/40 tabular-nums">
                {Number(cell.date.slice(8))}
              </span>
            ) : (
              <button
                key={cell.date}
                type="button"
                onClick={() => onOpenDay(cell.date)}
                aria-label={cellLabel(cell)}
                className="grid h-11 place-items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:rounded-lg"
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-lg text-xs font-medium tabular-nums transition-colors",
                    LEVEL_CLASS[cell.level],
                    cell.isToday && "ring-2 ring-m ring-offset-2 ring-offset-card",
                  )}
                >
                  {Number(cell.date.slice(8))}
                </span>
              </button>
            ),
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Mais escuro, mais perto da meta{summary.weeks.flat().some((c) => c?.targetMl) ? "" : " (defina uma meta para ver a escala)"}. Toque num dia para ver os registros.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          <MonthStat label="Dias na meta" value={summary.daysMet > 0 || summary.weeks.flat().some((c) => c?.targetMl) ? `${summary.daysMet}` : "—"} note={summary.daysWithRecord > 0 ? `de ${summary.daysWithRecord} com registro` : undefined} />
          <MonthStat label="Média por dia" value={summary.averageMl !== null ? formatLiters(summary.averageMl) : "—"} note={summary.daysWithRecord > 0 ? "dias com registro" : undefined} />
          <MonthStat label="Total do mês" value={summary.totalMl > 0 ? formatLiters(summary.totalMl) : "—"} />
        </dl>
      </Surface>
    </section>
  );
}

function MonthStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg leading-tight font-semibold tabular-nums">{value}</dd>
      <dd className="min-h-8 text-xs text-muted-foreground">{note ?? ""}</dd>
    </div>
  );
}
