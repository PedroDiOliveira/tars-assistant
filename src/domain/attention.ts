import { daysLeftInWeek, monthOf, weekdayIndex, type DateKey } from "@/lib/dates";
import { formatMinutes, pluralize } from "@/lib/format";
import { formatBRLCompact, formatSignedBRL } from "./money";
import { progressPercent } from "./progress";
import {
  financeSummary,
  readingWeekSummary,
  studyWeekSummary,
  workoutSummary,
  type DataSnapshot,
} from "./summary";

export type AttentionTone = "danger" | "warn" | "info" | "success";
export type AttentionModule = "finance" | "workout" | "study" | "reading";

export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  module: AttentionModule;
  text: string;
  href: string;
}

const TONE_ORDER: Record<AttentionTone, number> = { danger: 0, warn: 1, info: 2, success: 3 };

/**
 * "O que merece atenção nesta semana", só com regras de ritmo e limites.
 * Determinístico, sem IA, e cada frase informa o período a que se refere.
 */
export function buildAttention(data: DataSnapshot, today: DateKey, max = 4): AttentionItem[] {
  const items: AttentionItem[] = [];
  const daysLeft = daysLeftInWeek(today);
  const dayLabel = `${daysLeft} ${pluralize(daysLeft, "dia", "dias")}`;

  // Treino
  const workout = workoutSummary(data, today);
  if (workout.target) {
    if (workout.remaining === 0) {
      items.push({
        id: "workout-met",
        tone: "success",
        module: "workout",
        text: `Meta de treino batida: ${workout.done} de ${workout.target} nesta semana.`,
        href: "/treino",
      });
    } else {
      const tone: AttentionTone =
        workout.remaining > daysLeft ? "danger" : workout.remaining === daysLeft ? "warn" : "info";
      items.push({
        id: "workout-pace",
        tone,
        module: "workout",
        text: `Faltam ${workout.remaining} ${pluralize(workout.remaining, "treino", "treinos")} para a meta e ${dayLabel} até domingo.`,
        href: "/treino",
      });
    }
  }

  // Finanças: orçamento e resultado
  const finance = financeSummary(data, monthOf(today));
  for (const row of finance.rows) {
    if (!row.budget || row.tone === "ok") continue;
    const name = row.category?.name ?? "Categoria";
    const percent = progressPercent(row.cents, row.budget);
    items.push({
      id: `budget-${row.categoryId}`,
      tone: row.tone === "over" ? "danger" : "warn",
      module: "finance",
      text:
        row.tone === "over"
          ? `${name} passou do orçamento do mês: ${formatBRLCompact(row.cents)} de ${formatBRLCompact(row.budget)}.`
          : `${name} em ${percent}% do orçamento do mês (${formatBRLCompact(row.cents)} de ${formatBRLCompact(row.budget)}).`,
      href: "/financas",
    });
  }
  if (finance.count > 0 && finance.resultCents < 0) {
    items.push({
      id: "result-negative",
      tone: "danger",
      module: "finance",
      text: `Resultado do mês negativo: ${formatSignedBRL(finance.resultCents)}.`,
      href: "/financas",
    });
  }

  // Estudos
  const study = studyWeekSummary(data, today);
  if (study.targetMinutes) {
    const remainingMin = Math.max(0, study.targetMinutes - study.seconds / 60);
    if (remainingMin > 0 && daysLeft <= 2) {
      items.push({
        id: "study-pace",
        tone: "warn",
        module: "study",
        text: `Faltam ${formatMinutes(remainingMin)} para a meta de estudo da semana e ${dayLabel}.`,
        href: "/estudos",
      });
    }
  }
  if (weekdayIndex(today) >= 2) {
    const neglected = study.bySubject
      .filter((s) => s.targetMinutes && s.seconds === 0)
      .slice(0, 1);
    for (const s of neglected) {
      items.push({
        id: `subject-${s.subject.id}`,
        tone: "info",
        module: "study",
        text: `${s.subject.name}: nenhum estudo registrado nesta semana (meta ${formatMinutes(s.targetMinutes ?? 0)}).`,
        href: "/estudos",
      });
    }
  }

  // Leitura
  const reading = readingWeekSummary(data, today);
  if (reading.target && reading.book && reading.pages === 0 && weekdayIndex(today) >= 2) {
    items.push({
      id: "reading-zero",
      tone: "info",
      module: "reading",
      text: `Leitura: nenhuma página registrada nesta semana (meta ${reading.target}).`,
      href: "/estudos/leitura",
    });
  }

  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]).slice(0, max);
}
