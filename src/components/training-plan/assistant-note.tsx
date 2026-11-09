import type { ReactNode } from "react";
import { AssistantAvatar } from "@/components/brand/assistant-avatar";
import { Surface } from "@/components/shared/surface";
import { ASSISTANT } from "@/lib/constants";

/**
 * "Recado do Tars": o texto que explica o plano, na voz do assistente. A autoridade do plano vem das regras e das fontes
 * ("Por que este treino funciona"); aqui o tom é de cuidado. Sempre diz, em letra pequena, se foi escrito com IA ou
 * pelas regras do app: a persona é o app inteiro, não "a IA", e a pessoa sabe o que leu.
 */
export function AssistantNote({ source, children, extra }: { source: "ai" | "rules"; children: ReactNode; extra?: string }) {
  return (
    <Surface className="space-y-2 p-4" role="region" aria-label={`Recado ${ASSISTANT.of}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AssistantAvatar size="sm" />
        Recado {ASSISTANT.of}
      </p>
      <p className="text-sm text-muted-foreground">{children}</p>
      <p className="text-xs text-muted-foreground/80">
        {source === "ai" ? "Escrito com IA" : "Escrito pelas regras do app, sem IA"}
        {extra ? ` · ${extra}` : ""}
      </p>
    </Surface>
  );
}
