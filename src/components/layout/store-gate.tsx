"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useStoreStatus } from "@/data";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { IS_LIVE } from "@/lib/app-mode";

/** Depois disto, o esqueleto vira uma explicação: algo travou ao carregar os dados. */
const SLOW_MS = 8000;

/**
 * Envolve uma tela para só renderizá-la depois que os dados carregaram; até lá mostra o esqueleto. Fica
 * dentro da tela (e não no layout) para que a página sempre seja renderizada no servidor, como o Next
 * espera para validar navegação instantânea.
 */
export function withStoreGate<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function Gated(props: P) {
    const status = useStoreStatus();
    const [slow, setSlow] = useState(false);
    const loading = status.phase === "loading";

    useEffect(() => {
      if (!loading) return;
      const timer = setTimeout(() => setSlow(true), SLOW_MS);
      return () => clearTimeout(timer);
    }, [loading]);

    if (status.phase === "ready") return <Screen {...props} />;
    if (status.phase === "error") return <LoadProblem title="Não consegui carregar seus dados" detail={status.message} onRetry={status.retry} />;
    if (slow) {
      return IS_LIVE ? (
        <LoadProblem
          title="Está demorando para carregar"
          detail="Confira sua conexão. Seus dados estão salvos no servidor e nada foi perdido."
          onRetry={() => location.reload()}
        />
      ) : (
        <LoadProblem
          title="Não consegui ler os dados deste navegador"
          detail="Os dados de demonstração ficam no armazenamento local. Em uma janela anônima ou com os dados do site bloqueados, isso pode falhar."
          onRetry={() => location.reload()}
        />
      );
    }
    return <PageSkeleton />;
  }
  Gated.displayName = `StoreGate(${Screen.displayName ?? Screen.name})`;
  return Gated;
}

function LoadProblem({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-3 px-6 py-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
      >
        Tentar de novo
      </button>
    </div>
  );
}
