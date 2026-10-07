import type {
  Book,
  BookStatus,
  Category,
  Exercise,
  Goal,
  ReadingSession,
  StudySession,
  Subject,
  Transaction,
  TxTemplate,
  WorkoutPlan,
  WorkoutSession,
} from "./types";

/**
 * Toda mudança nos dados persistidos é um comando. O mesmo comando alimenta o reducer puro
 * (atualização otimista e modo demo) e o servidor (Server Action -> banco), e o teste de
 * paridade garante que os dois chegam ao mesmo estado.
 *
 * Regras que todo comando respeita:
 * - Ids vêm do cliente (UUID): repetir o comando nunca duplica o registro.
 * - Instantes que dependem do relógio (`nowMs`) vão no comando, para o reducer continuar puro.
 */
export type Command =
  /* finanças */
  | { type: "transaction.add"; transaction: Transaction }
  | { type: "transaction.update"; id: string; fields: TransactionFields }
  | { type: "transaction.delete"; id: string }
  | { type: "template.add"; template: TxTemplate }
  | { type: "template.delete"; id: string }
  /* metas */
  | { type: "goal.set"; goal: Goal }
  /* treino (o rascunho é local; só a sessão finalizada é um comando) */
  | { type: "workout.finish"; session: WorkoutSession }
  | { type: "workout.deleteSession"; id: string }
  /* estudos */
  | { type: "study.start"; subjectId: string; nowMs: number }
  | { type: "study.pause"; nowMs: number }
  | { type: "study.resume"; nowMs: number }
  | { type: "study.finish"; sessionId: string; nowMs: number }
  | { type: "study.discard" }
  | { type: "studySession.add"; session: StudySession }
  | { type: "studySession.update"; id: string; fields: StudySessionFields }
  | { type: "studySession.delete"; id: string }
  | { type: "subject.add"; subject: Subject }
  | { type: "subject.update"; id: string; fields: SubjectFields }
  | { type: "subject.archive"; id: string; archived: boolean }
  /* catálogos de finanças e treino. Itens já usados nunca são apagados: são ARQUIVADOS (somem das escolhas,
     mas continuam dando nome ao histórico). */
  | { type: "category.add"; category: Omit<Category, "archived"> }
  | { type: "category.update"; id: string; fields: CategoryFields }
  | { type: "category.archive"; id: string; archived: boolean }
  | { type: "exercise.add"; exercise: Omit<Exercise, "archived"> }
  | { type: "exercise.update"; id: string; fields: ExerciseFields }
  | { type: "exercise.archive"; id: string; archived: boolean }
  /** Cria a ficha ou substitui nome, observações e exercícios dela (atômico). Não altera treinos já feitos. */
  | { type: "plan.save"; plan: PlanInput }
  | { type: "plan.archive"; id: string; archived: boolean }
  /* leitura */
  | { type: "book.add"; book: Book }
  | { type: "book.update"; id: string; fields: BookFields }
  /** Apaga o livro E as sessões de leitura dele. */
  | { type: "book.delete"; id: string }
  | { type: "book.setStatus"; id: string; status: BookStatus }
  | { type: "reading.addSession"; session: ReadingSession }
  | { type: "reading.updateSession"; id: string; fields: ReadingSessionFields }
  | { type: "reading.deleteSession"; id: string };

/**
 * Campos editáveis de um registro. Atualizar SUBSTITUI todos eles (não é um patch parcial): assim "limpar a
 * observação" é só omiti-la, sem a ambiguidade de `undefined` que o JSON descartaria na rede.
 * O `source` (manual/ia) nasce com o registro e nunca muda.
 */
export type TransactionFields = Omit<Transaction, "id" | "source">;
export type StudySessionFields = Omit<StudySession, "id" | "source">;
export type SubjectFields = Omit<Subject, "id" | "hue" | "archived">;
/** O tipo (receita/despesa) de uma categoria não muda: os lançamentos dela dependem dele. */
export type CategoryFields = Omit<Category, "id" | "type" | "archived">;
export type ExerciseFields = Omit<Exercise, "id" | "archived">;
export type PlanInput = Omit<WorkoutPlan, "archived">;
export type BookFields = Omit<Book, "id" | "status">;
export type ReadingSessionFields = Omit<ReadingSession, "id" | "bookId">;

export type CommandType = Command["type"];

/**
 * Desfecho de um comando que deu certo. Só `study.finish` varia: "too_short" (sessão com menos de
 * 1 min, descartada) e "none" (não havia cronômetro). Os demais devolvem "saved".
 */
export type Outcome = "saved" | "too_short" | "none";
