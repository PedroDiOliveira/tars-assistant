"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useStoreReady } from "@/data";
import { PageSkeleton } from "@/components/shared/page-skeleton";

/** Depois disto, o esqueleto vira uma explicação: algo travou ao ler os dados locais. */
const SLOW_MS = 8000;

/**
 * Envolve uma tela para só renderizá-la depois que os dados locais carregaram; até lá mostra o
 * esqueleto. Fica dentro da tela (e não no layout) para que a página sempre seja renderizada
 * no servidor, como o Next espera para validar navegação instantânea.
 */
export function withStoreGate<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function Gated(props: P) {
    const ready = useStoreReady();
    const [slow, setSlow] = useState(false);

    useEffect(() => {
      if (ready) return;
      const timer = setTimeout(() => setSlow(true), SLOW_MS);
      return () => clearTimeout(timer);
    }, [ready]);

    if (ready) return <Screen {...props} />;
    if (slow) return <StorageProblem />;
    return <PageSkeleton />;
  }
  Gated.displayName = `StoreGate(${Screen.displayName ?? Screen.name})`;
  return Gated;
}

function StorageProblem() {
  return (
    <div role="alert" className="space-y-3 px-6 py-10 text-center">
      <p className="text-lg font-semibold">Não consegui ler os dados deste navegador</p>
      <p className="text-sm text-muted-foreground">
        Os dados de demonstração ficam no armazenamento local. Em uma janela anônima ou com os
        dados do site bloqueados, isso pode falhar.
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
      >
        Tentar de novo
      </button>
    </div>
  );
}
