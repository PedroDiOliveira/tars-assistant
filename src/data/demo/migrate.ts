import { uid } from "@/lib/id";
import type { TarsState } from "./store";

/**
 * Migra o estado do demo guardado no localStorage entre versões do formato, SEM apagar nada do usuário.
 *  v2: o rascunho de treino ganhou `id` (vira o id da sessão ao finalizar). Rascunhos salvos na v1 não têm;
 *      sem isto, finalizar um treino iniciado antes da atualização geraria uma sessão sem id.
 *  v3: corridas (`runningSessions`). Estados antigos não têm a coleção: passam a ter uma lista vazia.
 *  v4: água (`waterIntakes`). Mesmo tratamento: lista vazia, nada do que já existe é tocado.
 */
export function migrateDemoState(persisted: unknown, version: number): TarsState {
  let state = persisted as TarsState;
  if (version < 2 && state.draft && !state.draft.id) {
    state = { ...state, draft: { ...state.draft, id: uid() } };
  }
  if (version < 3 || !Array.isArray(state.runningSessions)) {
    state = { ...state, runningSessions: Array.isArray(state.runningSessions) ? state.runningSessions : [] };
  }
  if (version < 4 || !Array.isArray(state.waterIntakes)) {
    state = { ...state, waterIntakes: Array.isArray(state.waterIntakes) ? state.waterIntakes : [] };
  }
  return state;
}
