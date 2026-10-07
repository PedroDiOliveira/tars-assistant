"use client";

import { useEffect } from "react";
import { log } from "@/lib/client-log";

/**
 * Erro inesperado numa tela. Mostra uma mensagem humana e um jeito de tentar de novo; o detalhe técnico nunca vai
 * para a tela (em produção o Next já o esconde) e só o `digest` (um código curto) é registrado para achar no log do
 * servidor.
 */
export default function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    log("screen_error", error.digest);
  }, [error]);

  return (
    <div className="min-h-dvh bg-muted/40">
      <main role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 bg-background px-6 py-10 text-center md:border-x">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Algo deu errado</h1>
          <p className="text-muted-foreground">
            Seus dados estão salvos e nada foi perdido. Tente de novo; se continuar, recarregue a página.
          </p>
        </div>
        <button type="button" onClick={() => retry()} className="min-h-11 w-full max-w-xs rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
          Tentar de novo
        </button>
        {error.digest ? <p className="text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      </main>
    </div>
  );
}
