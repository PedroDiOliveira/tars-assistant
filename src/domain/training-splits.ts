import type { SlotType, Tier } from "./training-rules";
import type { TrainingExperience, TrainingProfile, TrainingSplit } from "./types";

/**
 * Divisões do treino na semana. Dias por semana e número de treinos diferentes são coisas separadas: com 5 dias, o
 * padrão são 3 treinos (A, B, C) que se revezam em sequência (A B C A B, e na semana seguinte continua do C). A pessoa
 * vê isso escrito no rascunho e pode trocar por qualquer divisão com até tantos treinos quantos dias.
 *
 * Só tipos vêm de training-rules (sem ciclo em tempo de execução): as regras importam este arquivo.
 */

export type DayKind =
  | "corpo-a"
  | "corpo-b"
  | "corpo-c"
  | "superior-a"
  | "superior-b"
  | "inferior-a"
  | "inferior-b"
  | "empurrar"
  | "puxar"
  | "pernas"
  | "peito-triceps"
  | "costas-biceps"
  | "ombros-abdomen"
  | "posterior-gluteo"
  | "bracos";

export const DAY_KINDS: readonly DayKind[] = [
  "corpo-a",
  "corpo-b",
  "corpo-c",
  "superior-a",
  "superior-b",
  "inferior-a",
  "inferior-b",
  "empurrar",
  "puxar",
  "pernas",
  "peito-triceps",
  "costas-biceps",
  "ombros-abdomen",
  "posterior-gluteo",
  "bracos",
];

type Slot = readonly [SlotType, Tier];

/** Vagas de cada tipo de treino, na ordem de execução: compostos primeiro, isolados no fim. */
export const DAY_TEMPLATES: Record<DayKind, { name: string; slots: readonly Slot[] }> = {
  "corpo-a": {
    name: "Corpo inteiro A",
    slots: [["quadriceps-composto", 1], ["peito-composto", 1], ["costas-horizontal", 1], ["posteriores-isolado", 2], ["ombro-lateral", 2], ["triceps", 3], ["biceps", 3], ["abdomen", 3]],
  },
  "corpo-b": {
    name: "Corpo inteiro B",
    slots: [["posteriores-quadril", 1], ["costas-vertical", 1], ["ombro-composto", 1], ["pernas-unilateral", 2], ["peito-isolado", 2], ["biceps", 3], ["triceps", 3], ["panturrilha", 3]],
  },
  "corpo-c": {
    name: "Corpo inteiro C",
    slots: [["quadriceps-composto", 1], ["peito-inclinado", 1], ["costas-vertical", 1], ["posteriores-isolado", 2], ["ombro-posterior", 2], ["gluteos", 3], ["biceps", 3], ["abdomen", 3]],
  },
  "superior-a": {
    name: "Superior A",
    slots: [["peito-composto", 1], ["costas-horizontal", 1], ["ombro-composto", 1], ["costas-vertical", 2], ["ombro-lateral", 2], ["triceps", 3], ["biceps", 3]],
  },
  "superior-b": {
    name: "Superior B",
    slots: [["costas-vertical", 1], ["peito-inclinado", 1], ["costas-horizontal", 1], ["peito-isolado", 2], ["ombro-lateral", 2], ["ombro-posterior", 3], ["biceps", 3], ["triceps", 3]],
  },
  "inferior-a": {
    name: "Inferior A",
    slots: [["quadriceps-composto", 1], ["posteriores-quadril", 1], ["quadriceps-isolado", 2], ["posteriores-isolado", 2], ["panturrilha", 3], ["abdomen", 3]],
  },
  "inferior-b": {
    name: "Inferior B",
    slots: [["posteriores-quadril", 1], ["pernas-unilateral", 1], ["quadriceps-composto", 2], ["posteriores-isolado", 2], ["gluteos", 3], ["panturrilha", 3], ["abdomen", 3]],
  },
  empurrar: {
    name: "Empurrar",
    slots: [["peito-composto", 1], ["ombro-composto", 1], ["peito-inclinado", 2], ["ombro-lateral", 2], ["triceps", 2], ["peito-isolado", 3], ["triceps", 3]],
  },
  puxar: {
    name: "Puxar",
    slots: [["costas-vertical", 1], ["costas-horizontal", 1], ["costas-horizontal", 2], ["ombro-posterior", 2], ["biceps", 2], ["biceps", 3]],
  },
  pernas: {
    name: "Pernas",
    slots: [["quadriceps-composto", 1], ["posteriores-quadril", 1], ["pernas-unilateral", 2], ["quadriceps-isolado", 2], ["posteriores-isolado", 2], ["panturrilha", 3], ["abdomen", 3]],
  },
  "peito-triceps": {
    name: "Peito e tríceps",
    slots: [["peito-composto", 1], ["peito-inclinado", 1], ["peito-isolado", 2], ["triceps", 2], ["peito-composto", 3], ["triceps", 3]],
  },
  "costas-biceps": {
    name: "Costas e bíceps",
    slots: [["costas-vertical", 1], ["costas-horizontal", 1], ["costas-horizontal", 2], ["costas-vertical", 2], ["biceps", 2], ["biceps", 3]],
  },
  "ombros-abdomen": {
    name: "Ombros e abdômen",
    slots: [["ombro-composto", 1], ["ombro-lateral", 1], ["ombro-posterior", 2], ["ombro-lateral", 2], ["abdomen", 3], ["panturrilha", 3]],
  },
  "posterior-gluteo": {
    name: "Posterior e glúteos",
    slots: [["posteriores-quadril", 1], ["gluteos", 1], ["posteriores-isolado", 2], ["pernas-unilateral", 2], ["panturrilha", 3], ["abdomen", 3]],
  },
  bracos: {
    name: "Braços",
    slots: [["biceps", 1], ["triceps", 1], ["biceps", 2], ["triceps", 2], ["ombro-lateral", 3], ["abdomen", 3]],
  },
};

/* ---------- catálogo ---------- */

export type SplitOptionId =
  | "corpo-inteiro-2"
  | "corpo-inteiro-3"
  | "superior-inferior-2"
  | "superior-inferior-4"
  | "empurrar-puxar-pernas-3"
  | "superior-inferior-ppl-5"
  | "por-grupo-4"
  | "por-grupo-5"
  | "por-grupo-6";

export interface SplitOption {
  id: SplitOptionId;
  family: TrainingSplit;
  /** nome curto, sem jargão de letras */
  title: string;
  /** os treinos, na ordem do rodízio */
  days: readonly DayKind[];
  /** aviso neutro para quem escolhe (ex.: frequência menor), ou nada */
  note?: string;
}

const ONCE_A_WEEK =
  "Peito, costas e ombros treinam só 1 vez por semana. Funciona se o volume da semana for mantido: o app põe mais séries em cada treino.";

export const SPLIT_OPTIONS: readonly SplitOption[] = [
  { id: "corpo-inteiro-2", family: "corpo-inteiro", title: "Corpo inteiro", days: ["corpo-a", "corpo-b"] },
  { id: "superior-inferior-2", family: "superior-inferior", title: "Superior e inferior", days: ["superior-a", "inferior-a"] },
  { id: "corpo-inteiro-3", family: "corpo-inteiro", title: "Corpo inteiro", days: ["corpo-a", "corpo-b", "corpo-c"] },
  { id: "empurrar-puxar-pernas-3", family: "empurrar-puxar-pernas", title: "Empurrar, puxar e pernas", days: ["empurrar", "puxar", "pernas"] },
  { id: "superior-inferior-4", family: "superior-inferior", title: "Superior e inferior", days: ["superior-a", "inferior-a", "superior-b", "inferior-b"] },
  { id: "por-grupo-4", family: "por-grupo", title: "Um grupo por treino", days: ["peito-triceps", "costas-biceps", "pernas", "ombros-abdomen"] },
  {
    id: "superior-inferior-ppl-5",
    family: "superior-inferior-ppl",
    title: "Superior, inferior, empurrar, puxar e pernas",
    days: ["superior-a", "inferior-a", "empurrar", "puxar", "pernas"],
  },
  {
    id: "por-grupo-5",
    family: "por-grupo",
    title: "Um grupo por treino",
    days: ["peito-triceps", "costas-biceps", "pernas", "ombros-abdomen", "posterior-gluteo"],
    note: ONCE_A_WEEK,
  },
  {
    id: "por-grupo-6",
    family: "por-grupo",
    title: "Um grupo por treino",
    days: ["peito-triceps", "costas-biceps", "pernas", "ombros-abdomen", "bracos", "posterior-gluteo"],
    note: ONCE_A_WEEK,
  },
];

export const SPLIT_OPTION_IDS = SPLIT_OPTIONS.map((o) => o.id) as [SplitOptionId, ...SplitOptionId[]];

export function splitOption(id: string | undefined): SplitOption | undefined {
  return SPLIT_OPTIONS.find((o) => o.id === id);
}

/** As divisões possíveis com estes dias: até um treino diferente por dia (nunca mais treinos que dias). */
export function availableSplits(daysPerWeek: number): SplitOption[] {
  return SPLIT_OPTIONS.filter((o) => o.days.length <= daysPerWeek);
}

/**
 * O padrão das regras, para quem não quer pensar nisso. Com 5 dias, 3 treinos em rodízio: 5 treinos diferentes é
 * muita coisa para decorar e não rende mais (o que pesa é o volume da semana, não quantas fichas existem).
 */
const DEFAULTS: Record<TrainingProfile["daysPerWeek"], Record<TrainingExperience, SplitOptionId>> = {
  2: { iniciante: "corpo-inteiro-2", intermediario: "corpo-inteiro-2", avancado: "corpo-inteiro-2" },
  3: { iniciante: "corpo-inteiro-2", intermediario: "corpo-inteiro-3", avancado: "corpo-inteiro-3" },
  4: { iniciante: "superior-inferior-4", intermediario: "superior-inferior-4", avancado: "superior-inferior-4" },
  5: { iniciante: "empurrar-puxar-pernas-3", intermediario: "empurrar-puxar-pernas-3", avancado: "empurrar-puxar-pernas-3" },
  6: { iniciante: "empurrar-puxar-pernas-3", intermediario: "empurrar-puxar-pernas-3", avancado: "empurrar-puxar-pernas-3" },
};

export function defaultSplit(profile: Pick<TrainingProfile, "daysPerWeek" | "experience">): SplitOption {
  return splitOption(DEFAULTS[profile.daysPerWeek][profile.experience])!;
}

/** A divisão pedida, se ela cabe nestes dias; senão, o padrão. */
export function resolveSplit(profile: Pick<TrainingProfile, "daysPerWeek" | "experience">, id?: string): SplitOption {
  const wanted = splitOption(id);
  return wanted && wanted.days.length <= profile.daysPerWeek ? wanted : defaultSplit(profile);
}

const LETTERS = "ABCDEF";

/** "A", "B"… para o treino de índice `index`. */
export function dayLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

export function splitLetters(count: number): string {
  return Array.from({ length: count }, (_, i) => dayLetter(i)).join(" ");
}

/**
 * Como os treinos se encaixam na semana, em português: é o que a pessoa precisa saber sem conhecer o jargão.
 * Ex.: "3 treinos que se revezam nos seus 5 dias (A, B, C, A, B…)".
 */
export function scheduleLabel(daysPerWeek: number, count: number): string {
  const letters = Array.from({ length: count }, (_, i) => dayLetter(i)).join(", ");
  if (count === daysPerWeek) return `${count} treinos, um para cada dia (${letters})`;
  if (daysPerWeek % count === 0) return `${count} treinos, cada um ${daysPerWeek / count} vezes na semana (${letters})`;
  const sequence = Array.from({ length: daysPerWeek }, (_, i) => dayLetter(i % count)).join(", ");
  return `${count} treinos que se revezam nos seus ${daysPerWeek} dias (${sequence}…)`;
}
