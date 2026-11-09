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
  /** arquivado: some das listas de escolha, mas continua dando nome ao histórico que já o usa */
  archived?: boolean;
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
  | "reading_pages" // páginas, semanal
  | "running_meters" // metros corridos, semanal (guardado em metros inteiros; a interface fala em km)
  | "water_ml"; // ml de água POR DIA, com vigência semanal (a interface fala em litros)

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
  /** vínculo opcional com a biblioteca (domain/exercise-library.ts): equipamento, músculos e padrão de movimento */
  libraryKey?: string;
  /** arquivado: some das listas de escolha, mas continua dando nome ao histórico que já o usa */
  archived?: boolean;
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
  /** arquivado: some das listas de escolha, mas continua dando nome ao histórico que já o usa */
  archived?: boolean;
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
  /** null quando a ficha foi apagada depois: a sessão sobrevive pelos snapshots */
  planId: string | null;
  nameSnapshot: string;
  startedAt: number;
  finishedAt: number;
  occurredOn: DateKey;
  exercises: SessionExercise[];
  notes?: string;
  /** "Como foi?" ao finalizar (1 leve, 2 na medida, 3 pesado, 4 exaustivo); ausente = não avaliado */
  effort?: SessionEffort;
}

export type SessionEffort = 1 | 2 | 3 | 4;

/* ---------- Plano de treino (respostas do formulário e planos aceitos) ---------- */

export type TrainingGoal = "massa" | "forca" | "saude" | "emagrecer";
export type TrainingExperience = "iniciante" | "intermediario" | "avancado";
export type TrainingLocation = "academia" | "casa-halteres";
export type BodyRegion = "ombro" | "cotovelo" | "punho" | "lombar" | "quadril" | "joelho" | "tornozelo";
export type PriorityGroup = "peito" | "costas" | "ombros" | "bracos" | "pernas" | "gluteos";
/**
 * Triagem de saúde antes do plano. Só o RESULTADO fica guardado, nunca as respostas: "liberado" (nada acusado),
 * "liberacao-medica" (algo acusado e a pessoa confirmou ter liberação) ou "nao-respondida" (pulou a parte de saúde).
 */
export type HealthScreening = "liberado" | "liberacao-medica" | "nao-respondida";

/** Respostas do formulário do plano: uma por pessoa, substituída a cada vez que ela refaz as perguntas. */
export interface TrainingProfile {
  goal: TrainingGoal;
  experience: TrainingExperience;
  daysPerWeek: 2 | 3 | 4 | 5 | 6;
  sessionMinutes: 30 | 45 | 60 | 75;
  location: TrainingLocation;
  /** dado de saúde: só existe com consentimento (`healthConsentAt`); vazio quando ela pulou a parte de saúde */
  limitations: BodyRegion[];
  screening: HealthScreening;
  /** instante do consentimento para as perguntas de saúde; ausente quando ela pulou */
  healthConsentAt?: number;
  /** até 2 grupos para dar mais atenção */
  priorities: PriorityGroup[];
  /** "Algo mais?": o único texto livre que vai para a IA */
  notes?: string;
  updatedAt: number;
}

/** Família da divisão do treino na semana (domain/training-splits.ts). */
export type TrainingSplit = "corpo-inteiro" | "superior-inferior" | "superior-inferior-ppl" | "empurrar-puxar-pernas" | "por-grupo";

/** Um exercício de um plano aceito: o vínculo com a ficha criada e o motivo da escolha. */
export interface TrainingPlanExercise {
  exerciseId: string;
  libraryKey: string;
  reason?: string;
  /** trocado pela pessoa antes de aceitar */
  swapped?: boolean;
}

/**
 * Um plano ACEITO: de onde veio (IA ou modelo pronto), o porquê e quais fichas ele criou. A proposta em revisão vive
 * só no aparelho; só o que a pessoa aceita chega ao banco. É a base da revisão mensal (fase 2) e das métricas.
 */
export interface TrainingPlanRecord {
  id: string;
  acceptedAt: number;
  source: "ai" | "rules";
  /** modelo de IA usado; ausente no modelo pronto */
  model?: string;
  promptVersion: string;
  split: TrainingSplit;
  summary: string;
  /** as respostas usadas, SEM os dados de saúde (eles ficam só no perfil, que a pessoa pode apagar) */
  answers: Pick<TrainingProfile, "goal" | "experience" | "daysPerWeek" | "sessionMinutes" | "location" | "priorities">;
  days: { planId: string; name: string; exercises: TrainingPlanExercise[] }[];
  /** quantas trocas a pessoa fez antes de aceitar */
  edits: number;
  /** a divisão exata do catálogo (training-splits); ausente nos planos aceitos antes do rodízio */
  option?: string;
}

/** Gatilho de um ajuste no plano em uso: um chip, o texto livre (que NÃO é guardado), uma troca escolhida pela pessoa ou a sugestão do app. */
export type TrainingAdjustTrigger = "mais-curto" | "menos-exercicios" | "foco" | "mais-pesado" | "mais-leve" | "texto" | "troca" | "sugestao";

/** Uma mudança aplicada às fichas do plano em uso, como a pessoa a viu na prévia. */
export interface TrainingPlanChangeItem {
  /** a ficha alterada */
  planId: string;
  /** "Inferior A · Leg press" */
  where: string;
  before: string;
  after: string;
  reason: string;
  /** id do princípio da base científica (domain/training-evidence.ts) */
  principle: string;
}

/**
 * Um ajuste ACEITO no plano em uso: o que mudou nas fichas, por quê e de onde veio. Imutável; é o histórico "O que
 * mudou" e a base da revisão a cada 4 semanas (fase 2). O texto livre da pessoa nunca é guardado (pode ter dado de saúde).
 */
export interface TrainingPlanChange {
  id: string;
  planRecordId: string;
  createdAt: number;
  source: "ai" | "rules";
  trigger: TrainingAdjustTrigger;
  /** modelo de IA usado; ausente quando veio das regras */
  model?: string;
  promptVersion: string;
  items: TrainingPlanChangeItem[];
}

/** Treino em andamento: vive só no aparelho até ser finalizado. */
export interface WorkoutDraft {
  /**
   * Vira o id da sessão finalizada. É definido ao iniciar o treino, e não ao finalizar, para que
   * tocar duas vezes em "Finalizar" (ou tentar de novo depois de uma falha de rede) reenvie a MESMA
   * sessão em vez de criar outra.
   */
  id: string;
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
  /** arquivado: some das listas de escolha, mas continua dando nome ao histórico que já o usa */
  archived?: boolean;
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

/* ---------- Corrida ---------- */

/**
 * Uma corrida realizada. Registro manual: não há início, fim nem trajeto, só o dia e, quando se sabe,
 * a distância e a duração. Distância e duração ausentes significam "não informado", nunca zero.
 */
export interface RunningSession {
  id: string;
  occurredOn: DateKey;
  /** metros inteiros e positivos (5,25 km = 5250); ausente quando a pessoa não sabe */
  distanceMeters?: number;
  /** segundos inteiros e positivos; ausente quando a pessoa não sabe */
  durationSeconds?: number;
  notes?: string;
}

/* ---------- Água ---------- */

/**
 * Um toque no contador de água: um registro por vez que a pessoa bebe. O total do dia é derivado (soma dos
 * registros do dia no fuso do app). Registros são imutáveis: corrigir é remover e adicionar de novo.
 */
export interface WaterIntake {
  id: string;
  /** instante do toque (epoch ms); o dia é derivado dele no fuso do app, nunca guardado à parte */
  at: number;
  /** mililitros inteiros e positivos */
  ml: number;
}
