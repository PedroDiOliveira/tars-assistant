import { z } from "zod";
import { expensesByCategory } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import { pagesInPeriod } from "@/domain/reading";
import type { AppData } from "@/domain/snapshot";
import { secondsBySubject } from "@/domain/studies";
import { financeSummary } from "@/domain/summary";
import type { TxProposal } from "@/domain/quick-entry";
import type { TxType } from "@/domain/types";
import { sessionsInPeriod } from "@/domain/workouts";
import { addDays, daysBetween, isValidDateKey, monthPeriod, weekStart, type DateKey, type Period } from "@/lib/dates";
import { formatDayShort, formatMinutes, formatMonthLabel } from "@/lib/format";
import type { ToolDefinition } from "./provider";

/**
 * Ferramentas do assistente. Duas regras de segurança:
 *  1. NENHUMA escreve nos dados. `propose_transaction` só PROPÕE; quem salva é o usuário, ao confirmar na tela.
 *  2. Os números vêm das MESMAS funções do domínio que alimentam as telas: a resposta do assistente é, por
 *     construção, a que o app mostra. O modelo só escolhe a ferramenta e redige o texto.
 *
 * Argumentos vêm do modelo e podem estar errados: todos são validados com Zod, e um erro volta ao modelo como
 * resultado da ferramenta (para ele corrigir), nunca como exceção.
 */

export interface ToolContext {
  data: AppData;
  today: DateKey;
}

export type TransactionProposal = Omit<TxProposal, "id">;

export type ToolOutcome =
  | { kind: "result"; payload: unknown }
  | { kind: "proposal"; proposal: TransactionProposal }
  | { kind: "error"; message: string };

const MAX_RANGE_DAYS = 366;
const dateKey = z.string().refine((v) => isValidDateKey(v), { error: "Data inválida: use YYYY-MM-DD." });
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Mês inválido: use YYYY-MM." });

const range = z.strictObject({ from: dateKey, to: dateKey });

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Período consultado, validado: ordem correta e no máximo 366 dias (limita o tamanho do que o modelo pode pedir). */
function checkRange(input: { from: DateKey; to: DateKey }): { period: Period } | { error: string } {
  if (input.from > input.to) return { error: "O início do período é depois do fim." };
  if (daysBetween(input.from, input.to) + 1 > MAX_RANGE_DAYS) return { error: `Período longo demais: no máximo ${MAX_RANGE_DAYS} dias.` };
  return { period: { start: input.from, end: input.to } };
}

const periodLabel = (p: Period) => (p.start === p.end ? formatDayShort(p.start) : `${formatDayShort(p.start)} a ${formatDayShort(p.end)}`);

/* ---------- propose_transaction ---------- */

const proposeArgs = z.strictObject({
  type: z.enum(["income", "expense"]),
  amount_brl: z.number().positive({ error: "O valor deve ser maior que zero." }).max(99_999_999.99, { error: "Valor alto demais." }),
  description: z.string().trim().max(200).default(""),
  date: dateKey.optional(),
  category_name: z.string().trim().max(40).optional(),
});

/** Categoria por nome entre as ATIVAS do tipo; se o nome não bate, "Outros"; nunca um id vindo do modelo. */
function resolveCategory(data: AppData, type: TxType, name: string | undefined): string | null {
  const usable = data.categories.filter((c) => c.type === type && !c.archived);
  const wanted = name ? normalize(name) : "";
  const byName = wanted ? usable.find((c) => normalize(c.name) === wanted) : undefined;
  const fallback = usable.find((c) => normalize(c.name) === "outros");
  return (byName ?? fallback ?? usable[0])?.id ?? null;
}

function propose(args: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = proposeArgs.safeParse(args);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Argumentos inválidos." };
  const { type, amount_brl, description, date, category_name } = parsed.data;

  const amountCents = Math.round(amount_brl * 100);
  if (amountCents < 1) return { kind: "error", message: "O valor deve ser de pelo menos R$ 0,01." };

  const occurredOn = date ?? ctx.today;
  if (occurredOn > ctx.today) return { kind: "error", message: "A data não pode ser no futuro. Use hoje ou uma data passada." };
  if (occurredOn < "2000-01-01") return { kind: "error", message: "Data antiga demais." };

  const categoryId = resolveCategory(ctx.data, type, category_name);
  if (!categoryId) return { kind: "error", message: "Não há categoria disponível para esse tipo de lançamento." };

  return { kind: "proposal", proposal: { type, amountCents, description, occurredOn, categoryId } };
}

/* ---------- resumos (somente leitura) ---------- */

function financialSummary(args: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = z.strictObject({ month: monthKey }).safeParse(args);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Argumentos inválidos." };
  const { month } = parsed.data;
  const summary = financeSummary(ctx.data, month);
  const names = new Map(ctx.data.categories.map((c) => [c.id, c.name]));
  const spend = expensesByCategory(ctx.data.transactions, month);
  return {
    kind: "result",
    payload: {
      period: { month, label: formatMonthLabel(month), from: monthPeriod(month).start, to: monthPeriod(month).end },
      hasRecords: summary.count > 0,
      transactionCount: summary.count,
      incomeText: formatBRL(summary.incomeCents),
      expenseText: formatBRL(summary.expenseCents),
      resultText: formatBRL(summary.resultCents),
      note: "Resultado do mês = receitas − despesas lançadas. Não é saldo bancário.",
      savingsGoalText: summary.savingsTarget ? formatBRL(summary.savingsTarget) : null,
      topExpenseCategories: spend.slice(0, 8).map((row) => {
        const budget = summary.rows.find((r) => r.categoryId === row.categoryId)?.budget ?? null;
        return {
          name: names.get(row.categoryId) ?? "Sem categoria",
          spentText: formatBRL(row.cents),
          entries: row.count,
          budgetText: budget ? formatBRL(budget) : null,
        };
      }),
    },
  };
}

function workoutSummary(args: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = range.safeParse(args);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Argumentos inválidos." };
  const checked = checkRange(parsed.data);
  if ("error" in checked) return { kind: "error", message: checked.error };
  const { period } = checked;

  const sessions = sessionsInPeriod(ctx.data.sessions, period);
  // por semana (segunda a domingo), da mais antiga para a mais recente
  const weeks: { weekStarting: DateKey; sessions: number }[] = [];
  for (let day = weekStart(period.start); day <= period.end; day = addDays(day, 7)) {
    const week = { start: day, end: addDays(day, 6) };
    weeks.push({ weekStarting: day, sessions: sessionsInPeriod(sessions, week).length });
  }
  return {
    kind: "result",
    payload: {
      period: { from: period.start, to: period.end, label: periodLabel(period) },
      hasRecords: sessions.length > 0,
      sessionsCompleted: sessions.length,
      byWeek: weeks.slice(-53),
      note: "Só treinos finalizados contam.",
    },
  };
}

function studySummary(args: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = range.extend({ subject_name: z.string().trim().max(40).optional() }).safeParse(args);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Argumentos inválidos." };
  const { subject_name, ...rest } = parsed.data;
  const checked = checkRange(rest);
  if ("error" in checked) return { kind: "error", message: checked.error };
  const { period } = checked;

  let subjects = ctx.data.subjects;
  if (subject_name) {
    const wanted = normalize(subject_name);
    subjects = subjects.filter((s) => normalize(s.name) === wanted);
    if (subjects.length === 0) return { kind: "error", message: `Não existe a matéria "${subject_name}".` };
  }
  const seconds = secondsBySubject(ctx.data.studySessions, period, subjects.map((s) => s.id));
  const rows = subjects.map((s) => ({ name: s.name, seconds: seconds.get(s.id) ?? 0 }));
  const total = rows.reduce((sum, r) => sum + r.seconds, 0);
  const sessionCount = ctx.data.studySessions.filter(
    (x) => x.occurredOn >= period.start && x.occurredOn <= period.end && subjects.some((s) => s.id === x.subjectId),
  ).length;
  return {
    kind: "result",
    payload: {
      period: { from: period.start, to: period.end, label: periodLabel(period) },
      hasRecords: sessionCount > 0,
      sessionCount,
      totalText: formatMinutes(total / 60),
      bySubject: rows.sort((a, b) => b.seconds - a.seconds).map((r) => ({ name: r.name, timeText: formatMinutes(r.seconds / 60) })),
    },
  };
}

function readingSummary(args: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = range.safeParse(args);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Argumentos inválidos." };
  const checked = checkRange(parsed.data);
  if ("error" in checked) return { kind: "error", message: checked.error };
  const { period } = checked;

  const inRange = ctx.data.readingSessions.filter((s) => s.occurredOn >= period.start && s.occurredOn <= period.end);
  const byBook = ctx.data.books
    .map((book) => ({ title: book.title, pages: pagesInPeriod(inRange, period, book.id) }))
    .filter((b) => b.pages > 0)
    .sort((a, b) => b.pages - a.pages);
  return {
    kind: "result",
    payload: {
      period: { from: period.start, to: period.end, label: periodLabel(period) },
      hasRecords: inRange.length > 0,
      sessionCount: inRange.length,
      pagesRead: pagesInPeriod(inRange, period),
      byBook,
      note: "Páginas lidas = página final − página inicial de cada sessão. A página em que o livro foi cadastrado não conta.",
    },
  };
}

/* ---------- registro ---------- */

const RANGE_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "string", description: "Primeiro dia do período, YYYY-MM-DD." },
    to: { type: "string", description: "Último dia do período (inclusive), YYYY-MM-DD." },
  },
  required: ["from", "to"],
  additionalProperties: false,
} as const;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "propose_transaction",
    description:
      "PROPÕE um lançamento financeiro (gasto ou receita) para o usuário confirmar. NÃO salva nada. Use somente quando a mensagem descrever um único lançamento com valor. Se faltar o valor, não chame: pergunte.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"], description: "income = receita, expense = despesa." },
        amount_brl: { type: "number", description: "Valor em reais (ex.: 42 ou 18.5). Sempre positivo." },
        description: { type: "string", description: "Estabelecimento ou descrição curta. Não invente: deixe vazio se não foi dito." },
        date: { type: "string", description: "Data do lançamento, YYYY-MM-DD. Omita para hoje. Resolva 'ontem', 'anteontem', 'dia 5' a partir da data de hoje." },
        category_name: { type: "string", description: "Nome da categoria que melhor combina (ex.: Alimentação, Transporte, Salário). Omita se incerto." },
      },
      required: ["type", "amount_brl"],
      additionalProperties: false,
    },
  },
  {
    name: "get_financial_summary",
    description: "Resumo financeiro de UM mês: receitas, despesas, resultado, meta de economia e maiores categorias de despesa.",
    parameters: {
      type: "object",
      properties: { month: { type: "string", description: "Mês no formato YYYY-MM." } },
      required: ["month"],
      additionalProperties: false,
    },
  },
  {
    name: "get_workout_summary",
    description: "Treinos concluídos num período, no total e por semana.",
    parameters: RANGE_SCHEMA,
  },
  {
    name: "get_study_summary",
    description: "Tempo estudado num período, no total e por matéria. Opcionalmente filtra uma matéria pelo nome.",
    parameters: {
      type: "object",
      properties: { ...RANGE_SCHEMA.properties, subject_name: { type: "string", description: "Nome da matéria (opcional)." } },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "get_reading_summary",
    description: "Páginas lidas num período, no total e por livro.",
    parameters: RANGE_SCHEMA,
  },
];

const EXECUTORS: Record<string, (args: unknown, ctx: ToolContext) => ToolOutcome> = {
  propose_transaction: propose,
  get_financial_summary: financialSummary,
  get_workout_summary: workoutSummary,
  get_study_summary: studySummary,
  get_reading_summary: readingSummary,
};

/** Executa uma chamada de ferramenta do modelo. Nome desconhecido ou JSON quebrado voltam como erro, não exceção. */
export function runTool(name: string, rawArguments: string, ctx: ToolContext): ToolOutcome {
  const execute = Object.hasOwn(EXECUTORS, name) ? EXECUTORS[name] : undefined;
  if (!execute) return { kind: "error", message: `Ferramenta desconhecida: ${name}.` };
  let args: unknown;
  try {
    args = rawArguments.trim() === "" ? {} : JSON.parse(rawArguments);
  } catch {
    return { kind: "error", message: "Os argumentos não são um JSON válido." };
  }
  return execute(args, ctx);
}
