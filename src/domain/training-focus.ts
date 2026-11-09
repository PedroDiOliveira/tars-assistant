import type { SlotType, Tier, VolumeGroup } from "./training-rules";
import type { BodyRegion, PriorityGroup, TrainingExperience, TrainingGoal, TrainingProfile } from "./types";

/**
 * Volume semanal e foco, por regra (sem IA e sem custo). Três ideias:
 *
 *  1. O que se mede é a série EFETIVA por músculo na semana: a série direta conta 1 e a indireta (o tríceps no supino, o
 *     bíceps na remada) conta 0,5. É a contagem que melhor se ajusta aos estudos de dose-resposta (Pelland et al., 2024,
 *     pré-print, e a revisão de Schoenfeld, Ogborn e Krieger, 2017).
 *  2. O foco só mexe no volume quando há motivo: no objetivo de MASSA ele leva o grupo à faixa de foco; em FORÇA vira
 *     prioridade na ordem e uma série pesada a mais no exercício principal; em SAÚDE e EMAGRECER é leve (ordem e no
 *     máximo 2 séries). Iniciante e quem ainda precisa de liberação médica ficam no topo da faixa normal. Região com dor
 *     marcada nunca é reforçada.
 *  3. Peso e contrapeso: o foco nunca é cortado para caber no tempo; quem paga é o resto, que desce no máximo até o piso
 *     de manutenção (Bickel et al., 2011: cerca de 1/3 do volume mantém o que já foi ganho), nunca a zero. Se não couber,
 *     o app diz o que coube.
 *
 * As faixas abaixo são PROPOSTAS, calibradas pelos planos padrão do app, e passam por revisão de um profissional de
 * educação física antes de o app abrir para outras pessoas (ver docs/arquitetura-backend.md, decisão 39).
 *
 * Este arquivo só importa TIPOS das regras (sem ciclo em tempo de execução): quem precisa de SLOT_TYPES ou do tempo do
 * treino os passa pelo `FocusEnv`.
 */

/** Grupos que o app acompanha no volume semanal (panturrilha e abdômen não entram: não há faixa para eles). */
export const TRACKED_GROUPS: readonly VolumeGroup[] = ["peito", "costas", "ombros", "biceps", "triceps", "quadriceps", "posteriores", "gluteos"];

/** Grupos grandes: só eles têm piso de manutenção (os pequenos recebem trabalho indireto dos compostos). */
export const FLOOR_GROUPS: readonly VolumeGroup[] = ["peito", "costas", "ombros", "quadriceps", "posteriores"];

export const GROUP_LABELS: Partial<Record<VolumeGroup, string>> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  quadriceps: "Quadríceps",
  posteriores: "Posteriores",
  gluteos: "Glúteos",
};

/** O que cada grupo de prioridade do formulário reforça. */
export const PRIORITY_VOLUME: Record<PriorityGroup, readonly VolumeGroup[]> = {
  peito: ["peito"],
  costas: ["costas"],
  ombros: ["ombros"],
  bracos: ["biceps", "triceps"],
  pernas: ["quadriceps", "posteriores"],
  gluteos: ["gluteos"],
};

export const INDIRECT_WEIGHT = 0.5;

/**
 * Trabalho indireto dos compostos, por tipo de vaga. Só entra o que é bem estabelecido: o tríceps nos empurrões, o
 * bíceps nas puxadas e remadas, o glúteo nos exercícios de perna e de quadril. O ombro NÃO recebe crédito do supino: o
 * ombro lateral e o posterior precisam de trabalho direto, e o da frente já sobra no peito.
 */
const INDIRECT: Partial<Record<SlotType, Partial<Record<VolumeGroup, number>>>> = {
  "peito-composto": { triceps: INDIRECT_WEIGHT },
  "peito-inclinado": { triceps: INDIRECT_WEIGHT },
  "ombro-composto": { triceps: INDIRECT_WEIGHT },
  "costas-vertical": { biceps: INDIRECT_WEIGHT },
  "costas-horizontal": { biceps: INDIRECT_WEIGHT },
  "quadriceps-composto": { gluteos: INDIRECT_WEIGHT },
  "pernas-unilateral": { gluteos: INDIRECT_WEIGHT },
  "posteriores-quadril": { gluteos: INDIRECT_WEIGHT },
};

/** Esta vaga dá trabalho indireto a algum dos grupos? (costas dá bíceps; o supino dá tríceps) */
export function givesIndirectTo(type: SlotType, groups: ReadonlySet<VolumeGroup>): boolean {
  return Object.keys(INDIRECT[type] ?? {}).some((g) => groups.has(g as VolumeGroup));
}

/** Quanto `sets` séries de uma vaga deste tipo valem para `group` (direto = 1 por série; indireto = 0,5). */
export function setsFor(group: VolumeGroup, type: SlotType, primary: VolumeGroup, sets: number): number {
  if (primary === group) return sets;
  return (INDIRECT[type]?.[group] ?? 0) * sets;
}

/* ---------- faixas ---------- */

export interface VolumeBand {
  /** piso de manutenção: abaixo disso o app avisa */
  floor: number;
  /** faixa normal, de `low` a `high` séries efetivas por semana (só objetivo massa) */
  low: number;
  high: number;
  /** alvo do grupo em foco (só objetivo massa) */
  focusMax: number;
}

/**
 * O piso é cerca de 1/3 do volume normal (Bickel et al., 2011: 1/3 do volume manteve o músculo já ganho em adultos
 * jovens; adultos mais velhos precisam de mais, e o app ainda não conhece a idade). Vale para todos os objetivos.
 */
const BANDS: Record<TrainingExperience, VolumeBand> = {
  iniciante: { floor: 3, low: 6, high: 10, focusMax: 10 },
  intermediario: { floor: 4, low: 10, high: 15, focusMax: 18 },
  avancado: { floor: 4, low: 12, high: 18, focusMax: 21 },
};

export function volumeBand(profile: Pick<TrainingProfile, "experience">): VolumeBand {
  return BANDS[profile.experience];
}

/* ---------- decisão do foco ---------- */

export type FocusMode = "volume" | "main-lift" | "light";

/** Regiões em que reforçar o grupo poderia forçar a dor marcada. */
const BLOCKING_REGIONS: Partial<Record<VolumeGroup, readonly BodyRegion[]>> = {
  peito: ["ombro"],
  ombros: ["ombro"],
  costas: ["lombar"],
  biceps: ["cotovelo"],
  triceps: ["cotovelo"],
  quadriceps: ["joelho"],
  posteriores: ["lombar", "quadril"],
  gluteos: ["quadril"],
};

export interface FocusDecision {
  group: VolumeGroup;
  priority: PriorityGroup;
  mode: FocusMode;
  /** região com dor que impede o reforço; sem reforço neste grupo */
  blockedBy?: BodyRegion;
  /** por que o alvo ficou no topo da faixa normal (massa) */
  limitedBy?: "iniciante" | "liberacao-medica";
}

export function focusMode(goal: TrainingGoal): FocusMode {
  return goal === "massa" ? "volume" : goal === "forca" ? "main-lift" : "light";
}

/** Uma decisão por grupo de volume em foco, na ordem em que as prioridades foram marcadas. */
export function focusDecisions(profile: Pick<TrainingProfile, "goal" | "experience" | "priorities" | "limitations" | "screening">): FocusDecision[] {
  const mode = focusMode(profile.goal);
  const limitedBy = mode === "volume" ? (profile.experience === "iniciante" ? "iniciante" : profile.screening === "liberacao-medica" ? "liberacao-medica" : undefined) : undefined;
  const seen = new Set<VolumeGroup>();
  const out: FocusDecision[] = [];
  for (const priority of profile.priorities) {
    for (const group of PRIORITY_VOLUME[priority]) {
      if (seen.has(group)) continue;
      seen.add(group);
      const blockedBy = (BLOCKING_REGIONS[group] ?? []).find((region) => profile.limitations.includes(region));
      out.push({ group, priority, mode, ...(blockedBy ? { blockedBy } : {}), ...(limitedBy ? { limitedBy } : {}) });
    }
  }
  return out;
}

/** Alvo de séries efetivas por semana do grupo em foco no objetivo massa. */
export function focusTarget(profile: Pick<TrainingProfile, "goal" | "experience">, decision: FocusDecision): number {
  const band = volumeBand(profile);
  return decision.limitedBy ? band.high : band.focusMax;
}

/** Acréscimo máximo (séries efetivas por semana) do foco leve de saúde e emagrecer. */
export const LIGHT_FOCUS_EXTRA = 2;

/* ---------- distribuidor ---------- */

export interface FocusSlotLike {
  id: string;
  type: SlotType;
  tier: Tier;
  sets: number;
  setOptions: readonly number[];
  restSeconds: number;
}

export interface FocusEnv<S extends FocusSlotLike> {
  groupOf(type: SlotType): VolumeGroup;
  /** segundos de exercício destes slots (o aquecimento fica de fora) */
  secondsOf(slots: readonly S[]): number;
  budgetSeconds: number;
  timesPerWeek: number;
  /** piso de séries efetivas por semana dos grupos grandes */
  floor: number;
  /** vagas novas possíveis para o grupo neste treino, já com id único e exercício distinto dos do treino */
  addable(day: { id: string; slots: readonly S[] }, group: VolumeGroup): S[];
  /**
   * Na GERAÇÃO, proteger o foco do corte de tempo pode deixá-lo acima do alvo; aparar devolve ao teto. No AJUSTE nunca:
   * quem pede mais foco não pode ficar com menos do que já tinha.
   */
  trimOvershoot?: boolean;
}

export interface FocusTarget {
  group: VolumeGroup;
  /** só no modo "volume": séries efetivas por semana a atingir */
  target?: number;
}

export interface FocusResult<S extends FocusSlotLike> {
  days: { id: string; slots: S[] }[];
  effective: Record<VolumeGroup, number>;
  /** grupos em foco (modo volume) que não chegaram ao alvo */
  unmet: VolumeGroup[];
  ops: {
    sets: { slotId: string; sets: number }[];
    added: { dayId: string; slot: S }[];
    removed: { slotId: string }[];
  };
}

/** Séries efetivas por semana de cada grupo acompanhado. */
export function effectiveOf<S extends Pick<FocusSlotLike, "type" | "sets">>(
  days: readonly { slots: readonly S[] }[],
  groupOf: (type: SlotType) => VolumeGroup,
  timesPerWeek: number,
): Record<VolumeGroup, number> {
  const totals = {} as Record<VolumeGroup, number>;
  for (const group of TRACKED_GROUPS) {
    let sum = 0;
    for (const day of days) for (const slot of day.slots) sum += setsFor(group, slot.type, groupOf(slot.type), slot.sets);
    totals[group] = sum * timesPerWeek;
  }
  return totals;
}

const EPS = 1e-9;
/** Quanto um passo pode passar do alvo (em séries efetivas por semana). */
const OVERSHOOT = 1;

/**
 * Leva os grupos em foco ao alvo do objetivo, dentro do tempo de cada treino:
 *  - "volume" (massa): sobe séries nas vagas do grupo, acrescenta exercício do grupo onde sobra tempo e, se o tempo
 *    acabar, tira séries (ou exercícios de apoio) dos grupos que NÃO são foco, sem baixá-los do piso. O foco nunca é cortado;
 *  - "main-lift" (força): uma série a mais só nos exercícios principais do grupo;
 *  - "light" (saúde, emagrecer): até `LIGHT_FOCUS_EXTRA` séries efetivas a mais, nas vagas de prioridade 1 e 2.
 * Sem lacuna, não faz nada. Determinístico: mesma entrada, mesma saída.
 */
export function runFocus<S extends FocusSlotLike>(
  input: { id: string; slots: S[] }[],
  env: FocusEnv<S>,
  mode: FocusMode,
  targets: readonly FocusTarget[],
): FocusResult<S> {
  const work = input.map((d) => ({ id: d.id, slots: d.slots.map((s) => ({ ...s })) }));
  const initialSets = new Map(work.flatMap((d) => d.slots.map((s) => [s.id, s.sets] as const)));
  const initialIds = new Set(initialSets.keys());
  const focusGroups = new Set(targets.map((t) => t.group));
  const tpw = env.timesPerWeek;
  const effective = (group: VolumeGroup) =>
    work.reduce((t, d) => t + d.slots.reduce((n, s) => n + setsFor(group, s.type, env.groupOf(s.type), s.sets), 0), 0) * tpw;
  const nextSets = (slot: S) => slot.setOptions.find((n) => n > slot.sets);
  const fits = (day: { slots: S[] }) => env.secondsOf(day.slots) <= env.budgetSeconds;

  /** Sobe uma série de `slot`; desfaz se o treino não couber no tempo. */
  const tryRaise = (day: { slots: S[] }, slot: S): boolean | "time" => {
    const next = nextSets(slot);
    if (next === undefined) return false;
    const before = slot.sets;
    slot.sets = next;
    if (fits(day)) return true;
    slot.sets = before;
    return "time";
  };

  const unmet = new Set<VolumeGroup>();

  if (mode === "volume") {
    const open = targets.filter((t): t is Required<FocusTarget> => t.target !== undefined);
    const stuck = new Set<VolumeGroup>();
    for (let guard = 0; guard < 400; guard++) {
      const pending = open.filter((t) => !stuck.has(t.group) && effective(t.group) < t.target - EPS);
      if (pending.length === 0) break;
      const current = pending.reduce((a, b) => (b.target - effective(b.group) > a.target - effective(a.group) ? b : a));
      const group = current.group;
      let blockedDay: (typeof work)[number] | null = null;

      const need = current.target - effective(group);
      // Nunca estoura o alvo em mais de 1 série efetiva (o teto de iniciante e de liberação médica é o alvo).
      const overshoots = (gain: number) => gain > need + OVERSHOOT + EPS;

      // 1. Uma série a mais numa vaga do grupo (as principais primeiro).
      const candidates = work
        .flatMap((day, di) => day.slots.map((slot, si) => ({ day, slot, di, si })))
        .filter(({ slot }) => env.groupOf(slot.type) === group)
        .sort((a, b) => a.slot.tier - b.slot.tier || a.slot.sets - b.slot.sets || a.di - b.di || a.si - b.si);
      let progressed = false;
      for (const { day, slot } of candidates) {
        const step = nextSets(slot);
        if (step === undefined || overshoots((step - slot.sets) * tpw * setsFor(group, slot.type, group, 1))) continue;
        const result = tryRaise(day, slot);
        if (result === true) {
          progressed = true;
          break;
        }
        if (result === "time" && !blockedDay) blockedDay = day;
      }
      if (progressed) continue;

      // 2. Um exercício novo do grupo, no treino com mais tempo sobrando.
      for (const day of [...work].sort((a, b) => env.secondsOf(a.slots) - env.secondsOf(b.slots))) {
        // O exercício novo entra só com as séries que cobrem o que falta (a menor opção que chega lá).
        const options = env
          .addable(day, group)
          .map((slot) => {
            const options = [...slot.setOptions].sort((a, b) => a - b);
            const wanted = options.find((n) => n * tpw >= need - EPS) ?? options[options.length - 1];
            return { ...slot, sets: wanted };
          })
          .filter((slot) => !overshoots(slot.sets * tpw));
        const fit = options.find((slot) => env.secondsOf([...day.slots, slot]) <= env.budgetSeconds);
        if (fit) {
          day.slots.push(fit);
          progressed = true;
          break;
        }
        if (options.length > 0 && !blockedDay) blockedDay = day;
      }
      if (progressed) continue;

      // 3. O tempo é o que falta: tira de quem NÃO é foco, sem baixar do piso.
      if (blockedDay && freeTime(blockedDay)) continue;
      stuck.add(group);
    }
    // Proteger o foco do corte de tempo pode deixá-lo acima do alvo (que é o teto de iniciante e de liberação médica):
    // aparar do menos importante, sem ficar abaixo do alvo.
    for (const t of env.trimOvershoot ? open : []) {
      for (let guard = 0; guard < 100 && effective(t.group) > t.target + OVERSHOOT + EPS; guard++) {
        const trimmable = work
          .flatMap((day) => day.slots.map((slot) => ({ day, slot })))
          .filter(({ slot }) => env.groupOf(slot.type) === t.group && slot.tier > 1)
          .sort((a, b) => b.slot.tier - a.slot.tier || b.day.slots.indexOf(b.slot) - a.day.slots.indexOf(a.slot));
        let done = false;
        for (const { day, slot } of trimmable) {
          const lower = [...slot.setOptions].reverse().find((n) => n < slot.sets);
          const drops = lower !== undefined ? (slot.sets - lower) * tpw : slot.sets * tpw;
          if (effective(t.group) - drops < t.target - EPS) continue;
          if (lower !== undefined) slot.sets = lower;
          else if (day.slots.length > 2) day.slots.splice(day.slots.indexOf(slot), 1);
          else continue;
          done = true;
          break;
        }
        if (!done) break;
      }
    }
    for (const t of open) if (effective(t.group) < t.target - EPS) unmet.add(t.group);
  } else {
    // Foco de força e foco leve: uma passada, sem acrescentar exercício e sem tirar nada de ninguém.
    const tiers: readonly Tier[] = mode === "main-lift" ? [1] : [1, 2];
    const extra = new Map<VolumeGroup, number>(targets.map((t) => [t.group, LIGHT_FOCUS_EXTRA]));
    const candidates = work
      .flatMap((day, di) => day.slots.map((slot, si) => ({ day, slot, di, si })))
      .filter(({ slot }) => focusGroups.has(env.groupOf(slot.type)) && tiers.includes(slot.tier))
      .sort((a, b) => a.slot.tier - b.slot.tier || a.di - b.di || a.si - b.si);
    for (const { day, slot } of candidates) {
      const group = env.groupOf(slot.type);
      const next = nextSets(slot);
      if (next === undefined || next - (initialSets.get(slot.id) ?? slot.sets) > 1) continue;
      const gain = (next - slot.sets) * tpw;
      if (mode === "light" && gain > (extra.get(group) ?? 0) + EPS) continue;
      if (tryRaise(day, slot) === true && mode === "light") extra.set(group, (extra.get(group) ?? 0) - gain);
    }
  }

  /** Libera tempo no treino `day` tirando de um grupo que não é foco: uma série (ou um exercício de apoio) de cada vez. */
  function freeTime(day: { id: string; slots: S[] }): boolean {
    const order = day.slots
      .map((slot, index) => ({ slot, index }))
      // Quem dá trabalho indireto a um grupo em foco (costas dá bíceps; o supino dá tríceps) também fica: tirar dela baixaria o foco.
      .filter(({ slot }) => !focusGroups.has(env.groupOf(slot.type)) && slot.tier > 1 && ![...focusGroups].some((g) => setsFor(g, slot.type, env.groupOf(slot.type), 1) > 0))
      .sort((a, b) => b.slot.tier - a.slot.tier || b.index - a.index);
    const keepsFloor = (apply: () => void, undo: () => void, group: VolumeGroup) => {
      apply();
      const ok = !FLOOR_GROUPS.includes(group) || effective(group) >= env.floor - EPS;
      if (!ok) undo();
      return ok;
    };
    // Primeiro uma série a menos (mais barato para o treino); só depois um exercício inteiro.
    for (const { slot } of order) {
      const lower = [...slot.setOptions].reverse().find((n) => n < slot.sets);
      if (lower === undefined) continue;
      const before = slot.sets;
      if (keepsFloor(() => (slot.sets = lower), () => (slot.sets = before), env.groupOf(slot.type))) return true;
    }
    if (day.slots.length <= 2) return false;
    for (const { slot } of order) {
      const at = day.slots.indexOf(slot);
      if (day.slots.length <= 2) return false;
      if (keepsFloor(() => day.slots.splice(at, 1), () => day.slots.splice(at, 0, slot), env.groupOf(slot.type))) return true;
    }
    return false;
  }

  const finalIds = new Set(work.flatMap((d) => d.slots.map((s) => s.id)));
  return {
    days: work,
    effective: Object.fromEntries(TRACKED_GROUPS.map((g) => [g, effective(g)])) as Record<VolumeGroup, number>,
    unmet: [...unmet],
    ops: {
      sets: work.flatMap((d) => d.slots).filter((s) => initialIds.has(s.id) && s.sets !== initialSets.get(s.id)).map((s) => ({ slotId: s.id, sets: s.sets })),
      added: work.flatMap((d) => d.slots.filter((s) => !initialIds.has(s.id)).map((slot) => ({ dayId: d.id, slot }))),
      removed: [...initialIds].filter((id) => !finalIds.has(id)).map((slotId) => ({ slotId })),
    },
  };
}

/** Os exercícios principais do grupo em foco vão para o começo do treino (o que vem antes rende mais; Simão et al., 2012). */
export function focusFirst<S extends Pick<FocusSlotLike, "type" | "tier">>(slots: readonly S[], focusGroups: ReadonlySet<VolumeGroup>, groupOf: (type: SlotType) => VolumeGroup): S[] {
  const isLead = (s: S) => s.tier === 1 && focusGroups.has(groupOf(s.type));
  return [...slots.filter(isLead), ...slots.filter((s) => !isLead(s))];
}

