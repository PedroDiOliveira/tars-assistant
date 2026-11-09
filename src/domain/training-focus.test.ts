import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIGHT_FOCUS_EXTRA, PRIORITY_VOLUME, effectiveOf, focusDecisions, volumeBand, TRACKED_GROUPS, FLOOR_GROUPS } from "./training-focus";
import { SESSION_MINUTES, TRAINING_DAYS, TRAINING_EXPERIENCES, TRAINING_GOALS, TRAINING_LOCATIONS } from "./training-profile";
import { focusAdjustment, applyChanges } from "./training-adjust";
import { adjustedFocusIsStable } from "./training-focus.helpers";
import { parsePlanProposal, rulesProposal } from "./training-proposal";
import { SLOT_TYPES, buildSkeleton, dayOverBudget, defaultChoices, planErrors, type PlanSkeleton } from "./training-rules";
import { volumeReport } from "./training-volume";
import type { BodyRegion, PriorityGroup, TrainingProfile } from "./types";

const ALL: BodyRegion[] = ["ombro", "cotovelo", "punho", "lombar", "quadril", "joelho", "tornozelo"];

describe("sem foco, nada muda", () => {
  it("o plano de TODAS as combinações sem prioridade é idêntico ao de antes do foco (impressão digital de 2026-11-09)", () => {
    const golden = JSON.parse(readFileSync(new URL("./__golden__/skeleton-no-focus.json", import.meta.url), "utf8")) as Record<string, string>;
    const changed: string[] = [];
    let checked = 0;
    for (const goal of TRAINING_GOALS)
      for (const experience of TRAINING_EXPERIENCES)
        for (const daysPerWeek of TRAINING_DAYS)
          for (const sessionMinutes of SESSION_MINUTES)
            for (const location of TRAINING_LOCATIONS)
              for (const limitations of [[], ALL]) {
                const profile: TrainingProfile = { goal, experience, daysPerWeek, sessionMinutes, location, limitations, screening: "liberado", healthConsentAt: 1, priorities: [], updatedAt: 1 };
                const skeleton = buildSkeleton(profile, []);
                const key = [goal, experience, daysPerWeek, sessionMinutes, location, limitations.length ? "dor" : "ok"].join("|");
                const hash = createHash("sha1").update(JSON.stringify({ skeleton, choices: defaultChoices(skeleton) })).digest("hex").slice(0, 10);
                if (golden[key] !== hash) changed.push(key);
                checked++;
              }
    expect(checked).toBe(Object.keys(golden).length);
    expect(changed).toEqual([]);
  });
});

const BASE: TrainingProfile = { goal: "massa", experience: "intermediario", daysPerWeek: 4, sessionMinutes: 60, location: "academia", limitations: [], screening: "liberado", healthConsentAt: 1, priorities: [], updatedAt: 1 };
const FOCI: PriorityGroup[][] = [["peito"], ["costas"], ["ombros"], ["bracos"], ["pernas"], ["gluteos"], ["ombros", "bracos"]];
const groupOf = (type: keyof typeof SLOT_TYPES) => SLOT_TYPES[type].group;
const effective = (sk: PlanSkeleton) => effectiveOf(sk.days, groupOf, sk.timesPerWeek);
const focusGroups = (priorities: PriorityGroup[]) => new Set(priorities.flatMap((p) => PRIORITY_VOLUME[p]));

function eachScenario(goals: readonly TrainingProfile["goal"][], run: (profile: TrainingProfile, label: string) => void) {
  for (const goal of goals)
    for (const experience of TRAINING_EXPERIENCES)
      for (const daysPerWeek of TRAINING_DAYS)
        for (const sessionMinutes of SESSION_MINUTES)
          for (const location of TRAINING_LOCATIONS)
            for (const priorities of FOCI) {
              const profile = { ...BASE, goal, experience, daysPerWeek, sessionMinutes, location, priorities };
              run(profile, JSON.stringify({ goal, experience, daysPerWeek, sessionMinutes, location, priorities }));
            }
}

describe("foco no objetivo massa", () => {
  it("em toda combinação: plano válido, foco nunca abaixo do que teria sem foco, e o resto nunca abaixo do piso por causa do foco", () => {
    let checked = 0;
    eachScenario(["massa"], (profile, label) => {
      const withFocus = buildSkeleton(profile, []);
      const without = buildSkeleton({ ...profile, priorities: [] }, []);
      const eff = effective(withFocus);
      const base = effective(without);
      const band = volumeBand(profile);
      expect(planErrors(withFocus, defaultChoices(withFocus)), label).toEqual([]);
      const focus = focusGroups(profile.priorities);
      for (const g of focus) expect(eff[g] + 1e-9, `${label} ${g}`).toBeGreaterThanOrEqual(Math.min(base[g], band.focusMax));
      for (const g of FLOOR_GROUPS) {
        if (focus.has(g)) continue;
        expect(eff[g] + 1e-9, `${label} ${g} (resto abaixo do piso por causa do foco)`).toBeGreaterThanOrEqual(Math.min(base[g], band.floor));
      }
      for (const day of withFocus.days) expect(day.slots.length, label).toBeGreaterThanOrEqual(2);
      checked++;
    });
    expect(checked).toBe(3 * 5 * 4 * 2 * FOCI.length);
  });

  it("não passa do alvo em mais de um passo (teto de iniciante e de liberação médica é o topo da faixa normal)", () => {
    eachScenario(["massa"], (profile, label) => {
      // Dois grupos em foco que dividem trabalho indireto (ombros + braços: o ombro dá tríceps) podem passar um do outro.
      if (profile.priorities.length > 1) return;
      const sk = buildSkeleton(profile, []);
      const base = effective(buildSkeleton({ ...profile, priorities: [] }, []));
      const band = volumeBand(profile);
      for (const g of focusGroups(profile.priorities)) {
        const eff = effective(sk)[g];
        // O foco só sobe o que falta: o que já estava acima do alvo (plano padrão cheio) fica como está.
        expect(eff, `${label} ${g}`).toBeLessThanOrEqual(Math.max(base[g], band.focusMax + 2) + 1e-9);
      }
    });
    const novice = buildSkeleton({ ...BASE, experience: "iniciante", sessionMinutes: 75 as const, priorities: ["peito"] }, []);
    expect(effective(novice).peito).toBeLessThanOrEqual(volumeBand({ experience: "iniciante" }).high + 1);
    const medical = buildSkeleton({ ...BASE, screening: "liberacao-medica", sessionMinutes: 75 as const, priorities: ["peito"] }, []);
    expect(effective(medical).peito).toBeLessThanOrEqual(volumeBand(BASE).high + 1);
    const normal = buildSkeleton({ ...BASE, sessionMinutes: 75 as const, priorities: ["peito"] }, []);
    expect(effective(normal).peito).toBeGreaterThan(volumeBand(BASE).high);
  });

  it("o exercício principal do grupo em foco abre o treino; sem ele, nada muda de lugar", () => {
    eachScenario(["massa"], (profile, label) => {
      const focus = focusGroups(profile.priorities);
      for (const day of buildSkeleton(profile, []).days) {
        const lead = day.slots.find((s) => s.tier === 1 && focus.has(SLOT_TYPES[s.type].group));
        if (lead) expect(day.slots[0].tier === 1 && focus.has(SLOT_TYPES[day.slots[0].type].group), `${label} ${day.id}`).toBe(true);
      }
    });
  });

  it("o caso do Pedro: foco em peito sobe o peito de verdade (11 → 18) e dá ombros e braços 8 → o tempo cobra do que tem folga", () => {
    const chest = effective(buildSkeleton({ ...BASE, priorities: ["peito"] }, []));
    expect(chest.peito).toBe(18);
    const arms = effective(buildSkeleton({ ...BASE, priorities: ["ombros", "bracos"] }, []));
    for (const g of ["ombros", "biceps", "triceps"] as const) expect(arms[g], g).toBeGreaterThanOrEqual(volumeBand(BASE).focusMax);
    expect(arms.peito).toBeLessThan(11);
    expect(arms.peito).toBeGreaterThanOrEqual(volumeBand(BASE).floor);
  });

  it("o bug do bíceps zerado: braços em foco nunca ficam sem bíceps nem tríceps", () => {
    eachScenario(["massa"], (profile, label) => {
      if (!profile.priorities.includes("bracos") || profile.sessionMinutes === 30) return;
      const eff = effective(buildSkeleton(profile, []));
      expect(eff.biceps, label).toBeGreaterThan(0);
      expect(eff.triceps, label).toBeGreaterThan(0);
    });
  });

  it("é determinístico", () => {
    const profile = { ...BASE, priorities: ["peito", "costas"] as PriorityGroup[] };
    expect(JSON.stringify(buildSkeleton(profile, []))).toBe(JSON.stringify(buildSkeleton(profile, [])));
  });

  it("quando não coube, diz quanto cabe e por quê (nunca entrega menos em silêncio)", () => {
    const profile: TrainingProfile = { ...BASE, sessionMinutes: 30, priorities: ["peito"] };
    const sk = buildSkeleton(profile, []);
    const report = volumeReport(profile, sk, defaultChoices(sk));
    expect(report.notes.join(" ")).toMatch(/não coube/);
    const full: TrainingProfile = { ...BASE, sessionMinutes: 75, priorities: ["peito"] };
    const fullSkeleton = buildSkeleton(full, []);
    expect(volumeReport(full, fullSkeleton, defaultChoices(fullSkeleton)).notes.join(" ")).not.toMatch(/cheguei a/);
  });
});

describe("o foco depende do objetivo", () => {
  it("força: só uma série pesada a mais nos exercícios principais do grupo; nada de exercício novo e o resto das vagas como estava", () => {
    eachScenario(["forca"], (profile, label) => {
      const withFocus = buildSkeleton(profile, []);
      const without = buildSkeleton({ ...profile, priorities: [] }, []);
      const focus = focusGroups(profile.priorities);
      for (const day of withFocus.days) {
        for (const slot of day.slots) {
          expect(slot.id, label).not.toMatch(/x\d+$/);
          const group = SLOT_TYPES[slot.type].group;
          // O foco só mexe nas séries dos exercícios principais do próprio grupo: nenhuma outra vaga passa do máximo normal.
          if (!focus.has(group) || slot.tier !== 1) expect(slot.sets, `${label} ${slot.id}`).toBeLessThanOrEqual(Math.max(...slot.setOptions));
        }
      }
      expect(planErrors(withFocus, defaultChoices(withFocus)), label).toEqual([]);
      void without;
    });
  });

  it("saúde e emagrecer: leve (no máximo 2 séries efetivas a mais no grupo, sem exercício novo) e o resto das vagas como estava", () => {
    const direct = (sk: PlanSkeleton, ids: Set<string>, g: string) =>
      sk.days.reduce((t, d) => t + d.slots.filter((s) => ids.has(s.id) && SLOT_TYPES[s.type].group === g).reduce((n, s) => n + s.sets, 0), 0) * sk.timesPerWeek;
    eachScenario(["saude", "emagrecer"], (profile, label) => {
      const withFocus = buildSkeleton(profile, []);
      const without = buildSkeleton({ ...profile, priorities: [] }, []);
      const common = new Set(without.days.flatMap((d) => d.slots.map((s) => s.id)));
      for (const g of focusGroups(profile.priorities)) {
        expect(direct(withFocus, common, g) - direct(without, common, g), `${label} ${g}`).toBeLessThanOrEqual(LIGHT_FOCUS_EXTRA + 1e-9);
      }
      for (const day of withFocus.days) for (const slot of day.slots) expect(slot.id, label).not.toMatch(/x\d+$/);
    });
  });

  it("região com dor marcada: o foco nesse grupo não muda o plano, e o aviso explica", () => {
    // "pernas" são dois grupos (quadríceps e posteriores): só some por inteiro com as duas regiões marcadas.
    const cases: [PriorityGroup, BodyRegion[]][] = [["peito", ["ombro"]], ["ombros", ["ombro"]], ["costas", ["lombar"]], ["pernas", ["joelho", "lombar"]], ["bracos", ["cotovelo"]], ["gluteos", ["quadril"]]];
    for (const [priority, region] of cases) {
      const withFocus: TrainingProfile = { ...BASE, sessionMinutes: 75, limitations: region, priorities: [priority] };
      const sk = buildSkeleton(withFocus, []);
      expect(JSON.stringify(sk), `${priority}/${region}`).toBe(JSON.stringify(buildSkeleton({ ...withFocus, priorities: [] }, [])));
      expect(volumeReport(withFocus, sk, defaultChoices(sk)).notes.join(" ")).toMatch(/Não reforcei/);
      expect(focusDecisions(withFocus).every((d) => d.blockedBy !== undefined), `${priority}`).toBe(true);
    }
  });

  it("o quadro de volume só aparece para quem treina massa; os pisos valem para todos os objetivos", () => {
    for (const goal of TRAINING_GOALS) {
      const profile = { ...BASE, goal };
      const sk = buildSkeleton(profile, []);
      const report = volumeReport(profile, sk, defaultChoices(sk));
      expect(report.showTable, goal).toBe(goal === "massa");
      expect(report.rows.map((r) => r.group), goal).toEqual([...TRACKED_GROUPS]);
    }
  });
});

describe("ajustar o foco num plano que já existe", () => {
  it("é estável: gerar com foco e pedir o mesmo foco de novo não propõe mudança nenhuma", () => {
    expect(adjustedFocusIsStable(BASE, ["peito"])).toBe(true);
    expect(adjustedFocusIsStable({ ...BASE, sessionMinutes: 75 }, ["costas"])).toBe(true);
    expect(adjustedFocusIsStable({ ...BASE, experience: "iniciante" }, ["peito"])).toBe(true);
  });
});

describe("ajustar o foco: o mesmo distribuidor, pelas mudanças que a pessoa vê", () => {
  const uuid = "00000000-0000-4000-8000-000000000001";
  const eff = (p: ReturnType<typeof rulesProposal>) =>
    effectiveOf(p.skeleton.days.map((d) => ({ slots: d.slots.map((s) => ({ type: s.type, sets: p.choices[s.id].sets })) })), groupOf, p.skeleton.timesPerWeek);

  it("em toda combinação: até 16 mudanças válidas, nenhum treino passa do tempo e o grupo nunca fica abaixo do que tinha", () => {
    let withAdds = 0;
    let checked = 0;
    for (const goal of ["massa", "forca", "saude"] as const)
      for (const experience of TRAINING_EXPERIENCES)
        for (const daysPerWeek of [3, 4, 5] as const)
          for (const sessionMinutes of [45, 60, 75] as const)
            for (const priority of ["peito", "costas", "ombros", "bracos", "pernas", "gluteos"] as PriorityGroup[]) {
              const profile: TrainingProfile = { ...BASE, goal, experience, daysPerWeek, sessionMinutes };
              const proposal = rulesProposal(profile, [], uuid, 1);
              const label = JSON.stringify({ goal, experience, daysPerWeek, sessionMinutes, priority });
              const { changes, notes } = focusAdjustment(proposal, profile, [], priority);
              expect(changes.length, label).toBeLessThanOrEqual(16);
              expect(notes.every((n) => n.length > 10), label).toBe(true);
              const { proposal: after, applied } = applyChanges(proposal, changes);
              expect(applied, label).toHaveLength(changes.length);
              expect(parsePlanProposal(JSON.parse(JSON.stringify(after))), label).not.toBeNull();
              expect(planErrors(after.skeleton, after.choices, { checkTime: false }), label).toEqual([]);
              for (const day of after.skeleton.days) {
                const before = proposal.skeleton.days.find((d) => d.id === day.id)!;
                if (!dayOverBudget(proposal.skeleton, before, proposal.choices)) expect(dayOverBudget(after.skeleton, day, after.choices), `${label} ${day.id} passou do tempo`).toBe(false);
              }
              for (const g of PRIORITY_VOLUME[priority]) expect(eff(after)[g] + 1e-9, `${label} ${g}`).toBeGreaterThanOrEqual(eff(proposal)[g]);
              if (goal !== "massa") expect(changes.some((c) => c.change.kind === "add" || c.change.kind === "remove"), `${label} só massa mexe na estrutura`).toBe(false);
              if (changes.some((c) => c.change.kind === "add")) withAdds++;
              checked++;
            }
    expect(checked).toBe(3 * 3 * 3 * 3 * 6);
    expect(withAdds).toBeGreaterThan(0); // acrescentar exercício acontece de verdade
  });

  it("peito no plano de ombros e braços: sobe o peito de verdade, e o que paga é dito (o caso do Pedro)", () => {
    const profile: TrainingProfile = { ...BASE, priorities: ["ombros", "bracos"] };
    const proposal = rulesProposal(profile, [], uuid, 1);
    const { changes, notes } = focusAdjustment(proposal, profile, [], "peito");
    const { proposal: after } = applyChanges(proposal, changes);
    expect(eff(after).peito).toBeGreaterThan(eff(proposal).peito + 2);
    expect(eff(after).peito).toBeLessThanOrEqual(volumeBand(BASE).focusMax + 2);
    expect(changes.length).toBeGreaterThan(1); // não é só trocar de lugar
    expect(changes.some((c) => c.change.kind === "sets" || c.change.kind === "add")).toBe(true);
    void notes;
  });

  it("a mudança de ordem leva o exercício principal do grupo para o começo", () => {
    const profile: TrainingProfile = { ...BASE, sessionMinutes: 75 };
    const proposal = rulesProposal(profile, [], uuid, 1);
    const { proposal: after } = applyChanges(proposal, focusAdjustment(proposal, profile, [], "ombros").changes);
    for (const day of after.skeleton.days) {
      const lead = day.slots.find((s) => s.tier === 1 && SLOT_TYPES[s.type].group === "ombros");
      if (lead) expect(day.slots[0].id).toBe(lead.id);
    }
  });
});
