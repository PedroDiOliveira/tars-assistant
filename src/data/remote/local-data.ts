import { AI_CONSENT_KEY, notifyAiConsentChanged } from "../consent";
import { DRAFT_STORAGE_KEY, wipeDraft } from "./draft-store";

/**
 * Apaga TUDO o que o app guarda neste aparelho sobre o usuário (spec §13): treino em andamento e consentimento da IA.
 * O cache de dados fica em memória e morre com a página; nada do Supabase é guardado em localStorage.
 */
export function wipeLocalUserData(): void {
  wipeDraft();
  try {
    localStorage.removeItem(AI_CONSENT_KEY);
  } catch {
    // sem armazenamento local: nada a apagar
  }
  notifyAiConsentChanged();
}

export { AI_CONSENT_KEY, DRAFT_STORAGE_KEY };
