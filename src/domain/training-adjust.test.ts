import { describe, expect, it } from "vitest";
import { parseCommand } from "./command-schema";
import { ADJUST_CHIPS, applyChanges, describeChange, ruleSuggestions, validSuggestions, type SuggestedChange } from "./training-adjust";
import { SESSION_MINUTES, TRAINING_DAYS, TRAINING_EXPERIENCES } from "./training-profile";
import { buildApplyPlan, parsePlanProposal, removeSlot, rulesProposal } from "./training-proposal";
import { SLOT_TYPES, dayMinutes } from "./training-rules";
import { availableSplits } from "./training-splits";
import type { TrainingProfile } from "./types";

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
const ID = "00000000-0000-4000-8000-000000000009";
const proposalFor = (over: Partial<TrainingProfile> = {}, split?: string) => rulesProposal({ ...PROFILE, ...over }, [], ID, NOW, undefined, split);
const nameOf = (key: string) => key;
let n = 100;
const newId = () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`;

describe("chips: mudanças pelas regras, sem IA", () => {
  it("para toda experiência, dias, tempo, divisão e chip: só mudanças válidas, uma por treino, e o resultado é aceitável", () => {
    let checked = 0;
    for (const experience of TRAINING_EXPERIENCES)
      for (const daysPerWeek of TRAINING_DAYS)
        for (const sessionMinutes of SESSION_MINUTES)
          for (const option of availableSplits(daysPerWeek))
            for (const chip of ADJUST_CHIPS.map((c) => c.id).filter((id) => id !== "foco")) {
              const profile = { ...PROFILE, experience, daysPerWeek, sessionMinutes };
              const proposal = rulesProposal(profile, [], ID, NOW, undefined, option.id);
              const changes = ruleSuggestions(proposal, chip);
              const label = JSON.stringify({ experience, daysPerWeek, sessionMinutes, option: option.id, chip });
              expect(changes.length, label).toBeLessThanOrEqual(proposal.skeleton.days.length);
              const { proposal: after, applied } = applyChanges(proposal, changes);
              expect(applied, label).toHaveLength(changes.length);
              expect(parsePlanProposal(JSON.parse(JSON.stringify(after))), label).not.toBeNull();
              expect(parseCommand(buildApplyPlan({ proposal: after, profile, exercises: [], plans: [], archivePlanIds: [], nowMs: NOW, newId })).ok, label).toBe(true);
              checked++;
            }
    expect(checked).toBeGreaterThan(1000);
  });

  it("mais curto: cada treino com mudança fica mais curto, e os principais não perdem séries", () => {
    const proposal = proposalFor();
    const changes = ruleSuggestions(proposal, "mais-curto");
    expect(changes.length).toBeGreaterThan(0);
    const after = applyChanges(proposal, changes).proposal;
    for (const day of after.skeleton.days) {
      const before = proposal.skeleton.days.find((d) => d.id === day.id)!;
      expect(dayMinutes(day, after.choices)).toBeLessThanOrEqual(dayMinutes(before, proposal.choices));
    }
    const mains = proposal.skeleton.days.flatMap((d) => d.slots).filter((s) => s.tier === 1);
    for (const slot of mains) expect(after.choices[slot.id].sets).toBe(proposal.choices[slot.id].sets);
  });

  it("menos exercícios: tira um de apoio por treino, nunca o principal, e deixa pelo menos 3", () => {
    const proposal = proposalFor();
    const changes = ruleSuggestions(proposal, "menos-exercicios");
    const after = applyChanges(proposal, changes).proposal;
    for (const change of changes) {
      expect(change.change.kind).toBe("remove");
      const slot = proposal.skeleton.days.flatMap((d) => d.slots).find((s) => s.id === change.change.slotId)!;
      expect(slot.tier).toBeGreaterThan(1);
    }
    for (const day of after.skeleton.days) expect(day.slots.length).toBeGreaterThanOrEqual(3);
  });
});

describe("sugestões de fora (IA): só passa o que vale neste rascunho", () => {
  it("descarta exercício de outra vaga, remover o principal, séries fora das opções e vaga inexistente", () => {
    const proposal = proposalFor();
    const [main, second] = proposal.skeleton.days[0].slots;
    const foreign = proposal.skeleton.days[1].slots.find((s) => !main.options.includes(s.options[0]))!.options[0];
    const s = (change: SuggestedChange["change"]): SuggestedChange => ({ change, reason: "x", principle: "volume" });
    const valid = validSuggestions(proposal, [
      s({ kind: "swap", slotId: main.id, exerciseKey: foreign }),
      s({ kind: "remove", slotId: main.id }),
      s({ kind: "sets", slotId: second.id, sets: 99 }),
      s({ kind: "sets", slotId: "d9s9", sets: 3 }),
      s({ kind: "move", slotId: second.id, toIndex: 0 }),
    ]);
    expect(valid.map((v) => v.change.kind)).toEqual(["move"]);
  });

  it("remover: o principal e o treino com só 2 exercícios ficam", () => {
    const proposal = proposalFor({ sessionMinutes: 30 });
    const day = proposal.skeleton.days[0];
    expect(removeSlot(proposal, day.slots.find((s) => s.tier === 1)!.id)).toBeNull();
    let small = proposal;
    for (const slot of [...day.slots].reverse()) small = removeSlot(small, slot.id) ?? small;
    expect(small.skeleton.days[0].slots.length).toBeGreaterThanOrEqual(2);
  });

  it("descreve cada mudança como antes → depois, com o treino", () => {
    const proposal = proposalFor();
    const day = proposal.skeleton.days[0];
    const slot = day.slots[1];
    const key = proposal.choices[slot.id].exerciseKey;
    expect(describeChange(proposal, { kind: "sets", slotId: slot.id, sets: 2 }, nameOf)).toEqual({
      where: `${day.name} · ${key}`,
      before: `${proposal.choices[slot.id].sets} séries`,
      after: "2 séries",
    });
    expect(describeChange(proposal, { kind: "move", slotId: slot.id, toIndex: 0 }, nameOf)?.after).toBe("1º do treino");
    expect(describeChange(proposal, { kind: "remove", slotId: slot.id }, nameOf)).toEqual({ where: day.name, before: key, after: "sai do treino" });
    expect(SLOT_TYPES[slot.type]).toBeDefined();
  });
});
