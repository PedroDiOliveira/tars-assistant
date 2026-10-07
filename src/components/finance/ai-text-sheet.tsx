"use client";

import { useState } from "react";
import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import type { TxProposal } from "@/domain/quick-entry";
import { assistant, useAccount } from "@/data";

const EXAMPLES = ["Gastei 42 reais no Outback ontem", "Recebi 3500 de salário hoje", "Paguei 18,50 de uber"];

interface AiTextSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** chamada com a proposta interpretada; o salvamento só acontece na tela de confirmação */
  onProposal: (proposal: TxProposal) => void;
  /** abre o formulário manual (caminho sempre disponível quando a IA falha) */
  onManual: () => void;
}

export function AiTextSheet({ open, onOpenChange, onProposal, onManual }: AiTextSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Lançar por texto"
      description="Escreva como falaria: o valor, o que foi e quando."
      module="finance"
    >
      <AiTextForm
        onProposal={(proposal) => {
          onOpenChange(false);
          onProposal(proposal);
        }}
        onManual={() => {
          onOpenChange(false);
          onManual();
        }}
      />
    </Sheet>
  );
}

function AiTextForm({ onProposal, onManual }: { onProposal: (proposal: TxProposal) => void; onManual: () => void }) {
  const account = useAccount();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function interpret() {
    if (busy || text.trim() === "") return;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    const result = await assistant.ask(text);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      setMessage(result.error);
    } else if (result.value.proposal) {
      onProposal(result.value.proposal);
    } else {
      // o assistente pediu algo que faltou (ex.: o valor) ou não viu um lançamento na frase
      setMessage(result.value.text);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {account.isLive
            ? `Sua frase é enviada a ${account.aiProvider ?? "um provedor de IA"} para ser interpretada. Ela só propõe: você sempre confirma antes de salvar.`
            : "Simulação local: nada sai do seu aparelho. Na versão real, a IA propõe e você sempre confirma antes de salvar."}
        </p>
      </div>

      <Textarea
        autoFocus
        rows={3}
        value={text}
        maxLength={200}
        placeholder="Ex.: Gastei 42 reais no Outback ontem"
        aria-label="Descreva o lançamento"
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
      />

      {message ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setText(example);
              setMessage(null);
            }}
            className="min-h-11 rounded-full border bg-card px-3.5 text-left text-sm transition active:bg-muted"
          >
            {example}
          </button>
        ))}
      </div>

      <SheetFooter>
        <Button size="lg" disabled={text.trim() === "" || busy} onClick={() => void interpret()}>
          <Sparkles aria-hidden /> {busy ? "Interpretando…" : "Interpretar"}
        </Button>
        {failed ? (
          <Button size="lg" variant="outline" onClick={onManual}>
            Preencher manualmente
          </Button>
        ) : null}
      </SheetFooter>
    </div>
  );
}
