import type { Command, PlanInput } from "./commands";
import { libraryEntry, matchLibrary } from "./exercise-library";
import { applyChange, describeChange, type SuggestedChange } from "./training-adjust";
import { existingExercise, type PlanProposal } from "./training-proposal";
import { trainingMonthReport, defaultReportMonth } from "./training-report";
import { SLOT_TYPES, allowedOptions, buildSkeleton, knownLibraryKeys, makeSlot, swapOptions, type PlanDay, type PlanSlot, type RepRange, type SlotType } from "./training-rules";
import { SPLIT_OPTIONS } from "./training-splits";
import type { DataSnapshot } from "./summary";
import type {
  Exercise,
  PlanExercise,
  TrainingAdjustTrigger,
  TrainingPlanChange,
  TrainingPlanChangeItem,
  TrainingPlanRecord,
  TrainingProfile,
  WorkoutPlan,
} from "./types";
import type { DateKey } from "@/lib/dates";

/**
 * O plano EM USO visto como um rascunho: as fichas atuais (com o que a pessoa já mudou nelas à mão) encaixadas nas
 * vagas das regras. Assim os mesmos ajustes do rascunho (chips, IA, prévia de antes → depois) valem para o plano em uso,
 * com as mesmas validações. Exercício que não encaixa em nenhuma vaga (cadastrado à mão, fora da biblioteca, ou
 * repetido) fica FIXO: não aparece nos ajustes e volta para a ficha na mesma posição.
 */
export interface CurrentPlanView {
  record: TrainingPlanRecord;
  /** as respostas DO PLANO com as limitações de hoje: quem ajusta o foco usa estas */
  profile: TrainingProfile;
  /** rascunho virtual: só os exercícios que encaixaram em vagas */
  proposal: PlanProposal;
  /** vaga -> ficha e exercício reais */
  slots: Record<string, { planId: string; exerciseId: string }>;
  /** treino (id do rascunho) -> ficha */
  dayPlan: Record<string, string>;
  /** por ficha: exercícios fixos, com a posição original */
  fixed: Record<string, { index: number; item: PlanExercise }[]>;
  plans: Record<string, WorkoutPlan>;
}

/** A divisão do plano aceito: a gravada ou, nos planos de antes do rodízio, a que tem a mesma família e quantidade. */
function recordOption(record: TrainingPlanRecord): string | undefined {
  return record.option ?? SPLIT_OPTIONS.find((o) => o.family === record.split && o.days.length === record.days.length)?.id;
}

const keyOf = (exercise: Exercise | undefined) => (exercise ? (exercise.libraryKey ?? matchLibrary(exercise.name)?.key ?? null) : null);
const sortedUnique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

export function currentPlanView(
  record: TrainingPlanRecord,
  data: Pick<DataSnapshot, "plans" | "exercises" | "trainingProfile">,
  id: string,
): CurrentPlanView | null {
  // As respostas DO PLANO (dias, tempo, local...) com as limitações de hoje: as opções de troca respeitam o que dói agora.
  const today = data.trainingProfile;
  const profile: TrainingProfile = {
    ...record.answers,
    limitations: today?.limitations ?? [],
    screening: today?.screening ?? "nao-respondida",
    ...(today?.healthConsentAt !== undefined ? { healthConsentAt: today.healthConsentAt } : {}),
    updatedAt: today?.updatedAt ?? record.acceptedAt,
  };
  const skeleton = buildSkeleton(profile, data.exercises, recordOption(record));
  if (skeleton.days.length !== record.days.length) return null;

  const exerciseById = new Map(data.exercises.map((e) => [e.id, e]));
  const slots: CurrentPlanView["slots"] = {};
  const dayPlan: CurrentPlanView["dayPlan"] = {};
  const fixed: CurrentPlanView["fixed"] = {};
  const plans: CurrentPlanView["plans"] = {};
  const choices: PlanProposal["choices"] = {};
  const days: PlanDay[] = [];

  record.days.forEach((recordDay, i) => {
    const plan = data.plans.find((p) => p.id === recordDay.planId && !p.archived);
    if (!plan) return;
    plans[plan.id] = plan;
    const pool = [...skeleton.days[i].slots];
    const used = new Set<string>();
    const daySlots: PlanSlot[] = [];
    fixed[plan.id] = [];
    plan.exercises.forEach((item, j) => {
      const key = keyOf(exerciseById.get(item.exerciseId));
      const slotIndex = key && !used.has(key) ? pool.findIndex((s) => s.options.includes(key)) : -1;
      // Exercício que o app acrescentou ao reforçar um grupo (ou que a pessoa escolheu) e que os modelos de treino não
      // têm numa vaga livre: vira uma vaga extra do tipo dele, para contar no volume em vez de ficar de fora.
      let base: PlanSlot | undefined = slotIndex >= 0 ? pool.splice(slotIndex, 1)[0] : undefined;
      if (!base && key && !used.has(key)) {
        const type = (Object.keys(SLOT_TYPES) as SlotType[]).find((t) => SLOT_TYPES[t].options.includes(key));
        const options = type ? allowedOptions(type, profile, knownLibraryKeys(data.exercises)) : [];
        if (type && options.includes(key)) base = makeSlot(profile, { type, options }, 2, `c${i + 1}x${j + 1}`, false);
      }
      if (!key || !base) {
        fixed[plan.id].push({ index: j, item });
        return;
      }
      used.add(key);
      const reps: RepRange = [item.repMin, item.repMax];
      const slot: PlanSlot = {
        ...base,
        id: `c${i + 1}s${j + 1}`,
        // O que já está na ficha sempre vale (a pessoa pode ter mudado à mão); as opções das regras continuam ao lado.
        setOptions: sortedUnique([...base.setOptions, item.plannedSets]),
        repOptions: base.repOptions.some((r) => r[0] === reps[0] && r[1] === reps[1]) ? base.repOptions : [...base.repOptions, reps],
        restSeconds: item.restSeconds,
      };
      daySlots.push(slot);
      slots[slot.id] = { planId: plan.id, exerciseId: item.exerciseId };
      choices[slot.id] = { exerciseKey: key, sets: item.plannedSets, reps };
    });
    if (daySlots.length === 0) return;
    const dayId = `c${i + 1}`;
    dayPlan[dayId] = plan.id;
    days.push({ id: dayId, kind: skeleton.days[i].kind, name: plan.name, slots: daySlots });
  });
  if (days.length === 0) return null;

  const proposal: PlanProposal = {
    id,
    createdAt: record.acceptedAt,
    source: record.source,
    promptVersion: record.promptVersion,
    summary: record.summary,
    skeleton: { ...skeleton, days },
    choices,
    profileUpdatedAt: profile.updatedAt,
  };
  return { record, profile, proposal, slots, dayPlan, fixed, plans };
}

/**
 * Monta o comando que grava um ajuste aceito no plano em uso: as fichas alteradas (exercícios fixos de volta no lugar),
 * os exercícios da biblioteca que a pessoa ainda não tinha e o registro do que mudou, como a pessoa viu na prévia.
 */
export function buildAdjustPlan(input: {
  view: CurrentPlanView;
  changes: readonly SuggestedChange[];
  trigger: TrainingAdjustTrigger;
  source: "ai" | "rules";
  model?: string;
  promptVersion: string;
  exercises: readonly Exercise[];
  nameOf: (exerciseKey: string) => string;
  nowMs: number;
  newId: () => string;
}): Extract<Command, { type: "training.adjustPlan" }> | null {
  const { view } = input;
  let current = view.proposal;
  const items: TrainingPlanChangeItem[] = [];
  for (const suggestion of input.changes) {
    const view_ = describeChange(current, suggestion.change, input.nameOf);
    const next = applyChange(current, suggestion.change);
    if (!view_ || !next) continue;
    current = next;
    items.push({
      planId: suggestion.change.kind === "add" ? view.dayPlan[suggestion.change.dayId] : view.slots[suggestion.change.slotId].planId,
      where: view_.where,
      before: view_.before,
      after: view_.after,
      reason: suggestion.reason,
      principle: suggestion.principle,
    });
  }
  if (items.length === 0) return null;

  const created: Omit<Exercise, "archived">[] = [];
  const idByKey = new Map<string, string>();
  const exerciseIdFor = (slotId: string, key: string): string => {
    // Mesmo exercício de antes na vaga: o da ficha (o nome pode ser o que a pessoa deu).
    if (view.proposal.choices[slotId]?.exerciseKey === key) return view.slots[slotId].exerciseId;
    const known = idByKey.get(key) ?? existingExercise(input.exercises, key)?.id;
    if (known) return known;
    const entry = libraryEntry(key);
    if (!entry) throw new Error(`Exercício fora da biblioteca: ${key}`);
    const id = input.newId();
    created.push({ id, name: entry.name, muscleGroup: entry.group, loadType: entry.loadType, libraryKey: key });
    idByKey.set(key, id);
    return id;
  };

  const touched = new Set(items.map((i) => i.planId));
  const plans: PlanInput[] = [];
  for (const day of current.skeleton.days) {
    const planId = view.dayPlan[day.id];
    if (!touched.has(planId)) continue;
    const plan = view.plans[planId];
    const exercises: PlanExercise[] = day.slots.map((slot) => {
      const choice = current.choices[slot.id];
      return { exerciseId: exerciseIdFor(slot.id, choice.exerciseKey), plannedSets: choice.sets, repMin: choice.reps[0], repMax: choice.reps[1], restSeconds: slot.restSeconds };
    });
    // Os fixos voltam na posição original (ou no fim, se a ficha ficou menor).
    for (const { index, item } of view.fixed[planId] ?? []) exercises.splice(Math.min(index, exercises.length), 0, item);
    plans.push({ id: plan.id, name: plan.name, ...(plan.notes ? { notes: plan.notes } : {}), exercises });
  }

  const change: TrainingPlanChange = {
    id: input.newId(),
    planRecordId: view.record.id,
    createdAt: input.nowMs,
    source: input.source,
    trigger: input.trigger,
    ...(input.model ? { model: input.model } : {}),
    promptVersion: input.promptVersion,
    items,
  };
  return { type: "training.adjustPlan", change, exercises: created, plans };
}

/** Os ajustes de um plano aceito, do mais novo para o mais antigo. */
export function planChanges(changes: readonly TrainingPlanChange[], recordId: string): TrainingPlanChange[] {
  return changes.filter((c) => c.planRecordId === recordId).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Sugestão espontânea, pelas regras e sem IA: o exercício do plano que está há mais treinos sem evoluir, trocado pela
 * primeira variação permitida da mesma vaga. Null = nada estagnado que dê para trocar.
 */
export function stalledSuggestion(
  view: CurrentPlanView,
  data: DataSnapshot,
  today: DateKey,
  isDismissed: (exerciseId: string) => boolean = () => false,
): (SuggestedChange & { exerciseId: string }) | null {
  const report = trainingMonthReport(data, defaultReportMonth(today), today);
  for (const stalled of report.stalled) {
    if (isDismissed(stalled.exerciseId)) continue;
    const slotId = Object.keys(view.slots).find((id) => view.slots[id].exerciseId === stalled.exerciseId);
    if (!slotId) continue;
    const [option] = swapOptions(view.proposal.skeleton, view.proposal.choices, slotId);
    if (!option) continue;
    return {
      exerciseId: stalled.exerciseId,
      change: { kind: "swap", slotId, exerciseKey: option },
      reason: `Há ${stalled.sessions} treinos sem evoluir em ${stalled.name}. Uma variação parecida costuma ajudar a voltar a progredir.`,
      principle: "variacao",
    };
  }
  return null;
}
