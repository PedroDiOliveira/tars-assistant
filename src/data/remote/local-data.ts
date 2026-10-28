import { AI_CONSENT_KEY, notifyAiConsentChanged } from "../consent";
import { BREATH_PREFS_KEY, wipeBreathPrefs } from "../breath-prefs";
import { wipeWaterPrefs, WATER_PREFS_KEY } from "../water-prefs";
import { DRAFT_STORAGE_KEY, wipeDraft } from "./draft-store";

/**
 * Apaga TUDO o que o app guarda neste aparelho sobre o usuário (spec §13): treino em andamento, consentimento da IA
 * e as preferências do contador de água e da respiração guiada.
 * O cache de dados fica em memória e morre com a página; nada do Supabase é guardado em localStorage.
 */
export function wipeLocalUserData(): void {
  wipeDraft();
  wipeWaterPrefs();
  wipeBreathPrefs();
  try {
    localStorage.removeItem(AI_CONSENT_KEY);
  } catch {
    // sem armazenamento local: nada a apagar
  }
  notifyAiConsentChanged();
}

export { AI_CONSENT_KEY, BREATH_PREFS_KEY, DRAFT_STORAGE_KEY, WATER_PREFS_KEY };
