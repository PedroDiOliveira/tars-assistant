import { describe, expect, it } from "vitest";
import { parseCommand } from "./command-schema";
import { applyCommand } from "./reducers";
import { EMPTY_APP_DATA, type AppData } from "./snapshot";
import { ADJUST_RULES_VERSION, focusAdjustment, ruleSuggestions, type SuggestedChange } from "./training-adjust";
import { buildAdjustPlan, currentPlanView, planChanges, stalledSuggestion } from "./training-current";
import { buildApplyPlan, parsePlanProposal, rulesProposal } from "./training-proposal";
import { swapOptions } from "./training-rules";
import type { Exercise, TrainingPlanChange, TrainingProfile, WorkoutSession } from "./types";

const NOW = Date.UTC(2026, 10, 8, 15, 0);
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
let n = 1;
const newId = () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`;
const VIEW_ID = "00000000-0000-4000-8000-999999999999";
const nameOf = (key: string) => key;

/** Uma conta com o plano do modelo pronto aceito. */
function accepted(): AppData {
  const start: AppData = { ...EMPTY_APP_DATA, trainingProfile: PROFILE };
  const proposal = rulesProposal(PROFILE, [], newId(), NOW);
  const command = buildApplyPlan({ proposal, profile: PROFILE, exercises: [], plans: [], archivePlanIds: [], nowMs: NOW, newId });
  const applied = applyCommand(start, command);
  if (!applied.ok) throw new Error(applied.error);
  return applied.data;
}

function adjust(data: AppData, changes: SuggestedChange[], trigger: TrainingPlanChange["trigger"] = "mais-curto") {
  const view = currentPlanView(data.trainingPlans[0], data, VIEW_ID)!;
  return buildAdjustPlan({ view, changes, trigger, source: "rules", promptVersion: ADJUST_RULES_VERSION, exercises: data.exercises, nameOf, nowMs: NOW + 60_000, newId });
}

describe("o plano em uso como rascunho", () => {
  it("todas as fichas do plano encaixam nas vagas, e o rascunho virtual é válido (vai à IA como está)", () => {
    const data = accepted();
    const view = currentPlanView(data.trainingPlans[0], data, VIEW_ID)!;
    expect(view.proposal.skeleton.days.map((d) => d.name)).toEqual(["Superior A", "Inferior A", "Superior B", "Inferior B"]);
    const mapped = Object.keys(view.slots).length;
    expect(mapped).toBe(data.plans.reduce((t, p) => t + p.exercises.length, 0));
    expect(Object.values(view.fixed).flat()).toEqual([]);
    expect(parsePlanProposal(JSON.parse(JSON.stringify(view.proposal)))).not.toBeNull();
  });

  it("o que a pessoa mudou à mão na ficha vale (séries fora do padrão e exercício fora da biblioteca, que fica fixo)", () => {
    const data = accepted();
    const custom: Exercise = { id: newId(), name: "Meu exercício esquisito", muscleGroup: "Outro", loadType: "external" };
    const plan = data.plans[0];
    const edited = {
      ...plan,
      exercises: [{ ...plan.exercises[0], plannedSets: 6 }, { exerciseId: custom.id, plannedSets: 3, repMin: 10, repMax: 12, restSeconds: 60 }, ...plan.exercises.slice(1)],
    };
    const withEdits = { ...data, exercises: [...data.exercises, custom], plans: data.plans.map((p) => (p.id === plan.id ? edited : p)) };
    const view = currentPlanView(withEdits.trainingPlans[0], withEdits, VIEW_ID)!;
    const first = view.proposal.skeleton.days[0].slots[0];
    expect(view.proposal.choices[first.id].sets).toBe(6);
    expect(view.fixed[plan.id]).toEqual([{ index: 1, item: edited.exercises[1] }]);
    expect(parsePlanProposal(JSON.parse(JSON.stringify(view.proposal)))).not.toBeNull();

    // Um ajuste nessa ficha devolve o exercício fixo para a mesma posição.
    const command = adjust(withEdits, ruleSuggestions(view.proposal, "mais-curto").slice(0, 1))!;
    const saved = command.plans.find((p) => p.id === plan.id)!;
    expect(saved.exercises[1]).toEqual(edited.exercises[1]);
    expect(saved.exercises).toHaveLength(edited.exercises.length);
  });

  it("sem as fichas do plano (arquivadas), não há o que ajustar", () => {
    const data = accepted();
    const archived = { ...data, plans: data.plans.map((p) => ({ ...p, archived: true as const })) };
    expect(currentPlanView(archived.trainingPlans[0], archived, VIEW_ID)).toBeNull();
  });
});

describe("gravar um ajuste", () => {
  it("chip 'mais curto': comando válido, só as fichas tocadas, histórico como a prévia; repetir não duplica", () => {
    const data = accepted();
    const view = currentPlanView(data.trainingPlans[0], data, VIEW_ID)!;
    const changes = ruleSuggestions(view.proposal, "mais-curto");
    const command = adjust(data, changes)!;
    expect(parseCommand(command)).toMatchObject({ ok: true });
    expect(command.plans.length).toBe(new Set(command.change.items.map((i) => i.planId)).size);
    expect(command.change).toMatchObject({ planRecordId: data.trainingPlans[0].id, source: "rules", trigger: "mais-curto", promptVersion: ADJUST_RULES_VERSION });
    expect(command.change.items[0]).toMatchObject({ before: expect.stringContaining("séries"), after: expect.stringContaining("séries"), principle: "volume" });

    const applied = applyCommand(data, command);
    if (!applied.ok) throw new Error(applied.error);
    expect(applied.data.trainingPlanChanges).toEqual([command.change]);
    const before = data.plans.reduce((t, p) => t + p.exercises.reduce((s, e) => s + e.plannedSets, 0), 0);
    const after = applied.data.plans.reduce((t, p) => t + p.exercises.reduce((s, e) => s + e.plannedSets, 0), 0);
    expect(after).toBe(before - changes.length);
    expect(applyCommand(applied.data, command)).toMatchObject({ ok: true, data: applied.data });
  });

  it("trocar por um exercício que a pessoa ainda não tem cria o exercício da biblioteca junto", () => {
    const data = accepted();
    const view = currentPlanView(data.trainingPlans[0], data, VIEW_ID)!;
    const slot = view.proposal.skeleton.days[0].slots[0];
    const option = swapOptions(view.proposal.skeleton, view.proposal.choices, slot.id).find((k) => !data.exercises.some((e) => e.libraryKey === k))!;
    const command = adjust(data, [{ change: { kind: "swap", slotId: slot.id, exerciseKey: option }, reason: "Preferência.", principle: "variacao" }], "troca")!;
    expect(command.exercises.map((e) => e.libraryKey)).toEqual([option]);
    const applied = applyCommand(data, command);
    if (!applied.ok) throw new Error(applied.error);
    const plan = applied.data.plans.find((p) => p.id === view.slots[slot.id].planId)!;
    expect(plan.exercises[0].exerciseId).toBe(command.exercises[0].id);
  });

  it("o banco e o reducer recusam ficha de fora do plano e plano que não existe (mesmas mensagens)", () => {
    const data = accepted();
    const command = adjust(data, ruleSuggestions(currentPlanView(data.trainingPlans[0], data, VIEW_ID)!.proposal, "mais-curto"))!;
    expect(applyCommand(data, { ...command, change: { ...command.change, planRecordId: newId() } })).toEqual({ ok: false, error: "Plano de treino não encontrado." });
    const foreign = { ...command, plans: [...command.plans, { id: newId(), name: "Outra", exercises: [] }] };
    expect(applyCommand(data, foreign)).toEqual({ ok: false, error: "Ajuste inconsistente com o plano." });
    expect(adjust(data, [])).toBeNull();
  });

  it("histórico do plano: do mais novo para o mais antigo, só os deste plano", () => {
    const a = { id: "a", planRecordId: "p1", createdAt: 1 } as TrainingPlanChange;
    const b = { id: "b", planRecordId: "p1", createdAt: 2 } as TrainingPlanChange;
    const c = { id: "c", planRecordId: "p2", createdAt: 3 } as TrainingPlanChange;
    expect(planChanges([a, b, c], "p1").map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("foco no plano em uso", () => {
  it("peito: sobe as séries, acrescenta exercício novo da biblioteca onde cabe e grava tudo, fichas e histórico", () => {
    const data = accepted();
    const view = currentPlanView(data.trainingPlans[0], data, VIEW_ID)!;
    const { changes } = focusAdjustment(view.proposal, view.profile, data.exercises, "peito");
    expect(changes.length).toBeGreaterThan(0);
    const command = adjust(data, changes, "foco")!;
    expect(command.change.items.length).toBeLessThanOrEqual(16);
    expect(JSON.stringify(command.change).length).toBeLessThan(16_000);
    expect(parseCommand(command)).toMatchObject({ ok: true });
    const applied = applyCommand(data, command);
    if (!applied.ok) throw new Error(applied.error);
    const sets = (d: AppData) => d.plans.filter((p) => !p.archived).reduce((t, p) => t + p.exercises.length, 0);
    const adds = changes.filter((c) => c.change.kind === "add").length;
    const removes = changes.filter((c) => c.change.kind === "remove").length;
    expect(sets(applied.data)).toBe(sets(data) + adds - removes);
    expect(applied.data.trainingPlanChanges).toHaveLength(1);
    expect(applyCommand(applied.data, command)).toMatchObject({ ok: true, data: applied.data }); // repetir não duplica
    // O plano novo, visto de novo, já está no alvo: pedir o mesmo foco não propõe mais nada.
    const again = currentPlanView(applied.data.trainingPlans[0], applied.data, VIEW_ID)!;
    expect(focusAdjustment(again.proposal, again.profile, applied.data.exercises, "peito").changes).toEqual([]);
  });
});

describe("sugestão quando um exercício estagna", () => {
  it("sugere trocar o exercício do plano parado há mais treinos por uma variação da mesma vaga; 'agora não' esconde", () => {
    const data = accepted();
    const plan = data.plans[0];
    const target = plan.exercises[0];
    const today = "2026-11-08";
    // 4 treinos com a mesma carga e repetições: sem evolução.
    const sessions: WorkoutSession[] = [1, 3, 5, 7].map((d) => ({
      id: newId(),
      planId: plan.id,
      nameSnapshot: plan.name,
      startedAt: Date.UTC(2026, 10, d, 10),
      finishedAt: Date.UTC(2026, 10, d, 11),
      occurredOn: `2026-11-0${d}`,
      exercises: [
        {
          exerciseId: target.exerciseId,
          nameSnapshot: "x",
          loadType: "external",
          plannedSets: 3,
          repMin: 8,
          repMax: 12,
          restSeconds: 90,
          sets: [{ weightKg: 40, reps: 8, done: true }],
        },
      ],
    }));
    const withHistory = { ...data, sessions };
    const view = currentPlanView(withHistory.trainingPlans[0], withHistory, VIEW_ID)!;
    const suggestion = stalledSuggestion(view, withHistory, today);
    expect(suggestion).toMatchObject({ exerciseId: target.exerciseId, principle: "variacao", change: { kind: "swap" } });
    expect(stalledSuggestion(view, withHistory, today, (id) => id === target.exerciseId)).toBeNull();
    expect(stalledSuggestion(view, data, today)).toBeNull();
  });
});
