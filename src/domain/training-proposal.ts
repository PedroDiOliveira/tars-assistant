import { z } from "zod";
import { dateKeyFromInstant } from "@/lib/dates";
import { formatDayMonth } from "@/lib/format";
import type { Command, PlanInput } from "./commands";
import { isLibraryKey, libraryEntry, matchLibrary, normalizeExerciseName } from "./exercise-library";
import { TRAINING_SPLITS } from "./training-profile";
import { SPLIT_OPTION_IDS } from "./training-splits";
import {
  DAY_KINDS,
  SLOT_TYPES,
  buildSkeleton,
  defaultChoices,
  planErrors,
  rulesSummary,
  swapOptions,
  type PlanChoices,
  type PlanSkeleton,
  type PlanSlot,
  type RepRange,
  type SlotType,
} from "./training-rules";
import type { Exercise, TrainingPlanRecord, TrainingProfile, WorkoutPlan, WorkoutSession } from "./types";

/**
 * Proposta de plano em revisão. Vive SÓ no aparelho (data/plan-proposal.ts) até a pessoa aceitar: só o plano aceito
 * vai ao banco, num único comando atômico (`training.applyPlan`) que cria os exercícios que faltam, as fichas novas,
 * arquiva as antigas escolhidas e guarda o registro do plano.
 */

/** Versão das regras: muda quando o esqueleto muda, para comparar planos de versões diferentes depois. */
export const RULES_VERSION = "regras-v3";

/** Por que a proposta saiu do modelo pronto (sem IA). */
export type FallbackReason =
  | "ai_off" // IA desligada neste app (ou modo demo)
  | "ai_limit" // limite de uso da IA atingido
  | "ai_unavailable" // provedor fora do ar, lento ou recusou
  | "ai_invalid"; // a IA respondeu duas vezes fora das regras

export const FALLBACK_MESSAGES: Record<FallbackReason, string> = {
  ai_off: "Montado pelo modelo pronto do app, sem IA.",
  ai_limit: "A IA atingiu o limite de uso por agora: este plano saiu do modelo pronto do app.",
  ai_unavailable: "A IA não respondeu a tempo: este plano saiu do modelo pronto do app. Você pode gerar de novo daqui a pouco.",
  ai_invalid: "A IA não montou um plano dentro das regras: este saiu do modelo pronto do app.",
};

export interface PlanProposal {
  id: string;
  createdAt: number;
  source: "ai" | "rules";
  /** modelo de IA usado; ausente no modelo pronto */
  model?: string;
  promptVersion: string;
  fallback?: FallbackReason;
  summary: string;
  skeleton: PlanSkeleton;
  choices: PlanChoices;
  /** `updatedAt` das respostas usadas: se a pessoa refizer as perguntas, esta proposta fica desatualizada */
  profileUpdatedAt: number;
  /** quantas edições a pessoa fez na revisão (trocas, ordem, séries e repetições); ausente = nenhuma */
  edits?: number;
}

/**
 * O plano do modelo pronto: as regras escolhem tudo. Sempre válido (os testes garantem para todas as respostas e
 * divisões). `splitId` = a divisão que a pessoa escolheu no rascunho; sem ela, o padrão das regras.
 */
export function rulesProposal(
  profile: TrainingProfile,
  exercises: readonly Exercise[],
  id: string,
  nowMs: number,
  fallback?: FallbackReason,
  splitId?: string,
): PlanProposal {
  const skeleton = buildSkeleton(profile, exercises, splitId);
  return {
    id,
    createdAt: nowMs,
    source: "rules",
    promptVersion: RULES_VERSION,
    ...(fallback ? { fallback } : {}),
    summary: rulesSummary(profile, skeleton),
    skeleton,
    choices: defaultChoices(skeleton),
    profileUpdatedAt: profile.updatedAt,
  };
}

/** Mais uma edição da pessoa na revisão. */
function edited(proposal: PlanProposal, changes: Partial<PlanProposal>): PlanProposal {
  return { ...proposal, ...changes, edits: Math.min(1000, (proposal.edits ?? swapCount(proposal)) + 1) };
}

/**
 * Troca o exercício de uma vaga por outra opção permitida. Devolve null se a troca não é permitida. Passar do tempo
 * não impede a troca (a pessoa decide; a tela avisa).
 */
export function swapExercise(proposal: PlanProposal, slotId: string, exerciseKey: string): PlanProposal | null {
  if (!swapOptions(proposal.skeleton, proposal.choices, slotId).includes(exerciseKey)) return null;
  const current = proposal.choices[slotId];
  const choices = { ...proposal.choices, [slotId]: { exerciseKey, sets: current.sets, reps: current.reps, swapped: true as const } };
  return planErrors(proposal.skeleton, choices, { checkTime: false }).length === 0 ? edited(proposal, { choices }) : null;
}

/**
 * Muda a posição de um exercício dentro do treino (de `from` para `to`, índices da lista do dia). A ordem do dia é a
 * ordem das vagas: é ela que vira a ordem da ficha ao aceitar. Índices fora da lista, ou sem mudança: null.
 */
export function moveSlot(proposal: PlanProposal, dayId: string, from: number, to: number): PlanProposal | null {
  const day = proposal.skeleton.days.find((d) => d.id === dayId);
  if (!day || from === to || from < 0 || to < 0 || from >= day.slots.length || to >= day.slots.length) return null;
  const slots = [...day.slots];
  const [moved] = slots.splice(from, 1);
  slots.splice(to, 0, moved);
  const days = proposal.skeleton.days.map((d) => (d.id === dayId ? { ...d, slots } : d));
  return edited(proposal, { skeleton: { ...proposal.skeleton, days } });
}

/**
 * Muda séries e/ou repetições de uma vaga, sempre entre as opções que as regras permitem para ela. Fora das opções,
 * vaga desconhecida ou sem mudança: null.
 */
export function setPrescription(
  proposal: PlanProposal,
  slotId: string,
  change: { sets?: number; reps?: RepRange },
): PlanProposal | null {
  const slot = proposal.skeleton.days.flatMap((d) => d.slots).find((s) => s.id === slotId);
  const current = proposal.choices[slotId];
  if (!slot || !current) return null;
  const sets = change.sets ?? current.sets;
  const reps = change.reps ?? current.reps;
  if (!slot.setOptions.includes(sets) || !slot.repOptions.some((r) => r[0] === reps[0] && r[1] === reps[1])) return null;
  if (sets === current.sets && reps[0] === current.reps[0] && reps[1] === current.reps[1]) return null;
  const choices = { ...proposal.choices, [slotId]: { ...current, sets, reps: [reps[0], reps[1]] as const } };
  return edited(proposal, { choices });
}

/**
 * Tira um exercício do treino (vaga e escolha). O treino fica com pelo menos 2 exercícios; o principal (prioridade 1)
 * não sai por aqui. Vaga desconhecida ou proibida: null.
 */
export function removeSlot(proposal: PlanProposal, slotId: string): PlanProposal | null {
  const day = proposal.skeleton.days.find((d) => d.slots.some((s) => s.id === slotId));
  const slot = day?.slots.find((s) => s.id === slotId);
  if (!day || !slot || slot.tier === 1 || day.slots.length <= 2) return null;
  const days = proposal.skeleton.days.map((d) => (d.id === day.id ? { ...d, slots: d.slots.filter((s) => s.id !== slotId) } : d));
  const { [slotId]: _removed, ...choices } = proposal.choices;
  void _removed;
  return edited(proposal, { skeleton: { ...proposal.skeleton, days }, choices });
}

/**
 * Acrescenta um exercício ao treino (a vaga já vem pronta das regras). O exercício tem de ser uma das opções da vaga e
 * diferente dos que o treino já tem; a vaga entra depois das do mesmo grupo (ou no fim). Passar do tempo não impede
 * (a tela avisa). Treino que não existe, vaga repetida ou exercício fora das opções: null.
 */
export function addSlot(proposal: PlanProposal, dayId: string, slot: PlanSlot, exerciseKey: string): PlanProposal | null {
  const day = proposal.skeleton.days.find((d) => d.id === dayId);
  if (!day || day.slots.length >= 14 || proposal.choices[slot.id] || day.slots.some((s) => s.id === slot.id)) return null;
  if (!slot.options.includes(exerciseKey) || day.slots.some((s) => proposal.choices[s.id]?.exerciseKey === exerciseKey)) return null;
  const group = SLOT_TYPES[slot.type].group;
  const slots = [...day.slots];
  const last = slots.findLastIndex((s) => SLOT_TYPES[s.type].group === group);
  slots.splice(last >= 0 ? last + 1 : slots.length, 0, slot);
  const days = proposal.skeleton.days.map((d) => (d.id === dayId ? { ...d, slots } : d));
  const choices = { ...proposal.choices, [slot.id]: { exerciseKey, sets: slot.sets, reps: slot.reps } };
  const next = { ...proposal.skeleton, days };
  return planErrors(next, choices, { checkTime: false }).length === 0 ? edited(proposal, { skeleton: next, choices }) : null;
}

export function swapCount(proposal: PlanProposal): number {
  return Object.values(proposal.choices).filter((c) => c.swapped).length;
}

/**
 * O exercício da pessoa que já corresponde a esta chave da biblioteca: primeiro o vinculado, depois um sem vínculo
 * com o nome igual ao da biblioteca. Reaproveitar mantém o histórico e a evolução do exercício.
 */
export function existingExercise(exercises: readonly Exercise[], key: string): Exercise | undefined {
  const active = exercises.filter((e) => !e.archived);
  const entry = libraryEntry(key);
  return (
    active.find((e) => e.libraryKey === key) ??
    active.find((e) => !e.libraryKey && matchLibrary(e.name)?.key === key) ??
    // Nome igual ao da biblioteca, mas vinculado a outra coisa: é o mesmo exercício para a pessoa (e o nome já é dela).
    (entry ? active.find((e) => normalizeExerciseName(e.name) === normalizeExerciseName(entry.name)) : undefined)
  );
}

export type ApplyPlanCommand = Extract<Command, { type: "training.applyPlan" }>;

/**
 * Transforma a proposta aceita no comando que a grava. `archivePlanIds` são as fichas atuais que a pessoa escolheu
 * arquivar (somem da lista, o histórico fica). Ids novos vêm de `newId` (o comando é idempotente pelo id do plano).
 */
export function buildApplyPlan(input: {
  proposal: PlanProposal;
  profile: TrainingProfile;
  exercises: readonly Exercise[];
  plans: readonly WorkoutPlan[];
  archivePlanIds: readonly string[];
  nowMs: number;
  newId: () => string;
}): ApplyPlanCommand {
  const { proposal, profile, nowMs, newId } = input;
  const created: Omit<Exercise, "archived">[] = [];
  const idByKey = new Map<string, string>();
  const exerciseIdFor = (key: string): string => {
    const known = idByKey.get(key);
    if (known) return known;
    const existing = existingExercise(input.exercises, key);
    let id: string;
    if (existing) {
      id = existing.id;
    } else {
      const entry = libraryEntry(key);
      if (!entry) throw new Error(`Exercício fora da biblioteca: ${key}`);
      id = newId();
      created.push({ id, name: entry.name, muscleGroup: entry.group, loadType: entry.loadType, libraryKey: key });
    }
    idByKey.set(key, id);
    return id;
  };

  const notes = `Do plano de treino de ${formatDayMonth(dateKeyFromInstant(nowMs))}.`;
  const plans: PlanInput[] = [];
  const days: TrainingPlanRecord["days"] = [];
  for (const day of proposal.skeleton.days) {
    const planId = newId();
    const exercises = day.slots.map((slot) => {
      const choice = proposal.choices[slot.id];
      return { slot, choice, exerciseId: exerciseIdFor(choice.exerciseKey) };
    });
    plans.push({
      id: planId,
      name: day.name,
      notes,
      exercises: exercises.map(({ slot, choice, exerciseId }) => ({
        exerciseId,
        plannedSets: choice.sets,
        repMin: choice.reps[0],
        repMax: choice.reps[1],
        restSeconds: slot.restSeconds,
      })),
    });
    days.push({
      planId,
      name: day.name,
      exercises: exercises.map(({ choice, exerciseId }) => ({
        exerciseId,
        libraryKey: choice.exerciseKey,
        ...(choice.reason ? { reason: choice.reason } : {}),
        ...(choice.swapped ? { swapped: true } : {}),
      })),
    });
  }

  const known = new Set(input.plans.map((p) => p.id));
  const record: TrainingPlanRecord = {
    id: proposal.id,
    acceptedAt: nowMs,
    source: proposal.source,
    ...(proposal.model ? { model: proposal.model } : {}),
    promptVersion: proposal.promptVersion,
    split: proposal.skeleton.split,
    summary: proposal.summary,
    answers: {
      goal: profile.goal,
      experience: profile.experience,
      daysPerWeek: profile.daysPerWeek,
      sessionMinutes: profile.sessionMinutes,
      location: profile.location,
      priorities: profile.priorities,
    },
    days,
    edits: Math.min(1000, proposal.edits ?? swapCount(proposal)),
    ...(proposal.skeleton.option ? { option: proposal.skeleton.option } : {}),
  };
  return {
    type: "training.applyPlan",
    record,
    exercises: created,
    plans,
    archivePlanIds: input.archivePlanIds.filter((id) => known.has(id)),
  };
}

/** O plano aceito mais recente (o que está valendo), ou null. */
export function currentTrainingPlan(records: readonly TrainingPlanRecord[]): TrainingPlanRecord | null {
  return records.reduce<TrainingPlanRecord | null>((latest, r) => (!latest || r.acceptedAt > latest.acceptedAt ? r : latest), null);
}

/**
 * A próxima ficha do rodízio do plano atual: a seguinte à última ficha do plano que foi treinada (depois da última,
 * volta à primeira). Sem treino do plano ainda: a primeira. Só conta ficha ativa; null = nada a sugerir (sem plano,
 * ou as fichas do plano foram arquivadas).
 */
export function nextPlanInRotation(
  record: TrainingPlanRecord | null,
  sessions: readonly Pick<WorkoutSession, "planId" | "finishedAt">[],
  activePlanIds: ReadonlySet<string>,
): string | null {
  if (!record) return null;
  const order = record.days.map((d) => d.planId).filter((id) => activePlanIds.has(id));
  if (order.length < 2) return null;
  let last: { index: number; at: number } | null = null;
  for (const session of sessions) {
    const index = order.indexOf(session.planId ?? "");
    if (index >= 0 && session.finishedAt >= record.acceptedAt && (!last || session.finishedAt >= last.at)) last = { index, at: session.finishedAt };
  }
  return order[last ? (last.index + 1) % order.length : 0];
}

/* ---------- proposta vinda de fora (servidor ou armazenamento do aparelho) ---------- */

const range = z.tuple([z.number().int().min(1).max(1000), z.number().int().min(1).max(1000)]);

const proposalSchema = z.object({
  id: z.uuid(),
  createdAt: z.number().int().nonnegative(),
  source: z.enum(["ai", "rules"]),
  model: z.string().max(100).optional(),
  promptVersion: z.string().min(1).max(40),
  fallback: z.enum(["ai_off", "ai_limit", "ai_unavailable", "ai_invalid"]).optional(),
  summary: z.string().min(1).max(600),
  skeleton: z.object({
    split: z.enum(TRAINING_SPLITS),
    option: z.enum(SPLIT_OPTION_IDS).optional(),
    daysPerWeek: z.number().int().min(2).max(6).optional(),
    // Fracionário no rodízio (3 treinos em 5 dias = 1,67).
    timesPerWeek: z.number().min(1).max(3),
    budgetSeconds: z.number().int().positive(),
    days: z
      .array(
        z.object({
          id: z.string().min(1),
          kind: z.enum(DAY_KINDS),
          name: z.string().min(1).max(60),
          slots: z
            .array(
              z.object({
                id: z.string().min(1),
                type: z.enum(Object.keys(SLOT_TYPES) as [SlotType, ...SlotType[]]),
                tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
                role: z.enum(["principal", "composto", "isolado", "core"]),
                options: z.array(z.string().refine(isLibraryKey)).min(1),
                sets: z.number().int().min(1).max(20),
                setOptions: z.array(z.number().int().min(1).max(20)).min(1),
                reps: range,
                repOptions: z.array(range).min(1),
                restSeconds: z.number().int().min(0).max(1800),
              }),
            )
            .min(1)
            .max(30),
        }),
      )
      .min(1)
      .max(6),
  }),
  choices: z.record(
    z.string(),
    z.object({ exerciseKey: z.string(), sets: z.number().int(), reps: range, reason: z.string().max(200).optional(), swapped: z.literal(true).optional() }),
  ),
  profileUpdatedAt: z.number().int().nonnegative(),
  edits: z.number().int().min(0).max(1000).optional(),
});

/**
 * Lê uma proposta que veio do servidor ou do armazenamento do aparelho (pode estar velha, truncada ou adulterada):
 * só passa a que tem o formato certo E é um plano válido pelas regras desta versão do app. O resto vira null.
 */
export function parsePlanProposal(raw: unknown): PlanProposal | null {
  const parsed = proposalSchema.safeParse(raw);
  if (!parsed.success) return null;
  const proposal = parsed.data as PlanProposal;
  // O tempo fica de fora: a pessoa pode ter decidido passar dele na revisão.
  return planErrors(proposal.skeleton, proposal.choices, { checkTime: false }).length === 0 ? proposal : null;
}
