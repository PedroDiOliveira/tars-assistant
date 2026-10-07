"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { IS_LIVE } from "@/lib/app-mode";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** `true` no servidor e na hidratação (a primeira renderização precisa casar); depois, o estado real do aparelho. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/**
 * Avisa, no modo real, que registrar algo exige internet (spec §13). O app nunca indica sucesso sem o servidor
 * confirmar, então sem conexão uma ação mostra erro; o aviso explica o porquê antes de a pessoa tentar.
 * No demo os dados são locais e funcionam sem rede: não há o que avisar.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (!IS_LIVE || online) return null;
  return (
    <div role="status" className="flex items-start gap-2 bg-warning-soft px-4 py-2 text-sm text-warning-ink">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>Sem conexão. Para registrar algo é preciso internet: nada é salvo até o servidor confirmar.</p>
    </div>
  );
}
