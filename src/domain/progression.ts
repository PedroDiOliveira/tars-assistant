import type { Equipment } from "./exercise-library";
import type { SetLog } from "./types";
import type { ExerciseEntry } from "./workouts";

/**
 * Progressão dupla, a regra mais usada (e mais fácil de seguir) em musculação: dentro da faixa de repetições da
 * ficha, primeiro se ganha REPETIÇÕES; quando TODAS as séries planejadas chegam ao topo da faixa com a mesma carga, é
 * hora de subir a carga (e as repetições voltam a subir a partir do mínimo).
 *
 * Aqui só a sugestão de subir. Ela nunca é aplicada sozinha: a tela mostra e a pessoa toca para aplicar.
 */

/**
 * Menor salto de carga que costuma existir em cada equipamento. Halteres e anilhas pequenas costumam ir de 2 em
 * 2 kg (1 kg de cada lado na barra); placas de máquina e polia, de 5 em 5. Sem vínculo com a biblioteca, ~2,5% da
 * carga (nunca menos de 1 kg).
 */
const STEP_KG: Record<Equipment, number> = {
  barra: 2,
  smith: 2,
  halteres: 2,
  kettlebell: 4,
  maquina: 5,
  polia: 5,
  "peso-corporal": 2,
};

export function loadStepKg(weightKg: number, equipment?: Equipment): number {
  if (equipment) return STEP_KG[equipment];
  return Math.max(1, Math.round(weightKg * 0.025));
}

export interface LoadSuggestion {
  fromKg: number;
  toKg: number;
  /** repetições feitas em todas as séries da última vez (o topo da faixa ou mais) */
  reps: number;
}

export interface SuggestionInput {
  /** último registro do exercício (`lastPerformance`) */
  last: ExerciseEntry | null;
  /** séries e topo da faixa da ficha ATUAL: é o alvo de hoje que conta, não o de quando foi feito */
  plannedSets: number;
  repMax: number;
  loadType: "external" | "bodyweight";
  equipment?: Equipment;
}

/**
 * Sugere subir a carga quando a última vez teve TODAS as séries planejadas, todas com a mesma carga e todas no topo
 * da faixa (ou acima). Fora disso (pirâmide, séries faltando, sem carga registrada, peso corporal sem carga extra),
 * não sugere nada: na dúvida, o app fica quieto.
 */
export function suggestLoad({ last, plannedSets, repMax, loadType, equipment }: SuggestionInput): LoadSuggestion | null {
  if (!last || last.sets.length < plannedSets) return null;
  const sets: SetLog[] = last.sets;
  const weight = sets[0].weightKg;
  if (weight <= 0) return null; // sem carga registrada (ou peso corporal sem carga extra)
  if (sets.some((s) => s.weightKg !== weight)) return null;
  if (sets.some((s) => s.reps < repMax)) return null;
  const step = loadStepKg(weight, loadType === "bodyweight" ? "peso-corporal" : equipment);
  return {
    fromKg: weight,
    toKg: Math.round((weight + step) * 2) / 2,
    reps: Math.min(...sets.map((s) => s.reps)),
  };
}

/** A sugestão já está na tela: toda série ainda não concluída está com a carga sugerida (ou mais). */
export function suggestionApplied(sets: SetLog[], suggestion: LoadSuggestion): boolean {
  const pending = sets.filter((s) => !s.done);
  const relevant = pending.length > 0 ? pending : sets;
  return relevant.every((s) => s.weightKg >= suggestion.toKg);
}
