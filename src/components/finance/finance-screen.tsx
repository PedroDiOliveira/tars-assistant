"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, Sparkles, Wallet } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { withStoreGate } from "@/components/layout/store-gate";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { HueDot } from "@/components/shared/hue-bubble";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Surface } from "@/components/shared/surface";
import { filterTransactions, groupByDay } from "@/domain/finance";
import { formatBRL, formatBRLCompact, formatSignedBRL } from "@/domain/money";
import type { TxProposal } from "@/domain/quick-entry";
import { financeSummary, type CategoryRow } from "@/domain/summary";
import { useData, useToday } from "@/data";
import { addMonths, monthOf, type MonthKey } from "@/lib/dates";
import { formatDayRelative, formatMonthLabel, formatMonthName } from "@/lib/format";
import { AiTextSheet } from "./ai-text-sheet";
import { EMPTY_FILTERS, FiltersSheet, countActiveFilters, type Filters } from "./filters-sheet";
import { TransactionRow } from "./transaction-row";
import { TransactionSheet, type TxSheetState } from "./transaction-sheet";

/** Quantas categorias e quantos dias aparecem antes do "mostrar mais". */
const TOP_CATEGORIES = 4;
const DAYS_STEP = 6;

function FinanceScreenContent() {
  const data = useData();
  const today = useToday();
  const thisMonth = monthOf(today);

  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [allCategories, setAllCategories] = useState(false);
  const [visibleDays, setVisibleDays] = useState(DAYS_STEP);

  const [txOpen, setTxOpen] = useState(false);
  const [txState, setTxState] = useState<TxSheetState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState<GoalTarget | null>(null);

  const summary = useMemo(() => financeSummary(data, month), [data, month]);
  const groups = useMemo(
    () =>
      groupByDay(
        filterTransactions(
          data.transactions,
          { month, type: filters.type, categoryId: filters.categoryId, query: filters.query },
          data.categories,
        ),
      ),
    [data.transactions, data.categories, month, filters],
  );
  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const activeFilters = countActiveFilters(filters);
  const isCurrentMonth = month === thisMonth;
  const negative = summary.resultCents < 0;
  const savingsMet = summary.savingsTarget !== null && summary.resultCents >= summary.savingsTarget;
  const rows = allCategories ? summary.rows : summary.rows.slice(0, TOP_CATEGORIES);

  function openTx(next: TxSheetState) {
    setTxState(next);
    setTxOpen(true);
  }

  function openGoal(target: GoalTarget) {
    setGoalTarget(target);
    setGoalOpen(true);
  }

  function editBudget(row: CategoryRow) {
    openGoal({
      kind: "category_budget",
      scopeId: row.categoryId,
      title: `Limite mensal · ${row.category?.name ?? "Categoria"}`,
      current: row.budget,
    });
  }

  return (
    <div data-module="finance" className="space-y-6 px-4">
      {/* Mês */}
      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft aria-hidden />
        </Button>
        <h1 className="text-lg font-semibold" aria-live="polite">
          {formatMonthLabel(month)}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximo mês"
          disabled={isCurrentMonth}
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      {/* Destaque do mês */}
      <Surface className="p-5">
        <p className="text-sm font-medium text-muted-foreground">Resultado do mês</p>
        <p
          className={cn(
            "mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums",
            negative && "text-danger-ink",
          )}
        >
          {formatBRL(summary.resultCents)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          {formatBRLCompact(summary.incomeCents)} recebidos · {formatBRLCompact(summary.expenseCents)} gastos
        </p>

        <div className="mt-4 border-t pt-4">
          {summary.savingsTarget ? (
            <button
              type="button"
              className="w-full space-y-2 text-left"
              onClick={() =>
                openGoal({
                  kind: "savings",
                  scopeId: null,
                  title: "Meta de economia mensal",
                  current: summary.savingsTarget,
                })
              }
            >
              <ProgressBar
                className="h-1.5"
                ratio={summary.savingsRatio}
                tone={negative ? "over" : "ok"}
                label="Progresso da meta de economia do mês"
              />
              <p className="text-sm text-muted-foreground">
                {savingsMet
                  ? `Meta de ${formatBRLCompact(summary.savingsTarget)} batida`
                  : `Faltam ${formatBRL(summary.savingsTarget - summary.resultCents)} da meta de ${formatBRLCompact(summary.savingsTarget)}`}
              </p>
            </button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => openGoal({ kind: "savings", scopeId: null, title: "Meta de economia mensal", current: null })}
            >
              Definir meta de economia
            </Button>
          )}
        </div>
      </Surface>

      {/* Ações */}
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" onClick={() => openTx({ mode: "create" })}>
          <Plus aria-hidden /> Lançamento
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setAiOpen(true)}>
          <Sparkles aria-hidden /> Por texto
        </Button>
      </div>

      {/* Categorias */}
      {summary.rows.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-base font-semibold">Onde foi o dinheiro</h2>
          <Surface className="divide-y divide-border/60 overflow-hidden">
            {rows.map((row) => {
              const name = row.category?.name ?? "Sem categoria";
              return (
                <button
                  key={row.categoryId}
                  type="button"
                  onClick={() => editBudget(row)}
                  className="block w-full px-4 py-3 text-left transition active:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <HueDot hue={row.category?.hue ?? 150} />
                      <span className="truncate font-medium">{name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatBRL(row.cents)}</span>
                  </div>
                  <ProgressBar
                    className="mt-2 h-1.5"
                    ratio={row.budget ? row.budgetRatio : row.share}
                    tone={row.tone}
                    label={row.budget ? `${name}: gasto em relação ao limite` : `${name}: participação nas despesas`}
                  />
                  <p
                    className={cn(
                      "mt-1.5 text-xs text-muted-foreground",
                      row.tone === "warn" && "text-warning-ink",
                      row.tone === "over" && "text-danger-ink",
                    )}
                  >
                    {row.budget
                      ? `limite ${formatBRLCompact(row.budget)}${row.tone === "over" ? ` · ${formatBRL(row.cents - row.budget)} acima` : ""}`
                      : `${Math.round(row.share * 100)}% das despesas · definir limite`}
                  </p>
                </button>
              );
            })}
          </Surface>
          {summary.rows.length > TOP_CATEGORIES ? (
            <Button variant="ghost" className="w-full" onClick={() => setAllCategories((v) => !v)}>
              {allCategories ? "Mostrar menos" : `Ver todas (${summary.rows.length})`}
            </Button>
          ) : null}
        </section>
      ) : null}

      {/* Lançamentos */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-base font-semibold">Lançamentos</h2>
          <Button variant="ghost" size="sm" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal aria-hidden />
            {activeFilters > 0 ? `Filtros (${activeFilters})` : "Filtrar"}
          </Button>
        </div>

        {groups.length > 0 ? (
          <div className="space-y-4">
            {groups.slice(0, visibleDays).map((group) => (
              <div key={group.date}>
                <div className="flex items-center justify-between px-2 pb-1 text-sm">
                  <p className="font-medium text-muted-foreground">{formatDayRelative(group.date, today)}</p>
                  <p className="text-muted-foreground tabular-nums">{formatSignedBRL(group.netCents)}</p>
                </div>
                <Surface className="p-1">
                  {group.items.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      transaction={tx}
                      category={categoryById.get(tx.categoryId)}
                      onSelect={(t) => openTx({ mode: "edit", transaction: t })}
                    />
                  ))}
                </Surface>
              </div>
            ))}
            {groups.length > visibleDays ? (
              <Button variant="ghost" className="w-full" onClick={() => setVisibleDays((v) => v + DAYS_STEP)}>
                Mostrar mais
              </Button>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={Wallet}
            title={activeFilters > 0 ? "Nada encontrado" : `Sem lançamentos em ${formatMonthName(month).toLowerCase()}`}
            description={
              activeFilters > 0 ? "Ajuste os filtros para ver mais." : "Registre um gasto para acompanhar o mês."
            }
            action={
              activeFilters > 0 ? (
                <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Limpar filtros
                </Button>
              ) : (
                <Button onClick={() => openTx({ mode: "create" })}>
                  <Plus aria-hidden /> Novo lançamento
                </Button>
              )
            }
          />
        )}
      </section>

      <TransactionSheet open={txOpen} state={txState} onOpenChange={setTxOpen} />
      <AiTextSheet
        open={aiOpen}
        onOpenChange={setAiOpen}
        onProposal={(proposal: TxProposal) => openTx({ mode: "confirm", initial: proposal })}
      />
      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={setFilters}
        categories={data.categories}
      />
      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
    </div>
  );
}

export const FinanceScreen = withStoreGate(FinanceScreenContent);
