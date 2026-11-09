import type { PrincipleId } from "./training-evidence";
import { GROUP_LABELS, focusDecisions, focusFirst, focusMode, focusTarget, runFocus, volumeBand, type FocusTarget } from "./training-focus";
import { addSlot, moveSlot, removeSlot, setPrescription, swapExercise, type PlanProposal } from "./training-proposal";
import { SLOT_TYPES, addableSlots, daySeconds, formatRange, knownLibraryKeys, type PlanDay, type PlanSlot, type RepRange } from "./training-rules";
import { volumeReport } from "./training-volume";
import type { Exercise, PriorityGroup, TrainingProfile } from "./types";

/**
 * Ajustes no rascunho sem refazer o formulário. Uma mudança é sempre uma destas operações pequenas, e cada uma passa
 * pelas MESMAS funções das edições à mão (trocar só entre as opções da vaga, séries e faixas só entre as permitidas):
 * uma sugestão inválida, venha das regras ou da IA, é descartada e nunca chega ao plano.
 *
 * Os chips ("mais curto", "mais foco em…") viram mudanças pelas regras, sem IA e sem custo. A IA só entra quando a
 * pessoa escreve o que quer (server/ai/plan-adjust.ts), e responde com estas mesmas operações.
 */

/** Versão das regras dos chips: fica gravada no histórico do ajuste, para comparar versões depois. */
export const ADJUST_RULES_VERSION = "ajuste-regras-v1";

/** Tamanho máximo do "Outra coisa" (o servidor recusa acima disso). */
export const MAX_ADJUST_TEXT = 200;

export type PlanChange =
  | { kind: "swap"; slotId: string; exerciseKey: string }
  | { kind: "sets"; slotId: string; sets: number }
  | { kind: "reps"; slotId: string; reps: RepRange }
  | { kind: "move"; slotId: string; toIndex: number }
  | { kind: "remove"; slotId: string }
  /** exercício novo num treino (só as regras propõem: reforçar um grupo em foco); `slotId` é o da vaga nova */
  | { kind: "add"; slotId: string; dayId: string; slot: PlanSlot; exerciseKey: string };

export interface SuggestedChange {
  change: PlanChange;
  /** uma frase simples: por que esta mudança */
  reason: string;
  /** o princípio da base científica que sustenta a mudança (domain/training-evidence.ts) */
  principle: PrincipleId;
}

function locate(proposal: PlanProposal, slotId: string): { day: PlanDay; slot: PlanSlot; index: number } | null {
  for (const day of proposal.skeleton.days) {
    const index = day.slots.findIndex((s) => s.id === slotId);
    if (index >= 0) return { day, slot: day.slots[index], index };
  }
  return null;
}

/** Aplica uma mudança. Inválida (fora das opções, vaga que não existe, sem efeito): null. */
export function applyChange(proposal: PlanProposal, change: PlanChange): PlanProposal | null {
  switch (change.kind) {
    case "swap":
      return swapExercise(proposal, change.slotId, change.exerciseKey);
    case "sets":
      return setPrescription(proposal, change.slotId, { sets: change.sets });
    case "reps":
      return setPrescription(proposal, change.slotId, { reps: change.reps });
    case "move": {
      const at = locate(proposal, change.slotId);
      return at ? moveSlot(proposal, at.day.id, at.index, change.toIndex) : null;
    }
    case "remove":
      return removeSlot(proposal, change.slotId);
    case "add":
      return addSlot(proposal, change.dayId, change.slot, change.exerciseKey);
  }
}

/** Aplica em sequência; as que não valem (ou deixam de valer depois das anteriores) ficam de fora. */
export function applyChanges(proposal: PlanProposal, changes: readonly SuggestedChange[]): { proposal: PlanProposal; applied: SuggestedChange[] } {
  let current = proposal;
  const applied: SuggestedChange[] = [];
  for (const suggestion of changes) {
    const next = applyChange(current, suggestion.change);
    if (!next) continue;
    current = next;
    applied.push(suggestion);
  }
  return { proposal: current, applied };
}

/** Só as sugestões que valem no rascunho atual, aplicadas em sequência (o que a prévia mostra). */
export function validSuggestions(proposal: PlanProposal, changes: readonly SuggestedChange[]): SuggestedChange[] {
  return applyChanges(proposal, changes).applied;
}

/** Como mostrar a mudança no cartão de antes → depois. */
export function describeChange(
  proposal: PlanProposal,
  change: PlanChange,
  nameOf: (exerciseKey: string) => string,
): { where: string; before: string; after: string } | null {
  if (change.kind === "add") {
    const day = proposal.skeleton.days.find((d) => d.id === change.dayId);
    return day ? { where: day.name, before: "Sem este exercício", after: `${nameOf(change.exerciseKey)} · ${change.slot.sets} × ${formatRange(change.slot.reps)}` } : null;
  }
  const at = locate(proposal, change.slotId);
  const choice = proposal.choices[change.slotId];
  if (!at || !choice) return null;
  const name = nameOf(choice.exerciseKey);
  switch (change.kind) {
    case "swap":
      return { where: at.day.name, before: name, after: nameOf(change.exerciseKey) };
    case "sets":
      return { where: `${at.day.name} · ${name}`, before: `${choice.sets} séries`, after: `${change.sets} séries` };
    case "reps":
      return { where: `${at.day.name} · ${name}`, before: `${formatRange(choice.reps)} repetições`, after: `${formatRange(change.reps)} repetições` };
    case "move":
      return { where: `${at.day.name} · ${name}`, before: `${at.index + 1}º do treino`, after: `${change.toIndex + 1}º do treino` };
    case "remove":
      return { where: at.day.name, before: name, after: "sai do treino" };
  }
}

/* ---------- chips: mudanças pelas regras, sem IA ---------- */

export type AdjustChip = "mais-curto" | "menos-exercicios" | "foco" | "mais-pesado" | "mais-leve";

export const ADJUST_CHIPS: readonly { id: AdjustChip; label: string }[] = [
  { id: "mais-curto", label: "Treino mais curto" },
  { id: "menos-exercicios", label: "Menos exercícios" },
  { id: "foco", label: "Mais foco em um grupo" },
  { id: "mais-pesado", label: "Está leve demais" },
  { id: "mais-leve", label: "Está pesado demais" },
];

/** Do menos importante para o mais: prioridade 3 antes da 2, e o último do treino antes do primeiro. */
const lowestFirst = (day: PlanDay) => [...day.slots].reverse().sort((a, b) => b.tier - a.tier);

/**
 * As mudanças de um chip, no máximo uma por treino (a prévia fica curta). Lista vazia = não há o que mudar pelas
 * regras (ex.: já está no mínimo de séries); a tela explica e sugere outro caminho.
 */
export function ruleSuggestions(proposal: PlanProposal, chip: AdjustChip): SuggestedChange[] {
  const out: SuggestedChange[] = [];
  for (const day of proposal.skeleton.days) {
    const sets = (slot: PlanSlot) => proposal.choices[slot.id]?.sets ?? slot.sets;
    if (chip === "mais-curto" || chip === "mais-leve") {
      const pool = chip === "mais-curto" ? lowestFirst(day) : day.slots.filter((s) => s.tier <= 2);
      const slot = pool.find((s) => sets(s) > s.setOptions[0]);
      if (!slot) continue;
      out.push({
        change: { kind: "sets", slotId: slot.id, sets: [...slot.setOptions].reverse().find((n) => n < sets(slot))! },
        reason:
          chip === "mais-curto"
            ? "Uma série a menos num exercício de apoio: o treino fica alguns minutos mais curto e os principais continuam iguais."
            : "Uma série a menos: menos cansaço enquanto você se adapta. Dá para voltar depois.",
        principle: chip === "mais-curto" ? "volume" : "falha",
      });
    } else if (chip === "menos-exercicios") {
      if (day.slots.length <= 3) continue;
      const slot = lowestFirst(day).find((s) => s.tier === 3) ?? lowestFirst(day).find((s) => s.tier === 2);
      if (!slot) continue;
      out.push({
        change: { kind: "remove", slotId: slot.id },
        reason: "Um exercício de apoio a menos: o treino fica mais enxuto e os principais continuam.",
        principle: "volume",
      });
    } else if (chip === "mais-pesado") {
      const slot = day.slots.find((s) => s.tier === 1 && s.setOptions.some((n) => n > sets(s)));
      if (!slot) continue;
      out.push({
        change: { kind: "sets", slotId: slot.id, sets: slot.setOptions.find((n) => n > sets(slot))! },
        reason: "Uma série a mais no exercício principal do treino: mais estímulo onde ele rende mais.",
        principle: "progressao",
      });
    }
  }
  return validSuggestions(proposal, out);
}

/* ---------- foco: o mesmo distribuidor da geração, aplicado ao plano que já existe ---------- */

type KeyedSlot = PlanSlot & { key?: string };

/** No máximo isto de mudanças por ajuste (o histórico guarda até 16 itens). */
export const MAX_FOCUS_CHANGES = 16;

/**
 * "Mais foco em X" no plano que existe (rascunho ou plano em uso): leva o grupo ao alvo do objetivo com o MESMO distribuidor
 * da geração (training-focus.ts), mas só pelo que falta: sem lacuna, não propõe nada. Devolve as mudanças (séries,
 * exercício novo, o que sai para caber no tempo e a ordem) e os avisos honestos (o que não coube, o que foi limitado).
 */
export function focusAdjustment(
  proposal: PlanProposal,
  profile: TrainingProfile,
  exercises: readonly Exercise[],
  priority: PriorityGroup,
): { changes: SuggestedChange[]; notes: string[] } {
  const asked: TrainingProfile = { ...profile, priorities: [priority] };
  const active = focusDecisions(asked).filter((d) => !d.blockedBy);
  const focusGroups = new Set(active.map((d) => d.group));
  const groupOf = (type: PlanSlot["type"]) => SLOT_TYPES[type].group;
  const label = (type: PlanSlot["type"]) => (GROUP_LABELS[groupOf(type)] ?? groupOf(type)).toLowerCase();
  const slotOf = (id: string) => proposal.skeleton.days.flatMap((d) => d.slots).find((s) => s.id === id);
  const raw: SuggestedChange[] = [];

  if (active.length > 0) {
    const mode = focusMode(asked.goal);
    const known = knownLibraryKeys(exercises);
    const targets: FocusTarget[] = active.map((d) => ({ group: d.group, ...(mode === "volume" ? { target: focusTarget(asked, d) } : {}) }));
    const result = runFocus<KeyedSlot>(
      proposal.skeleton.days.map((d) => ({
        id: d.id,
        slots: d.slots.map((s): KeyedSlot => ({ ...s, sets: proposal.choices[s.id]?.sets ?? s.sets, key: proposal.choices[s.id]?.exerciseKey })),
      })),
      {
        groupOf,
        secondsOf: daySeconds,
        budgetSeconds: proposal.skeleton.budgetSeconds,
        timesPerWeek: proposal.skeleton.timesPerWeek,
        floor: volumeBand(asked).floor,
        addable: (day, group) =>
          addableSlots(asked, known, day, group).flatMap((candidate) => {
            const used = new Set(day.slots.map((s) => s.key));
            const key = candidate.options.find((k) => !used.has(k));
            return key ? [{ ...candidate, key }] : [];
          }),
      },
      mode,
      targets,
    );
    const before = (id: string) => proposal.choices[id]?.sets ?? 0;
    const up = result.ops.sets.filter((o) => o.sets > before(o.slotId));
    const down = result.ops.sets.filter((o) => o.sets < before(o.slotId));
    for (const op of up) {
      raw.push({ change: { kind: "sets", slotId: op.slotId, sets: op.sets }, reason: `Uma série a mais em ${label(slotOf(op.slotId)!.type)}: leva o volume da semana rumo ao alvo do foco.`, principle: "volume" });
    }
    for (const { dayId, slot } of result.ops.added) {
      const { key, ...clean } = slot;
      raw.push({ change: { kind: "add", slotId: clean.id, dayId, slot: clean, exerciseKey: key! }, reason: `Um exercício a mais de ${label(clean.type)}: o foco precisa de mais séries do que cabiam nos exercícios que já estavam.`, principle: "volume" });
    }
    for (const op of down) {
      raw.push({ change: { kind: "sets", slotId: op.slotId, sets: op.sets }, reason: `Uma série a menos em ${label(slotOf(op.slotId)!.type)} para o treino caber no tempo, sem baixar do mínimo de manutenção.`, principle: "volume" });
    }
    for (const op of result.ops.removed) {
      raw.push({ change: { kind: "remove", slotId: op.slotId }, reason: `Um exercício de apoio de ${label(slotOf(op.slotId)!.type)} saiu para abrir espaço ao foco, sem baixar do mínimo de manutenção.`, principle: "volume" });
    }
  }

  let { proposal: after, applied } = applyChanges(proposal, raw);
  // Os exercícios principais do grupo em foco abrem o treino (o que vem antes rende mais).
  for (const day of after.skeleton.days) {
    const wanted = focusFirst(day.slots, focusGroups, groupOf);
    wanted.forEach((slot, index) => {
      const here = after.skeleton.days.find((d) => d.id === day.id)!.slots.findIndex((s) => s.id === slot.id);
      if (here === index || focusGroups.size === 0) return;
      const move: SuggestedChange = { change: { kind: "move", slotId: slot.id, toIndex: index }, reason: `O exercício principal de ${label(slot.type)} abre o treino: o que vem antes rende mais carga e repetições.`, principle: "ordem" };
      const next = applyChange(after, move.change);
      if (next) {
        after = next;
        applied = [...applied, move];
      }
    });
  }
  return { changes: applied.slice(0, MAX_FOCUS_CHANGES), notes: volumeReport(asked, after.skeleton, after.choices).notes };
}
