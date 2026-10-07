import type { DateKey } from "@/lib/dates";

/* ---------- Finanças ---------- */

export type TxType = "income" | "expense";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  /** chave de ícone em lib/icons.ts */
  icon: string;
  /** matiz (0-360) usado para colorir o ponto/ícone da categoria */
  hue: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  /** centavos inteiros e positivos; o tipo diferencia receita de despesa */
  amountCents: number;
  categoryId: string;
  description: string;
  occurredOn: DateKey;
  source: "manual" | "ai";
}

/** Atalho de lançamento ("Almoço R$ 35"). */
export interface TxTemplate {
  id: string;
  label: string;
  type: TxType;
  amountCents: number;
  categoryId: string;
}

/* ---------- Metas (por vigência) ---------- */

export type GoalKind =
  | "savings" // centavos de resultado, mensal
  | "category_budget" // centavos de despesa por categoria, mensal
  | "workout_sessions" // sessões concluídas, semanal
  | "study_minutes" // minutos, semanal (geral ou por matéria)
  | "reading_pages"; // páginas, semanal

export interface Goal {
  id: string;
  kind: GoalKind;
  /** categoryId (category_budget) ou subjectId (study_minutes); null = geral */
  scopeId: string | null;
  /** primeiro dia do período a partir do qual a meta vale */
  validFrom: DateKey;
  target: number;
}

/* ---------- Treino ---------- */

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  /** peso corporal tem carga externa 0 e não entra no cálculo de volume */
  loadType: "external" | "bodyweight";
}

export interface PlanExercise {
  exerciseId: string;
  plannedSets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  notes?: string;
  exercises: PlanExercise[];
}

export interface SetLog {
  weightKg: number;
  reps: number;
  done: boolean;
}

/** Cópia dos parâmetros da ficha no momento da sessão: editar a ficha não reescreve o histórico. */
export interface SessionExercise {
  exerciseId: string;
  nameSnapshot: string;
  loadType: Exercise["loadType"];
  plannedSets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  sets: SetLog[];
}

export interface WorkoutSession {
  id: string;
  planId: string;
  nameSnapshot: string;
  startedAt: number;
  finishedAt: number;
  occurredOn: DateKey;
  exercises: SessionExercise[];
  notes?: string;
}

/** Treino em andamento: vive só no aparelho até ser finalizado. */
export interface WorkoutDraft {
  planId: string;
  nameSnapshot: string;
  startedAt: number;
  exercises: SessionExercise[];
  notes?: string;
}

/* ---------- Estudos ---------- */

export interface Subject {
  id: string;
  name: string;
  objective?: string;
  hue: number;
}

export interface StudySession {
  id: string;
  subjectId: string;
  source: "timer" | "manual";
  occurredOn: DateKey;
  durationSeconds: number;
  notes?: string;
}

/** Cronômetro ativo (no máximo um). Baseado em timestamps, não em contador JS. */
export interface StudyTimer {
  subjectId: string;
  startedAt: number;
  /** instante do último "iniciar/retomar"; null enquanto pausado */
  runningSince: number | null;
  accumulatedSeconds: number;
}

/* ---------- Leitura ---------- */

export type BookStatus = "want" | "reading" | "done" | "paused";

export interface Book {
  id: string;
  title: string;
  author?: string;
  totalPages: number;
  /** posição ao cadastrar; páginas anteriores não contam como leitura do período */
  initialPage: number;
  status: BookStatus;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  occurredOn: DateKey;
  /** posição antes da sessão */
  startPage: number;
  /** posição depois da sessão */
  endPage: number;
  notes?: string;
}
