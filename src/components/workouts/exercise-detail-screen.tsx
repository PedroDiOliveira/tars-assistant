"use client";

import { useMemo } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import Link from "next/link";
import { Dumbbell, Trophy } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionTitle } from "@/components/shared/section-title";
import { Sparkline } from "@/components/shared/sparkline";
import { Surface } from "@/components/shared/surface";
import { SubHeader } from "@/components/layout/sub-header";
import { compareLastTwo, exerciseHistory, personalRecord } from "@/domain/workouts";
import { useData, useToday } from "@/data";
import { formatDayMonth, formatDayRelative, formatNumber } from "@/lib/format";
import { formatVolume, summarizeSets } from "./format-sets";

function signed(value: number, unit: string, digits = 2): string {
  if (value === 0) return "sem mudança";
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value), digits)} ${unit}`;
}

function ExerciseDetailScreenContent({ exerciseId }: { exerciseId: string }) {
  const data = useData();
  const today = useToday();
  const exercise = data.exercises.find((e) => e.id === exerciseId);

  const history = useMemo(() => exerciseHistory(data.sessions, exerciseId), [data.sessions, exerciseId]);
  const record = useMemo(() => personalRecord(data.sessions, exerciseId), [data.sessions, exerciseId]);
  const comparison = useMemo(() => compareLastTwo(data.sessions, exerciseId), [data.sessions, exerciseId]);

  if (!exercise) {
    return (
      <div data-module="workout">
        <SubHeader title="Exercício" backHref="/treino" />
        <div className="px-4 pt-4">
          <EmptyState
            icon={Dumbbell}
            title="Exercício não encontrado"
            action={
              <Button asChild>
                <Link href="/treino">Voltar aos treinos</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const bodyweight = exercise.loadType === "bodyweight";
  const recent = history.slice(-12);
  const series = recent.map((h) => (bodyweight ? h.topReps : h.topWeightKg));
  const bestReps = history.reduce((max, h) => Math.max(max, h.topReps), 0);

  return (
    <div data-module="workout" className="pb-8">
      <SubHeader title={exercise.name} backHref="/treino" />
      <div className="space-y-6 px-4 pt-2">
        <p className="text-sm text-muted-foreground">
          {exercise.muscleGroup} · {history.length} {history.length === 1 ? "sessão" : "sessões"} registradas
        </p>

        {history.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="Sem histórico neste exercício"
            description="Conclua séries deste exercício em um treino para ver a evolução."
          />
        ) : (
          <>
            <Surface className="flex items-center gap-4 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-m-soft text-m-ink">
                <Trophy className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {bodyweight ? "Melhor série (repetições)" : "Recorde de carga"}
                </p>
                {bodyweight ? (
                  <p className="text-xl font-bold tabular-nums">{bestReps} repetições</p>
                ) : record ? (
                  <>
                    <p className="text-xl font-bold tabular-nums">
                      {formatNumber(record.weightKg, 2)} kg × {record.reps}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatDayRelative(record.date, today)}</p>
                  </>
                ) : null}
              </div>
            </Surface>

            <section className="space-y-3">
              <SectionTitle hint={bodyweight ? "Repetições da melhor série por sessão" : "Carga da melhor série por sessão (kg)"}>
                Evolução
              </SectionTitle>
              <Surface className="space-y-2 p-4">
                <Sparkline
                  values={series}
                  summary={`${bodyweight ? "Repetições" : "Carga"} da melhor série nas últimas ${series.length} sessões: ${series.join(", ")}`}
                />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>
                    {formatDayMonth(recent[0].date)} · {formatNumber(series[0], 2)}
                    {bodyweight ? "" : " kg"}
                  </span>
                  <span>
                    {formatDayMonth(recent[recent.length - 1].date)} · {formatNumber(series[series.length - 1], 2)}
                    {bodyweight ? "" : " kg"}
                  </span>
                </div>
              </Surface>
            </section>

            <section className="space-y-3">
              <SectionTitle hint="Última sessão contra a anterior">Comparação</SectionTitle>
              <Surface className="space-y-2 p-4 text-sm">
                {comparison ? (
                  <>
                    <p className="text-muted-foreground">
                      {formatDayRelative(comparison.last.date, today)} comparado com{" "}
                      {formatDayRelative(comparison.previous.date, today).toLowerCase()}.
                    </p>
                    {!bodyweight ? (
                      <>
                        <Row label="Maior carga" value={signed(comparison.topWeightDeltaKg, "kg")} delta={comparison.topWeightDeltaKg} />
                        <Row label="Volume (carga × repetições)" value={signed(comparison.volumeDelta, "kg", 0)} delta={comparison.volumeDelta} />
                      </>
                    ) : (
                      <Row
                        label="Repetições da melhor série"
                        value={signed(comparison.last.topReps - comparison.previous.topReps, "reps", 0)}
                        delta={comparison.last.topReps - comparison.previous.topReps}
                      />
                    )}
                    <p className="pt-1 text-xs text-muted-foreground">
                      Volume é a soma de carga × repetições das séries concluídas. Não mede força isoladamente.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Registre mais uma sessão deste exercício para comparar.</p>
                )}
              </Surface>
            </section>

            <section className="space-y-3">
              <SectionTitle>Sessões recentes</SectionTitle>
              <Surface className="divide-y divide-border/70 overflow-hidden">
                {[...history]
                  .reverse()
                  .slice(0, 8)
                  .map((h) => (
                    <div key={h.sessionId} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{formatDayRelative(h.date, today)}</p>
                        {!bodyweight ? (
                          <p className="text-sm text-muted-foreground tabular-nums">volume {formatVolume(h.volume)}</p>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">{summarizeSets(h.sets)}</p>
                    </div>
                  ))}
              </Surface>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, delta }: { label: string; value: string; delta: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          delta > 0 && "text-success-ink",
          delta < 0 && "text-danger-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export const ExerciseDetailScreen = withStoreGate(ExerciseDetailScreenContent);
