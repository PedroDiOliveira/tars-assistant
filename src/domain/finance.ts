import { monthOf, type DateKey, type MonthKey } from "@/lib/dates";
import type { Category, Transaction, TxType } from "./types";

export interface MonthSummary {
  incomeCents: number;
  expenseCents: number;
  /** receitas − despesas. Não é saldo bancário; déficit aparece como negativo. */
  resultCents: number;
  count: number;
}

export function transactionsInMonth(txs: Transaction[], month: MonthKey): Transaction[] {
  return txs.filter((t) => monthOf(t.occurredOn) === month);
}

export function monthSummary(txs: Transaction[], month: MonthKey): MonthSummary {
  let incomeCents = 0;
  let expenseCents = 0;
  let count = 0;
  for (const t of txs) {
    if (monthOf(t.occurredOn) !== month) continue;
    count += 1;
    if (t.type === "income") incomeCents += t.amountCents;
    else expenseCents += t.amountCents;
  }
  return { incomeCents, expenseCents, resultCents: incomeCents - expenseCents, count };
}

export interface CategorySpend {
  categoryId: string;
  cents: number;
  count: number;
}

/** Despesas do mês por categoria, da maior para a menor. */
export function expensesByCategory(txs: Transaction[], month: MonthKey): CategorySpend[] {
  const map = new Map<string, CategorySpend>();
  for (const t of txs) {
    if (t.type !== "expense" || monthOf(t.occurredOn) !== month) continue;
    const entry = map.get(t.categoryId) ?? { categoryId: t.categoryId, cents: 0, count: 0 };
    entry.cents += t.amountCents;
    entry.count += 1;
    map.set(t.categoryId, entry);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

export interface TxFilter {
  month: MonthKey;
  type?: TxType | "all";
  categoryId?: string | "all";
  query?: string;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterTransactions(
  txs: Transaction[],
  filter: TxFilter,
  categories: Category[] = [],
): Transaction[] {
  const query = filter.query ? normalize(filter.query.trim()) : "";
  const catName = new Map(categories.map((c) => [c.id, normalize(c.name)]));
  return txs
    .filter((t) => monthOf(t.occurredOn) === filter.month)
    .filter((t) => !filter.type || filter.type === "all" || t.type === filter.type)
    .filter(
      (t) => !filter.categoryId || filter.categoryId === "all" || t.categoryId === filter.categoryId,
    )
    .filter(
      (t) =>
        query === "" ||
        normalize(t.description).includes(query) ||
        (catName.get(t.categoryId) ?? "").includes(query),
    )
    .sort(compareTransactionsDesc);
}

export function compareTransactionsDesc(a: Transaction, b: Transaction): number {
  if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export interface DayGroup {
  date: DateKey;
  items: Transaction[];
  /** saldo do dia (receitas − despesas) */
  netCents: number;
}

export function groupByDay(txs: Transaction[]): DayGroup[] {
  const groups = new Map<DateKey, DayGroup>();
  for (const t of txs) {
    const group = groups.get(t.occurredOn) ?? { date: t.occurredOn, items: [], netCents: 0 };
    group.items.push(t);
    group.netCents += t.type === "income" ? t.amountCents : -t.amountCents;
    groups.set(t.occurredOn, group);
  }
  return [...groups.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Categorias ATIVAS ordenadas por uso recente (mais usadas nas últimas transações primeiro). `keepId` mantém visível
 * a categoria já escolhida ao editar um lançamento antigo, mesmo que ela tenha sido arquivada depois.
 */
export function categoriesByRecentUse(
  categories: Category[],
  txs: Transaction[],
  type: TxType,
  recentLimit = 60,
  keepId?: string,
): Category[] {
  const recent = [...txs].sort(compareTransactionsDesc).slice(0, recentLimit);
  const score = new Map<string, number>();
  for (const t of recent) {
    if (t.type === type) score.set(t.categoryId, (score.get(t.categoryId) ?? 0) + 1);
  }
  return categories
    .filter((c) => c.type === type && (!c.archived || c.id === keepId))
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0));
}
