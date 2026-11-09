import "server-only";
import { z } from "zod";
import type { AppData } from "@/domain/snapshot";
import {
  BODY_REGIONS,
  HEALTH_SCREENINGS,
  PRIORITY_GROUPS,
  SESSION_MINUTES,
  TRAINING_DAYS,
  TRAINING_EXPERIENCES,
  TRAINING_GOALS,
  TRAINING_LOCATIONS,
  TRAINING_SPLITS,
} from "@/domain/training-profile";

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
  kind: z.enum(["savings", "category_budget", "workout_sessions", "study_minutes", "reading_pages", "running_meters", "water_ml"]),
  scopeId: id.nullable(),
  validFrom: dateKey,
  target: z.number().int(),
});

const exercise = z
  .object({ id, name: z.string(), muscleGroup: z.string(), loadType, libraryKey: absent(z.string()), archived: archivedFlag })
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
    effort: absent(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])),
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

const runningSession = z
  .object({
    id,
    occurredOn: dateKey,
    // NULL no banco = "não informado": some da chave (nunca vira 0).
    distanceMeters: absent(z.number().int()),
    durationSeconds: absent(z.number().int()),
    notes: absent(z.string()),
  })
  .transform(clean);

const waterIntake = z.object({
  id,
  // Instante do toque em ms (epoch), como os demais instantes do snapshot.
  at: z.number().int(),
  ml: z.number().int(),
});

const trainingAnswers = {
  goal: z.enum(TRAINING_GOALS),
  experience: z.enum(TRAINING_EXPERIENCES),
  daysPerWeek: z.literal(TRAINING_DAYS),
  sessionMinutes: z.literal(SESSION_MINUTES),
  location: z.enum(TRAINING_LOCATIONS),
  priorities: z.array(z.enum(PRIORITY_GROUPS)),
};

const trainingProfile = z
  .object({
    ...trainingAnswers,
    limitations: z.array(z.enum(BODY_REGIONS)),
    screening: z.enum(HEALTH_SCREENINGS),
    healthConsentAt: absent(z.number().int()),
    notes: absent(z.string()),
    updatedAt: z.number().int(),
  })
  .transform(clean);

// O detalhe do plano aceito é um documento (jsonb) validado pelo schema do comando ao entrar; aqui, de novo, ao sair.
const trainingPlan = z
  .object({
    id,
    acceptedAt: z.number().int(),
    source: z.enum(["ai", "rules"]),
    model: absent(z.string()),
    promptVersion: z.string(),
    split: z.enum(TRAINING_SPLITS),
    summary: z.string(),
    answers: z.object(trainingAnswers),
    days: z.array(
      z.object({
        planId: id,
        name: z.string(),
        exercises: z.array(
          z
            .object({ exerciseId: id, libraryKey: z.string(), reason: absent(z.string()), swapped: absent(z.literal(true)) })
            .transform(clean),
        ),
      }),
    ),
    edits: z.number().int(),
    option: absent(z.string()),
  })
  .transform(clean);

// Ajuste aceito no plano em uso: o detalhe (modelo, versão, mudanças) é um documento jsonb, validado ao entrar e ao sair.
const trainingPlanChange = z
  .object({
    id,
    planRecordId: id,
    createdAt: z.number().int(),
    source: z.enum(["ai", "rules"]),
    trigger: z.enum(["mais-curto", "menos-exercicios", "foco", "mais-pesado", "mais-leve", "texto", "troca", "sugestao"]),
    model: absent(z.string()),
    promptVersion: z.string(),
    items: z.array(
      z.object({ planId: id, where: z.string(), before: z.string(), after: z.string(), reason: z.string(), principle: z.string() }),
    ),
  })
  .transform(clean);

/**
 * Versão do esquema que este app exige do banco (`schemaVersion` de `get_snapshot`, desde a migração 16). Sobe quando
 * uma migração muda o que o app GRAVA dentro de registros: um banco antigo ignoraria esses campos em silêncio, e o app
 * prefere recusar abrir (dizendo qual migração falta) a fingir que salvou.
 */
export const SNAPSHOT_SCHEMA_VERSION = 18;

const snapshotSchema = z.object({
  serverNow: z.number(),
  schemaVersion: z.number().int().min(SNAPSHOT_SCHEMA_VERSION),
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
  runningSessions: z.array(runningSession),
  waterIntakes: z.array(waterIntake),
  trainingProfile: trainingProfile.nullable(),
  trainingPlans: z.array(trainingPlan),
  trainingPlanChanges: z.array(trainingPlanChange),
});

export interface Snapshot {
  data: AppData;
  profile: { displayName: string } | null;
  /** Relógio do servidor em ms, para corrigir a diferença do relógio do aparelho no cronômetro. */
  serverNow: number;
}

export function parseSnapshot(json: unknown): Snapshot {
  const { serverNow, profile, schemaVersion: _version, ...data } = snapshotSchema.parse(json);
  void _version; // só confere a versão; não faz parte dos dados
  // A atribuição abaixo só compila se o resultado do Zod for exatamente um AppData.
  const typed: AppData = data;
  return { data: typed, profile, serverNow };
}
