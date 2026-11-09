import { AI_CONSENT_KEY, notifyAiConsentChanged } from "../consent";
import { BREATH_PREFS_KEY, wipeBreathPrefs } from "../breath-prefs";
import { PLAN_PROPOSAL_KEY, wipePlanProposal } from "../plan-proposal";
import { PLAN_SUGGESTIONS_KEY, wipePlanSuggestions } from "../plan-suggestions";
import { wipeWaterPrefs, WATER_PREFS_KEY } from "../water-prefs";
import { DRAFT_STORAGE_KEY, wipeDraft } from "./draft-store";

/**
 * Apaga TUDO o que o app guarda neste aparelho sobre o usuário (spec §13): treino em andamento, consentimento da IA,
 * preferências do contador de água e da respiração guiada, a proposta de plano de treino em revisão e os "agora não"
 * das sugestões do plano.
 * O cache de dados fica em memória e morre com a página; nada do Supabase é guardado em localStorage.
 */
export function wipeLocalUserData(): void {
  wipeDraft();
  wipeWaterPrefs();
  wipeBreathPrefs();
  wipePlanProposal();
  wipePlanSuggestions();
  try {
    localStorage.removeItem(AI_CONSENT_KEY);
  } catch {
    // sem armazenamento local: nada a apagar
  }
  notifyAiConsentChanged();
}

export { AI_CONSENT_KEY, BREATH_PREFS_KEY, DRAFT_STORAGE_KEY, PLAN_PROPOSAL_KEY, PLAN_SUGGESTIONS_KEY, WATER_PREFS_KEY };
