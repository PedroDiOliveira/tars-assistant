"use client";

import { useState } from "react";
import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetFooter } from "@/components/shared/sheet";
import { parseQuickEntry, type TxProposal } from "@/domain/quick-entry";
import { useData, useToday } from "@/data";

const EXAMPLES = ["Gastei 42 reais no Outback ontem", "Recebi 3500 de salário hoje", "Paguei 18,50 de uber"];

interface AiTextSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** chamada com a proposta interpretada; o salvamento só acontece na tela de confirmação */
  onProposal: (proposal: TxProposal) => void;
}

export function AiTextSheet({ open, onOpenChange, onProposal }: AiTextSheetProps) {
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
      />
    </Sheet>
  );
}

function AiTextForm({ onProposal }: { onProposal: (proposal: TxProposal) => void }) {
  const data = useData();
  const today = useToday();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function interpret() {
    const result = parseQuickEntry(text, today, data.categories);
    if (result.kind === "proposal") {
      onProposal(result.proposal);
    } else if (result.kind === "ask") {
      setMessage(result.question);
    } else {
      setMessage("Não entendi como um lançamento. Tente algo como “Gastei 42 reais no Outback ontem”.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Simulação local: nada sai do seu aparelho. Na versão real, a IA propõe e você sempre
          confirma antes de salvar.
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
        <Button size="lg" disabled={text.trim() === ""} onClick={interpret}>
          <Sparkles aria-hidden /> Interpretar
        </Button>
      </SheetFooter>
    </div>
  );
}
