import { describe, expect, it } from "vitest";
import { libraryEntry } from "./exercise-library";
import { BODY_REGIONS, SESSION_MINUTES, TRAINING_DAYS, TRAINING_EXPERIENCES, TRAINING_GOALS, TRAINING_LOCATIONS } from "./training-profile";
import {
  CAUTION_BY_REGION,
  SLOT_TYPES,
  TIME_TOLERANCE,
  WARMUP_SECONDS,
  buildSkeleton,
  dayMinutes,
  defaultChoices,
  exclusionReason,
  exerciseSeconds,
  planErrors,
  repairChoices,
  formatFrequency,
  rulesSummary,
  splitFrequency,
  swapOptions,
  weeklySets,
  type PlanChoices,
} from "./training-rules";
import { effectiveOf } from "./training-focus";
import { SPLIT_OPTIONS, scheduleLabel, splitOption } from "./training-splits";
import type { BodyRegion, Exercise, PriorityGroup, TrainingProfile } from "./types";

const base: TrainingProfile = {
  goal: "massa",
  experience: "intermediario",
  daysPerWeek: 4,
  sessionMinutes: 60,
  location: "academia",
  limitations: [],
  screening: "liberado",
  healthConsentAt: 1,
  priorities: [],
  updatedAt: 1,
};
const profile = (over: Partial<TrainingProfile> = {}): TrainingProfile => ({ ...base, ...over });

const LIMITATION_SETS: BodyRegion[][] = [[], ...BODY_REGIONS.map((r) => [r]), [...BODY_REGIONS]];
const PRIORITY_SETS: PriorityGroup[][] = [[], ["costas", "pernas"]];

describe("buildSkeleton + defaultChoices: o modelo pronto é SEMPRE um plano válido", () => {
  it("para todas as combinações de objetivo, experiência, dias, tempo, local, limitações e prioridades", () => {
    let checked = 0;
    for (const goal of TRAINING_GOALS)
      for (const experience of TRAINING_EXPERIENCES)
        for (const daysPerWeek of TRAINING_DAYS)
          for (const sessionMinutes of SESSION_MINUTES)
            for (const location of TRAINING_LOCATIONS)
              for (const limitations of LIMITATION_SETS)
                for (const priorities of PRIORITY_SETS) {
                  const p = profile({ goal, experience, daysPerWeek, sessionMinutes, location, limitations, priorities });
                  const skeleton = buildSkeleton(p, []);
                  const label = JSON.stringify({ goal, experience, daysPerWeek, sessionMinutes, location, limitations, priorities });
                  expect(planErrors(skeleton, defaultChoices(skeleton)), label).toEqual([]);
                  for (const day of skeleton.days) {
                    expect(day.slots.length, label).toBeGreaterThanOrEqual(2);
                    for (const slot of day.slots) {
                      expect(slot.options.length, label).toBeGreaterThan(0);
                      for (const key of slot.options) expect(exclusionReason(key, p), `${label} ${key}`).toBeNull();
                    }
                  }
                  checked++;
                }
    expect(checked).toBe(4 * 3 * 5 * 4 * 2 * LIMITATION_SETS.length * PRIORITY_SETS.length);
  });

  it("é determinístico: as mesmas respostas dão o mesmo esqueleto e as mesmas escolhas", () => {
    expect(buildSkeleton(base, [])).toEqual(buildSkeleton(base, []));
    expect(defaultChoices(buildSkeleton(base, []))).toEqual(defaultChoices(buildSkeleton(base, [])));
  });
});

describe("divisão da semana", () => {
  it.each([
    [2, "corpo-inteiro", ["Corpo inteiro A", "Corpo inteiro B"], 1],
    [3, "corpo-inteiro", ["Corpo inteiro A", "Corpo inteiro B", "Corpo inteiro C"], 1],
    [4, "superior-inferior", ["Superior A", "Inferior A", "Superior B", "Inferior B"], 1],
    // 5 dias: 3 treinos que se revezam (não 5 treinos diferentes).
    [5, "empurrar-puxar-pernas", ["Empurrar", "Puxar", "Pernas"], 5 / 3],
    [6, "empurrar-puxar-pernas", ["Empurrar", "Puxar", "Pernas"], 2],
  ] as const)("%i dias: %s", (daysPerWeek, split, names, timesPerWeek) => {
    const skeleton = buildSkeleton(profile({ daysPerWeek }), []);
    expect(skeleton.split).toBe(split);
    expect(skeleton.days.map((d) => d.name)).toEqual(names);
    expect(skeleton.timesPerWeek).toBe(timesPerWeek);
  });

  it("iniciante com 3 dias: 2 treinos de corpo inteiro que se revezam", () => {
    const skeleton = buildSkeleton(profile({ daysPerWeek: 3, experience: "iniciante" }), []);
    expect(skeleton.days.map((d) => d.name)).toEqual(["Corpo inteiro A", "Corpo inteiro B"]);
    expect(skeleton).toMatchObject({ option: "corpo-inteiro-2", daysPerWeek: 3, timesPerWeek: 1.5 });
  });

  it("a divisão escolhida vale se couber nos dias; senão, o padrão", () => {
    expect(buildSkeleton(profile({ daysPerWeek: 5 }), [], "superior-inferior-ppl-5").days).toHaveLength(5);
    expect(buildSkeleton(profile({ daysPerWeek: 5 }), [], "superior-inferior-2")).toMatchObject({ option: "superior-inferior-2", timesPerWeek: 2.5 });
    expect(buildSkeleton(profile({ daysPerWeek: 3 }), [], "por-grupo-6").option).toBe("corpo-inteiro-3"); // 6 treinos não cabem em 3 dias
    expect(buildSkeleton(profile({ daysPerWeek: 3 }), [], "não-existe").option).toBe("corpo-inteiro-3");
  });

  it("toda divisão do catálogo, em todos os dias em que cabe, é um plano válido (mesmo em casa e com todas as limitações)", () => {
    let checked = 0;
    for (const option of SPLIT_OPTIONS)
      for (const daysPerWeek of TRAINING_DAYS.filter((d) => d >= option.days.length))
        for (const experience of TRAINING_EXPERIENCES)
          for (const sessionMinutes of SESSION_MINUTES)
            for (const location of TRAINING_LOCATIONS)
              for (const limitations of [[], [...BODY_REGIONS]] as BodyRegion[][]) {
                const p = profile({ daysPerWeek, experience, sessionMinutes, location, limitations });
                const skeleton = buildSkeleton(p, [], option.id);
                const label = JSON.stringify({ option: option.id, daysPerWeek, experience, sessionMinutes, location, limitations });
                expect(skeleton.option, label).toBe(option.id);
                expect(planErrors(skeleton, defaultChoices(skeleton)), label).toEqual([]);
                for (const day of skeleton.days) expect(day.slots.length, label).toBeGreaterThanOrEqual(2);
                checked++;
              }
    expect(checked).toBeGreaterThan(500);
  });

  it("um grupo por treino (cada músculo 1x por semana): as regras sobem séries para manter o volume da semana", () => {
    const p = profile({ daysPerWeek: 6, sessionMinutes: 75 });
    const split = buildSkeleton(p, [], "por-grupo-6");
    const sets = weeklySets(split, defaultChoices(split));
    for (const group of ["peito", "costas", "quadriceps"] as const) expect(sets[group], group).toBeGreaterThanOrEqual(10);
    expect(splitFrequency(splitOption("por-grupo-6")!, 6)).toBe(1);
    expect(splitFrequency(splitOption("empurrar-puxar-pernas-3")!, 5)).toBe(1.5); // rodízio: 3 treinos em 5 dias
    expect(splitFrequency(splitOption("empurrar-puxar-pernas-3")!, 6)).toBe(2);
    expect(splitFrequency(splitOption("corpo-inteiro-3")!, 3)).toBe(3);
  });

  it("texto da frequência e do rodízio, sem jargão", () => {
    expect(formatFrequency(1)).toBe("1 vez");
    expect(formatFrequency(1.5)).toBe("cerca de 1,5 vez");
    expect(formatFrequency(2)).toBe("2 vezes");
    expect(scheduleLabel(5, 3)).toBe("3 treinos que se revezam nos seus 5 dias (A, B, C, A, B…)");
    expect(scheduleLabel(4, 4)).toBe("4 treinos, um para cada dia (A, B, C, D)");
    expect(scheduleLabel(6, 3)).toBe("3 treinos, cada um 2 vezes na semana (A, B, C)");
    const p = profile({ daysPerWeek: 5 });
    expect(rulesSummary(p, buildSkeleton(p, []))).toContain("os 3 treinos se revezam");
  });

  it("6 dias conta cada ficha 2 vezes no volume semanal", () => {
    const six = buildSkeleton(profile({ daysPerWeek: 6 }), []);
    const choices = defaultChoices(six);
    const once = six.days.flatMap((d) => d.slots).filter((s) => SLOT_TYPES[s.type].group === "peito").reduce((n, s) => n + choices[s.id].sets, 0);
    expect(weeklySets(six, choices).peito).toBe(once * 2);
  });
});

describe("o que entra nas opções", () => {
  it("casa com halteres: só halteres, kettlebell e peso do corpo, sem barra fixa nem paralelas", () => {
    const skeleton = buildSkeleton(profile({ location: "casa-halteres" }), []);
    const keys = skeleton.days.flatMap((d) => d.slots.flatMap((s) => s.options));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(["halteres", "kettlebell", "peso-corporal"]).toContain(libraryEntry(key)!.equipment);
    expect(keys).not.toContain("barra-fixa");
    expect(keys).not.toContain("mergulho-paralelas");
  });

  it("limitação marcada: nenhum exercício da lista de cautela daquela região aparece", () => {
    for (const region of BODY_REGIONS) {
      const keys = buildSkeleton(profile({ limitations: [region] }), []).days.flatMap((d) => d.slots.flatMap((s) => s.options));
      for (const key of keys) expect(CAUTION_BY_REGION[region].has(key), `${region}: ${key}`).toBe(false);
    }
  });

  it("vaga sem opção vira a vaga equivalente (ombro dolorido: sem desenvolvimento, entra elevação lateral)", () => {
    const skeleton = buildSkeleton(profile({ limitations: ["ombro"] }), []);
    const types = skeleton.days.flatMap((d) => d.slots.map((s) => s.type));
    expect(types).not.toContain("ombro-composto");
    expect(types).toContain("ombro-lateral");
  });

  it("quem está começando não recebe exercícios de técnica avançada", () => {
    const keys = buildSkeleton(profile({ experience: "iniciante" }), []).days.flatMap((d) => d.slots.flatMap((s) => s.options));
    for (const key of ["levantamento-terra", "agachamento-frontal", "desenvolvimento-barra", "barra-fixa"]) expect(keys).not.toContain(key);
    expect(exclusionReason("levantamento-terra", profile({ experience: "avancado" }))).toBeNull();
  });

  it("o que a pessoa já faz vem primeiro (vínculo ou nome igual ao da biblioteca)", () => {
    const mine: Exercise[] = [
      { id: "e1", name: "Leg 45", muscleGroup: "Pernas", loadType: "external", libraryKey: "leg-press" },
      { id: "e2", name: "Remada sentada", muscleGroup: "Costas", loadType: "external" },
      { id: "e3", name: "Supino reto com halteres", muscleGroup: "Peito", loadType: "external", archived: true },
    ];
    const skeleton = buildSkeleton(profile(), mine);
    const first = (type: string) => skeleton.days.flatMap((d) => d.slots).find((s) => s.type === type)!.options[0];
    expect(first("quadriceps-composto")).toBe("leg-press");
    expect(first("costas-horizontal")).toBe("remada-baixa"); // "remada sentada" é apelido da remada baixa
    expect(first("peito-composto")).toBe("supino-reto-barra"); // arquivado não conta
  });
});

describe("tempo e volume", () => {
  it("cada treino cabe no tempo, e mais tempo dá mais exercícios", () => {
    for (const sessionMinutes of SESSION_MINUTES) {
      const skeleton = buildSkeleton(profile({ sessionMinutes }), []);
      const choices = defaultChoices(skeleton);
      for (const day of skeleton.days) expect(dayMinutes(day, choices)).toBeLessThanOrEqual(sessionMinutes * TIME_TOLERANCE);
    }
    const count = (sessionMinutes: TrainingProfile["sessionMinutes"]) => buildSkeleton(profile({ sessionMinutes }), []).days[0].slots.length;
    expect(count(30)).toBeLessThan(count(60));
    expect(count(60)).toBeLessThanOrEqual(count(75));
  });

  it("a estimativa conta montagem, séries e os descansos ENTRE as séries", () => {
    expect(exerciseSeconds(3, 90)).toBe(60 + 3 * 45 + 2 * 90);
    expect(WARMUP_SECONDS).toBe(300);
  });

  it("grupo em foco sobe até o alvo do objetivo (massa, intermediário: 18 séries efetivas, no máximo 1 a mais), e só se faltar", () => {
    const plain = buildSkeleton(profile(), []);
    const focused = buildSkeleton(profile({ priorities: ["costas"] }), []);
    const costas = (s: typeof plain) => effectiveOf(s.days, (t) => SLOT_TYPES[t].group, s.timesPerWeek).costas;
    expect(costas(plain)).toBe(15);
    expect(costas(focused)).toBeGreaterThanOrEqual(18);
    expect(costas(focused)).toBeLessThanOrEqual(19); // o passo seguinte pode passar 1 série do alvo, nunca mais
    // Quem já está no alvo ou acima não ganha série à toa.
    const high = buildSkeleton(profile({ priorities: ["costas"], sessionMinutes: 75 }), []);
    expect(costas(high)).toBeGreaterThanOrEqual(18);
    expect(costas(high)).toBeLessThanOrEqual(19);
  });

  it("força: os principais em poucas repetições e descanso longo; quem está começando, sem séries de 3", () => {
    const strength = buildSkeleton(profile({ goal: "forca" }), []).days[0].slots[0];
    expect(strength.role).toBe("principal");
    expect(strength.reps).toEqual([3, 6]);
    expect(strength.restSeconds).toBe(180);
    const beginner = buildSkeleton(profile({ goal: "forca", experience: "iniciante" }), []).days[0].slots[0];
    expect(beginner.reps).toEqual([5, 8]);
  });
});

describe("escolhas e validação", () => {
  const skeleton = buildSkeleton(profile({ daysPerWeek: 3 }), []);
  const choices = defaultChoices(skeleton);

  it("o modelo pronto varia o exercício quando a mesma vaga aparece em outro treino da semana", () => {
    const squat = skeleton.days.map((d) => d.slots.find((s) => s.type === "quadriceps-composto")).filter(Boolean);
    expect(squat.length).toBeGreaterThanOrEqual(2);
    expect(choices[squat[0]!.id].exerciseKey).not.toBe(choices[squat[1]!.id].exerciseKey);
  });

  it("recusa exercício fora das opções, repetido no treino, séries e faixas fora do permitido e treino longo demais", () => {
    const day = skeleton.days[0];
    const [a, b] = day.slots;
    const broken: PlanChoices = {
      ...choices,
      [a.id]: { ...choices[a.id], exerciseKey: "rosca-direta" },
      [b.id]: { ...choices[b.id], sets: 9, reps: [1, 2] },
    };
    const errors = planErrors(skeleton, broken);
    expect(errors.some((e) => e.includes("não é uma das opções"))).toBe(true);
    expect(errors.some((e) => e.includes("séries fora do permitido"))).toBe(true);
    expect(errors.some((e) => e.includes("faixa 1–2"))).toBe(true);

    const duplicated = { ...choices, [b.id]: { ...choices[b.id], exerciseKey: choices[a.id].exerciseKey } };
    expect(planErrors(skeleton, duplicated).some((e) => e.includes("repetido"))).toBe(true);

    const missing = { ...choices };
    delete missing[a.id];
    expect(planErrors(skeleton, missing).some((e) => e.includes("vaga sem exercício"))).toBe(true);

    const long = Object.fromEntries(
      Object.entries(choices).map(([id, c]) => {
        const slot = skeleton.days.flatMap((d) => d.slots).find((s) => s.id === id)!;
        return [id, { ...c, sets: slot.setOptions[slot.setOptions.length - 1] }];
      }),
    );
    const tight = { ...skeleton, budgetSeconds: 600 };
    expect(planErrors(tight, long).some((e) => e.includes("passa do tempo"))).toBe(true);
  });

  it("consertar: exercício repetido vira a primeira opção livre; treino longo perde séries extras até caber", () => {
    const day = skeleton.days[0];
    const [a, b] = day.slots;
    const repeated = { ...choices, [b.id]: { ...choices[b.id], exerciseKey: choices[a.id].exerciseKey, reason: "x" } };
    const fixed = repairChoices(skeleton, repeated);
    expect(fixed.repaired).toBe(1);
    expect(planErrors(skeleton, fixed.choices)).toEqual([]);
    expect(fixed.choices[b.id]).not.toHaveProperty("reason");

    const maxed = Object.fromEntries(
      Object.entries(choices).map(([id, c]) => {
        const slot = skeleton.days.flatMap((d) => d.slots).find((s) => s.id === id)!;
        return [id, { ...c, sets: slot.setOptions[slot.setOptions.length - 1] }];
      }),
    );
    const tight = { ...skeleton, budgetSeconds: Math.round(skeleton.budgetSeconds * 0.8) };
    const shortened = repairChoices(tight, maxed);
    expect(planErrors(tight, shortened.choices)).toEqual([]);
    expect(shortened.repaired).toBeGreaterThan(0);

    expect(repairChoices(skeleton, choices)).toEqual({ choices, repaired: 0 });
  });

  it("trocar: as opções da vaga menos a atual e as que já estão em outra vaga do mesmo treino", () => {
    const day = skeleton.days[0];
    const slot = day.slots[0];
    const options = swapOptions(skeleton, choices, slot.id);
    expect(options).not.toContain(choices[slot.id].exerciseKey);
    const taken = new Set(day.slots.slice(1).map((s) => choices[s.id].exerciseKey));
    for (const key of options) expect(taken.has(key)).toBe(false);
    expect(swapOptions(skeleton, choices, "não-existe")).toEqual([]);
  });

  it("o texto do modelo pronto (o recado do assistente, em primeira pessoa) explica a divisão e cita as limitações", () => {
    const p = profile({ limitations: ["lombar", "joelho"] });
    const text = rulesSummary(p, buildSkeleton(p, []));
    expect(text).toMatch(/^Alternei superior e inferior/);
    expect(text).toContain("Deixei de fora exercícios que");
    expect(text).toContain("forçar a lombar e o joelho");
  });
});
