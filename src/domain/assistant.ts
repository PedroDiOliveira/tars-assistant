import {
  addDays,
  addMonths,
  monthOf,
  monthPeriod,
  weekPeriod,
  weekStart,
  type DateKey,
} from "@/lib/dates";
import {
  formatDayShort,
  formatMinutes,
  formatMonthLabel,
  pluralize,
} from "@/lib/format";
import { expensesByCategory, monthSummary } from "./finance";
import { formatBRL } from "./money";
import { pagesInPeriod } from "./reading";
import { secondsInPeriod } from "./studies";
import { readingWeekSummary, workoutSummary, type DataSnapshot } from "./summary";
import { sessionsInPeriod } from "./workouts";

export interface AssistantReply {
  text: string;
  /** período efetivamente consultado, sempre informado */
  period?: string;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function weekLabel(today: DateKey): string {
  const p = weekPeriod(today);
  return `semana de ${formatDayShort(p.start)} a ${formatDayShort(p.end)}`;
}

function wantsPastMonth(q: string): boolean {
  return /mes passado|ultimo mes|mes anterior/.test(q);
}

/**
 * Responde às perguntas-modelo da spec calculando com as mesmas funções das telas.
 * É uma simulação local: na fase de IA, o modelo só escolhe a função e explica o resultado.
 */
export function answerQuestion(question: string, data: DataSnapshot, today: DateKey): AssistantReply {
  const q = normalize(question);

  if (/quanto gastei/.test(q)) {
    const month = wantsPastMonth(q) ? addMonths(monthOf(today), -1) : monthOf(today);
    const period = formatMonthLabel(month);
    const category = data.categories.find(
      (c) => c.type === "expense" && q.includes(normalize(c.name)),
    );
    const spend = expensesByCategory(data.transactions, month);
    if (category) {
      const entry = spend.find((s) => s.categoryId === category.id);
      if (!entry) {
        return { text: `Não há despesas de ${category.name} lançadas em ${period}.`, period };
      }
      return {
        text: `Você gastou ${formatBRL(entry.cents)} com ${category.name} em ${period} (${entry.count} ${pluralize(entry.count, "lançamento", "lançamentos")}).`,
        period,
      };
    }
    const summary = monthSummary(data.transactions, month);
    if (summary.count === 0) return { text: `Não há lançamentos em ${period}.`, period };
    return {
      text: `Em ${period} você gastou ${formatBRL(summary.expenseCents)} no total. Maior categoria: ${
        data.categories.find((c) => c.id === spend[0]?.categoryId)?.name ?? "—"
      } (${formatBRL(spend[0]?.cents ?? 0)}).`,
      period,
    };
  }

  if (/como foi (a )?minha semana|resumo da semana/.test(q)) {
    const period = weekLabel(today);
    const wk = weekPeriod(today);
    const workout = workoutSummary(data, today);
    const studied = secondsInPeriod(data.studySessions, wk);
    const read = pagesInPeriod(data.readingSessions, wk);
    const spent = data.transactions
      .filter((t) => t.type === "expense" && t.occurredOn >= wk.start && t.occurredOn <= wk.end)
      .reduce((s, t) => s + t.amountCents, 0);
    const lines = [
      workout.target
        ? `Treino: ${workout.done} de ${workout.target} ${pluralize(workout.target, "treino", "treinos")}.`
        : `Treino: ${workout.done} ${pluralize(workout.done, "treino", "treinos")} (sem meta definida).`,
      `Estudo: ${formatMinutes(studied / 60)} registrados.`,
      `Leitura: ${read} ${pluralize(read, "página", "páginas")}.`,
      `Gastos: ${formatBRL(spent)}.`,
    ];
    return { text: `Sua ${period}:\n${lines.join("\n")}`, period };
  }

  if (/quantas vezes treinei/.test(q)) {
    const end = today;
    const start = addDays(weekStart(today), -21); // 4 semanas, contando a atual
    const total = sessionsInPeriod(data.sessions, { start, end }).length;
    const weeks = [0, 1, 2, 3].map((i) => {
      const ws = addDays(weekStart(today), -7 * i);
      return sessionsInPeriod(data.sessions, weekPeriod(ws)).length;
    });
    const period = `últimas 4 semanas (${formatDayShort(start)} a ${formatDayShort(end)})`;
    if (total === 0) return { text: `Não há treinos registrados nas ${period}.`, period };
    return {
      text: `Você treinou ${total} ${pluralize(total, "vez", "vezes")} nas ${period}. Da mais recente para a mais antiga: ${weeks.join(", ")}.`,
      period,
    };
  }

  if (/quanto estudei/.test(q)) {
    const subject = data.subjects.find((s) => q.includes(normalize(s.name)));
    const weekly = /semana/.test(q);
    const month = wantsPastMonth(q) ? addMonths(monthOf(today), -1) : monthOf(today);
    const period = weekly ? weekLabel(today) : formatMonthLabel(month);
    const range = weekly ? weekPeriod(today) : monthPeriod(month);
    const sessions = data.studySessions.filter(
      (s) => s.occurredOn >= range.start && s.occurredOn <= range.end && (!subject || s.subjectId === subject.id),
    );
    const label = subject ? subject.name : "todas as matérias";
    if (sessions.length === 0) {
      return { text: `Não há sessões de estudo registradas de ${label} (${period}).`, period };
    }
    const seconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
    return {
      text: `Você estudou ${formatMinutes(seconds / 60)} de ${label} (${period}), em ${sessions.length} ${pluralize(sessions.length, "sessão", "sessões")}.`,
      period,
    };
  }

  if (/qual materia.*(menos|menor)/.test(q)) {
    const period = weekLabel(today);
    const wk = weekPeriod(today);
    if (data.subjects.length === 0) return { text: "Você ainda não cadastrou matérias.", period };
    const rows = data.subjects
      .map((s) => ({ s, seconds: secondsInPeriod(data.studySessions, wk, s.id) }))
      .sort((a, b) => a.seconds - b.seconds);
    const least = rows[0];
    return {
      text:
        least.seconds === 0
          ? `${least.s.name} ainda não tem nenhum estudo registrado nesta semana.`
          : `${least.s.name} é a matéria com menos tempo nesta semana: ${formatMinutes(least.seconds / 60)}.`,
      period,
    };
  }

  if (/quantas paginas|quanto li/.test(q)) {
    const reading = readingWeekSummary(data, today);
    const period = weekLabel(today);
    return {
      text: `Você leu ${reading.pages} ${pluralize(reading.pages, "página", "páginas")} nesta semana${reading.target ? ` (meta ${reading.target})` : ""}.`,
      period,
    };
  }

  return {
    text:
      "Ainda não sei responder isso nesta simulação. Tente uma das perguntas sugeridas ou descreva um gasto, como “Gastei 42 reais no Outback ontem”.",
  };
}
