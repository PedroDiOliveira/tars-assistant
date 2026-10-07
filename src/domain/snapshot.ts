import type { DataSnapshot } from "./summary";
import type { StudyTimer, TxTemplate } from "./types";

/**
 * Tudo o que o servidor persiste por usuário e que os comandos alteram. O rascunho de treino e o
 * estado de interface ficam de fora: vivem só no aparelho.
 */
export interface AppData extends DataSnapshot {
  templates: TxTemplate[];
  timer: StudyTimer | null;
}

export const EMPTY_APP_DATA: AppData = {
  categories: [],
  transactions: [],
  templates: [],
  goals: [],
  exercises: [],
  plans: [],
  sessions: [],
  subjects: [],
  studySessions: [],
  timer: null,
  books: [],
  readingSessions: [],
};
