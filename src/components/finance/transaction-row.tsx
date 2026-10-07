import { cn } from "cn";
import { HueBubble } from "@/components/shared/hue-bubble";
import { formatBRL } from "@/domain/money";
import type { Category, Transaction } from "@/domain/types";
import { categoryIcon } from "@/lib/icons";

interface TransactionRowProps {
  transaction: Transaction;
  category: Category | undefined;
  onSelect: (transaction: Transaction) => void;
}

export function TransactionRow({ transaction, category, onSelect }: TransactionRowProps) {
  const income = transaction.type === "income";
  const title = transaction.description || category?.name || "Lançamento";
  return (
    <button
      type="button"
      onClick={() => onSelect(transaction)}
      className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition active:bg-muted/70"
    >
      <HueBubble hue={category?.hue ?? 240} icon={categoryIcon(category?.icon)} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {category?.name ?? "Sem categoria"}
          {transaction.source === "ai" ? " · via assistente" : ""}
        </p>
      </div>
      <p className={cn("shrink-0 font-semibold tabular-nums", income && "text-success-ink")}>
        {income ? "+" : "−"}
        {formatBRL(transaction.amountCents)}
      </p>
    </button>
  );
}
