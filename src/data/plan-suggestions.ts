/**
 * "Agora não" da sugestão espontânea do plano (exercício estagnado): a sugestão daquele exercício some por 14 dias.
 * Fica só neste aparelho (preferência de tela, não dado do plano) e é apagada ao sair da conta. Sem armazenamento local
 * (janela anônima), o "agora não" vale só enquanto a página estiver aberta.
 */
export const PLAN_SUGGESTIONS_KEY = "tars-plan-suggestions-v1";
export const SUGGESTION_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

let memory: Record<string, number> = {};

function read(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_SUGGESTIONS_KEY) ?? "{}") as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "number")) as Record<string, number>;
    }
  } catch {
    // sem armazenamento: só a memória da página
  }
  return memory;
}

export function isSuggestionSnoozed(exerciseId: string, nowMs: number): boolean {
  return (read()[exerciseId] ?? 0) > nowMs;
}

export function snoozeSuggestion(exerciseId: string, nowMs: number): void {
  // Só o que ainda vale fica guardado (a lista não cresce para sempre).
  const kept = Object.fromEntries(Object.entries(read()).filter(([, until]) => until > nowMs));
  memory = { ...kept, [exerciseId]: nowMs + SUGGESTION_SNOOZE_MS };
  try {
    localStorage.setItem(PLAN_SUGGESTIONS_KEY, JSON.stringify(memory));
  } catch {
    // sem armazenamento: fica na memória
  }
}

export function wipePlanSuggestions(): void {
  memory = {};
  try {
    localStorage.removeItem(PLAN_SUGGESTIONS_KEY);
  } catch {
    // nada a apagar
  }
}
