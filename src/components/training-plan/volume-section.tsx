"use client";

import { useMemo } from "react";
import { ChartNoAxesColumn, ChevronDown, Info } from "lucide-react";
import { Surface } from "@/components/shared/surface";
import type { PlanProposal } from "@/domain/training-proposal";
import { volumeReport, type VolumeRow } from "@/domain/training-volume";
import type { TrainingProfile } from "@/domain/types";

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

function Row({ row, band, scale }: { row: VolumeRow; band: { low: number; high: number }; scale: number }) {
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  const warn = row.status !== "ok";
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {row.label}
          {row.focus ? (
            <span className="ml-2 rounded-full bg-m-soft px-2 py-0.5 text-xs font-semibold text-m-ink">foco</span>
          ) : row.above ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">acima do normal</span>
          ) : null}
        </span>
        <span className={warn ? "tabular-nums text-warning-ink" : "tabular-nums text-muted-foreground"}>{fmt(row.effective)} séries</span>
      </div>
      {/* A faixa normal fica sombreada; a barra é o que o plano entrega; o traço marca o alvo do foco. */}
      <div aria-hidden className="relative h-2 rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-full bg-m-soft" style={{ left: pct(band.low), width: `calc(${pct(band.high)} - ${pct(band.low)})` }} />
        <div className={warn ? "absolute inset-y-0 left-0 rounded-full bg-warning" : "absolute inset-y-0 left-0 rounded-full bg-primary"} style={{ width: pct(row.effective) }} />
        {row.target !== undefined ? <div className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-foreground/60" style={{ left: pct(row.target) }} /> : null}
      </div>
      <span className="sr-only">
        {row.label}: {fmt(row.effective)} séries por semana, faixa normal de {band.low} a {band.high}
        {row.target !== undefined ? `, alvo do foco ${row.target}` : ""}
        {row.status === "below-floor" ? ", abaixo do mínimo" : ""}.
      </span>
    </li>
  );
}

/**
 * "Volume da semana": o que o plano entrega por músculo contra a faixa do objetivo (só em massa, recolhido por padrão) e
 * os avisos honestos (o que não coube, o que foi limitado e por quê), que ficam sempre à vista. Só lê o plano: sem IA e
 * sem custo. Séries indiretas contam pela metade (o tríceps no supino, o bíceps na remada).
 */
export function VolumeSection({ proposal, profile }: { proposal: PlanProposal; profile: TrainingProfile }) {
  const report = useMemo(() => volumeReport(profile, proposal.skeleton, proposal.choices), [profile, proposal.skeleton, proposal.choices]);
  if (!report.showTable && report.notes.length === 0) return null;
  const scale = report.band.focusMax + 4;
  return (
    <section aria-label="Volume da semana" className="space-y-3">
      {report.notes.length > 0 ? (
        <Surface className="space-y-2 p-4" role="note" aria-label="Avisos sobre o volume">
          {report.notes.map((note) => (
            <p key={note} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-m-ink" aria-hidden />
              <span className="min-w-0 flex-1">{note}</span>
            </p>
          ))}
        </Surface>
      ) : null}
      {report.showTable ? (
        <details className="group/volume rounded-2xl bg-card text-card-foreground ring-1 ring-border/70">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <ChartNoAxesColumn className="size-5 shrink-0 text-m-ink" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Volume da semana</span>
              <span className="block text-sm text-muted-foreground">Séries por músculo, contra a faixa normal do seu nível</span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition group-open/volume:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-3 border-t px-4 pt-3 pb-4">
            <ul className="space-y-3">
              {report.rows.map((row) => (
                <Row key={row.group} row={row} band={report.band} scale={scale} />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              A faixa sombreada é o normal para o seu nível ({report.band.low} a {report.band.high} séries por músculo na semana). Série de um exercício
              que trabalha outro músculo junto conta pela metade. Mais volume não rende na mesma proporção: passado certo ponto, o ganho diminui.
            </p>
          </div>
        </details>
      ) : null}
    </section>
  );
}
