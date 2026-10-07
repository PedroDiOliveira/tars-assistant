import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Sem conexão" };

/**
 * Mostrada pelo service worker quando uma tela não abre por falta de internet. É estática e pública (não mostra
 * nenhum dado): o link é um <a> comum para funcionar mesmo sem JavaScript.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-dvh bg-muted/40">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 bg-background px-6 py-10 text-center md:border-x">
        <span className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
          <WifiOff className="size-8" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Você está sem conexão</h1>
          <p className="text-muted-foreground">
            Seus dados estão seguros no servidor. Para ver ou registrar qualquer coisa o Tars precisa de internet:
            nada é salvo até o servidor confirmar.
          </p>
        </div>
        {/* <a> comum de propósito: precisa recarregar de verdade e funcionar sem JavaScript */}
        <a href="/inicio" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
          Tentar de novo
        </a>
      </main>
    </div>
  );
}
