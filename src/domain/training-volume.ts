import { PRIORITY_LABELS, REGION_LABELS } from "./training-profile";
import {
  FLOOR_GROUPS,
  GROUP_LABELS,
  LIGHT_FOCUS_EXTRA,
  TRACKED_GROUPS,
  effectiveOf,
  focusDecisions,
  focusTarget,
  volumeBand,
  type FocusDecision,
  type VolumeBand,
} from "./training-focus";
import { SLOT_TYPES, type PlanChoices, type PlanSkeleton, type VolumeGroup } from "./training-rules";
import type { TrainingProfile } from "./types";

/**
 * "Volume da semana": o que o plano entrega, por músculo, contra a faixa do objetivo, e os avisos honestos (o que não
 * coube, o que foi limitado e por quê). Só lê o plano: não muda nada e não custa token. A tela mostra o quadro só no
 * objetivo massa; nos outros, só os avisos que importam.
 */

export interface VolumeRow {
  group: VolumeGroup;
  label: string;
  /** séries efetivas por semana (direta = 1, indireta = 0,5) */
  effective: number;
  focus: boolean;
  /** acima da faixa normal do nível (foco pedido depois, no ajuste, ou plano que já tinha bastante) */
  above: boolean;
  /** alvo do grupo em foco (massa) */
  target?: number;
  status: "ok" | "short" | "below-floor";
}

export interface VolumeReport {
  /** o quadro de volume só faz sentido no objetivo massa */
  showTable: boolean;
  band: VolumeBand;
  rows: VolumeRow[];
  notes: string[];
}

const round1 = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

function decisionNote(profile: TrainingProfile, decision: FocusDecision, effective: number): string | null {
  const label = GROUP_LABELS[decision.group] ?? decision.group;
  const band = volumeBand(profile);
  if (decision.blockedBy) {
    return `Não reforcei ${label.toLowerCase()}: você marcou ${REGION_LABELS[decision.blockedBy].toLowerCase()} e o foco poderia forçar essa região.`;
  }
  if (decision.mode === "light") {
    return `Para o seu objetivo, ${PRIORITY_LABELS[decision.priority].toLowerCase()} em foco vira prioridade na ordem do treino e até ${LIGHT_FOCUS_EXTRA} séries a mais por semana. Mais volume não rende mais aqui.`;
  }
  if (decision.mode === "main-lift") {
    return `Para força, o foco em ${PRIORITY_LABELS[decision.priority].toLowerCase()} vira prioridade no começo do treino e uma série pesada a mais no exercício principal; o volume por músculo pesa pouco.`;
  }
  if (decision.limitedBy === "iniciante") {
    return `Para quem está começando, passar de ${band.high} séries por semana num grupo rende pouco: não aumentei ${label.toLowerCase()} além disso e dei prioridade na ordem do treino.`;
  }
  if (decision.limitedBy === "liberacao-medica") {
    return `Com a liberação médica pendente, mantive ${label.toLowerCase()} dentro da faixa normal (até ${band.high} séries por semana).`;
  }
  const target = focusTarget(profile, decision);
  if (effective + 1e-9 < target) {
    return `${label}: cheguei a ${round1(effective)} séries por semana; o alvo era ${target}. Com ${profile.sessionMinutes} min por treino não coube. Mais tempo por treino ou mais um dia ajudam.`;
  }
  return null;
}

export function volumeReport(profile: TrainingProfile, skeleton: PlanSkeleton, choices: PlanChoices): VolumeReport {
  const band = volumeBand(profile);
  const decisions = focusDecisions(profile);
  const days = skeleton.days.map((d) => ({ slots: d.slots.map((s) => ({ type: s.type, sets: choices[s.id]?.sets ?? s.sets })) }));
  const effective = effectiveOf(days, (type) => SLOT_TYPES[type].group, skeleton.timesPerWeek);
  const focusByGroup = new Map(decisions.map((d) => [d.group, d]));
  const showTable = profile.goal === "massa";

  const rows: VolumeRow[] = TRACKED_GROUPS.map((group) => {
    const decision = focusByGroup.get(group);
    const active = decision && !decision.blockedBy && decision.mode === "volume";
    const target = active ? focusTarget(profile, decision) : undefined;
    const below = FLOOR_GROUPS.includes(group) && effective[group] + 1e-9 < band.floor;
    return {
      group,
      label: GROUP_LABELS[group] ?? group,
      effective: effective[group],
      focus: Boolean(decision && !decision.blockedBy),
      above: effective[group] > band.high + 1e-9,
      ...(target !== undefined ? { target } : {}),
      status: below ? "below-floor" : target !== undefined && effective[group] + 1e-9 < target ? "short" : "ok",
    };
  });

  const notes: string[] = [];
  for (const decision of decisions) {
    const note = decisionNote(profile, decision, effective[decision.group]);
    if (note) notes.push(note);
  }
  for (const row of rows) {
    if (row.status === "below-floor") {
      notes.push(`${row.label} ficou com ${round1(row.effective)} séries por semana, abaixo do mínimo de ${band.floor} para manter o que você já tem. Com ${profile.sessionMinutes} min por treino não coube mais.`);
    }
  }
  return { showTable, band, rows, notes };
}
