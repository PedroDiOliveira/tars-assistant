"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Dumbbell, Footprints, Hourglass, Minus, TrendingUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Surface } from "@/components/shared/surface";
import { SubHeader } from "@/components/layout/sub-header";
import { withStoreGate } from "@/components/layout/store-gate";
import { formatDistance } from "@/domain/running";
import {
  STALL_SESSIONS,
  defaultReportMonth,
  trainingMonthReport,
  type MonthWeek,
  type TopSet,
} from "@/domain/training-report";
import { EFFORT_LABELS, EFFORT_LEVELS } from "@/domain/workouts";
import { useData, useToday } from "@/data";
import { addMonths, monthOf } from "@/lib/dates";
import { formatDayMonth, formatMinutes, formatMonthLabel, formatMonthName, formatNumber, pluralize } from "@/lib/format";
import { formatVolume } from "./format-sets";

/** Quantos itens cada lista mostra antes de "Ver todos". */
const LIST_PREVIEW = 5;

/** Número em destaque: a partir de 10 toneladas, em toneladas (130.906 kg → "130,9 t"). */
function formatVolumeCompact(kg: number): string {
  return kg >= 10_000 ? `${formatNumber(kg / 1000, 1)} t` : formatVolume(kg);
}

function formatTopSet(set: TopSet): string {
  return set.weightKg > 0 ? `${formatNumber(set.weightKg, 2)} kg × ${set.reps}` : `${set.reps} reps`;
}

/**
 * "Seu mês em números": o retrato do mês de musculação, calculado só com os dados registrados (sem IA). Os números
 * vêm de `trainingMonthReport`; aqui só a apresentação.
 */
function MonthReportScreenContent() {
  const data = useData();
  const today = useToday();
  const currentMonth = monthOf(today);
  const [month, setMonth] = useState(() => defaultReportMonth(today));
  const report = useMemo(() => trainingMonthReport(data, month, today), [data, month, today]);
  const earliestMonth = useMemo(() => {
    const first = data.sessions.reduce<string | null>((min, s) => (min === null || s.occurredOn < min ? s.occurredOn : min), null);
    return first ? monthOf(first) : currentMonth;
  }, [data.sessions, currentMonth]);
  const previousName = formatMonthName(addMonths(month, -1)).toLowerCase();

  return (
    <div data-module="workout" className="pb-10">
      <SubHeader title="Resumo do mês" backHref="/treino" backLabel="Voltar para Musculação" />
      <div className="space-y-6 px-4 pt-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            disabled={month <= earliestMonth}
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <p className="text-center" aria-live="polite">
            <span className="block font-semibold">{formatMonthLabel(month)}</span>
            {report.current ? <span className="block text-xs text-muted-foreground">até agora</span> : null}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo mês"
            disabled={month >= currentMonth}
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>

        {report.sessions === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={`Nenhum treino em ${formatMonthName(month).toLowerCase()}`}
            description="Quando você finalizar treinos, o resumo do mês aparece aqui."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="Treinos"
                value={String(report.sessions)}
                note={
                  report.sessions === report.previousSessions
                    ? `igual a ${previousName}`
                    : `${report.sessions > report.previousSessions ? "+" : "−"}${Math.abs(report.sessions - report.previousSessions)} vs ${previousName}`
                }
              />
              <StatTile label="Séries" value={String(report.sets)} />
              <StatTile label="Tempo treinando" value={formatMinutes(report.minutes)} />
              <StatTile label="Volume" value={formatVolumeCompact(report.volumeKg)} />
            </div>

            <Weeks weeks={report.weeks} />

            <Section title="Séries por grupo muscular">
              <Surface className="p-4">
                <BarList label="Séries por grupo muscular" rows={report.groups.map((g) => ({ label: g.group, value: g.sets }))} />
              </Surface>
            </Section>

            <Section
              title="Como foram os treinos"
              note={`${report.effort.rated} de ${report.sessions} ${pluralize(report.sessions, "treino avaliado", "treinos avaliados")}`}
            >
              <Surface className="p-4">
                {report.effort.rated === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum treino avaliado neste mês. Ao finalizar um treino, toque em como ele foi.
                  </p>
                ) : (
                  <BarList
                    label="Como foram os treinos"
                    rows={EFFORT_LEVELS.map((level) => ({ label: EFFORT_LABELS[level], value: report.effort.counts[level] }))}
                  />
                )}
              </Surface>
            </Section>

            {report.records.length > 0 ? (
              <Section title="Recordes">
                <ItemList count={report.records.length} label="recordes">
                  {[...report.records].reverse().map((r) => (
                    <Item
                      key={r.exerciseId}
                      icon={Trophy}
                      href={`/treino/exercicio/${r.exerciseId}`}
                      title={r.name}
                      value={formatTopSet(r)}
                      detail={`antes: ${formatTopSet(r.previous)} · ${formatDayMonth(r.date)}`}
                    />
                  ))}
                </ItemList>
              </Section>
            ) : null}

            {report.progressed.length > 0 ? (
              <Section title="Evoluíram" note="Melhor série da última vez no mês, comparada com a de antes">
                <ItemList count={report.progressed.length} label="exercícios que evoluíram">
                  {report.progressed.map((t) => (
                    <Item
                      key={t.exerciseId}
                      icon={TrendingUp}
                      href={`/treino/exercicio/${t.exerciseId}`}
                      title={t.name}
                      value={formatTopSet(t.to)}
                      detail={`antes: ${formatTopSet(t.from)}`}
                    />
                  ))}
                </ItemList>
              </Section>
            ) : null}

            {report.stalled.length > 0 ? (
              <Section
                title="Sem evolução recente"
                note={`${STALL_SESSIONS} ou mais treinos seguidos sem superar a melhor série. Pode ser hora de mudar a faixa de repetições, a carga ou o exercício.`}
              >
                <ItemList count={report.stalled.length} label="exercícios sem evolução">
                  {report.stalled.map((s) => (
                    <Item
                      key={s.exerciseId}
                      icon={Minus}
                      href={`/treino/exercicio/${s.exerciseId}`}
                      title={s.name}
                      value={`${s.sessions} treinos`}
                      detail={`melhor série: ${formatTopSet(s.best)}`}
                    />
                  ))}
                </ItemList>
              </Section>
            ) : null}

            {report.running.runs > 0 ? (
              <Surface className="overflow-hidden" data-module="running">
                <Link href="/treino/corrida" className="flex min-h-14 items-center gap-3 px-4 py-3 transition active:bg-muted/60">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
                    <Footprints className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Corrida</span>
                    <span className="block text-sm text-muted-foreground">
                      {report.running.runs} {pluralize(report.running.runs, "corrida", "corridas")}
                      {report.running.meters > 0 ? ` · ${formatDistance(report.running.meters)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                </Link>
              </Surface>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Surface className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </Surface>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Barras horizontais de um tom só (a cor do módulo), crescendo da esquerda. O número fica escrito em toda linha: é
 * ele que carrega o valor (a barra só dá a proporção), o que também cobre o contraste baixo do verde no tema claro.
 */
function BarList({ label, rows }: { label: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3" aria-label={label}>
      {rows.map((row) => (
        <li key={row.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{row.value}</span>
          </div>
          <div className="h-2" aria-hidden>
            {row.value > 0 ? (
              <div className="h-full rounded-r-[4px] bg-m" style={{ width: `${(row.value / max) * 100}%` }} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Semanas (de segunda) que tocam o mês: feitos, meta e se bateu. Ícone + texto, nunca só cor. */
function Weeks({ weeks }: { weeks: MonthWeek[] }) {
  const closed = weeks.filter((w) => !w.current && w.target !== null);
  const hit = closed.filter((w) => w.done >= (w.target ?? 0)).length;
  return (
    <Section
      title="Semanas"
      note={closed.length > 0 ? `${hit} de ${closed.length} ${pluralize(closed.length, "semana", "semanas")} na meta` : undefined}
    >
      <Surface className="divide-y divide-border/60 overflow-hidden">
        {weeks.map((week) => {
          const reached = week.target !== null && week.done >= week.target;
          const Icon = week.current ? Hourglass : reached ? Check : null;
          return (
            <div key={week.start} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">Semana de {formatDayMonth(week.start)}</span>
              <span className="tabular-nums text-muted-foreground">
                {week.target !== null
                  ? `${week.done} de ${week.target}`
                  : `${week.done} ${pluralize(week.done, "treino", "treinos")}`}
              </span>
              <span className="flex w-28 items-center justify-end gap-1 text-xs font-medium">
                {Icon ? <Icon className="size-3.5 text-m-ink" aria-hidden /> : null}
                {week.current ? "em andamento" : week.target === null ? "" : reached ? "na meta" : "abaixo da meta"}
              </span>
            </div>
          );
        })}
      </Surface>
    </Section>
  );
}

/** Lista com prévia: os primeiros itens e um "Ver todos (N)" quando há mais. */
function ItemList({ count, label, children }: { count: number; label: string; children: ReactNode[] }) {
  const [all, setAll] = useState(false);
  return (
    <>
      <Surface className="divide-y divide-border/60 overflow-hidden">{all ? children : children.slice(0, LIST_PREVIEW)}</Surface>
      {count > LIST_PREVIEW ? (
        <Button variant="ghost" className="w-full" aria-label={all ? `Mostrar menos ${label}` : `Ver todos os ${count} ${label}`} onClick={() => setAll((v) => !v)}>
          {all ? "Mostrar menos" : `Ver todos (${count})`}
        </Button>
      ) : null}
    </>
  );
}

function Item({
  icon: Icon,
  href,
  title,
  value,
  detail,
}: {
  icon: typeof Trophy;
  href: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition active:bg-muted/60">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">{detail}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

export const MonthReportScreen = withStoreGate(MonthReportScreenContent);
