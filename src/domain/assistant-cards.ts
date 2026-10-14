import { z } from "zod";
import { WEEK_LABELS } from "@/lib/constants";
import {
  addDays,
  daysBetween,
  inPeriod,
  isValidDateKey,
  monthPeriod,
  weekdayIndex,
  weekStart,
  type DateKey,
  type MonthKey,
  type Period,
} from "@/lib/dates";
import {
  formatDayMonth,
  formatDayShort,
  formatMinutes,
  formatMinutesCompact,
  formatMonthLabel,
  pluralize,
} from "@/lib/format";
import type { ModuleKey } from "@/lib/modules";
import { formatBRL } from "./money";
import { progressRatio, type ProgressTone } from "./progress";
import { bookProgress, pagesInPeriod } from "./reading";
import { formatDistance, formatKm, runsInPeriod, runTotals } from "./running";
import { runningWeekText } from "./running-text";
import { targetFor } from "./goals";
import { financeSummary, type DataSnapshot } from "./summary";
import { sessionsInPeriod as workoutSessionsInPeriod } from "./workouts";

/**
 * Cards do assistente. O servidor NÃO manda números: manda só uma REFERÊNCIA ao cálculo que a ferramenta já fez
 * (`CardRef`, ~80 bytes). Quem monta o card é o cliente, com os dados que ele já tem e as mesmas funções de domínio
 * das telas. Assim o card nunca passa pelo modelo (zero token), o servidor não envia nomes de categorias, matérias
 * ou livros, e demo e versão real usam o mesmo código.
 */

/** Mesmo teto das ferramentas (`tools.ts`): o que o modelo pode pedir já é limitado a isto. */
export const MAX_RANGE_DAYS = 366;
/** Quantas referências o cliente aceita ler de uma resposta (há um card por tipo, então 5 é o teto real). */
const MAX_RAW_REFS = 10;
const MAX_CATEGORY_ROWS = 6;
const MAX_SUBJECT_ROWS = 6;
const MAX_BOOK_ROWS = 5;
const MAX_WEEK_BARS = 6;

export type FinanceRef = { kind: "finance_month"; month: MonthKey };
export type RangeRef = { kind: "workout_range" | "running_range" | "reading_range"; from: DateKey; to: DateKey };
export type StudyRef = { kind: "study_range"; from: DateKey; to: DateKey; subjectId?: string };
export type CardRef = FinanceRef | RangeRef | StudyRef;
export type CardKind = CardRef["kind"];

/** Ordem fixa dos cards na tela: a de sempre no app, não a ordem em que o modelo chamou as ferramentas. */
const KIND_ORDER: readonly CardKind[] = ["finance_month", "workout_range", "running_range", "study_range", "reading_range"];

const dateKey = z.string().refine((value) => isValidDateKey(value), { error: "Data inválida." });
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido." });

export const cardRefSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("finance_month"), month: monthKey }),
    z.strictObject({ kind: z.literal("workout_range"), from: dateKey, to: dateKey }),
    z.strictObject({ kind: z.literal("running_range"), from: dateKey, to: dateKey }),
    z.strictObject({ kind: z.literal("reading_range"), from: dateKey, to: dateKey }),
    z.strictObject({
      kind: z.literal("study_range"),
      from: dateKey,
      to: dateKey,
      subjectId: z.string().min(1).max(64).optional(),
    }),
  ])
  .refine((ref) => ref.kind === "finance_month" || (ref.from <= ref.to && daysBetween(ref.from, ref.to) + 1 <= MAX_RANGE_DAYS), {
    error: "Período inválido.",
  });

export function refPeriod(ref: CardRef): Period {
  return ref.kind === "finance_month" ? monthPeriod(ref.month) : { start: ref.from, end: ref.to };
}

function spanDays(ref: CardRef): number {
  const period = refPeriod(ref);
  return daysBetween(period.start, period.end) + 1;
}

/**
 * Acrescenta uma referência: no máximo UMA por tipo (se o modelo consultou dois períodos, vence o maior; empate
 * fica com o primeiro), na ordem fixa dos módulos.
 */
export function addCardRef(refs: readonly CardRef[], ref: CardRef): CardRef[] {
  const existing = refs.find((r) => r.kind === ref.kind);
  const keep = existing && spanDays(existing) >= spanDays(ref) ? existing : ref;
  return [...refs.filter((r) => r.kind !== ref.kind), keep].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** Lê as referências de uma resposta do servidor. Tolerante: o que for inválido é descartado e o texto continua valendo. */
export function parseCardRefs(raw: unknown): CardRef[] {
  if (!Array.isArray(raw)) return [];
  let refs: CardRef[] = [];
  for (const item of raw.slice(0, MAX_RAW_REFS)) {
    const parsed = cardRefSchema.safeParse(item);
    if (parsed.success) refs = addCardRef(refs, parsed.data);
  }
  return refs;
}

/* ---------- períodos (compartilhados com as ferramentas, para o texto e o card nunca divergirem) ---------- */

export function periodLabel(p: Period): string {
  return p.start === p.end ? formatDayShort(p.start) : `${formatDayShort(p.start)} a ${formatDayShort(p.end)}`;
}

/** Semanas (segunda a domingo) que o período toca, da mais antiga para a mais recente. */
export function weekBuckets(p: Period): Period[] {
  const weeks: Period[] = [];
  for (let day = weekStart(p.start); day <= p.end; day = addDays(day, 7)) weeks.push({ start: day, end: addDays(day, 6) });
  return weeks;
}

/** O período é exatamente uma semana de segunda a domingo? Só então a meta semanal faz sentido. */
function isWeek(p: Period): boolean {
  return p.start === weekStart(p.start) && p.end === addDays(p.start, 6);
}

/* ---------- o card ---------- */

export interface CardRow {
  key: string;
  label: string;
  hue?: number;
  valueText: string;
  note: string | null;
  /** 0..1 */
  ratio: number;
  tone: ProgressTone;
  /** descrição da barra para leitores de tela */
  barLabel: string;
  /** a linha que a pergunta citou (ex.: a categoria perguntada) */
  focused?: boolean;
}

export interface CardBar {
  label: string;
  value: number;
  display: string;
  highlight?: boolean;
  future?: boolean;
}

export interface CardSeries {
  items: CardBar[];
  /** descrição falada de todas as barras */
  summary: string;
  note: string | null;
}

export interface AssistantCard {
  /** único por card (tipo + período); serve de `key` no React */
  id: string;
  kind: CardKind;
  module: ModuleKey;
  periodLabel: string;
  headline: { value: string; unit: string | null; notes: string[] };
  progress: { ratio: number; tone: ProgressTone; label: string; caption: string } | null;
  series: CardSeries | null;
  rowsTitle: string | null;
  rows: CardRow[];
  /** linhas que existem mas não coube mostrar */
  hiddenRows: number;
}

export interface CardContext {
  today: DateKey;
  /** a pergunta do usuário: decide qual linha ganha destaque (o foco é do cliente, não do modelo) */
  question?: string;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

interface Dated {
  date: DateKey;
  value: number;
}

interface SeriesFormat {
  /** "Treinos" */
  title: string;
  /** texto sobre a barra, curto */
  short: (value: number) => string;
  /** texto falado */
  long: (value: number) => string;
  note?: string;
}

/**
 * Barras do período: por dia quando cabe numa semana (2 a 7 dias), senão por semana (as últimas 6). Um período de um
 * dia só não tem série. Os valores sempre aparecem em texto (nas barras e na descrição falada).
 */
function buildSeries(period: Period, entries: Dated[], today: DateKey, format: SeriesFormat): CardSeries | null {
  const span = daysBetween(period.start, period.end) + 1;
  if (span < 2) return null;
  const sum = (range: Period) => entries.filter((e) => inPeriod(e.date, range)).reduce((total, e) => total + e.value, 0);

  if (span <= 7) {
    const items: CardBar[] = Array.from({ length: span }, (_, i) => {
      const day = addDays(period.start, i);
      const value = sum({ start: day, end: day });
      return { label: WEEK_LABELS[weekdayIndex(day)], value, display: format.short(value), highlight: day === today, future: day > today };
    });
    return {
      items,
      summary: `${format.title} por dia: ${items.map((item) => `${item.label} ${format.long(item.value)}`).join(", ")}`,
      note: format.note ?? null,
    };
  }

  const buckets = weekBuckets(period);
  const shown = buckets.slice(-MAX_WEEK_BARS);
  const items: CardBar[] = shown.map((week) => {
    const value = sum({ start: week.start < period.start ? period.start : week.start, end: week.end > period.end ? period.end : week.end });
    return {
      label: formatDayMonth(week.start),
      value,
      display: format.short(value),
      highlight: today >= week.start && today <= week.end,
      future: week.start > today,
    };
  });
  const notes = ["Por semana, a partir da segunda", format.note, buckets.length > shown.length ? `últimas ${shown.length} de ${buckets.length} semanas` : null];
  return {
    items,
    summary: `${format.title} por semana: ${items.map((item) => `semana de ${item.label} ${format.long(item.value)}`).join(", ")}`,
    note: notes.filter(Boolean).join(" · "),
  };
}

/* ---------- um builder por tipo ---------- */

function financeCard(data: DataSnapshot, ref: FinanceRef, ctx: CardContext): AssistantCard | null {
  const summary = financeSummary(data, ref.month);
  if (summary.count === 0) return null;

  const question = ctx.question ? normalize(ctx.question) : "";
  const isFocused = (name: string | undefined) => Boolean(name) && normalize(name ?? "").length >= 3 && question.includes(normalize(name ?? ""));

  const withSpend = summary.rows.filter((row) => row.cents > 0);
  const shown = withSpend.slice(0, MAX_CATEGORY_ROWS);
  // A categoria que a pergunta citou entra sempre, mesmo fora do topo.
  const focus = withSpend.find((row) => isFocused(row.category?.name));
  if (focus && !shown.includes(focus)) shown[shown.length - 1] = focus;
  shown.sort((a, b) => b.cents - a.cents);

  const rows: CardRow[] = shown.map((row) => {
    const name = row.category?.name ?? "Sem categoria";
    const percent = Math.round(row.share * 100);
    return {
      key: row.categoryId,
      label: name,
      hue: row.category?.hue,
      valueText: formatBRL(row.cents),
      note: row.budget ? `de ${formatBRL(row.budget)} de orçamento` : `${percent}% das despesas`,
      ratio: row.budget ? row.budgetRatio : row.share,
      tone: row.tone,
      barLabel: row.budget ? `${name}: ${formatBRL(row.cents)} de ${formatBRL(row.budget)} de orçamento` : `${name}: ${percent}% das despesas`,
      focused: row === focus,
    };
  });

  return {
    id: `${ref.kind}:${ref.month}`,
    kind: ref.kind,
    module: "finance",
    periodLabel: formatMonthLabel(ref.month),
    headline: {
      value: formatBRL(summary.expenseCents),
      unit: "em despesas",
      notes: [`Receitas ${formatBRL(summary.incomeCents)}`, `Resultado do mês ${formatBRL(summary.resultCents)}`],
    },
    progress: summary.savingsTarget
      ? {
          ratio: summary.savingsRatio,
          tone: "ok",
          label: "Meta de economia do mês",
          caption: `Resultado de ${formatBRL(summary.resultCents)} para a meta de economia de ${formatBRL(summary.savingsTarget)}`,
        }
      : null,
    series: null,
    rowsTitle: rows.length > 0 ? "Despesas por categoria" : null,
    rows,
    hiddenRows: withSpend.length - rows.length,
  };
}

function workoutCard(data: DataSnapshot, ref: RangeRef, ctx: CardContext): AssistantCard | null {
  const period = refPeriod(ref);
  const sessions = workoutSessionsInPeriod(data.sessions, period);
  if (sessions.length === 0) return null;
  const done = sessions.length;
  const target = isWeek(period) ? targetFor(data.goals, "workout_sessions", null, period.start) : null;

  return {
    id: `${ref.kind}:${period.start}_${period.end}`,
    kind: ref.kind,
    module: "workout",
    periodLabel: periodLabel(period),
    headline: { value: String(done), unit: pluralize(done, "treino", "treinos"), notes: [] },
    progress: target
      ? {
          ratio: progressRatio(done, target),
          tone: "ok",
          label: "Meta semanal de musculação",
          caption: `${done} de ${target} ${pluralize(target, "treino", "treinos")} na semana`,
        }
      : null,
    series: buildSeries(period, sessions.map((s) => ({ date: s.occurredOn, value: 1 })), ctx.today, {
      title: "Treinos",
      short: String,
      long: (v) => `${v} ${pluralize(v, "treino", "treinos")}`,
    }),
    rowsTitle: null,
    rows: [],
    hiddenRows: 0,
  };
}

function runningCard(data: DataSnapshot, ref: RangeRef, ctx: CardContext): AssistantCard | null {
  const period = refPeriod(ref);
  const runs = runsInPeriod(data.runningSessions, period);
  if (runs.length === 0) return null;
  const totals = runTotals(runs);
  const targetMeters = isWeek(period) ? targetFor(data.goals, "running_meters", null, period.start) : null;
  const remainingMeters = targetMeters ? Math.max(0, targetMeters - totals.distanceMeters) : 0;
  // A mesma redação da tela e da Home: distância informada e distância desconhecida nunca se misturam.
  const text = runningWeekText({ ...totals, targetMeters, remainingMeters });

  // Sem nenhuma distância preenchida o total de km é desconhecido (não zero): as barras contam corridas.
  const byDistance = totals.hasDistance;
  const entries: Dated[] = runs.map((r) => ({ date: r.occurredOn, value: byDistance ? (r.distanceMeters ?? 0) : 1 }));

  return {
    id: `${ref.kind}:${period.start}_${period.end}`,
    kind: ref.kind,
    module: "running",
    periodLabel: periodLabel(period),
    headline: {
      value: text.value,
      unit: text.unit,
      notes: [text.countsLine, text.missingLine, text.showProgress ? null : text.goalLine].filter((n): n is string => Boolean(n)),
    },
    progress:
      text.showProgress && targetMeters
        ? {
            ratio: progressRatio(totals.distanceMeters, targetMeters),
            tone: "ok",
            label: "Meta semanal de corrida",
            caption: text.goalLine ?? "",
          }
        : null,
    series: buildSeries(
      period,
      entries,
      ctx.today,
      byDistance
        ? {
            title: "Distância",
            short: (v) => formatKm(v),
            // Dia sem corrida E dia com corrida sem distância valem 0 aqui: dizer "0 km" seria afirmar uma distância.
            long: (v) => (v > 0 ? formatDistance(v) : "sem distância informada"),
            note: "distância em km",
          }
        : { title: "Corridas", short: String, long: (v) => `${v} ${pluralize(v, "corrida", "corridas")}` },
    ),
    rowsTitle: null,
    rows: [],
    hiddenRows: 0,
  };
}

function studyCard(data: DataSnapshot, ref: StudyRef, ctx: CardContext): AssistantCard | null {
  const period = refPeriod(ref);
  const subject = ref.subjectId ? data.subjects.find((s) => s.id === ref.subjectId) : undefined;
  if (ref.subjectId && !subject) return null;
  // Como na ferramenta: só contam sessões de matérias que existem.
  const known = new Set(data.subjects.map((s) => s.id));
  const sessions = data.studySessions.filter(
    (s) => inPeriod(s.occurredOn, period) && (subject ? s.subjectId === subject.id : known.has(s.subjectId)),
  );
  if (sessions.length === 0) return null;

  const seconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  const minutes = seconds / 60;
  const aligned = isWeek(period);
  const target = aligned ? targetFor(data.goals, "study_minutes", subject?.id ?? null, period.start) : null;

  const rows: CardRow[] = [];
  let hiddenRows = 0;
  if (!subject) {
    const bySubject = data.subjects
      .map((s) => ({ s, secs: sessions.filter((x) => x.subjectId === s.id).reduce((sum, x) => sum + x.durationSeconds, 0) }))
      .filter((row) => row.secs > 0)
      .sort((a, b) => b.secs - a.secs);
    for (const { s, secs } of bySubject.slice(0, MAX_SUBJECT_ROWS)) {
      const subjectTarget = aligned ? targetFor(data.goals, "study_minutes", s.id, period.start) : null;
      const share = seconds > 0 ? secs / seconds : 0;
      const time = formatMinutes(secs / 60);
      rows.push({
        key: s.id,
        label: s.name,
        hue: s.hue,
        valueText: time,
        note: subjectTarget ? `meta de ${formatMinutes(subjectTarget)}` : `${Math.round(share * 100)}% do tempo`,
        ratio: subjectTarget ? progressRatio(secs / 60, subjectTarget) : share,
        tone: "ok",
        barLabel: subjectTarget
          ? `${s.name}: ${time} de ${formatMinutes(subjectTarget)} de meta`
          : `${s.name}: ${Math.round(share * 100)}% do tempo`,
      });
    }
    hiddenRows = bySubject.length - rows.length;
  }

  return {
    id: `${ref.kind}:${period.start}_${period.end}${subject ? `:${subject.id}` : ""}`,
    kind: ref.kind,
    module: "study",
    periodLabel: periodLabel(period),
    headline: {
      value: formatMinutes(minutes),
      unit: null,
      notes: [subject?.name ?? null, `${sessions.length} ${pluralize(sessions.length, "sessão", "sessões")} de estudo`].filter((n): n is string => Boolean(n)),
    },
    progress: target
      ? {
          ratio: progressRatio(minutes, target),
          tone: "ok",
          label: `Meta semanal de estudo${subject ? ` de ${subject.name}` : ""}`,
          caption: `${formatMinutes(minutes)} de ${formatMinutes(target)} na semana`,
        }
      : null,
    series: buildSeries(period, sessions.map((s) => ({ date: s.occurredOn, value: s.durationSeconds })), ctx.today, {
      title: "Tempo de estudo",
      short: (v) => formatMinutesCompact(v / 60),
      long: (v) => formatMinutes(v / 60),
    }),
    rowsTitle: rows.length > 0 ? "Por matéria" : null,
    rows,
    hiddenRows,
  };
}

function readingCard(data: DataSnapshot, ref: RangeRef, ctx: CardContext): AssistantCard | null {
  const period = refPeriod(ref);
  const sessions = data.readingSessions.filter((s) => inPeriod(s.occurredOn, period));
  if (sessions.length === 0) return null;
  const pages = pagesInPeriod(sessions, period);
  const target = isWeek(period) ? targetFor(data.goals, "reading_pages", null, period.start) : null;

  const byBook = data.books
    .map((book) => ({ book, pages: pagesInPeriod(sessions, period, book.id) }))
    .filter((row) => row.pages > 0)
    .sort((a, b) => b.pages - a.pages);
  const rows: CardRow[] = byBook.slice(0, MAX_BOOK_ROWS).map(({ book, pages: bookPages }) => {
    const progress = bookProgress(book, data.readingSessions);
    const where = `página ${progress.current} de ${progress.total}`;
    return {
      key: book.id,
      label: book.title,
      valueText: `${bookPages} ${pluralize(bookPages, "página", "páginas")}`,
      note: where,
      ratio: progress.ratio,
      tone: "ok",
      barLabel: `${book.title}: ${where}`,
    };
  });

  return {
    id: `${ref.kind}:${period.start}_${period.end}`,
    kind: ref.kind,
    module: "reading",
    periodLabel: periodLabel(period),
    headline: {
      value: String(pages),
      unit: pluralize(pages, "página", "páginas"),
      notes: [`${sessions.length} ${pluralize(sessions.length, "sessão", "sessões")} de leitura`],
    },
    progress: target
      ? {
          ratio: progressRatio(pages, target),
          tone: "ok",
          label: "Meta semanal de leitura",
          caption: `${pages} de ${target} ${pluralize(target, "página", "páginas")} na semana`,
        }
      : null,
    series: buildSeries(period, sessions.map((s) => ({ date: s.occurredOn, value: pagesInPeriod([s], period) })), ctx.today, {
      title: "Páginas",
      short: String,
      long: (v) => `${v} ${pluralize(v, "página", "páginas")}`,
    }),
    rowsTitle: rows.length > 0 ? "Por livro" : null,
    rows,
    hiddenRows: byBook.length - rows.length,
  };
}

/** Monta o card de uma referência. `null` = nada a mostrar (sem registros no período): o texto basta. */
export function buildCard(data: DataSnapshot, ref: CardRef, ctx: CardContext): AssistantCard | null {
  switch (ref.kind) {
    case "finance_month":
      return financeCard(data, ref, ctx);
    case "workout_range":
      return workoutCard(data, ref, ctx);
    case "running_range":
      return runningCard(data, ref, ctx);
    case "study_range":
      return studyCard(data, ref, ctx);
    case "reading_range":
      return readingCard(data, ref, ctx);
  }
}

export function buildCards(data: DataSnapshot, refs: readonly CardRef[], ctx: CardContext): AssistantCard[] {
  return refs.map((ref) => buildCard(data, ref, ctx)).filter((card): card is AssistantCard => card !== null);
}
