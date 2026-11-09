import { describe, expect, it } from "vitest";
import { parseCommand } from "./command-schema";
import { applyCommand } from "./reducers";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import { normalizeProfile, profileError } from "./training-profile";
import {
  buildApplyPlan,
  currentTrainingPlan,
  existingExercise,
  moveSlot,
  nextPlanInRotation,
  parsePlanProposal,
  rulesProposal,
  setPrescription,
  swapCount,
  swapExercise,
} from "./training-proposal";
import { dayOverBudget, lateMainSlots, planErrors, swapOptions } from "./training-rules";
import type { Exercise, TrainingPlanRecord, TrainingProfile } from "./types";

const NOW = Date.UTC(2026, 9, 28, 15, 0);
const PROFILE: TrainingProfile = {
  goal: "massa",
  experience: "intermediario",
  daysPerWeek: 4,
  sessionMinutes: 60,
  location: "academia",
  limitations: [],
  screening: "liberado",
  healthConsentAt: NOW - 1000,
  priorities: [],
  updatedAt: NOW,
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MINE: Exercise[] = [
  { id: uuid(1), name: "Supino reto", muscleGroup: "Peito", loadType: "external", libraryKey: "supino-reto-barra" },
  { id: uuid(2), name: "Leg press", muscleGroup: "Pernas", loadType: "external" },
  { id: uuid(3), name: "Puxada frontal", muscleGroup: "Costas", loadType: "external", archived: true, libraryKey: "puxada-frontal" },
];

function ids() {
  let n = 100;
  return () => uuid(n++);
}

describe("proposta do modelo pronto", () => {
  it("rodízio (3 treinos em 5 dias) e a divisão escolhida voltam iguais do armazenamento do aparelho", () => {
    const proposal = rulesProposal({ ...PROFILE, daysPerWeek: 5 }, MINE, uuid(9), NOW, undefined, "superior-inferior-2");
    expect(proposal.skeleton).toMatchObject({ option: "superior-inferior-2", daysPerWeek: 5, timesPerWeek: 2.5 });
    expect(parsePlanProposal(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
    const command = buildApplyPlan({ proposal, profile: { ...PROFILE, daysPerWeek: 5 }, exercises: MINE, plans: [], archivePlanIds: [], nowMs: NOW, newId: ids() });
    expect(parseCommand(command)).toMatchObject({ ok: true });
    expect(command.plans).toHaveLength(2);
  });

  it("é válida, volta igual depois de ir e voltar por JSON (é o que fica no aparelho) e guarda de onde veio", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW, "ai_unavailable");
    expect(proposal).toMatchObject({ source: "rules", fallback: "ai_unavailable", profileUpdatedAt: NOW, promptVersion: "regras-v3" });
    expect(parsePlanProposal(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
  });

  it("proposta adulterada, truncada ou de outra versão das regras é descartada", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const slotId = proposal.skeleton.days[0].slots[0].id;
    expect(parsePlanProposal({ ...proposal, choices: { ...proposal.choices, [slotId]: { ...proposal.choices[slotId], exerciseKey: "rosca-direta" } } })).toBeNull();
    expect(parsePlanProposal({ ...proposal, skeleton: { ...proposal.skeleton, split: "outra" } })).toBeNull();
    expect(parsePlanProposal({ ...proposal, id: "não é uuid" })).toBeNull();
    expect(parsePlanProposal(null)).toBeNull();
    expect(parsePlanProposal("texto")).toBeNull();
  });
});

describe("trocar exercício", () => {
  it("aceita só as opções permitidas e conta as trocas", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const slotId = proposal.skeleton.days[0].slots[0].id;
    const [option] = swapOptions(proposal.skeleton, proposal.choices, slotId);
    const swapped = swapExercise(proposal, slotId, option)!;
    expect(swapped.choices[slotId]).toMatchObject({ exerciseKey: option, swapped: true });
    expect(swapped.choices[slotId]).not.toHaveProperty("reason");
    expect(swapCount(swapped)).toBe(1);
    expect(swapExercise(proposal, slotId, "rosca-direta")).toBeNull();
    expect(swapExercise(proposal, slotId, proposal.choices[slotId].exerciseKey)).toBeNull(); // a atual não é troca
  });
});

describe("editar a ordem e a prescrição na revisão", () => {
  it("mover muda só a ordem daquele treino, conta como edição e chega igual à ficha e ao registro", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const day = proposal.skeleton.days[0];
    const first = day.slots[0].id;
    const moved = moveSlot(proposal, day.id, 0, 2)!;
    expect(moved.skeleton.days[0].slots.map((s) => s.id)).toEqual([day.slots[1].id, day.slots[2].id, first, ...day.slots.slice(3).map((s) => s.id)]);
    expect(moved.skeleton.days[1]).toBe(proposal.skeleton.days[1]); // os outros treinos ficam intactos
    expect(moved.edits).toBe(1);
    expect(parsePlanProposal(JSON.parse(JSON.stringify(moved)))).toEqual(moved);

    const command = buildApplyPlan({ proposal: moved, profile: PROFILE, exercises: MINE, plans: [], archivePlanIds: [], nowMs: NOW, newId: ids() });
    expect(parseCommand(command)).toMatchObject({ ok: true });
    expect(command.record.edits).toBe(1);
    const keys = moved.skeleton.days[0].slots.map((s) => moved.choices[s.id].exerciseKey);
    expect(command.record.days[0].exercises.map((e) => e.libraryKey)).toEqual(keys);
    expect(command.record.days[0].exercises.map((e) => e.exerciseId)).toEqual(command.plans[0].exercises.map((e) => e.exerciseId));
    expect(applyCommand({ ...EMPTY_APP_DATA, exercises: MINE, trainingProfile: PROFILE }, command).ok).toBe(true);
  });

  it("mover para o mesmo lugar, para fora da lista ou num treino que não existe não muda nada", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const day = proposal.skeleton.days[0];
    expect(moveSlot(proposal, day.id, 1, 1)).toBeNull();
    expect(moveSlot(proposal, day.id, 0, day.slots.length)).toBeNull();
    expect(moveSlot(proposal, day.id, -1, 0)).toBeNull();
    expect(moveSlot(proposal, "d99", 0, 1)).toBeNull();
  });

  it("séries e repetições só entre as opções da vaga; mais séries podem passar do tempo (a tela avisa)", () => {
    const proposal = rulesProposal({ ...PROFILE, sessionMinutes: 30 }, MINE, uuid(9), NOW);
    const day = proposal.skeleton.days[0];
    const slot = day.slots[0];
    const top = Math.max(...slot.setOptions);
    expect(setPrescription(proposal, slot.id, { sets: 99 })).toBeNull();
    expect(setPrescription(proposal, slot.id, { reps: [1, 2] })).toBeNull();
    expect(setPrescription(proposal, slot.id, { sets: proposal.choices[slot.id].sets })).toBeNull(); // sem mudança
    expect(setPrescription(proposal, "nada", { sets: top })).toBeNull();

    let heavy = proposal;
    for (const s of day.slots) heavy = setPrescription(heavy, s.id, { sets: Math.max(...s.setOptions) }) ?? heavy;
    expect(dayOverBudget(heavy.skeleton, heavy.skeleton.days[0], heavy.choices)).toBe(true);
    expect(planErrors(heavy.skeleton, heavy.choices)).not.toEqual([]); // a IA não poderia
    expect(parsePlanProposal(JSON.parse(JSON.stringify(heavy)))).toEqual(heavy); // a escolha da pessoa sobrevive a recarregar
    expect(dayOverBudget(proposal.skeleton, proposal.skeleton.days[0], proposal.choices)).toBe(false);
  });

  it("avisa quando um exercício principal ficou depois dos isolados", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const day = proposal.skeleton.days[0];
    expect(lateMainSlots(day)).toEqual([]);
    const mainIndex = day.slots.findIndex((s) => s.tier === 1);
    const moved = moveSlot(proposal, day.id, mainIndex, day.slots.length - 1)!;
    expect(lateMainSlots(moved.skeleton.days[0])).toEqual([day.slots[mainIndex].id]);
  });
});

describe("aceitar o plano", () => {
  const data = (): AppData => ({ ...EMPTY_APP_DATA, exercises: MINE, trainingProfile: PROFILE });

  it("reaproveita o exercício vinculado e o de nome igual; o arquivado não conta", () => {
    expect(existingExercise(MINE, "supino-reto-barra")?.id).toBe(uuid(1));
    expect(existingExercise(MINE, "leg-press")?.id).toBe(uuid(2));
    expect(existingExercise(MINE, "puxada-frontal")).toBeUndefined();
  });

  it("monta um comando válido no schema: exercícios que faltam com os dados da biblioteca e fichas que batem com o registro", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const command = buildApplyPlan({ proposal, profile: PROFILE, exercises: MINE, plans: [], archivePlanIds: [], nowMs: NOW, newId: ids() });
    expect(parseCommand(command)).toMatchObject({ ok: true });
    expect(command.record).toMatchObject({ id: uuid(9), acceptedAt: NOW, source: "rules", split: "superior-inferior", edits: 0 });
    expect(command.record.days.map((d) => d.planId)).toEqual(command.plans.map((p) => p.id));
    const used = new Set(command.plans.flatMap((p) => p.exercises.map((e) => e.exerciseId)));
    expect(used.has(uuid(1))).toBe(true); // o supino vinculado
    expect(command.exercises.some((e) => e.libraryKey === "supino-reto-barra")).toBe(false);
    for (const created of command.exercises) {
      expect(created.libraryKey).toBeDefined();
      expect(created.name.length).toBeGreaterThan(0);
    }
    // Uma chave usada em dois treinos vira UM exercício só.
    expect(new Set(command.exercises.map((e) => e.libraryKey)).size).toBe(command.exercises.length);
    expect(command.plans[0].notes).toBe("Do plano de treino de 28/10.");
  });

  it("no reducer: aplica tudo, é idempotente e recusa o registro que não bate com as fichas", () => {
    const proposal = rulesProposal(PROFILE, MINE, uuid(9), NOW);
    const oldPlan = { id: uuid(50), name: "Antiga", exercises: [{ exerciseId: uuid(1), plannedSets: 3, repMin: 8, repMax: 12, restSeconds: 90 }] };
    const start = { ...data(), plans: [oldPlan] };
    const command = buildApplyPlan({ proposal, profile: PROFILE, exercises: MINE, plans: start.plans, archivePlanIds: [uuid(50), uuid(51)], nowMs: NOW, newId: ids() });
    expect(command.archivePlanIds).toEqual([uuid(50)]); // ficha que não existe mais fica de fora

    const applied = applyCommand(start, command);
    if (!applied.ok) throw new Error(applied.error);
    expect(applied.data.plans.find((p) => p.id === uuid(50))?.archived).toBe(true);
    expect(applied.data.plans).toHaveLength(5);
    expect(applied.data.trainingPlans).toEqual([command.record]);

    const again = applyCommand(applied.data, command);
    expect(again).toMatchObject({ ok: true, outcome: "saved" });
    expect(again.ok && again.data).toBe(applied.data); // nada muda: mesma referência

    const reversed = { ...command, record: { ...command.record, days: [...command.record.days].reverse() } };
    expect(applyCommand(start, reversed)).toEqual({ ok: false, error: "Plano inconsistente com as fichas." });
  });

  it("rodízio: a próxima ficha é a seguinte à última treinada do plano, voltando ao começo", () => {
    const record = { acceptedAt: 100, days: [{ planId: "a" }, { planId: "b" }, { planId: "c" }] } as TrainingPlanRecord;
    const active = new Set(["a", "b", "c"]);
    expect(nextPlanInRotation(record, [], active)).toBe("a");
    expect(nextPlanInRotation(record, [{ planId: "a", finishedAt: 200 }], active)).toBe("b");
    expect(nextPlanInRotation(record, [{ planId: "c", finishedAt: 300 }, { planId: "b", finishedAt: 200 }], active)).toBe("a");
    expect(nextPlanInRotation(record, [{ planId: "a", finishedAt: 50 }], active)).toBe("a"); // treino de antes do plano
    expect(nextPlanInRotation(record, [{ planId: "x", finishedAt: 300 }], active)).toBe("a"); // outra ficha
    expect(nextPlanInRotation(record, [{ planId: "a", finishedAt: 200 }], new Set(["a", "c"]))).toBe("c"); // B arquivada
    expect(nextPlanInRotation(null, [], active)).toBeNull();
    expect(nextPlanInRotation(record, [], new Set(["a"]))).toBeNull();
  });

  it("o plano atual é o aceito mais recente", () => {
    const a = { id: "a", acceptedAt: 1 } as TrainingPlanRecord;
    const b = { id: "b", acceptedAt: 2 } as TrainingPlanRecord;
    expect(currentTrainingPlan([b, a])?.id).toBe("b");
    expect(currentTrainingPlan([])).toBeNull();
  });
});

describe("respostas do formulário", () => {
  it("normaliza listas, texto e, sem a parte de saúde, não guarda limitações nem consentimento", () => {
    expect(normalizeProfile({ ...PROFILE, limitations: ["joelho", "ombro", "joelho"], priorities: ["pernas", "peito", "costas"], notes: "  a   b " })).toEqual({
      ...PROFILE,
      limitations: ["ombro", "joelho"],
      priorities: ["peito", "costas"],
      notes: "a b",
    });
    const skipped = normalizeProfile({ ...PROFILE, screening: "nao-respondida", limitations: ["ombro"], notes: "   " });
    expect(skipped).toEqual({ ...PROFILE, screening: "nao-respondida", limitations: [], healthConsentAt: undefined });
    expect(skipped).not.toHaveProperty("healthConsentAt");
    expect(skipped).not.toHaveProperty("notes");
  });

  it("respondeu a parte de saúde sem consentimento: recusado (no reducer e no schema do comando)", () => {
    const { healthConsentAt: _c, ...noConsent } = PROFILE;
    void _c;
    expect(profileError(noConsent)).toBe("Confirme o consentimento antes das perguntas de saúde.");
    expect(applyCommand(EMPTY_APP_DATA, { type: "training.saveProfile", profile: noConsent })).toEqual({
      ok: false,
      error: "Confirme o consentimento antes das perguntas de saúde.",
    });
    expect(parseCommand({ type: "training.saveProfile", profile: noConsent })).toEqual({ ok: false, error: "Confirme o consentimento antes das perguntas de saúde." });
  });

  it("o schema do comando entrega as respostas já normalizadas ao banco e recusa valores fora do permitido", () => {
    const parsed = parseCommand({ type: "training.saveProfile", profile: { ...PROFILE, priorities: ["pernas", "peito"], notes: " x " } });
    expect(parsed.ok && parsed.command).toMatchObject({ profile: { priorities: ["peito", "pernas"], notes: "x" } });
    expect(parseCommand({ type: "training.saveProfile", profile: { ...PROFILE, daysPerWeek: 7 } }).ok).toBe(false);
    expect(parseCommand({ type: "training.saveProfile", profile: { ...PROFILE, goal: "voar" } }).ok).toBe(false);
    expect(parseCommand({ type: "training.saveProfile", profile: { ...PROFILE, notes: "x".repeat(281) } }).ok).toBe(false);
    expect(parseCommand({ type: "training.saveProfile", profile: { ...PROFILE, userId: "outro" } }).ok).toBe(false);
  });
});
