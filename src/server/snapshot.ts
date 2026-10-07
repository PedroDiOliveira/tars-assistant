import "server-only";
import { z } from "zod";
import type { AppData } from "@/domain/snapshot";

/**
 * Contrato entre `get_snapshot()` (SQL) e o domínio (TypeScript). O banco devolve camelCase no formato de
 * `AppData`; aqui validamos cada campo e convertemos `null` em ausência (o domínio usa `campo?: T`).
 * Um dado inesperado vira erro explícito, e não um `undefined` que estoura numa tela.
 */

/** `null` do banco => propriedade ausente, como no domínio. */
const absent = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? undefined);

/** Só marca `archived` quando é verdadeiro: o padrão (ativo) fica igual ao dado de um reducer. */
const archivedFlag = z
  .boolean()
  .optional()
  .transform((value) => (value ? true : undefined));

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1);
const txType = z.enum(["income", "expense"]);
const loadType = z.enum(["external", "bodyweight"]);

/** Remove as chaves `undefined` para o objeto ficar idêntico ao que o reducer produz. */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

const category = z
  .object({ id, name: z.string(), type: txType, icon: z.string(), hue: z.number(), archived: archivedFlag })
  .transform(clean);

const transaction = z.object({
  id,
  type: txType,
  amountCents: z.number().int(),
  categoryId: id,
  description: z.string(),
  occurredOn: dateKey,
  source: z.enum(["manual", "ai"]),
});

const template = z.object({
  id,
  label: z.string(),
  type: txType,
  amountCents: z.number().int(),
  categoryId: id,
});

const goal = z.object({
  id,
  kind: z.enum(["savings", "category_budget", "workout_sessions", "study_minutes", "reading_pages"]),
  scopeId: id.nullable(),
  validFrom: dateKey,
  target: z.number().int(),
});

const exercise = z
  .object({ id, name: z.string(), muscleGroup: z.string(), loadType, archived: archivedFlag })
  .transform(clean);

const planExercise = z.object({
  exerciseId: id,
  plannedSets: z.number().int(),
  repMin: z.number().int(),
  repMax: z.number().int(),
  restSeconds: z.number().int(),
});

const plan = z
  .object({
    id,
    name: z.string(),
    notes: absent(z.string()),
    archived: archivedFlag,
    exercises: z.array(planExercise),
  })
  .transform(clean);

const setLog = z.object({ weightKg: z.number(), reps: z.number().int(), done: z.boolean() });

const sessionExercise = z.object({
  exerciseId: id,
  nameSnapshot: z.string(),
  loadType,
  plannedSets: z.number().int(),
  repMin: z.number().int(),
  repMax: z.number().int(),
  restSeconds: z.number().int(),
  sets: z.array(setLog),
});

const workoutSession = z
  .object({
    id,
    planId: id.nullable(),
    nameSnapshot: z.string(),
    startedAt: z.number(),
    finishedAt: z.number(),
    occurredOn: dateKey,
    notes: absent(z.string()),
    exercises: z.array(sessionExercise),
  })
  .transform(clean);

const subject = z
  .object({ id, name: z.string(), objective: absent(z.string()), hue: z.number(), archived: archivedFlag })
  .transform(clean);

const studySession = z
  .object({
    id,
    subjectId: id,
    source: z.enum(["timer", "manual"]),
    occurredOn: dateKey,
    durationSeconds: z.number().int(),
    notes: absent(z.string()),
  })
  .transform(clean);

const timer = z.object({
  subjectId: id,
  startedAt: z.number(),
  runningSince: z.number().nullable(),
  accumulatedSeconds: z.number().int(),
});

const book = z
  .object({
    id,
    title: z.string(),
    author: absent(z.string()),
    totalPages: z.number().int(),
    initialPage: z.number().int(),
    status: z.enum(["want", "reading", "done", "paused"]),
  })
  .transform(clean);

const readingSession = z
  .object({
    id,
    bookId: id,
    occurredOn: dateKey,
    startPage: z.number().int(),
    endPage: z.number().int(),
    notes: absent(z.string()),
  })
  .transform(clean);

const snapshotSchema = z.object({
  serverNow: z.number(),
  profile: z.object({ displayName: z.string() }).nullable(),
  categories: z.array(category),
  transactions: z.array(transaction),
  templates: z.array(template),
  goals: z.array(goal),
  exercises: z.array(exercise),
  plans: z.array(plan),
  sessions: z.array(workoutSession),
  subjects: z.array(subject),
  studySessions: z.array(studySession),
  timer: timer.nullable(),
  books: z.array(book),
  readingSessions: z.array(readingSession),
});

export interface Snapshot {
  data: AppData;
  profile: { displayName: string } | null;
  /** Relógio do servidor em ms, para corrigir a diferença do relógio do aparelho no cronômetro. */
  serverNow: number;
}

export function parseSnapshot(json: unknown): Snapshot {
  const { serverNow, profile, ...data } = snapshotSchema.parse(json);
  // A atribuição abaixo só compila se o resultado do Zod for exatamente um AppData.
  const typed: AppData = data;
  return { data: typed, profile, serverNow };
}
