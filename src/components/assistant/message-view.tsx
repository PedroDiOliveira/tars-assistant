import { Button } from "@/components/ui/button";
import { MessageCards } from "./cards/card-group";
import type { Message } from "./chat-store";
import { ProposalCard } from "./proposal-card";
import { ReplyText } from "./reply-text";

export const messageDomId = (id: string) => `msg-${id}`;

interface MessageViewProps {
  message: Message;
  today: string;
  /** nome da categoria da proposta (se houver) */
  categoryName: string;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onManual: () => void;
}

/** Pergunta do usuário em bolha; resposta do assistente como texto corrido (sem bolha), com a proposta logo abaixo. */
export function MessageView({ message, today, categoryName, onConfirm, onEdit, onCancel, onManual }: MessageViewProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[0.95rem] text-primary-foreground">
          <p className="whitespace-pre-line">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      id={messageDomId(message.id)}
      className="scroll-mt-16 space-y-3 text-[0.95rem] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <ReplyText text={message.text} />
      {message.cards?.length ? (
        <MessageCards cards={message.cards} />
      ) : message.period ? (
        // Os cards já trazem o período; sem eles, o texto diz qual foi consultado.
        <p className="text-xs text-muted-foreground">Período: {message.period}</p>
      ) : null}
      {message.failed ? (
        <Button variant="secondary" onClick={onManual}>
          Lançar manualmente
        </Button>
      ) : null}
      {message.proposal ? (
        <ProposalCard
          proposal={message.proposal.value}
          status={message.proposal.status}
          today={today}
          categoryName={categoryName}
          onConfirm={onConfirm}
          onEdit={onEdit}
          onCancel={onCancel}
        />
      ) : null}
    </div>
  );
}

/** Espera pela resposta: duas linhas de esqueleto; o aviso falado fica só para leitores de tela. */
export function ThinkingSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-2 pt-1">
      <span className="sr-only">Calculando…</span>
      <div aria-hidden className="h-3.5 w-3/4 animate-pulse rounded-md bg-muted" />
      <div aria-hidden className="h-3.5 w-1/2 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
