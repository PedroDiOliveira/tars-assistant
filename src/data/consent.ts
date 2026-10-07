import { useSyncExternalStore } from "react";

/**
 * Consentimento de enviar mensagens ao provedor de IA (spec §10.3: explicar antes do primeiro uso). Fica neste
 * aparelho em localStorage e é apagado ao sair da conta (`wipeLocalUserData`).
 */
export const AI_CONSENT_KEY = "tars-ai-consent-v1";

const listeners = new Set<() => void>();
// Sem localStorage (janela anônima) o consentimento vale só enquanto a página estiver aberta.
let memory = false;

function read(): boolean {
  try {
    return localStorage.getItem(AI_CONSENT_KEY) === "1";
  } catch {
    return memory;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener); // outra aba aceitou ou o logout apagou
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function acceptAiConsent(): void {
  memory = true;
  try {
    localStorage.setItem(AI_CONSENT_KEY, "1");
  } catch {
    // vale só nesta visita
  }
  listeners.forEach((l) => l());
}

/** Avisa quem está ouvindo depois de apagar (sair da conta). */
export function notifyAiConsentChanged(): void {
  memory = false;
  listeners.forEach((l) => l());
}

/** `null` no servidor e na primeira renderização (a hidratação precisa casar); depois, o valor real do aparelho. */
export function useAiConsent(): boolean | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
