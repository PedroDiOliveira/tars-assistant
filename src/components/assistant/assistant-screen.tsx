"use client";

import { useEffect, useRef, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import { toast } from "sonner";
import { ArrowUp, Info, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubHeader } from "@/components/layout/sub-header";
import { TransactionSheet, type TxSheetState } from "@/components/finance/transaction-sheet";
import { answerQuestion } from "@/domain/assistant";
import { formatBRL } from "@/domain/money";
import { parseQuickEntry, type TxProposal } from "@/domain/quick-entry";
import { useActions, useData, useToday } from "@/data";
import { formatDayRelative } from "@/lib/format";
import { uid } from "@/lib/id";

type ProposalStatus = "pending" | "confirmed" | "cancelled";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  period?: string;
  proposal?: { value: TxProposal; status: ProposalStatus };
}

const SUGGESTIONS = [
  "Quanto gastei com alimentação este mês?",
  "Como foi minha semana?",
  "Quantas vezes treinei nas últimas quatro semanas?",
  "Quanto estudei SQL neste mês?",
  "Qual matéria teve menos tempo de estudo nesta semana?",
  "Gastei 42 reais no Outback ontem",
];

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  text: "Oi! Posso responder sobre seus números e propor lançamentos de gasto. Experimente uma das sugestões abaixo.",
};

function AssistantScreenContent() {
  const data = useData();
  const today = useToday();
  const { addTransaction } = useActions();

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txState, setTxState] = useState<TxSheetState | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Propostas já confirmadas: garante um único lançamento por proposta, mesmo com toques repetidos.
  const confirmed = useRef(new Set<string>());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  function send(raw: string) {
    const question = raw.trim();
    if (!question || thinking) return;
    setText("");
    setMessages((m) => [...m, { id: uid("m"), role: "user", text: question }]);
    setThinking(true);

    timeout.current = setTimeout(() => {
      const entry = parseQuickEntry(question, today, data.categories);
      let reply: Message;
      if (entry.kind === "proposal") {
        reply = {
          id: uid("m"),
          role: "assistant",
          text: "Entendi assim. Confira e confirme para eu salvar — nada foi salvo ainda.",
          proposal: { value: entry.proposal, status: "pending" },
        };
      } else if (entry.kind === "ask") {
        reply = { id: uid("m"), role: "assistant", text: entry.question };
      } else {
        const answer = answerQuestion(question, data, today);
        reply = { id: uid("m"), role: "assistant", text: answer.text, period: answer.period };
      }
      setMessages((m) => [...m, reply]);
      setThinking(false);
    }, 450);
  }

  function setStatus(id: string, status: ProposalStatus) {
    setMessages((all) =>
      all.map((m) => (m.id === id && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m)),
    );
  }

  function confirm(message: Message) {
    if (!message.proposal || message.proposal.status !== "pending") return;
    if (confirmed.current.has(message.id)) return;
    confirmed.current.add(message.id);
    const p = message.proposal.value;
    setStatus(message.id, "confirmed");
    addTransaction({
      type: p.type,
      amountCents: p.amountCents,
      categoryId: p.categoryId,
      description: p.description,
      occurredOn: p.occurredOn,
      source: "ai",
    });
    toast.success(`${p.type === "income" ? "Receita" : "Despesa"} de ${formatBRL(p.amountCents)} salva`);
  }

  function edit(message: Message) {
    if (!message.proposal) return;
    if (confirmed.current.has(message.id)) return;
    setTxState({
      mode: "confirm",
      initial: message.proposal.value,
      onSaved: () => {
        confirmed.current.add(message.id);
        setStatus(message.id, "confirmed");
      },
    });
    setTxOpen(true);
  }

  return (
    <div data-module="primary" className="flex min-h-dvh flex-col">
      <SubHeader title="Assistente" backHref="/inicio" />

      <div className="flex-1 space-y-3 px-4 pt-2 pb-48">
        <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Modo simulação: as respostas são calculadas no seu aparelho com os dados de demonstração. Na versão
            real, só o necessário para responder será enviado ao provedor de IA configurado.
          </p>
        </div>

        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] space-y-2 rounded-2xl px-4 py-3 text-[0.95rem]",
                m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card ring-1 ring-border/70",
              )}
            >
              <p className="whitespace-pre-line">{m.text}</p>
              {m.period ? <p className="text-xs text-muted-foreground">Período: {m.period}</p> : null}
              {m.proposal ? (
                <ProposalCard
                  proposal={m.proposal.value}
                  status={m.proposal.status}
                  today={today}
                  categoryName={data.categories.find((c) => c.id === m.proposal?.value.categoryId)?.name ?? "—"}
                  onConfirm={() => confirm(m)}
                  onEdit={() => edit(m)}
                  onCancel={() => setStatus(m.id, "cancelled")}
                />
              ) : null}
            </div>
          </div>
        ))}

        {thinking ? (
          <div className="flex justify-start" aria-live="polite">
            <div className="rounded-2xl rounded-bl-md bg-card px-4 py-3 text-muted-foreground ring-1 ring-border/70">
              Calculando…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto max-w-md space-y-2 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm transition active:bg-muted"
              >
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <Input
              value={text}
              maxLength={200}
              placeholder="Pergunte ou descreva um gasto"
              aria-label="Mensagem para o assistente"
              onChange={(e) => setText(e.target.value)}
              className="rounded-full px-4"
            />
            <Button type="submit" size="icon-lg" className="rounded-full" disabled={text.trim() === "" || thinking} aria-label="Enviar">
              <ArrowUp aria-hidden />
            </Button>
          </form>
        </div>
      </div>

      <TransactionSheet open={txOpen} state={txState} onOpenChange={setTxOpen} />
    </div>
  );
}

interface ProposalCardProps {
  proposal: TxProposal;
  status: ProposalStatus;
  today: string;
  categoryName: string;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

function ProposalCard({ proposal, status, today, categoryName, onConfirm, onEdit, onCancel }: ProposalCardProps) {
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

export const AssistantScreen = withStoreGate(AssistantScreenContent);
