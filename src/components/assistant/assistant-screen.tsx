"use client";

import { useEffect, useRef, useState } from "react";
import { withStoreGate } from "@/components/layout/store-gate";
import { ArrowUp, Info, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubHeader } from "@/components/layout/sub-header";
import { TransactionSheet, type TxSheetState } from "@/components/finance/transaction-sheet";
import { formatBRL } from "@/domain/money";
import type { TxProposal } from "@/domain/quick-entry";
import { acceptAiConsent, assistant, useAccount, useActions, useAiConsent, useData, useToday } from "@/data";
import { formatDayRelative } from "@/lib/format";
import { uid } from "@/lib/id";
import { KEYBOARD_EVENT } from "@/lib/keyboard";
import { notify } from "@/components/shared/notify";


type ProposalStatus = "pending" | "confirmed" | "cancelled";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  period?: string;
  proposal?: { value: TxProposal; status: ProposalStatus };
  /** falha ao falar com o assistente: a tela oferece o caminho manual */
  failed?: boolean;
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
  const account = useAccount();
  const { addTransaction } = useActions();

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txState, setTxState] = useState<TxSheetState | null>(null);
  // null = ainda lendo o aparelho. No demo nada sai do aparelho, então não há o que consentir.
  const stored = useAiConsent();
  // Deploy sem provedor de IA configurado: o assistente não existe (o resto do app não depende dele).
  const unavailable = account.isLive && !account.aiEnabled;
  const consent = unavailable ? false : account.isLive ? stored : true;
  const endRef = useRef<HTMLDivElement>(null);
  // Propostas já confirmadas: garante um único lançamento por proposta, mesmo com toques repetidos.
  const confirmed = useRef(new Set<string>());

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  // Teclado aberto: a barra de mensagem sobe para cima dele e cobriria a última resposta; volta ao fim da conversa.
  useEffect(() => {
    const onKeyboard = () => {
      if (document.documentElement.hasAttribute("data-keyboard")) endRef.current?.scrollIntoView({ block: "end" });
    };
    window.addEventListener(KEYBOARD_EVENT, onKeyboard);
    return () => window.removeEventListener(KEYBOARD_EVENT, onKeyboard);
  }, []);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || thinking || consent !== true) return;
    setText("");
    setMessages((m) => [...m, { id: uid(), role: "user", text: question }]);
    setThinking(true);

    const result = await assistant.ask(question);
    setThinking(false);
    if (!result.ok) {
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: result.error, failed: true }]);
      return;
    }
    const { text: answer, period, proposal } = result.value;
    setMessages((m) => [
      ...m,
      { id: uid(), role: "assistant", text: answer, period, ...(proposal ? { proposal: { value: proposal, status: "pending" as const } } : {}) },
    ]);
  }

  function setStatus(id: string, status: ProposalStatus) {
    setMessages((all) =>
      all.map((m) => (m.id === id && m.proposal ? { ...m, proposal: { ...m.proposal, status } } : m)),
    );
  }

  async function confirm(message: Message) {
    if (!message.proposal || message.proposal.status !== "pending") return;
    if (confirmed.current.has(message.id)) return;
    confirmed.current.add(message.id);
    const p = message.proposal.value;
    const result = await addTransaction({
      // O id da proposta é o do lançamento: confirmar de novo (toque duplo, nova tentativa) nunca duplica.
      id: p.id ?? message.id,
      type: p.type,
      amountCents: p.amountCents,
      categoryId: p.categoryId,
      description: p.description,
      occurredOn: p.occurredOn,
      source: "ai",
    });
    if (!notify(result, `${p.type === "income" ? "Receita" : "Despesa"} de ${formatBRL(p.amountCents)} salva`)) {
      confirmed.current.delete(message.id); // não salvou: a proposta continua pendente
      return;
    }
    setStatus(message.id, "confirmed");
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

      {/* O espaço embaixo cresce com o teclado: a barra fixa sobe e não pode esconder o fim da conversa. */}
      <div className="flex-1 space-y-3 px-4 pt-2" style={{ paddingBottom: "calc(12rem + var(--kb-inset))" }}>
        {account.isLive ? null : (
          <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Modo simulação: as respostas são calculadas no seu aparelho com os dados de demonstração. Na versão
              real, só o necessário para responder será enviado ao provedor de IA configurado.
            </p>
          </div>
        )}

        {unavailable ? (
          <div role="status" className="flex gap-2 rounded-xl bg-muted p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>O assistente não está configurado neste app. Lançamentos, treinos, estudos e leitura funcionam normalmente pelos formulários.</p>
          </div>
        ) : null}

        {account.isLive && !unavailable && consent === false ? (
          <div role="region" aria-label="Aviso de privacidade" className="space-y-3 rounded-xl bg-warning-soft p-4 text-sm text-warning-ink">
            <p className="flex items-center gap-2 font-semibold">
              <Info className="size-4 shrink-0" aria-hidden /> Antes de usar o assistente
            </p>
            <p>
              Suas mensagens e os resumos necessários para respondê-las (totais e nomes de categorias, matérias e livros)
              serão enviados a {account.aiProvider ?? "um provedor de IA"}. Descrições dos seus lançamentos não são enviadas.
              O uso de IA pode gerar custo. O resto do app funciona sem o assistente.
            </p>
            <Button onClick={acceptAiConsent}>Entendi, usar o assistente</Button>
          </div>
        ) : null}

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
              {m.failed ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTxState({ mode: "create" });
                    setTxOpen(true);
                  }}
                >
                  Lançar manualmente
                </Button>
              ) : null}
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

      <div className="fixed inset-x-0 bottom-(--kb-inset) z-40">
        <div className="mx-auto max-w-md space-y-2 border-t bg-background/95 p-3 pb-[max(0.75rem,var(--safe-bottom))] backdrop-blur-xl">
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={consent !== true}
                onClick={() => void send(s)}
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm transition active:bg-muted disabled:opacity-50"
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
              void send(text);
            }}
          >
            <Input
              value={text}
              maxLength={200}
              placeholder={unavailable ? "Assistente não configurado" : consent === false ? "Aceite o aviso para usar o assistente" : "Pergunte ou descreva um gasto"}
              disabled={consent !== true}
              aria-label="Mensagem para o assistente"
              onChange={(e) => setText(e.target.value)}
              className="rounded-full px-4"
            />
            <Button type="submit" size="icon-lg" className="rounded-full" disabled={text.trim() === "" || thinking || consent !== true} aria-label="Enviar">
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
