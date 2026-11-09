import { describe, expect, it } from "vitest";
import { PRINCIPLES, PRINCIPLE_IDS, scienceSummary } from "./training-evidence";
import { SESSION_MINUTES, TRAINING_DAYS, TRAINING_EXPERIENCES, TRAINING_GOALS } from "./training-profile";
import { setPrescription, rulesProposal } from "./training-proposal";
import { buildSkeleton, defaultChoices } from "./training-rules";
import { availableSplits } from "./training-splits";
import type { TrainingProfile } from "./types";

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

describe("base científica", () => {
  it("cada princípio tem referência completa com DOI", () => {
    for (const id of PRINCIPLE_IDS) {
      const { reference } = PRINCIPLES[id];
      expect(reference.doi, id).toMatch(/^10\.\d{4,}\//);
      expect(reference.full.length, id).toBeGreaterThan(60);
      expect(reference.short, id).toMatch(/\(\d{4}\)$/);
    }
  });

  it("para toda resposta e divisão: 4 ou 5 pontos, sem texto quebrado, e as referências são exatamente as dos pontos", () => {
    let checked = 0;
    for (const goal of TRAINING_GOALS)
      for (const experience of TRAINING_EXPERIENCES)
        for (const daysPerWeek of TRAINING_DAYS)
          for (const sessionMinutes of SESSION_MINUTES)
            for (const option of availableSplits(daysPerWeek)) {
              const profile = { ...base, goal, experience, daysPerWeek, sessionMinutes };
              const skeleton = buildSkeleton(profile, [], option.id);
              const summary = scienceSummary(profile, skeleton, defaultChoices(skeleton));
              const label = JSON.stringify({ goal, experience, daysPerWeek, sessionMinutes, option: option.id });
              expect(summary.points.length, label).toBeGreaterThanOrEqual(4);
              expect(summary.points.length, label).toBeLessThanOrEqual(5);
              for (const point of summary.points) expect(point.text, label).not.toMatch(/undefined|NaN|null|Infinity/);
              expect(summary.references, label).toEqual([...new Set(summary.points.map((p) => PRINCIPLES[p.principle].reference))]);
              checked++;
            }
    expect(checked).toBeGreaterThan(300);
  });

  it("fala dos dias da pessoa, do rodízio e do objetivo", () => {
    const profile = { ...base, daysPerWeek: 5 as const };
    const skeleton = buildSkeleton(profile, []);
    const text = scienceSummary(profile, skeleton, defaultChoices(skeleton)).points.map((p) => p.text).join(" ");
    expect(text).toContain("Nos seus 5 dias, cada músculo treina cerca de 1,5 vez por semana");
    expect(text).toContain("para quem já treina");
    expect(text).toContain("Para ganhar massa");
  });

  it("o quinto ponto depende do objetivo: descanso para massa e força, não ir à falha para os demais", () => {
    const principles = (goal: TrainingProfile["goal"]) => {
      const profile = { ...base, goal };
      const skeleton = buildSkeleton(profile, []);
      return scienceSummary(profile, skeleton, defaultChoices(skeleton)).points.map((p) => p.principle);
    };
    expect(principles("massa")).toEqual(["volume", "frequencia", "carga", "ordem", "descanso"]);
    expect(principles("forca")).toContain("descanso");
    expect(principles("saude")).toContain("falha");
    expect(principles("emagrecer")).toContain("falha");
  });

  it("acompanha as edições da pessoa: mais séries mudam o volume citado", () => {
    const proposal = rulesProposal(base, [], "00000000-0000-4000-8000-000000000001", 1);
    const volume = (p: typeof proposal) => scienceSummary(base, p.skeleton, p.choices).points.find((x) => x.principle === "volume")!.text;
    let edited = proposal;
    for (const slot of proposal.skeleton.days.flatMap((d) => d.slots)) edited = setPrescription(edited, slot.id, { sets: Math.max(...slot.setOptions) }) ?? edited;
    expect(volume(edited)).not.toBe(volume(proposal));
  });
});
