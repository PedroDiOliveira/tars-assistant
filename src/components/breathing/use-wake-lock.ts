"use client";

import { useEffect } from "react";

/**
 * Mantém a tela acesa enquanto `active` (Screen Wake Lock API). Melhoria progressiva e silenciosa: sem suporte, ou
 * quando o sistema recusa (bateria fraca, PWA instalada no iOS antes do 18.4, bug WebKit 254545), a sessão segue
 * igual e a tela só apaga no tempo normal do aparelho.
 *
 * O sistema solta o bloqueio sozinho quando a página some; ao voltar a ficar visível, ele é pedido de novo.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let disposed = false;

    async function acquire() {
      if (disposed || pending || sentinel || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (disposed) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        lock.addEventListener(
          "release",
          () => {
            if (sentinel === lock) sentinel = null;
            void acquire();
          },
          { once: true },
        );
      } catch {
        // recusado ou sem suporte de verdade: segue sem bloqueio
      } finally {
        pending = false;
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = sentinel;
      sentinel = null;
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
