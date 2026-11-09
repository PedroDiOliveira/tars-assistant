import { describe, expect, it } from "vitest";
import { loadStepKg, suggestLoad, suggestionApplied } from "./progression";
import type { SetLog } from "./types";
import type { ExerciseEntry } from "./workouts";

const sets = (...pairs: [number, number][]): SetLog[] => pairs.map(([weightKg, reps]) => ({ weightKg, reps, done: true }));
const entry = (done: SetLog[]): ExerciseEntry => ({
  sessionId: "s1",
  date: "2026-10-20",
  sets: done,
  topWeightKg: Math.max(...done.map((s) => s.weightKg)),
  topReps: done[0].reps,
  volume: 0,
});
const base = { plannedSets: 3, repMax: 12, loadType: "external" as const };

describe("progressão dupla: quando sugerir subir a carga", () => {
  it("todas as séries planejadas no topo da faixa, com a mesma carga → sobe um passo", () => {
    expect(suggestLoad({ ...base, last: entry(sets([60, 12], [60, 12], [60, 12])), equipment: "barra" })).toEqual({
      fromKg: 60,
      toKg: 62,
      reps: 12,
    });
  });

  it("passar do topo também conta (as repetições mostradas são as da pior série)", () => {
    expect(suggestLoad({ ...base, last: entry(sets([40, 14], [40, 13], [40, 12])), equipment: "halteres" })?.reps).toBe(12);
  });

  it("não sugere: alguma série abaixo do topo, séries faltando, pirâmide ou sem histórico", () => {
    expect(suggestLoad({ ...base, last: entry(sets([60, 12], [60, 11], [60, 12])) })).toBeNull();
    expect(suggestLoad({ ...base, last: entry(sets([60, 12], [60, 12])) })).toBeNull();
    expect(suggestLoad({ ...base, last: entry(sets([60, 12], [62, 12], [64, 12])) })).toBeNull();
    expect(suggestLoad({ ...base, last: null })).toBeNull();
  });

  it("o alvo é a ficha de HOJE: se o topo da faixa subiu, ainda não é hora", () => {
    const last = entry(sets([60, 12], [60, 12], [60, 12]));
    expect(suggestLoad({ ...base, repMax: 15, last })).toBeNull();
  });

  it("peso corporal: só com carga extra registrada (passo de 2 kg)", () => {
    expect(suggestLoad({ ...base, loadType: "bodyweight", last: entry(sets([0, 12], [0, 12], [0, 12])) })).toBeNull();
    expect(suggestLoad({ ...base, loadType: "bodyweight", last: entry(sets([5, 12], [5, 12], [5, 12])) })?.toKg).toBe(7);
  });
});

describe("passo de carga", () => {
  it("pelo equipamento da biblioteca", () => {
    expect(loadStepKg(100, "maquina")).toBe(5);
    expect(loadStepKg(100, "polia")).toBe(5);
    expect(loadStepKg(20, "halteres")).toBe(2);
    expect(loadStepKg(16, "kettlebell")).toBe(4);
  });

  it("sem vínculo: ~2,5% da carga, nunca menos de 1 kg", () => {
    expect(loadStepKg(10)).toBe(1);
    expect(loadStepKg(60)).toBe(2);
    expect(loadStepKg(200)).toBe(5);
  });

  it("a carga sugerida fica em múltiplos de 0,5 kg", () => {
    const last = entry(sets([37.5, 12], [37.5, 12], [37.5, 12]));
    expect(suggestLoad({ ...base, last })?.toKg).toBe(38.5);
  });
});

describe("sugestão aplicada", () => {
  const suggestion = { fromKg: 60, toKg: 62, reps: 12 };
  it("vale quando as séries ainda por fazer estão na carga sugerida (ou acima)", () => {
    const draft: SetLog[] = [
      { weightKg: 60, reps: 12, done: true },
      { weightKg: 62, reps: 12, done: false },
      { weightKg: 62, reps: 12, done: false },
    ];
    expect(suggestionApplied(draft, suggestion)).toBe(true);
    expect(suggestionApplied([{ weightKg: 60, reps: 12, done: false }], suggestion)).toBe(false);
  });

  it("com tudo concluído, olha as séries feitas", () => {
    expect(suggestionApplied([{ weightKg: 62, reps: 10, done: true }], suggestion)).toBe(true);
  });
});
