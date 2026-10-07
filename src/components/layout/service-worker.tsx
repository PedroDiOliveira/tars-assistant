"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (public/sw.js) só em produção: em desenvolvimento um cache velho atrapalharia mais do que
 * ajuda. Falhar ao registrar não afeta nada, o app funciona igual, só sem a tela de "sem conexão".
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
