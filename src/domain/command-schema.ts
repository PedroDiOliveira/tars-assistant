import { z } from "zod";
import { isValidDateKey, weekStart } from "@/lib/dates";
import type { Command } from "./commands";
import { GOAL_PERIOD } from "./goals";
import { MAX_SESSION_SECONDS, MIN_TIMER_SECONDS } from "./studies";

/**
 * Valida um comando que chegou de fora (o navegador) antes de ele tocar o banco. Os limites espelham as
 * constraints das migrações: o banco continua sendo a última defesa, mas aqui o usuário recebe uma mensagem
 * clara em vez de um erro genérico de constraint, e nada malformado chega ao RPC.
 *
 * Objetos são `strict`: um campo desconhecido (ex.: um `userId` plantado) é recusado, nunca ignorado.
 */

const MAX_CENTS = 9_999_999_999;

const uuid = z.uuid({ error: "Identificador inválido." });
const text = (max: number, label: string) =>
  z.string().max(max, { error: `${label}: no máximo ${max} caracteres.` });
const name = (max: number, label: string) =>
  z.string().trim().min(1, { error: `${label}: informe um valor.` }).max(max, { error: `${label}: no máximo ${max} caracteres.` });

const dateKey = z
  .string()
  .refine((v) => isValidDateKey(v) && v >= "2000-01-01" && v <= "2100-12-31", { error: "Data inválida." });

const epochMs = z.number().int().min(0).max(8_640_000_000_000_000);
const cents = z.number().int({ error: "Valor inválido." }).min(1, { error: "O valor deve ser maior que zero." }).max(MAX_CENTS, { error: "Valor alto demais." });
const page = z.number().int({ error: "Use números inteiros nas páginas." });
const txType = z.enum(["income", "expense"]);
const loadType = z.enum(["external", "bodyweight"]);

const obj = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape);

const transaction = obj({
  id: uuid,
  type: txType,
  amountCents: cents,
  categoryId: uuid,
  description: text(200, "Descrição"),
  occurredOn: dateKey,
  source: z.enum(["manual", "ai"]),
});

const transactionFields = obj({
  type: txType,
  amountCents: cents,
  categoryId: uuid,
  description: text(200, "Descrição"),
  occurredOn: dateKey,
});

const template = obj({
  id: uuid,
  label: name(60, "Atalho"),
  type: txType,
  amountCents: cents,
  categoryId: uuid,
});

const goal = obj({
  id: uuid,
  kind: z.enum(["savings", "category_budget", "workout_sessions", "study_minutes", "reading_pages"]),
  scopeId: uuid.nullable(),
  validFrom: dateKey,
  target: z.number().int().min(0, { error: "A meta não pode ser negativa." }).max(MAX_CENTS),
}).superRefine((g, ctx) => {
  const monthly = GOAL_PERIOD[g.kind] === "month";
  const aligned = monthly ? g.validFrom.endsWith("-01") : weekStart(g.validFrom) === g.validFrom;
  if (!aligned) {
    ctx.addIssue({
      code: "custom",
      path: ["validFrom"],
      message: monthly ? "A vigência deve começar no dia 1 do mês." : "A vigência deve começar numa segunda-feira.",
    });
  }
  if (g.kind === "category_budget" && g.scopeId === null) {
    ctx.addIssue({ code: "custom", path: ["scopeId"], message: "O orçamento precisa de uma categoria." });
  }
  if (g.scopeId !== null && g.kind !== "category_budget" && g.kind !== "study_minutes") {
    ctx.addIssue({ code: "custom", path: ["scopeId"], message: "Esta meta não tem escopo." });
  }
});

const setLog = obj({
  weightKg: z.number().min(0).max(9999.99).multipleOf(0.01),
  reps: z.number().int().min(1).max(1000),
  // Só séries concluídas chegam ao servidor (finalizeDraft descarta o resto).
  done: z.literal(true),
});

const sessionExercise = obj({
  exerciseId: uuid,
  nameSnapshot: name(60, "Exercício"),
  loadType,
  plannedSets: z.number().int().min(1).max(50),
  repMin: z.number().int().min(1).max(1000),
  repMax: z.number().int().min(1).max(1000),
  restSeconds: z.number().int().min(0).max(1800),
  sets: z.array(setLog).min(1).max(50),
}).refine((e) => e.repMax >= e.repMin, { error: "Repetições máximas menores que as mínimas." });

const workoutSession = obj({
  id: uuid,
  planId: uuid.nullable(),
  nameSnapshot: name(60, "Treino"),
  startedAt: epochMs,
  finishedAt: epochMs,
  occurredOn: dateKey,
  notes: text(500, "Observações").optional(),
  exercises: z.array(sessionExercise).min(1, { error: "Conclua ao menos uma série para salvar o treino." }).max(40),
}).refine((s) => s.finishedAt >= s.startedAt, { error: "O treino não pode terminar antes de começar." });

const studyFields = obj({
  subjectId: uuid,
  occurredOn: dateKey,
  durationSeconds: z.number().int().min(MIN_TIMER_SECONDS, { error: "Mínimo de 1 minuto." }).max(MAX_SESSION_SECONDS, { error: "Máximo de 24 horas por sessão." }),
  notes: text(200, "Observações").optional(),
});

const studySession = obj({
  id: uuid,
  source: z.enum(["timer", "manual"]),
  subjectId: uuid,
  occurredOn: dateKey,
  durationSeconds: studyFields.shape.durationSeconds,
  notes: text(200, "Observações").optional(),
});

const subject = obj({
  id: uuid,
  name: name(40, "Matéria"),
  objective: text(60, "Objetivo").optional(),
  hue: z.number().int().min(0).max(360),
});

const book = obj({
  id: uuid,
  title: name(80, "Título"),
  author: text(60, "Autor").optional(),
  totalPages: z.number().int().min(1, { error: "Informe o total de páginas." }).max(100_000),
  initialPage: z.number().int().min(0),
  status: z.enum(["want", "reading", "done", "paused"]),
}).refine((b) => b.initialPage <= b.totalPages, { error: "A página inicial passa do total do livro." });

const readingSession = obj({
  id: uuid,
  bookId: uuid,
  occurredOn: dateKey,
  startPage: page,
  endPage: page,
  notes: text(200, "Observações").optional(),
});

const subjectFields = obj({
  name: name(40, "Matéria"),
  objective: text(60, "Objetivo").optional(),
});

const iconKey = z.string().regex(/^[a-z]{1,30}$/, { error: "Ícone inválido." });
const hue = z.number().int().min(0).max(360);

const category = obj({
  id: uuid,
  name: name(40, "Categoria"),
  type: txType,
  icon: iconKey,
  hue,
});

const categoryFields = obj({ name: name(40, "Categoria"), icon: iconKey, hue });

const exerciseFields = obj({
  name: name(60, "Exercício"),
  muscleGroup: name(30, "Grupo muscular"),
  loadType,
});

const exercise = obj({ id: uuid, ...exerciseFields.shape });

const planExercise = obj({
  exerciseId: uuid,
  plannedSets: z.number().int().min(1, { error: "Informe ao menos 1 série." }).max(20, { error: "No máximo 20 séries por exercício." }),
  repMin: z.number().int().min(1).max(1000),
  repMax: z.number().int().min(1).max(1000),
  restSeconds: z.number().int().min(0).max(1800),
}).refine((e) => e.repMax >= e.repMin, { error: "As repetições máximas não podem ser menores que as mínimas." });

const plan = obj({
  id: uuid,
  name: name(60, "Ficha"),
  notes: text(500, "Observações").optional(),
  exercises: z.array(planExercise).min(1, { error: "Adicione ao menos um exercício à ficha." }).max(30, { error: "No máximo 30 exercícios por ficha." }),
}).refine((p) => new Set(p.exercises.map((e) => e.exerciseId)).size === p.exercises.length, {
  error: "Há exercícios repetidos na ficha.",
});

const bookFields = obj({
  title: name(80, "Título"),
  author: text(60, "Autor").optional(),
  totalPages: z.number().int().min(1, { error: "Informe o total de páginas." }).max(100_000),
  initialPage: z.number().int().min(0),
}).refine((b) => b.initialPage <= b.totalPages, { error: "A página inicial passa do total do livro." });

const readingFields = obj({
  occurredOn: dateKey,
  startPage: page,
  endPage: page,
  notes: text(200, "Observações").optional(),
});

export const commandSchema: z.ZodType<Command> = z.discriminatedUnion("type", [
  obj({ type: z.literal("transaction.add"), transaction }),
  obj({ type: z.literal("transaction.update"), id: uuid, fields: transactionFields }),
  obj({ type: z.literal("transaction.delete"), id: uuid }),
  obj({ type: z.literal("template.add"), template }),
  obj({ type: z.literal("template.delete"), id: uuid }),
  obj({ type: z.literal("goal.set"), goal }),
  obj({ type: z.literal("workout.finish"), session: workoutSession }),
  obj({ type: z.literal("workout.deleteSession"), id: uuid }),
  obj({ type: z.literal("study.start"), subjectId: uuid, nowMs: epochMs }),
  obj({ type: z.literal("study.pause"), nowMs: epochMs }),
  obj({ type: z.literal("study.resume"), nowMs: epochMs }),
  obj({ type: z.literal("study.finish"), sessionId: uuid, nowMs: epochMs }),
  obj({ type: z.literal("study.discard") }),
  obj({ type: z.literal("studySession.add"), session: studySession }),
  obj({ type: z.literal("studySession.update"), id: uuid, fields: studyFields }),
  obj({ type: z.literal("studySession.delete"), id: uuid }),
  obj({ type: z.literal("subject.add"), subject }),
  obj({ type: z.literal("subject.update"), id: uuid, fields: subjectFields }),
  obj({ type: z.literal("subject.archive"), id: uuid, archived: z.boolean() }),
  obj({ type: z.literal("category.add"), category }),
  obj({ type: z.literal("category.update"), id: uuid, fields: categoryFields }),
  obj({ type: z.literal("category.archive"), id: uuid, archived: z.boolean() }),
  obj({ type: z.literal("exercise.add"), exercise }),
  obj({ type: z.literal("exercise.update"), id: uuid, fields: exerciseFields }),
  obj({ type: z.literal("exercise.archive"), id: uuid, archived: z.boolean() }),
  obj({ type: z.literal("plan.save"), plan }),
  obj({ type: z.literal("plan.archive"), id: uuid, archived: z.boolean() }),
  obj({ type: z.literal("book.add"), book }),
  obj({ type: z.literal("book.update"), id: uuid, fields: bookFields }),
  obj({ type: z.literal("book.delete"), id: uuid }),
  obj({ type: z.literal("book.setStatus"), id: uuid, status: z.enum(["want", "reading", "done", "paused"]) }),
  obj({ type: z.literal("reading.addSession"), session: readingSession }),
  obj({ type: z.literal("reading.updateSession"), id: uuid, fields: readingFields }),
  obj({ type: z.literal("reading.deleteSession"), id: uuid }),
]);

/**
 * Primeira mensagem de erro, já em português, para devolver ao usuário. As mensagens escritas nos schemas
 * acima passam; qualquer outra (campo ausente, tipo errado, comando desconhecido: só acontece com um cliente
 * adulterado ou com bug) vira "Pedido inválido.", sem expor a estrutura interna.
 */
export function parseCommand(raw: unknown): { ok: true; command: Command } | { ok: false; error: string } {
  const parsed = commandSchema.safeParse(raw, { error: () => GENERIC_ERROR });
  if (parsed.success) return { ok: true, command: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
}

const GENERIC_ERROR = "Pedido inválido.";
