import type { AssistantReply } from "@/domain/assistant";
import type { DateKey } from "@/lib/dates";
import type {
  BookFields,
  CategoryFields,
  ExerciseFields,
  PlanInput,
  ReadingSessionFields,
  StudySessionFields,
  SubjectFields,
  TransactionFields,
} from "@/domain/commands";
import type {
  Book,
  BookStatus,
  Category,
  Exercise,
  GoalKind,
  ReadingSession,
  SetLog,
  StudySession,
  Transaction,
  TxTemplate,
} from "@/domain/types";

/* ---------- resultado ---------- */

export type FailureCode =
  | "validation" // a regra de negócio recusou (ex.: página final menor que a inicial)
  | "offline" // sem rede: nada foi salvo
  | "conflict" // o servidor já tem um estado diferente
  | "unauthorized" // sessão expirada
  | "unknown";

/** `error` já é a mensagem para o usuário, em português. */
export interface Failure {
  ok: false;
  error: string;
  code: FailureCode;
}

export interface Success<T> {
  ok: true;
  value: T;
}

export type Result<T = void> = Success<T> | Failure;

export function ok(): Success<void>;
export function ok<T>(value: T): Success<T>;
export function ok(value?: unknown): Success<unknown> {
  return { ok: true, value };
}

export function fail(error: string, code: FailureCode = "unknown"): Failure {
  return { ok: false, error, code };
}

/* ---------- desfechos ---------- */

export type FinishStudyOutcome = "saved" | "too_short" | "none";
export type FinishWorkoutOutcome = "saved" | "empty" | "none";

/* ---------- entradas ---------- */

export type NewTransaction = Omit<Transaction, "id" | "source"> & {
  source?: Transaction["source"];
  /** Id da proposta do assistente: confirmar duas vezes a mesma proposta nunca duplica o lançamento. */
  id?: string;
};
export type NewStudySession = Omit<StudySession, "id" | "source"> & { source?: StudySession["source"] };

export interface GoalInput {
  kind: GoalKind;
  scopeId: string | null;
  validFrom: DateKey;
  target: number;
}

/* ---------- ações ---------- */

/**
 * Ações sobre dados persistidos. São assíncronas porque no modo real passam pelo servidor, e só
 * devolvem `ok` depois de salvar: a tela mostra "salvo" apenas então (spec §13).
 */
export interface DataActions {
  /* finanças */
  addTransaction(input: NewTransaction): Promise<Result<{ id: string }>>;
  /** Substitui os campos editáveis (não é um patch parcial). */
  updateTransaction(id: string, fields: TransactionFields): Promise<Result>;
  deleteTransaction(id: string): Promise<Result>;
  addTemplate(input: Omit<TxTemplate, "id">): Promise<Result>;
  deleteTemplate(id: string): Promise<Result>;
  /* metas */
  setGoal(input: GoalInput): Promise<Result>;
  /* treino */
  finishWorkout(): Promise<Result<FinishWorkoutOutcome>>;
  deleteWorkoutSession(id: string): Promise<Result>;
  /* estudos */
  startStudy(subjectId: string): Promise<Result>;
  pauseStudy(): Promise<Result>;
  resumeStudy(): Promise<Result>;
  finishStudy(): Promise<Result<FinishStudyOutcome>>;
  discardStudy(): Promise<Result>;
  addStudySession(input: NewStudySession): Promise<Result>;
  updateStudySession(id: string, fields: StudySessionFields): Promise<Result>;
  deleteStudySession(id: string): Promise<Result>;
  addSubject(name: string, objective?: string): Promise<Result<{ id: string }>>;
  updateSubject(id: string, fields: SubjectFields): Promise<Result>;
  /** Arquivar esconde a matéria das escolhas; o histórico de estudo dela continua. */
  archiveSubject(id: string, archived: boolean): Promise<Result>;
  /* catálogos: o que já foi usado é arquivado, nunca apagado */
  addCategory(input: Pick<Category, "name" | "type" | "icon">): Promise<Result<{ id: string }>>;
  updateCategory(id: string, fields: CategoryFields): Promise<Result>;
  archiveCategory(id: string, archived: boolean): Promise<Result>;
  addExercise(input: Omit<Exercise, "id" | "archived">): Promise<Result<{ id: string }>>;
  updateExercise(id: string, fields: ExerciseFields): Promise<Result>;
  archiveExercise(id: string, archived: boolean): Promise<Result>;
  /** Cria (sem `id`) ou substitui (com `id`) a ficha, com os exercícios. Treinos já feitos não mudam. */
  savePlan(input: Omit<PlanInput, "id"> & { id?: string }): Promise<Result<{ id: string }>>;
  archivePlan(id: string, archived: boolean): Promise<Result>;
  /* leitura */
  addBook(input: Omit<Book, "id">): Promise<Result<{ id: string }>>;
  updateBook(id: string, fields: BookFields): Promise<Result>;
  /** Apaga o livro e todas as sessões de leitura dele. */
  deleteBook(id: string): Promise<Result>;
  setBookStatus(id: string, status: BookStatus): Promise<Result>;
  /** Falha com `code: "validation"` e a mensagem em português quando as páginas são inválidas. */
  addReadingSession(input: Omit<ReadingSession, "id">): Promise<Result>;
  updateReadingSession(id: string, fields: ReadingSessionFields): Promise<Result>;
  deleteReadingSession(id: string): Promise<Result>;
}

/**
 * Ações só do aparelho: o treino em andamento é um rascunho local (decisão B), alterado a cada
 * toque, então tem de ser síncrono e instantâneo.
 */
export interface LocalActions {
  startWorkout(planId: string): void;
  updateDraftSet(exerciseIndex: number, setIndex: number, patch: Partial<SetLog>): void;
  addDraftSet(exerciseIndex: number): void;
  removeDraftSet(exerciseIndex: number, setIndex: number): void;
  setDraftNotes(notes: string): void;
  cancelWorkout(): void;
  /** Só existe no modo demo. */
  resetDemo(): void;
}

/**
 * O assistente. No modo real a pergunta vai ao servidor (que consulta o provedor de IA); no demo é uma simulação
 * local. Em ambos o resultado é o mesmo: um texto, e talvez uma PROPOSTA de lançamento que só é salva quando o
 * usuário confirma. Falhas vêm com mensagem em português; a tela sempre oferece o caminho manual.
 */
export interface AssistantApi {
  ask(message: string): Promise<Result<AssistantReply>>;
}

export type Actions = DataActions & LocalActions;
