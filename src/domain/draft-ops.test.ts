import { describe, expect, it } from "vitest";
import type { WorkoutDraft } from "./types";
import { addDraftSet, removeDraftSet, setDraftNotes, updateDraftSet } from "./workouts";

const base: WorkoutDraft = {
  id: "d1", planId: "p", nameSnapshot: "Treino A", startedAt: 0,
  exercises: [
    { exerciseId: "e1", nameSnapshot: "Supino", loadType: "external", plannedSets: 2, repMin: 6, repMax: 10, restSeconds: 90,
      sets: [{ weightKg: 60, reps: 8, done: false }, { weightKg: 62.5, reps: 6, done: false }] },
    { exerciseId: "e2", nameSnapshot: "Barra", loadType: "bodyweight", plannedSets: 1, repMin: 5, repMax: 10, restSeconds: 120,
      sets: [] },
  ],
};
const frozen = <T,>(v: T): T => { Object.freeze(v); Object.values(v as object).forEach((c) => typeof c === "object" && c && frozen(c)); return v; };

describe("edição do rascunho de treino", () => {
  it("updateDraftSet altera só a série pedida e não muta o original", () => {
    const original = frozen(structuredClone(base)); // congelado: qualquer mutação lançaria TypeError
    const next = updateDraftSet(original, 0, 1, { done: true, reps: 7 });
    expect(next.exercises[0].sets).toEqual([{ weightKg: 60, reps: 8, done: false }, { weightKg: 62.5, reps: 7, done: true }]);
    expect(next.exercises[1]).toBe(original.exercises[1]); // o que não mudou mantém a mesma referência
    expect(original.exercises[0].sets[1]).toEqual({ weightKg: 62.5, reps: 6, done: false }); // e o original segue intacto
    expect(next.id).toBe("d1"); // o id da sessão sobrevive a toda edição
  });

  it("addDraftSet copia a última série; sem séries usa a repetição máxima da ficha", () => {
    const withCopy = addDraftSet(base, 0);
    expect(withCopy.exercises[0].sets.at(-1)).toEqual({ weightKg: 62.5, reps: 6, done: false });
    const fromEmpty = addDraftSet(base, 1);
    expect(fromEmpty.exercises[1].sets).toEqual([{ weightKg: 0, reps: 10, done: false }]);
  });

  it("removeDraftSet tira só a série pedida", () => {
    expect(removeDraftSet(base, 0, 0).exercises[0].sets).toEqual([{ weightKg: 62.5, reps: 6, done: false }]);
  });

  it("setDraftNotes", () => {
    expect(setDraftNotes(base, "Pesado").notes).toBe("Pesado");
  });

  it("índice fora do intervalo não altera nada", () => {
    expect(updateDraftSet(base, 9, 0, { done: true })).toEqual(base);
    expect(removeDraftSet(base, 0, 9)).toEqual(base);
  });
});
