import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/domain/money";
import type { TxProposal } from "@/domain/quick-entry";
import { formatDayRelative } from "@/lib/format";
import type { ProposalStatus } from "./chat-store";

interface ProposalCardProps {
  proposal: TxProposal;
  status: ProposalStatus;
  today: string;
  categoryName: string;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

export function ProposalCard({ proposal, status, today, categoryName, onConfirm, onEdit, onCancel }: ProposalCardProps) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/70 p-3" data-module="finance">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Tipo</dt>
        <dd className="font-medium">{proposal.type === "income" ? "Receita" : "Despesa"}</dd>
        <dt className="text-muted-foreground">Valor</dt>
        <dd className="font-semibold tabular-nums">{formatBRL(proposal.amountCents)}</dd>
        <dt className="text-muted-foreground">Descrição</dt>
        <dd className="font-medium">{proposal.description}</dd>
        <dt className="text-muted-foreground">Data</dt>
        <dd className="font-medium">{formatDayRelative(proposal.occurredOn, today)}</dd>
        <dt className="text-muted-foreground">Categoria</dt>
        <dd className="font-medium">{categoryName}</dd>
      </dl>
      {status === "pending" ? (
        <div className="grid gap-2">
          <Button onClick={onConfirm}>Confirmar lançamento</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn("text-sm font-medium", status === "confirmed" ? "text-success-ink" : "text-muted-foreground")}>
          {status === "confirmed" ? "Lançamento salvo." : "Proposta cancelada. Nada foi salvo."}
        </p>
      )}
    </div>
  );
}
