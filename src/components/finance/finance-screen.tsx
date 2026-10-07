"use client";

import { useMemo, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import { CheckCircle2, ChevronLeft, ChevronRight, Pencil, Plus, Search, Sparkles, Wallet } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GoalSheet, type GoalTarget } from "@/components/goals/goal-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { PageTitle } from "@/components/shared/page-title";
import { ProgressBar } from "@/components/shared/progress-bar";
import { Segmented } from "@/components/shared/segmented";
import { SectionTitle } from "@/components/shared/section-title";
import { Surface } from "@/components/shared/surface";
import { filterTransactions, groupByDay } from "@/domain/finance";
import { formatBRL, formatBRLCompact, formatSignedBRL } from "@/domain/money";
import { progressPercent } from "@/domain/progress";
import type { TxProposal } from "@/domain/quick-entry";
import { financeSummary, type CategoryRow } from "@/domain/summary";
import type { TxType } from "@/domain/types";
import { useData, useToday } from "@/data";
import { addMonths, monthOf, type MonthKey } from "@/lib/dates";
import { formatDayRelative, formatMonthLabel, formatMonthName, pluralize } from "@/lib/format";
import { AiTextSheet } from "./ai-text-sheet";
import { CategoryBreakdown } from "./category-breakdown";
import { TransactionRow } from "./transaction-row";
import { TransactionSheet, type TxSheetState } from "./transaction-sheet";

type TypeFilter = TxType | "all";

function FinanceScreenContent() {
  const data = useData();
  const today = useToday();
  const thisMonth = monthOf(today);

  const [month, setMonth] = useState<MonthKey>(thisMonth);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [txOpen, setTxOpen] = useState(false);
  const [txState, setTxState] = useState<TxSheetState | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState<GoalTarget | null>(null);

  const summary = useMemo(() => financeSummary(data, month), [data, month]);
  const groups = useMemo(
    () =>
      groupByDay(
        filterTransactions(
          data.transactions,
          { month, type: typeFilter, categoryId: categoryFilter, query },
          data.categories,
        ),
      ),
    [data.transactions, data.categories, month, typeFilter, categoryFilter, query],
  );
  const categoryById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const filtered = typeFilter !== "all" || categoryFilter !== "all" || query.trim() !== "";
  const isCurrentMonth = month === thisMonth;
  const negative = summary.resultCents < 0;

  function openTx(next: TxSheetState) {
    setTxState(next);
    setTxOpen(true);
  }

  function openGoal(target: GoalTarget) {
    setGoalTarget(target);
    setGoalOpen(true);
  }

  function onProposal(proposal: TxProposal) {
    openTx({ mode: "confirm", initial: proposal });
  }

  function editBudget(row: CategoryRow) {
    openGoal({
      kind: "category_budget",
      scopeId: row.categoryId,
      title: `Limite mensal · ${row.category?.name ?? "Categoria"}`,
      current: row.budget,
    });
  }

  const savingsPercent = progressPercent(summary.resultCents, summary.savingsTarget);
  const goalMet = summary.savingsTarget !== null && summary.resultCents >= summary.savingsTarget;

  return (
    <div data-module="finance" className="pb-24">
      <PageTitle
        title="Finanças"
        action={
          <Button variant="secondary" onClick={() => setAiOpen(true)}>
            <Sparkles aria-hidden /> Por texto
          </Button>
        }
      />

      <div className="space-y-6 px-4">
        {/* Seletor de mês */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <p className="text-base font-semibold" aria-live="polite">
            {formatMonthLabel(month)}
          </p>
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

        {/* Resumo do mês */}
        <Surface className="p-4">
          <p className="text-sm font-medium text-muted-foreground">Resultado do mês</p>
          <p
            className={cn(
              "mt-1 text-4xl font-bold tracking-tight tabular-nums",
              negative ? "text-danger-ink" : "text-foreground",
            )}
          >
            {formatBRL(summary.resultCents)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Receitas − despesas lançadas em {formatMonthName(month).toLowerCase()}. Não é saldo bancário.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success-soft p-3">
              <p className="text-xs font-medium text-success-ink">Receitas</p>
              <p className="mt-0.5 text-lg font-semibold text-success-ink tabular-nums">
                {formatBRL(summary.incomeCents)}
              </p>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">Despesas</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatBRL(summary.expenseCents)}</p>
            </div>
          </div>

          <div className="mt-4 border-t pt-4">
            {summary.savingsTarget ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Meta de economia</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {formatBRL(summary.resultCents)} de {formatBRLCompact(summary.savingsTarget)}
                      {savingsPercent !== null ? ` · ${savingsPercent}%` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Editar meta de economia"
                    onClick={() =>
                      openGoal({
                        kind: "savings",
                        scopeId: null,
                        title: "Meta de economia mensal",
                        current: summary.savingsTarget,
                      })
                    }
                  >
                    <Pencil aria-hidden />
                  </Button>
                </div>
                <ProgressBar
                  ratio={summary.savingsRatio}
                  label="Progresso da meta de economia do mês"
                  tone={negative ? "over" : "ok"}
                />
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {goalMet ? (
                    <>
                      <CheckCircle2 className="size-4 text-success-ink" aria-hidden /> Meta batida neste mês
                    </>
                  ) : (
                    `Faltam ${formatBRL((summary.savingsTarget ?? 0) - summary.resultCents)} para a meta`
                  )}
                </p>
              </div>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() =>
                  openGoal({
                    kind: "savings",
                    scopeId: null,
                    title: "Meta de economia mensal",
                    current: null,
                  })
                }
              >
                Definir meta de economia
              </Button>
            )}
          </div>
        </Surface>

        {/* Despesas por categoria */}
        <section className="space-y-3">
          <SectionTitle hint="Toque numa categoria para definir o limite do mês">
            Despesas por categoria
          </SectionTitle>
          {summary.rows.length > 0 ? (
            <CategoryBreakdown rows={summary.rows} onSelect={editBudget} />
          ) : (
            <EmptyState
              icon={Wallet}
              title={`Sem despesas em ${formatMonthName(month).toLowerCase()}`}
              description="Registre um gasto para ver para onde o dinheiro está indo."
              action={
                <Button onClick={() => openTx({ mode: "create" })}>
                  <Plus aria-hidden /> Novo lançamento
                </Button>
              }
            />
          )}
        </section>

        {/* Lançamentos */}
        <section className="space-y-3">
          <SectionTitle
            hint={`${summary.count} ${pluralize(summary.count, "lançamento", "lançamentos")} no mês`}
          >
            Lançamentos
          </SectionTitle>

          <Surface className="space-y-3 p-3">
            <Segmented<TypeFilter>
              ariaLabel="Filtrar por tipo"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "income", label: "Receitas" },
                { value: "expense", label: "Despesas" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full" aria-label="Filtrar por categoria">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {data.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.name === "Outros" ? (c.type === "income" ? " (receita)" : " (despesa)") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar"
                  aria-label="Buscar pela descrição"
                  className="pl-9"
                />
              </div>
            </div>
          </Surface>

          {groups.length > 0 ? (
            <div className="space-y-4">
              {groups.map((group) => (
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
            </div>
          ) : (
            <EmptyState
              icon={filtered ? Search : Wallet}
              title={filtered ? "Nada encontrado com esses filtros" : "Nenhum lançamento neste mês"}
              description={
                filtered
                  ? "Ajuste o tipo, a categoria ou a busca."
                  : "Comece registrando uma despesa ou receita. Leva poucos segundos."
              }
              action={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTypeFilter("all");
                      setCategoryFilter("all");
                      setQuery("");
                    }}
                  >
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
      </div>

      {/* Ação primária do módulo */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30">
        <div className="mx-auto flex max-w-md justify-end px-4">
          <Button
            size="lg"
            className="pointer-events-auto h-14 rounded-full px-6 shadow-lg shadow-primary/25"
            onClick={() => openTx({ mode: "create" })}
          >
            <Plus aria-hidden /> Lançamento
          </Button>
        </div>
      </div>

      <TransactionSheet open={txOpen} state={txState} onOpenChange={setTxOpen} />
      <AiTextSheet open={aiOpen} onOpenChange={setAiOpen} onProposal={onProposal} />
      <GoalSheet open={goalOpen} onOpenChange={setGoalOpen} target={goalTarget} />
    </div>
  );
}

export const FinanceScreen = withStoreGate(FinanceScreenContent);
