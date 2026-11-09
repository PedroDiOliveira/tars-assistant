import { libraryEntry, matchLibrary, type Equipment } from "./exercise-library";
import { PRIORITY_LABELS, REGION_LABELS } from "./training-profile";
import {
  PRIORITY_VOLUME,
  focusDecisions,
  focusFirst,
  focusMode,
  focusTarget,
  givesIndirectTo,
  runFocus,
  volumeBand,
  type FocusTarget,
} from "./training-focus";
import { DAY_KINDS, DAY_TEMPLATES, resolveSplit, type DayKind, type SplitOption, type SplitOptionId } from "./training-splits";
import type {
  BodyRegion,
  Exercise,
  TrainingExperience,
  TrainingGoal,
  TrainingLocation,
  TrainingProfile,
  TrainingSplit,
} from "./types";

/**
 * Regras do plano de treino: a parte que NÃO pode falhar fica no código, não na IA.
 *
 * As regras montam o ESQUELETO do plano: a divisão da semana pelos dias disponíveis, as vagas de cada treino (um
 * "supino ou equivalente", uma "remada ou equivalente"...), quantas séries e quais faixas de repetição cada vaga
 * aceita, quantas vagas cabem no tempo e, para cada vaga, a lista FECHADA de exercícios permitidos (equipamento do
 * local, limitações e experiência). A IA só escolhe dentro dessas listas e escreve os motivos; sem IA, as próprias
 * regras escolhem (o "modelo pronto"). Os dois caminhos passam pela mesma validação.
 */

/** Grupo usado para contar volume semanal e para as prioridades. */
export type VolumeGroup =
  | "peito"
  | "costas"
  | "ombros"
  | "biceps"
  | "triceps"
  | "quadriceps"
  | "posteriores"
  | "gluteos"
  | "panturrilhas"
  | "abdomen";

export type SlotType =
  | "peito-composto"
  | "peito-inclinado"
  | "peito-isolado"
  | "costas-vertical"
  | "costas-horizontal"
  | "ombro-composto"
  | "ombro-lateral"
  | "ombro-posterior"
  | "biceps"
  | "triceps"
  | "quadriceps-composto"
  | "pernas-unilateral"
  | "quadriceps-isolado"
  | "posteriores-quadril"
  | "posteriores-isolado"
  | "gluteos"
  | "panturrilha"
  | "abdomen";

/** 1 = sempre fica; 2 e 3 entram se couberem no tempo (3 sai primeiro). */
export type Tier = 1 | 2 | 3;

interface SlotTypeDef {
  label: string;
  group: VolumeGroup;
  kind: "composto" | "isolado" | "core";
  /** opções da biblioteca, na ordem de preferência do modelo pronto */
  options: readonly string[];
  /** quando nenhuma opção sobra (equipamento, limitações), a vaga vira esta */
  fallback?: SlotType;
}

export const SLOT_TYPES: Record<SlotType, SlotTypeDef> = {
  "peito-composto": {
    label: "Peito",
    group: "peito",
    kind: "composto",
    options: ["supino-reto-barra", "supino-reto-halteres", "supino-maquina", "supino-smith", "flexao", "supino-declinado"],
    fallback: "peito-inclinado",
  },
  "peito-inclinado": {
    label: "Peito (inclinado)",
    group: "peito",
    kind: "composto",
    options: ["supino-inclinado-halteres", "supino-inclinado-barra"],
    fallback: "peito-composto",
  },
  "peito-isolado": { label: "Peito (isolado)", group: "peito", kind: "isolado", options: ["crucifixo-maquina", "crossover", "crucifixo-halteres"] },
  "costas-vertical": {
    label: "Costas (puxada)",
    group: "costas",
    kind: "composto",
    options: ["puxada-frontal", "barra-fixa", "puxada-triangulo", "barra-fixa-supinada", "pullover-halteres"],
    fallback: "costas-horizontal",
  },
  "costas-horizontal": {
    label: "Costas (remada)",
    group: "costas",
    kind: "composto",
    options: ["remada-baixa", "remada-curvada", "remada-unilateral", "remada-maquina", "remada-cavalinho", "remada-curvada-halteres"],
  },
  "ombro-composto": {
    label: "Ombros",
    group: "ombros",
    kind: "composto",
    options: ["desenvolvimento-halteres", "desenvolvimento-maquina", "desenvolvimento-barra"],
    fallback: "ombro-lateral",
  },
  "ombro-lateral": { label: "Ombros (lateral)", group: "ombros", kind: "isolado", options: ["elevacao-lateral", "elevacao-lateral-polia"] },
  "ombro-posterior": { label: "Ombros (posterior)", group: "ombros", kind: "isolado", options: ["crucifixo-inverso", "face-pull"] },
  biceps: {
    label: "Bíceps",
    group: "biceps",
    kind: "isolado",
    options: ["rosca-direta", "rosca-alternada", "rosca-martelo", "rosca-polia", "rosca-scott", "rosca-inclinada", "rosca-concentrada"],
  },
  triceps: {
    label: "Tríceps",
    group: "triceps",
    kind: "isolado",
    options: ["triceps-pulley", "triceps-corda", "triceps-testa", "triceps-frances", "supino-fechado", "mergulho-banco", "triceps-coice"],
  },
  "quadriceps-composto": {
    label: "Pernas (agachamento)",
    group: "quadriceps",
    kind: "composto",
    options: ["agachamento-livre", "leg-press", "agachamento-hack", "agachamento-smith", "agachamento-goblet", "agachamento-frontal"],
    fallback: "pernas-unilateral",
  },
  "pernas-unilateral": {
    label: "Pernas (unilateral)",
    group: "quadriceps",
    kind: "composto",
    options: ["agachamento-bulgaro", "afundo"],
    fallback: "quadriceps-composto",
  },
  "quadriceps-isolado": {
    label: "Quadríceps (isolado)",
    group: "quadriceps",
    kind: "isolado",
    options: ["cadeira-extensora"],
    fallback: "pernas-unilateral",
  },
  "posteriores-quadril": {
    label: "Posteriores (quadril)",
    group: "posteriores",
    kind: "composto",
    options: ["terra-romeno", "stiff", "stiff-halteres", "levantamento-terra", "elevacao-pelvica"],
    fallback: "gluteos",
  },
  "posteriores-isolado": {
    label: "Posteriores (isolado)",
    group: "posteriores",
    kind: "isolado",
    options: ["mesa-flexora", "cadeira-flexora"],
    fallback: "posteriores-quadril",
  },
  gluteos: { label: "Glúteos", group: "gluteos", kind: "isolado", options: ["elevacao-pelvica", "gluteo-polia", "cadeira-abdutora", "ponte-gluteo"] },
  panturrilha: {
    label: "Panturrilha",
    group: "panturrilhas",
    kind: "isolado",
    options: ["panturrilha-em-pe", "panturrilha-sentado", "panturrilha-leg-press", "panturrilha-halteres"],
  },
  // Sem prancha: ela é por tempo, e a ficha conta repetições.
  abdomen: { label: "Abdômen", group: "abdomen", kind: "core", options: ["abdominal-polia", "abdominal-infra", "abdominal-supra", "abdominal-maquina", "roda-abdominal"] },
};

/* ---------- o que cada local, experiência e limitação permite ---------- */

const ALL_EQUIPMENT: readonly Equipment[] = ["barra", "halteres", "maquina", "polia", "smith", "kettlebell", "peso-corporal"];

const LOCATION_EQUIPMENT: Record<TrainingLocation, readonly Equipment[]> = {
  academia: ALL_EQUIPMENT,
  "casa-halteres": ["halteres", "kettlebell", "peso-corporal"],
};

/** Peso do corpo, mas com estrutura de academia (barra alta, paralelas, banco romano). */
const NEEDS_GYM = new Set(["barra-fixa", "barra-fixa-supinada", "mergulho-paralelas", "hiperextensao-lombar", "roda-abdominal"]);

/** Técnica difícil para quem está começando: entram depois, com a base feita. */
const TECHNICAL = new Set(["levantamento-terra", "agachamento-frontal", "desenvolvimento-barra", "barra-fixa", "barra-fixa-supinada", "roda-abdominal"]);

/**
 * Lista de CAUTELA, conservadora de propósito: exercícios que costumam forçar a região marcada como dolorida ficam de
 * fora do plano. Não é avaliação clínica e precisa da revisão de um profissional de Educação Física antes de abrir o
 * app ao público (docs/avaliacao-lgpd.md). Na dúvida, um exercício entra aqui.
 */
export const CAUTION_BY_REGION: Record<BodyRegion, ReadonlySet<string>> = {
  ombro: new Set([
    "desenvolvimento-barra",
    "desenvolvimento-halteres",
    "desenvolvimento-maquina",
    "remada-alta",
    "mergulho-paralelas",
    "mergulho-banco",
    "elevacao-frontal",
    "supino-reto-barra",
    "supino-inclinado-barra",
    "supino-declinado",
  ]),
  cotovelo: new Set(["triceps-testa", "triceps-frances", "rosca-scott", "supino-fechado", "mergulho-paralelas", "mergulho-banco", "rosca-direta"]),
  punho: new Set(["flexao", "rosca-direta", "triceps-testa", "supino-fechado", "roda-abdominal"]),
  lombar: new Set([
    "levantamento-terra",
    "terra-romeno",
    "stiff",
    "stiff-halteres",
    "remada-curvada",
    "remada-curvada-halteres",
    "remada-cavalinho",
    "agachamento-livre",
    "agachamento-frontal",
    "desenvolvimento-barra",
    "hiperextensao-lombar",
    "roda-abdominal",
  ]),
  quadril: new Set(["agachamento-frontal", "levantamento-terra", "agachamento-bulgaro", "afundo", "cadeira-adutora"]),
  joelho: new Set(["agachamento-livre", "agachamento-frontal", "agachamento-hack", "agachamento-smith", "agachamento-bulgaro", "afundo"]),
  tornozelo: new Set(["afundo", "agachamento-bulgaro", "agachamento-frontal", "panturrilha-em-pe", "panturrilha-halteres"]),
};

/** Por que este exercício não pode entrar no plano desta pessoa, ou null. */
export function exclusionReason(key: string, profile: Pick<TrainingProfile, "location" | "experience" | "limitations">): string | null {
  const entry = libraryEntry(key);
  if (!entry) return "não está na biblioteca";
  if (!LOCATION_EQUIPMENT[profile.location].includes(entry.equipment)) return "equipamento indisponível";
  if (profile.location !== "academia" && NEEDS_GYM.has(key)) return "precisa de estrutura de academia";
  if (profile.experience === "iniciante" && TECHNICAL.has(key)) return "técnica avançada";
  const region = profile.limitations.find((r) => CAUTION_BY_REGION[r].has(key));
  if (region) return `força a região: ${REGION_LABELS[region].toLowerCase()}`;
  return null;
}

/* ---------- séries, repetições e descanso ---------- */

export type RepRange = readonly [number, number];
export type Role = "principal" | "composto" | "isolado" | "core";

interface Prescription {
  reps: RepRange;
  /** faixas que a IA pode escolher no lugar da padrão */
  options: readonly RepRange[];
  restSeconds: number;
}

const PRESCRIPTIONS: Record<TrainingGoal, Record<Role, Prescription>> = {
  massa: {
    principal: { reps: [6, 10], options: [[5, 8], [6, 10], [8, 12]], restSeconds: 120 },
    composto: { reps: [8, 12], options: [[6, 10], [8, 12], [10, 15]], restSeconds: 90 },
    isolado: { reps: [10, 15], options: [[8, 12], [10, 15], [12, 20]], restSeconds: 60 },
    core: { reps: [12, 20], options: [[10, 15], [12, 20], [15, 25]], restSeconds: 45 },
  },
  forca: {
    principal: { reps: [3, 6], options: [[3, 5], [3, 6], [4, 6], [5, 8]], restSeconds: 180 },
    composto: { reps: [6, 8], options: [[5, 8], [6, 8], [6, 10]], restSeconds: 120 },
    isolado: { reps: [8, 12], options: [[8, 12], [10, 15]], restSeconds: 75 },
    core: { reps: [10, 15], options: [[10, 15], [12, 20]], restSeconds: 45 },
  },
  saude: {
    principal: { reps: [8, 12], options: [[6, 10], [8, 12], [10, 15]], restSeconds: 90 },
    composto: { reps: [10, 12], options: [[8, 12], [10, 12], [10, 15]], restSeconds: 75 },
    isolado: { reps: [12, 15], options: [[10, 15], [12, 15], [12, 20]], restSeconds: 60 },
    core: { reps: [12, 20], options: [[10, 15], [12, 20], [15, 25]], restSeconds: 45 },
  },
  emagrecer: {
    principal: { reps: [8, 12], options: [[6, 10], [8, 12], [10, 15]], restSeconds: 75 },
    composto: { reps: [10, 12], options: [[8, 12], [10, 12], [10, 15]], restSeconds: 60 },
    isolado: { reps: [12, 15], options: [[10, 15], [12, 15], [12, 20]], restSeconds: 45 },
    core: { reps: [12, 20], options: [[10, 15], [12, 20], [15, 25]], restSeconds: 30 },
  },
};

/** Força para quem está começando: cargas altas, mas sem séries de 3 repetições antes de ter técnica. */
const BEGINNER_STRENGTH: Prescription = { reps: [5, 8], options: [[5, 8], [6, 8], [6, 10]], restSeconds: 150 };

const SETS: Record<TrainingExperience, Record<Tier, { sets: number; options: readonly number[] }>> = {
  iniciante: { 1: { sets: 3, options: [2, 3] }, 2: { sets: 3, options: [2, 3] }, 3: { sets: 2, options: [2, 3] } },
  intermediario: { 1: { sets: 4, options: [3, 4] }, 2: { sets: 3, options: [2, 3, 4] }, 3: { sets: 3, options: [2, 3] } },
  avancado: { 1: { sets: 4, options: [3, 4, 5] }, 2: { sets: 4, options: [3, 4] }, 3: { sets: 3, options: [2, 3, 4] } },
};

export { PRIORITY_VOLUME };

function roleOf(type: SlotType, tier: Tier): Role {
  const { kind } = SLOT_TYPES[type];
  if (kind === "composto") return tier === 1 ? "principal" : "composto";
  return kind;
}

/* ---------- tempo ---------- */

/** Aquecimento fora das vagas: entra na conta do tempo, mas não vira exercício na ficha. */
export const WARMUP_SECONDS = 5 * 60;
/** Montar o aparelho, ajustar a carga e ir para o próximo. */
const SETUP_SECONDS = 60;
/** Uma série, do início ao fim. */
const WORK_SECONDS = 45;
/** A IA pode passar um pouco do tempo estimado (a estimativa é aproximada); mais do que isso é recusado. */
export const TIME_TOLERANCE = 1.1;

export function exerciseSeconds(sets: number, restSeconds: number): number {
  return SETUP_SECONDS + sets * WORK_SECONDS + Math.max(0, sets - 1) * restSeconds;
}

export { DAY_KINDS, type DayKind };

/* ---------- esqueleto ---------- */

export interface PlanSlot {
  /** estável dentro do plano ("d1s3"): é por ele que a IA e as trocas se referem à vaga */
  id: string;
  type: SlotType;
  tier: Tier;
  role: Role;
  /** exercícios permitidos (chaves da biblioteca), na ordem de preferência; nunca vazio */
  options: string[];
  sets: number;
  setOptions: number[];
  reps: RepRange;
  repOptions: RepRange[];
  restSeconds: number;
}

export interface PlanDay {
  id: string;
  kind: DayKind;
  name: string;
  slots: PlanSlot[];
}

export interface PlanSkeleton {
  /** a família da divisão (para o registro e os textos) */
  split: TrainingSplit;
  /** a divisão exata do catálogo; ausente nas propostas de antes do rodízio */
  option?: SplitOptionId;
  /** dias de musculação por semana usados no rodízio; ausente nas propostas antigas */
  daysPerWeek?: number;
  days: PlanDay[];
  /**
   * quantas vezes, em média, cada ficha é feita na semana: dias ÷ treinos. Fracionário no rodízio (3 treinos em 5
   * dias = 1,67), 2 no empurrar/puxar/pernas de 6 dias.
   */
  timesPerWeek: number;
  /** tempo de exercícios por treino, já sem o aquecimento */
  budgetSeconds: number;
}

/** Chaves da biblioteca que a pessoa já tem cadastradas (vínculo, ou nome igual a um da biblioteca). */
export function knownLibraryKeys(exercises: readonly Exercise[]): Set<string> {
  const keys = new Set<string>();
  for (const e of exercises) {
    if (e.archived) continue;
    const key = e.libraryKey ?? matchLibrary(e.name)?.key;
    if (key) keys.add(key);
  }
  return keys;
}

export function allowedOptions(type: SlotType, profile: TrainingProfile, known: ReadonlySet<string>): string[] {
  const allowed = SLOT_TYPES[type].options.filter((key) => exclusionReason(key, profile) === null);
  // O que a pessoa já faz vem primeiro: continuar um exercício mantém a evolução comparável.
  return [...allowed.filter((k) => known.has(k)), ...allowed.filter((k) => !known.has(k))];
}

function resolveType(type: SlotType, profile: TrainingProfile, known: ReadonlySet<string>): { type: SlotType; options: string[] } | null {
  const options = allowedOptions(type, profile, known);
  if (options.length > 0) return { type, options };
  const fallback = SLOT_TYPES[type].fallback;
  if (!fallback) return null;
  const alternative = allowedOptions(fallback, profile, known);
  return alternative.length > 0 ? { type: fallback, options: alternative } : null;
}

/**
 * Um exercício DIFERENTE para cada vaga do treino, respeitando a ordem de preferência de cada uma (busca em
 * profundidade: as listas são curtas). Null = impossível (duas vagas disputam o único exercício que sobrou).
 */
function assignDistinct(optionLists: readonly (readonly string[])[]): string[] | null {
  const used = new Set<string>();
  const picked: string[] = [];
  const fill = (index: number): boolean => {
    if (index === optionLists.length) return true;
    for (const key of optionLists[index]) {
      if (used.has(key)) continue;
      used.add(key);
      picked.push(key);
      if (fill(index + 1)) return true;
      used.delete(key);
      picked.pop();
    }
    return false;
  };
  return fill(0) ? picked : null;
}

export function daySeconds(slots: readonly Pick<PlanSlot, "sets" | "restSeconds">[]): number {
  return slots.reduce((total, s) => total + exerciseSeconds(s.sets, s.restSeconds), 0);
}

/**
 * Corta vagas até o treino caber no tempo: primeiro as de nível 3, depois as de nível 2 (sempre a última da ficha).
 * Os grupos protegidos (`guarded`: o foco e quem lhe dá trabalho indireto) só são cortados depois de todos os outros. Se só as principais não couberem, reduz as
 * séries delas ao mínimo e, por último, tira principais (ficam pelo menos 2).
 */
function fitToBudget(slots: PlanSlot[], budget: number, guarded: (slot: PlanSlot) => boolean = () => false): PlanSlot[] {
  let fitted = [...slots];
  for (const onlyGuarded of [false, true]) {
    for (const tier of [3, 2] as const) {
      while (daySeconds(fitted) > budget) {
        const index = fitted.findLastIndex((s) => s.tier === tier && guarded(s) === onlyGuarded);
        if (index < 0) break;
        fitted.splice(index, 1);
      }
    }
  }
  if (daySeconds(fitted) > budget) {
    fitted = fitted.map((s) => ({ ...s, sets: s.setOptions[0] }));
  }
  while (daySeconds(fitted) > budget && fitted.length > 2) fitted.pop();
  return fitted;
}

/** Grupos grandes que contam para o volume semanal mínimo (braços, panturrilha e abdômen já vêm dos compostos). */
export const MAJOR_GROUPS: readonly VolumeGroup[] = ["peito", "costas", "ombros", "quadriceps", "posteriores"];

/**
 * Séries por semana que cada grupo grande deve receber, no mínimo. Abaixo de ~10 séries semanais o ganho tende a ser
 * menor (Schoenfeld, Ogborn & Krieger, 2017); quem está começando responde bem com menos.
 */
const WEEKLY_MIN_SETS: Record<TrainingExperience, number> = { iniciante: 6, intermediario: 10, avancado: 12 };

/**
 * Sobe séries (dentro das opções de cada vaga e do tempo do treino) dos grupos grandes que ficaram com pouco volume na
 * semana. Acontece nas divisões em que cada músculo treina 1 vez por semana: o volume se mantém com mais séries no dia.
 */
function balanceVolume(days: PlanDay[], timesPerWeek: number, budget: number, minimum: number): PlanDay[] {
  const balanced = days.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
  const weekly = (group: VolumeGroup) =>
    balanced.reduce((t, d) => t + d.slots.filter((s) => SLOT_TYPES[s.type].group === group).reduce((n, s) => n + s.sets, 0), 0) * timesPerWeek;
  for (const group of MAJOR_GROUPS) {
    let changed = true;
    while (changed && weekly(group) > 0 && weekly(group) < minimum) {
      changed = false;
      for (const day of balanced) {
        // Do mais importante para o menos: a série a mais vai primeiro no exercício principal do grupo.
        for (const slot of [...day.slots].sort((a, b) => a.tier - b.tier)) {
          if (SLOT_TYPES[slot.type].group !== group) continue;
          const next = slot.setOptions.find((n) => n > slot.sets);
          if (next === undefined) continue;
          const before = slot.sets;
          slot.sets = next;
          if (daySeconds(day.slots) > budget) {
            slot.sets = before;
            continue;
          }
          changed = true;
          break;
        }
        if (weekly(group) >= minimum) break;
      }
    }
  }
  return balanced;
}

/**
 * Quantas vezes por semana um grupo grande típico treina (mediana dos grupos) com esta divisão e estes dias (arredondado em 0,5).
 * É o número que a tela mostra ao escolher a divisão.
 */
export function splitFrequency(option: SplitOption, daysPerWeek: number): number {
  const rounds = daysPerWeek / option.days.length;
  const perGroup = MAJOR_GROUPS.map(
    (group) => option.days.filter((kind) => DAY_TEMPLATES[kind].slots.some(([type, tier]) => tier <= 2 && SLOT_TYPES[type].group === group)).length * rounds,
  );
  // Mediana, não média: um grupo que aparece em mais treinos (ombro no empurrar E no puxar) não muda o "cada músculo".
  const median = [...perGroup].sort((a, b) => a - b)[Math.floor(perGroup.length / 2)];
  return Math.max(1, Math.round(median * 2) / 2);
}

/** "1 vez", "cerca de 1,5 vez", "2 vezes"… */
export function formatFrequency(times: number): string {
  if (times === 1) return "1 vez";
  const number = Number.isInteger(times) ? String(times) : String(times).replace(".", ",");
  return `${Number.isInteger(times) ? "" : "cerca de "}${number} ${times < 2 ? "vez" : "vezes"}`;
}

/**
 * Uma vaga nova. `extended` (grupo em foco) deixa a vaga subir uma série acima do máximo normal; o padrão continua o
 * mesmo: o foco só sobe séries quando o distribuidor encontra uma lacuna (training-focus.ts).
 */
export function makeSlot(
  profile: TrainingProfile,
  resolved: { type: SlotType; options: string[] },
  tier: Tier,
  id: string,
  extended: boolean,
): PlanSlot {
  const role = roleOf(resolved.type, tier);
  const prescription =
    profile.goal === "forca" && profile.experience === "iniciante" && role === "principal" ? BEGINNER_STRENGTH : PRESCRIPTIONS[profile.goal][role];
  const volume = SETS[profile.experience][tier];
  return {
    id,
    type: resolved.type,
    tier,
    role,
    options: resolved.options,
    sets: volume.sets,
    setOptions: extended ? extendSetOptions(volume.options) : [...volume.options],
    reps: prescription.reps,
    repOptions: prescription.options.map((r) => [r[0], r[1]] as const),
    restSeconds: prescription.restSeconds,
  };
}

/** Uma série acima do máximo normal da vaga (só o grupo em foco pode usar). */
function extendSetOptions(options: readonly number[]): number[] {
  return [...new Set([...options, options[options.length - 1] + 1])];
}

const ADDED_ID = /x\d+$/;

/**
 * Vagas novas que podem entrar num treino para reforçar um grupo: tipos do grupo com exercício permitido (equipamento e
 * limitações já considerados), os que o treino ainda não tem primeiro. Prioridade 2, com id único no treino.
 */
export function addableSlots(
  profile: TrainingProfile,
  known: ReadonlySet<string>,
  day: { id: string; slots: readonly PlanSlot[] },
  group: VolumeGroup,
): PlanSlot[] {
  const present = new Set(day.slots.map((s) => s.type));
  const types = (Object.keys(SLOT_TYPES) as SlotType[])
    .filter((type) => SLOT_TYPES[type].group === group)
    .sort((a, b) => Number(present.has(a)) - Number(present.has(b)) || Number(SLOT_TYPES[a].kind !== "composto") - Number(SLOT_TYPES[b].kind !== "composto"));
  const taken = day.slots.filter((s) => ADDED_ID.test(s.id)).map((s) => Number(s.id.slice(s.id.lastIndexOf("x") + 1)));
  const id = `${day.id}x${(taken.length ? Math.max(...taken) : 0) + 1}`;
  const out: PlanSlot[] = [];
  for (const type of types) {
    const options = allowedOptions(type, profile, known);
    if (options.length === 0) continue;
    out.push(makeSlot(profile, { type, options }, 2, id, true));
  }
  return out;
}

/** Vagas acrescentadas ficam logo depois das do mesmo grupo (ou no fim); as do modelo ficam onde estavam. */
function placeAdded(slots: PlanSlot[]): PlanSlot[] {
  const placed = slots.filter((s) => !ADDED_ID.test(s.id));
  for (const added of slots.filter((s) => ADDED_ID.test(s.id))) {
    const group = SLOT_TYPES[added.type].group;
    const last = placed.findLastIndex((s) => SLOT_TYPES[s.type].group === group);
    placed.splice(last >= 0 ? last + 1 : placed.length, 0, added);
  }
  return placed;
}

/**
 * O esqueleto do plano para estas respostas e esta divisão (`splitId`; sem ela, ou se ela não cabe nos dias, o padrão
 * das regras). Puro e determinístico: as mesmas entradas dão o mesmo esqueleto.
 *
 * Foco (training-focus.ts): sem foco, nada muda. Com foco, o grupo é protegido do corte de tempo e o distribuidor leva o
 * volume ao alvo do objetivo (massa), ou só reforça o exercício principal (força) ou levemente (saúde e emagrecer).
 */
export function buildSkeleton(profile: TrainingProfile, exercises: readonly Exercise[], splitId?: string): PlanSkeleton {
  const option = resolveSplit(profile, splitId);
  const { family: split, days } = option;
  const known = knownLibraryKeys(exercises);
  const budgetSeconds = profile.sessionMinutes * 60 - WARMUP_SECONDS;
  const active = focusDecisions(profile).filter((d) => !d.blockedBy);
  const focusGroups = new Set(active.map((d) => d.group));
  // O foco e quem lhe dá trabalho indireto (costas para o bíceps, supino para o tríceps) só são cortados por último.
  const isGuarded = (slot: PlanSlot) => focusGroups.has(SLOT_TYPES[slot.type].group) || givesIndirectTo(slot.type, focusGroups);

  const built = days.map((kind, dayIndex): PlanDay => {
    const template = DAY_TEMPLATES[kind];
    const slots: PlanSlot[] = [];
    template.slots.forEach(([wanted, tier], slotIndex) => {
      const resolved = resolveType(wanted, profile, known);
      if (!resolved) return;
      // Vaga que só teria exercícios já usados neste treino (ex.: em casa, a vaga de quadril virou glúteo e a de
      // glúteo não tem outra opção): fica de fora, em vez de repetir o exercício.
      if (!assignDistinct([...slots.map((s) => s.options), resolved.options])) return;
      slots.push(makeSlot(profile, resolved, tier, `d${dayIndex + 1}s${slotIndex + 1}`, false));
    });
    return { id: `d${dayIndex + 1}`, kind, name: template.name, slots: fitToBudget(slots, budgetSeconds, isGuarded) };
  });

  const timesPerWeek = profile.daysPerWeek / days.length;
  const band = volumeBand(profile);
  // O mínimo semanal de hoje vale para TODOS os objetivos (comportamento anterior ao foco, mantido de propósito: mexer nele
  // mudaria planos de quem não pediu nada). Se um dia for o caso de baixar em saúde e emagrecer, é uma decisão à parte.
  let finalDays = balanceVolume(built, timesPerWeek, budgetSeconds, WEEKLY_MIN_SETS[profile.experience]);

  if (active.length > 0) {
    // Só agora as vagas do foco ganham a série extra (acima do máximo normal): antes disso o mínimo semanal, que vale
    // para todos, não pode gastar o tempo do treino com séries que só o foco pode usar.
    finalDays = finalDays.map((day) => ({
      ...day,
      slots: day.slots.map((slot) => (focusGroups.has(SLOT_TYPES[slot.type].group) ? { ...slot, setOptions: extendSetOptions(slot.setOptions) } : slot)),
    }));
    const mode = focusMode(profile.goal);
    const targets: FocusTarget[] = active.map((d) => ({ group: d.group, ...(mode === "volume" ? { target: focusTarget(profile, d) } : {}) }));
    const groupOf = (type: SlotType) => SLOT_TYPES[type].group;
    const result = runFocus<PlanSlot>(
      finalDays,
      {
        groupOf,
        secondsOf: daySeconds,
        budgetSeconds,
        timesPerWeek,
        floor: band.floor,
        trimOvershoot: true,
        addable: (day, group) => addableSlots(profile, known, day, group).filter((slot) => assignDistinct([...day.slots.map((s) => s.options), slot.options])),
      },
      mode,
      targets,
    );
    finalDays = finalDays.map((day, i) => ({ ...day, slots: focusFirst(placeAdded(result.days[i].slots), focusGroups, groupOf) }));
  }

  return {
    split,
    option: option.id,
    daysPerWeek: profile.daysPerWeek,
    days: finalDays,
    timesPerWeek,
    budgetSeconds,
  };
}

/* ---------- escolhas ---------- */

export interface SlotChoice {
  exerciseKey: string;
  sets: number;
  reps: RepRange;
  /** motivo curto da escolha (IA); ausente no modelo pronto e depois de uma troca */
  reason?: string;
  /** trocado pela pessoa na revisão */
  swapped?: boolean;
}

export type PlanChoices = Record<string, SlotChoice>;

/**
 * As escolhas do modelo pronto: a primeira opção de cada vaga, sem repetir exercício no mesmo treino. Uma vaga que
 * aparece de novo em outro treino da semana pega a opção seguinte, para variar os estímulos.
 */
export function defaultChoices(skeleton: PlanSkeleton): PlanChoices {
  const choices: PlanChoices = {};
  const seen = new Map<SlotType, number>();
  for (const day of skeleton.days) {
    const rotated = day.slots.map((slot) => {
      const occurrence = seen.get(slot.type) ?? 0;
      seen.set(slot.type, occurrence + 1);
      const shift = occurrence % slot.options.length;
      return [...slot.options.slice(shift), ...slot.options.slice(0, shift)];
    });
    // O esqueleto garante que existe uma escolha sem repetição (as mesmas opções, só em outra ordem).
    const keys = assignDistinct(rotated) ?? day.slots.map((slot) => slot.options[0]);
    day.slots.forEach((slot, i) => {
      choices[slot.id] = { exerciseKey: keys[i], sets: slot.sets, reps: slot.reps };
    });
  }
  return choices;
}

const sameRange = (a: RepRange, b: RepRange) => a[0] === b[0] && a[1] === b[1];

export function formatRange(range: RepRange): string {
  return `${range[0]}–${range[1]}`;
}

/** Tempo estimado do treino com estas escolhas, em minutos inteiros, incluindo o aquecimento. */
export function dayMinutes(day: PlanDay, choices: PlanChoices): number {
  const seconds = daySeconds(day.slots.map((s) => ({ sets: choices[s.id]?.sets ?? s.sets, restSeconds: s.restSeconds })));
  return Math.round((seconds + WARMUP_SECONDS) / 60);
}

/** O treino passou do tempo disponível (com a mesma folga das regras)? Para avisar, nunca para recusar. */
export function dayOverBudget(skeleton: PlanSkeleton, day: PlanDay, choices: PlanChoices): boolean {
  const seconds = daySeconds(day.slots.map((s) => ({ sets: choices[s.id]?.sets ?? s.sets, restSeconds: s.restSeconds })));
  return seconds > skeleton.budgetSeconds * TIME_TOLERANCE;
}

/**
 * Exercícios principais (os mais pesados, prioridade 1) que ficaram DEPOIS de um isolado ou de core. Quem faz um
 * exercício mais cedo no treino tende a render mais repetições e carga nele (Simão et al., 2012): é só um aviso.
 */
export function lateMainSlots(day: PlanDay): string[] {
  let sawAccessory = false;
  const late: string[] = [];
  for (const slot of day.slots) {
    if (slot.role === "isolado" || slot.role === "core") sawAccessory = true;
    else if (slot.tier === 1 && sawAccessory) late.push(slot.id);
  }
  return late;
}

/**
 * Tudo o que torna um plano inválido, em português. Vale para a IA, para o modelo pronto e para as edições da pessoa:
 * plano com erro nunca chega à tela. Lista vazia = válido.
 *
 * `checkTime: false` deixa de fora só o tempo: a IA e o modelo pronto precisam caber no tempo informado, mas a pessoa
 * pode decidir passar dele (mais séries, outro exercício). A tela avisa (`dayOverBudget`) em vez de recusar.
 */
export function planErrors(skeleton: PlanSkeleton, choices: PlanChoices, options: { checkTime?: boolean } = {}): string[] {
  const checkTime = options.checkTime ?? true;
  const errors: string[] = [];
  for (const day of skeleton.days) {
    const used = new Set<string>();
    for (const slot of day.slots) {
      const choice = choices[slot.id];
      const where = `${day.name}, ${SLOT_TYPES[slot.type].label}`;
      if (!choice) {
        errors.push(`${where}: vaga sem exercício.`);
        continue;
      }
      if (!slot.options.includes(choice.exerciseKey)) errors.push(`${where}: "${choice.exerciseKey}" não é uma das opções da vaga.`);
      if (used.has(choice.exerciseKey)) errors.push(`${where}: "${choice.exerciseKey}" repetido no mesmo treino.`);
      used.add(choice.exerciseKey);
      if (!slot.setOptions.includes(choice.sets)) errors.push(`${where}: ${choice.sets} séries fora do permitido (${slot.setOptions.join(", ")}).`);
      if (!slot.repOptions.some((r) => sameRange(r, choice.reps))) errors.push(`${where}: faixa ${formatRange(choice.reps)} fora do permitido.`);
    }
    if (!checkTime) continue;
    const seconds = daySeconds(day.slots.map((s) => ({ sets: choices[s.id]?.sets ?? s.sets, restSeconds: s.restSeconds })));
    if (seconds > skeleton.budgetSeconds * TIME_TOLERANCE) {
      errors.push(`${day.name}: passa do tempo disponível (cerca de ${Math.round((seconds + WARMUP_SECONDS) / 60)} min).`);
    }
  }
  return errors;
}

/**
 * Conserta, pelas regras, o que a IA pode errar mesmo com a saída estruturada (o schema não sabe dizer "sem repetir"
 * nem somar tempo): exercício repetido no treino vira a primeira opção livre da vaga; treino longo demais perde as
 * séries a mais (das vagas de menor prioridade primeiro) até caber. Devolve quantas vagas mudaram.
 */
export function repairChoices(skeleton: PlanSkeleton, choices: PlanChoices): { choices: PlanChoices; repaired: number } {
  const fixed: PlanChoices = { ...choices };
  const touched = new Set<string>();
  for (const day of skeleton.days) {
    const used = new Set<string>();
    for (const slot of day.slots) {
      const choice = fixed[slot.id];
      if (!choice) continue;
      if (used.has(choice.exerciseKey)) {
        const free = slot.options.find((key) => !used.has(key));
        if (free) {
          fixed[slot.id] = { exerciseKey: free, sets: choice.sets, reps: choice.reps };
          touched.add(slot.id);
        }
      }
      used.add(fixed[slot.id].exerciseKey);
    }
    const seconds = () => daySeconds(day.slots.map((s) => ({ sets: fixed[s.id]?.sets ?? s.sets, restSeconds: s.restSeconds })));
    const byPriority = [...day.slots].sort((a, b) => b.tier - a.tier);
    for (const target of ["default", "minimum"] as const) {
      for (const slot of byPriority) {
        if (seconds() <= skeleton.budgetSeconds * TIME_TOLERANCE) break;
        const choice = fixed[slot.id];
        const floor = target === "default" ? slot.sets : slot.setOptions[0];
        if (choice && choice.sets > floor) {
          fixed[slot.id] = { ...choice, sets: floor };
          touched.add(slot.id);
        }
      }
    }
  }
  return { choices: fixed, repaired: touched.size };
}

/** Séries por semana de cada grupo, com estas escolhas (para a revisão e para conferir o equilíbrio). */
export function weeklySets(skeleton: PlanSkeleton, choices: PlanChoices): Partial<Record<VolumeGroup, number>> {
  const totals: Partial<Record<VolumeGroup, number>> = {};
  for (const day of skeleton.days) {
    for (const slot of day.slots) {
      const group = SLOT_TYPES[slot.type].group;
      totals[group] = (totals[group] ?? 0) + (choices[slot.id]?.sets ?? slot.sets) * skeleton.timesPerWeek;
    }
  }
  return totals;
}

/** Opções para trocar o exercício de uma vaga: as permitidas, menos as que já estão em outra vaga do mesmo treino. */
export function swapOptions(skeleton: PlanSkeleton, choices: PlanChoices, slotId: string): string[] {
  const day = skeleton.days.find((d) => d.slots.some((s) => s.id === slotId));
  const slot = day?.slots.find((s) => s.id === slotId);
  if (!day || !slot) return [];
  const taken = new Set(day.slots.filter((s) => s.id !== slotId).map((s) => choices[s.id]?.exerciseKey));
  return slot.options.filter((key) => key !== choices[slotId]?.exerciseKey && !taken.has(key));
}

/* ---------- texto do modelo pronto ---------- */

/*
 * O resumo das regras é o "Recado do Tars" quando não há IA: em primeira pessoa, como o assistente explicando o que
 * montou. As afirmações são as mesmas de antes (nada que a seção de fontes não sustente).
 */
const SPLIT_SENTENCES: Record<TrainingSplit, (count: number) => string> = {
  "corpo-inteiro": (count) => `Montei ${count} treinos de corpo inteiro: cada um passa por todos os grupos, o que rende bem para quem tem poucos dias ou está começando.`,
  "superior-inferior": () => "Alternei superior e inferior: um dia a parte de cima, no outro as pernas, com descanso entre um e outro.",
  "superior-inferior-ppl": () => "Combinei superior e inferior com empurrar, puxar e pernas: frequência e variedade em 5 treinos.",
  "empurrar-puxar-pernas": () =>
    "Separei em empurrar (peito, ombros e tríceps), puxar (costas e bíceps) e pernas: cada treino junta músculos que trabalham juntos.",
  "por-grupo": () => "Dei um grupo muscular para cada treino, com mais séries no dia dele para manter o volume da semana.",
};

/** Como os treinos se encaixam nos dias, para o resumo. */
function rotationSentence(count: number, daysPerWeek: number): string | null {
  if (count === daysPerWeek) return null;
  if (daysPerWeek % count === 0) return `Cada treino entra ${daysPerWeek / count} vezes na semana.`;
  return `Como você treina ${daysPerWeek} dias, os ${count} treinos se revezam em sequência: depois do último, volte ao A.`;
}

const GOAL_SENTENCES: Record<TrainingGoal, string> = {
  massa: "Usei faixas de 6 a 15 repetições, que funcionam bem para ganhar massa.",
  forca: "Deixei os exercícios principais em poucas repetições, com descanso longo, para a carga subir.",
  saude: "Usei repetições moderadas e descansos curtos: bom para o condicionamento e para firmar a técnica.",
  emagrecer: "Deixei descansos curtos para o treino render no tempo. Perder gordura depende mais da alimentação; o treino ajuda a preservar a massa muscular.",
};

const REGION_WITH_ARTICLE: Record<BodyRegion, string> = {
  ombro: "o ombro",
  cotovelo: "o cotovelo",
  punho: "o punho",
  lombar: "a lombar",
  quadril: "o quadril",
  joelho: "o joelho",
  tornozelo: "o tornozelo",
};

/** As 2 ou 3 frases de "por que este plano" quando ele sai das regras, sem IA. */
export function rulesSummary(profile: TrainingProfile, skeleton: PlanSkeleton): string {
  const count = skeleton.days.length;
  const option = resolveSplit(profile, skeleton.option);
  const attention = [...new Set(focusDecisions(profile).filter((d) => !d.blockedBy).map((d) => PRIORITY_LABELS[d.priority].toLowerCase()))];
  const parts = [
    SPLIT_SENTENCES[skeleton.split](count),
    rotationSentence(count, profile.daysPerWeek),
    `Assim, cada grupo grande treina ${formatFrequency(splitFrequency(option, profile.daysPerWeek))} por semana.`,
    GOAL_SENTENCES[profile.goal],
    attention.length > 0 ? `Dei mais atenção a ${attention.join(" e ")}.` : null,
  ].filter((part): part is string => part !== null);
  if (profile.limitations.length > 0) {
    const regions = profile.limitations.map((r) => REGION_WITH_ARTICLE[r]);
    const list = regions.length > 1 ? `${regions.slice(0, -1).join(", ")} e ${regions[regions.length - 1]}` : regions[0];
    parts.push(`Deixei de fora exercícios que costumam forçar ${list}.`);
  }
  return parts.join(" ");
}
