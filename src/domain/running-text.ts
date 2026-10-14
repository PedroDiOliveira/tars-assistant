import { pluralize } from "@/lib/format";
import { formatDistance, formatKm } from "./running";
import type { RunningWeekSummary } from "./summary";

/**
 * Como a semana de corrida é DITA. Fica no domínio, junto do resumo, para a tela de Corrida e a Home nunca
 * contarem a mesma semana de jeitos diferentes. Regras de redação:
 *  - Distância sempre é "informada": nunca se apresenta 0 km como total real quando a distância não foi preenchida.
 *  - Corridas e dias com corrida são contagens próprias, independentes da distância.
 */
export interface RunningWeekText {
  /** o número que importa: "12,5 de 20" (com meta), "12,5" (sem meta) ou "3" (só registros sem distância) */
  value: string;
  /** "km", "corrida" ou "corridas" */
  unit: string;
  /** apoio sobre a meta: "Faltam 7,5 km", "Meta da semana batida", "Distância não preenchida"... */
  goalLine: string | null;
  /** "3 corridas · 2 dias com corrida" (ou "Nenhuma corrida registrada") */
  countsLine: string;
  /** "8 km informados · 1 corrida sem distância"; só existe quando falta distância em alguma corrida */
  missingLine: string | null;
  /** a barra mede a distância: só existe com meta E com alguma distância informada */
  showProgress: boolean;
}

export function runningWeekText(week: RunningWeekSummary): RunningWeekText {
  const { runs, activeDays, distanceMeters, runsWithoutDistance, hasDistance, targetMeters, remainingMeters } = week;

  const countsLine =
    runs === 0
      ? "Nenhuma corrida registrada"
      : `${runs} ${pluralize(runs, "corrida", "corridas")} · ${activeDays} ${pluralize(activeDays, "dia com corrida", "dias com corrida")}`;

  const missingLine =
    runsWithoutDistance > 0 && hasDistance
      ? `${formatDistance(distanceMeters)} informados · ${runsWithoutDistance} ${pluralize(runsWithoutDistance, "corrida sem distância", "corridas sem distância")}`
      : null;

  // Só registros sem distância: o total de km é desconhecido, não zero. O destaque são as corridas.
  if (runs > 0 && !hasDistance) {
    return {
      value: String(runs),
      unit: pluralize(runs, "corrida", "corridas"),
      goalLine: targetMeters
        ? `Distância não preenchida · meta de ${formatDistance(targetMeters)}`
        : "Distância não preenchida",
      countsLine,
      missingLine: null,
      showProgress: false,
    };
  }

  // Nenhuma corrida: zero é o total real (nada foi registrado).
  if (runs === 0) {
    return {
      value: targetMeters ? `0 de ${formatKm(targetMeters)}` : "0",
      unit: targetMeters ? "km" : "corridas",
      goalLine: targetMeters ? `Faltam ${formatDistance(targetMeters)}` : null,
      countsLine,
      missingLine: null,
      showProgress: targetMeters !== null,
    };
  }

  return {
    value: targetMeters ? `${formatKm(distanceMeters)} de ${formatKm(targetMeters)}` : formatKm(distanceMeters),
    unit: "km",
    goalLine: targetMeters
      ? remainingMeters === 0
        ? "Meta da semana batida"
        : `Faltam ${formatDistance(remainingMeters)}`
      : null,
    countsLine,
    missingLine,
    showProgress: targetMeters !== null,
  };
}
