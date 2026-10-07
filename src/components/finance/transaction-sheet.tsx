"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Info, Star, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Segmented } from "@/components/shared/segmented";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { categoriesByRecentUse } from "@/domain/finance";
import { centsFromDigits, formatBRL } from "@/domain/money";
import type { Transaction, TxType } from "@/domain/types";
import { useActions, useData, useTemplates, useToday } from "@/data";
import { addDays, isValidDateKey, type DateKey } from "@/lib/dates";
import { categoryIcon } from "@/lib/icons";
import { notify } from "@/components/shared/notify";

export type TxDraft = Partial<Omit<Transaction, "id" | "source">>;

export interface TxSheetState {
  /** create = novo; edit = alterar um existente; confirm = proposta do assistente (nada salvo ainda) */
  mode: "create" | "edit" | "confirm";
  transaction?: Transaction;
  initial?: TxDraft;
  /** chamada depois que o lançamento é salvo (ex.: marcar a proposta do assistente como confirmada) */
  onSaved?: () => void;
}

interface TransactionSheetProps {
  open: boolean;
  state: TxSheetState | null;
  onOpenChange: (open: boolean) => void;
}

const TITLES: Record<TxSheetState["mode"], string> = {
  create: "Novo lançamento",
  edit: "Editar lançamento",
  confirm: "Confirmar lançamento",
};

export function TransactionSheet({ open, state, onOpenChange }: TransactionSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={state ? TITLES[state.mode] : "Lançamento"}
      description={state?.mode === "confirm" ? "Revise os campos. Nada foi salvo ainda." : undefined}
      module="finance"
    >
      {state ? <TransactionForm state={state} onDone={() => onOpenChange(false)} /> : null}
    </Sheet>
  );
}

function TransactionForm({ state, onDone }: { state: TxSheetState; onDone: () => void }) {
  const data = useData();
  const templates = useTemplates();
  const today = useToday();
  const { addTransaction, updateTransaction, deleteTransaction, addTemplate } = useActions();

  const seed: TxDraft = state.transaction ?? state.initial ?? {};
  const [type, setType] = useState<TxType>(seed.type ?? "expense");
  const [cents, setCents] = useState<number>(seed.amountCents ?? 0);
  const [categoryId, setCategoryId] = useState<string>(
    () =>
      seed.categoryId ??
      categoriesByRecentUse(data.categories, data.transactions, seed.type ?? "expense", 60, state.transaction?.categoryId)[0]?.id ??
      "",
  );
  const [description, setDescription] = useState<string>(seed.description ?? "");
  const [date, setDate] = useState<DateKey>(seed.occurredOn ?? today);
  const [saveFavorite, setSaveFavorite] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Trava contra toque duplo: um lançamento por confirmação.
  const submitted = useRef(false);

  const categories = useMemo(
    () => categoriesByRecentUse(data.categories, data.transactions, type, 60, state.transaction?.categoryId),
    [data.categories, data.transactions, type, state.transaction?.categoryId],
  );
  const yesterday = addDays(today, -1);
  const isEdit = state.mode === "edit" && state.transaction;
  const valid = cents > 0 && categoryId !== "" && isValidDateKey(date);
  const categoryName = data.categories.find((c) => c.id === categoryId)?.name ?? "";

  function changeType(next: TxType) {
    setType(next);
    setCategoryId(categoriesByRecentUse(data.categories, data.transactions, next, 60, state.transaction?.categoryId)[0]?.id ?? "");
  }

  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setType(tpl.type);
    setCents(tpl.amountCents);
    setCategoryId(tpl.categoryId);
    setDescription(tpl.label);
  }

  async function save() {
    if (submitted.current || !valid) return;
    submitted.current = true;
    const payload = {
      type,
      amountCents: cents,
      categoryId,
      description: description.trim(),
      occurredOn: date,
    };
    if (isEdit && state.transaction) {
      if (!notify(await updateTransaction(state.transaction.id, payload), "Lançamento atualizado")) {
        submitted.current = false;
        return;
      }
    } else {
      const created = await addTransaction({ ...payload, source: state.mode === "confirm" ? "ai" : "manual" });
      if (!notify(created)) {
        submitted.current = false;
        return;
      }
      // O lançamento já está salvo; falhar só o atalho não deve desfazê-lo nem travar a tela.
      const favoriteSaved =
        saveFavorite &&
        notify(
          await addTemplate({
            label: payload.description || categoryName,
            type,
            amountCents: cents,
            categoryId,
          }),
        );
      toast.success(
        `${type === "income" ? "Receita" : "Despesa"} de ${formatBRL(cents)} salva${favoriteSaved ? " e adicionada aos atalhos" : ""}`,
      );
    }
    state.onSaved?.();
    onDone();
  }

  async function duplicateToday() {
    const original = state.transaction;
    if (!original) return;
    const result = await addTransaction({
      type: original.type,
      amountCents: original.amountCents,
      categoryId: original.categoryId,
      description: original.description,
      occurredOn: today,
    });
    if (notify(result, "Lançamento repetido para hoje")) onDone();
  }

  async function remove() {
    if (!state.transaction) return;
    if (notify(await deleteTransaction(state.transaction.id), "Lançamento excluído")) onDone();
  }

  return (
    <div className="space-y-5">
      {state.mode === "confirm" ? (
        <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Proposta gerada pela simulação local do assistente. Confira valor, data e categoria.</p>
        </div>
      ) : null}

      {state.mode === "create" && templates.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Star className="size-4" aria-hidden /> Atalhos
          </p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t.id)}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border bg-card px-3.5 text-sm font-medium transition active:bg-muted"
              >
                {t.label}
                <span className="text-muted-foreground tabular-nums">{formatBRL(t.amountCents)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Segmented
        ariaLabel="Tipo de lançamento"
        value={type}
        onChange={changeType}
        options={[
          { value: "expense", label: "Despesa" },
          { value: "income", label: "Receita" },
        ]}
      />

      <div className="rounded-2xl bg-m-soft px-4 py-3">
        <label htmlFor="tx-amount" className="text-xs font-medium text-m-ink">
          Valor
        </label>
        <input
          id="tx-amount"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={state.mode === "create"}
          value={formatBRL(cents)}
          onChange={(e) => setCents(centsFromDigits(e.target.value))}
          className={cn(
            "w-full bg-transparent text-center text-4xl font-semibold tabular-nums outline-none",
            type === "income" ? "text-success-ink" : "text-foreground",
          )}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Categoria</p>
        <div role="radiogroup" aria-label="Categoria" className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon);
            const active = c.id === categoryId;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition",
                  active ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Data</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Hoje", value: today },
            { label: "Ontem", value: yesterday },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={date === option.value}
              onClick={() => setDate(option.value)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium transition",
                date === option.value ? "border-transparent bg-primary text-primary-foreground" : "bg-card active:bg-muted",
              )}
            >
              {option.label}
            </button>
          ))}
          <Input
            type="date"
            aria-label="Outra data"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-auto min-w-40 flex-1 rounded-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="tx-description" className="text-sm font-medium">
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <Input
          id="tx-description"
          value={description}
          maxLength={80}
          placeholder="Ex.: Almoço com a equipe"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {state.mode === "create" ? (
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-muted/60 px-3.5">
          <span className="text-sm font-medium">Salvar como atalho</span>
          <Switch checked={saveFavorite} onCheckedChange={setSaveFavorite} />
        </label>
      ) : null}

      <SheetFooter>
        <Button size="lg" disabled={!valid} onClick={save}>
          {state.mode === "confirm" ? "Confirmar lançamento" : isEdit ? "Salvar alterações" : "Salvar lançamento"}
        </Button>
        {isEdit ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={duplicateToday}>
              <Copy aria-hidden /> Repetir hoje
            </Button>
            <Button variant="destructive" size="lg" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden /> Excluir
            </Button>
          </div>
        ) : null}
      </SheetFooter>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir este lançamento?"
        description="Os totais do mês serão recalculados."
        confirmLabel="Excluir"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
